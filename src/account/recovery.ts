import {
  context,
  parseDraft,
  rootCommitment,
  unhex,
  hex,
  lp,
  draftDigest,
  confirmationBytes,
  type RecoveryContext,
  type RecoveryDraft,
} from '../../account-protocol/recovery.ts';

const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function normalizeRecoveryCode(input: string): string {
  if (typeof input !== 'string' || input.length > 256) throw Error('Invalid recovery code');
  const value = input
    .replaceAll(/[-\s]/gu, '')
    .toUpperCase()
    .replaceAll('O', '0')
    .replaceAll(/[IL]/gu, '1');
  if (value.length !== 25 || [...value].some((symbol) => !alphabet.includes(symbol)))
    throw Error('A recovery code has 25 Crockford Base32 symbols');
  return value;
}
const random = (size: number) => crypto.getRandomValues(new Uint8Array(size));
const prefix = (kind: 'X25519' | 'Ed25519') =>
  unhex(
    kind === 'X25519' ? '302e020100300506032b656e04220420' : '302e020100300506032b657004220420',
    16,
  );
function rawExport(bytes: Uint8Array, kind: 'X25519' | 'Ed25519'): Uint8Array {
  const header = prefix(kind);
  if (bytes.length !== 48 || !header.every((value, i) => bytes[i] === value))
    throw Error(`Unexpected ${kind} PKCS#8 export`);
  return bytes.subarray(16);
}
async function privateKey(raw: Uint8Array, kind: 'X25519' | 'Ed25519', subtle = crypto.subtle) {
  const pkcs8 = new Uint8Array([...prefix(kind), ...raw]);
  try {
    return await subtle.importKey(
      'pkcs8',
      pkcs8,
      kind,
      false,
      kind === 'X25519' ? ['deriveBits'] : ['sign'],
    );
  } finally {
    pkcs8.fill(0);
  }
}
async function codeKey(code: string, principalId: string, salt: string, subtle = crypto.subtle) {
  const input = new TextEncoder().encode(normalizeRecoveryCode(code));
  try {
    const ikm = await subtle.importKey('raw', input, 'HKDF', false, ['deriveKey']);
    return await subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: unhex(salt, 16),
        info: lp('done/recovery/v1', principalId),
      },
      ikm,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  } finally {
    input.fill(0);
  }
}
const aad = (draft: RecoveryDraft) => lp('done/recovery/v1', draft.principalId, '1', draft.rPub);

/** The caller must durably save draft before displaying code. No private key escapes this call. */
export async function generateRecovery(
  input: RecoveryContext,
): Promise<{ code: string; draft: RecoveryDraft }> {
  const scope = context(input),
    symbols = random(25);
  const code = Array.from(symbols, (byte) => alphabet[byte & 31])
    .join('')
    .match(/.{5}/g)!
    .join('-');
  symbols.fill(0);
  const r = await crypto.subtle.generateKey('X25519', true, ['deriveBits']);
  const signer = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  let rRaw: Uint8Array<ArrayBuffer> | undefined, sRaw: Uint8Array<ArrayBuffer> | undefined;
  const payload = new Uint8Array(96);
  try {
    rRaw = new Uint8Array(await crypto.subtle.exportKey('pkcs8', r.privateKey));
    sRaw = new Uint8Array(await crypto.subtle.exportKey('pkcs8', signer.privateKey));
    const draft: RecoveryDraft = {
      ...scope,
      v: 1,
      rootCommitment: await rootCommitment(scope),
      rPub: hex(new Uint8Array(await crypto.subtle.exportKey('raw', r.publicKey))),
      bootstrapSigner: hex(new Uint8Array(await crypto.subtle.exportKey('raw', signer.publicKey))),
      envelope: { v: 1, salt: hex(random(16)), nonce: hex(random(12)), ct: '' },
    };
    // S0-6's R_priv || RootCommitment, followed by S0-2's bootstrap seed.
    payload.set(rawExport(rRaw, 'X25519'), 0);
    payload.set(unhex(draft.rootCommitment, 32), 32);
    payload.set(rawExport(sRaw, 'Ed25519'), 64);
    draft.envelope.ct = hex(
      new Uint8Array(
        await crypto.subtle.encrypt(
          {
            name: 'AES-GCM',
            iv: unhex(draft.envelope.nonce, 12),
            additionalData: aad(draft),
            tagLength: 128,
          },
          await codeKey(code, scope.principalId, draft.envelope.salt),
          payload,
        ),
      ),
    );
    return { code, draft: parseDraft(draft) };
  } finally {
    payload.fill(0);
    rRaw?.fill(0);
    sRaw?.fill(0);
  }
}

/** Private owner callback: verified, non-extractable keys live only for this invocation. */
export async function withRecoveryKeys<T>(
  input: RecoveryDraft,
  code: string,
  subtle: SubtleCrypto,
  work: (wrapping: CryptoKey, signing: CryptoKey) => Promise<T>,
): Promise<T> {
  const draft = parseDraft(input);
  if ((await rootCommitment(draft)) !== draft.rootCommitment)
    throw Error('Recovery context mismatch');
  const payload = new Uint8Array(
    await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: unhex(draft.envelope.nonce, 12),
        additionalData: aad(draft),
        tagLength: 128,
      },
      await codeKey(code, draft.principalId, draft.envelope.salt, subtle),
      unhex(draft.envelope.ct, 112),
    ),
  );
  try {
    if (payload.length !== 96 || hex(payload.subarray(32, 64)) !== draft.rootCommitment)
      throw Error('Sealed root mismatch');
    const r = await privateKey(payload.subarray(0, 32), 'X25519', subtle);
    const pub = await subtle.importKey('raw', unhex(draft.rPub, 32), 'X25519', false, []);
    const peer = await subtle.generateKey('X25519', false, ['deriveBits']);
    const a = new Uint8Array(
      await subtle.deriveBits({ name: 'X25519', public: peer.publicKey }, r, 256),
    );
    let b: Uint8Array<ArrayBuffer> | undefined;
    try {
      b = new Uint8Array(
        await subtle.deriveBits({ name: 'X25519', public: pub }, peer.privateKey, 256),
      );
      if (!a.some((v) => v !== 0) || hex(a) !== hex(b)) throw Error('Recovery key mismatch');
    } finally {
      a.fill(0);
      b?.fill(0);
    }
    const signer = await privateKey(payload.subarray(64), 'Ed25519', subtle);
    const message = lp('done/recovery-key-check/v1', draft.rootCommitment);
    const proof = new Uint8Array(await subtle.sign('Ed25519', signer, message));
    const verify = await subtle.importKey(
      'raw',
      unhex(draft.bootstrapSigner, 32),
      'Ed25519',
      false,
      ['verify'],
    );
    if (!(await subtle.verify('Ed25519', verify, proof, message)))
      throw Error('Bootstrap key mismatch');
    return await work(r, signer);
  } finally {
    payload.fill(0);
  }
}

/** Re-entry opens and checks the complete amended payload, then signs only this finalization. */
export async function confirmRecovery(
  input: RecoveryDraft,
  code: string,
  challenge: string,
  expectedDigest: string,
): Promise<string> {
  const draft = parseDraft(input);
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge) || (await draftDigest(draft)) !== expectedDigest)
    throw Error('Recovery context mismatch');
  return withRecoveryKeys(draft, code, crypto.subtle, async (_r, signer) =>
    hex(
      new Uint8Array(
        await crypto.subtle.sign('Ed25519', signer, confirmationBytes(challenge, expectedDigest)),
      ),
    ),
  );
}
