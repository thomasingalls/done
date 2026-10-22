/** Internal custody primitives. Row 13 LockSeal and row 3 KeyEnvelope stay v1. */
export type Bytes = Uint8Array<ArrayBuffer>;
export interface CryptoScope {
  principalId: string;
  workspaceId: string;
}
export interface LockSeal {
  v: 1;
  factor: 'code' | 'prf';
  id: string;
  salt: Bytes;
  nonce: Bytes;
  ct: Bytes;
}
export interface KeyEnvelope {
  v: 1;
  gen: number;
  nonce: Bytes;
  ct: Bytes;
}
export const utf8 = (s: string): Bytes => new TextEncoder().encode(s);
const hexByte = Array.from({ length: 256 }, (_, n) => n.toString(16).padStart(2, '0'));
export const hex = (b: Uint8Array): string => {
  // Preserve the original iterator's refusal of detached buffers, including zero-length views.
  if (!b.length) {
    b.subarray(0, 0);
    return '';
  }
  // oxlint-disable-next-line unicorn/no-new-array -- Preallocate the byte count; every slot is filled below.
  const parts = new Array<string>(b.length);
  for (let i = 0; i < b.length; i++) parts[i] = hexByte[b[i]!]!;
  return parts.join('');
};
export const random = (n: number): Bytes => crypto.getRandomValues(new Uint8Array(n));
export const concat = (...parts: Uint8Array[]): Bytes => {
  const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
  let offset = 0;
  for (const b of parts) {
    out.set(b, offset);
    offset += b.length;
  }
  return out;
};
export const fields = (...values: string[]): Bytes =>
  concat(
    ...values.map((value) => {
      // TextEncoder replaces lone surrogates. Refuse rather than alias two identities.
      if (
        typeof value !== 'string' ||
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)
      )
        throw new Error('Invalid UTF-8 field');
      const bytes = utf8(value);
      if (bytes.length > 65535) throw new Error('Field too long');
      return concat(new Uint8Array([bytes.length >>> 8, bytes.length & 255]), bytes);
    }),
  );

export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const normalizeDeviceCode = (input: string): string => {
  if (typeof input !== 'string') throw new Error('A device code is required');
  const value = input
    .replaceAll(/[-\s]/gu, '')
    .toUpperCase()
    .replaceAll('O', '0')
    .replaceAll(/[IL]/gu, '1');
  if (value.length !== 25 || [...value].some((c) => !CODE_ALPHABET.includes(c)))
    throw new Error('A device code has 25 Crockford Base32 symbols');
  return value;
};
export const generateDeviceCode = (): string => {
  const bytes = random(25);
  try {
    return Array.from(bytes, (b) => CODE_ALPHABET[b & 31])
      .join('')
      .match(/.{5}/gu)!
      .join('-');
  } finally {
    bytes.fill(0);
  }
};

export const hkdf = async (
  ikm: Bytes,
  salt: Bytes,
  info: Bytes,
  algorithm: AesKeyGenParams | HmacImportParams,
  usages: KeyUsage[],
  subtle: SubtleCrypto = crypto.subtle,
): Promise<CryptoKey> => {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    algorithm,
    false,
    usages,
  );
};
export const aes = (raw: Bytes, subtle: SubtleCrypto = crypto.subtle): Promise<CryptoKey> =>
  subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
export const sealAAD = (scope: CryptoScope, seal: Pick<LockSeal, 'v' | 'factor' | 'id'>): Bytes =>
  fields(
    'done/devicelock/v1',
    scope.principalId,
    scope.workspaceId,
    String(seal.v),
    seal.factor,
    seal.id,
  );
export const factorKey = (
  scope: CryptoScope,
  ikm: Bytes,
  seal: Pick<LockSeal, 'salt' | 'factor'>,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<CryptoKey> =>
  hkdf(
    ikm,
    seal.salt,
    fields('done/devicelock/v1', scope.principalId, scope.workspaceId, seal.factor),
    { name: 'AES-GCM', length: 256 },
    ['encrypt', 'decrypt'],
    subtle,
  );
export const sealFactor = async (
  scope: CryptoScope,
  ikm: Bytes,
  plaintext: Bytes,
  factor: LockSeal['factor'],
  id: string,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<LockSeal> => {
  const seal: LockSeal = {
    v: 1,
    factor,
    id,
    salt: random(16),
    nonce: random(12),
    ct: new Uint8Array(),
  };
  const key = await factorKey(scope, ikm, seal, subtle);
  seal.ct = new Uint8Array(
    await subtle.encrypt(
      { name: 'AES-GCM', iv: seal.nonce, additionalData: sealAAD(scope, seal), tagLength: 128 },
      key,
      plaintext,
    ),
  );
  return seal;
};
export const openFactor = async (
  scope: CryptoScope,
  ikm: Bytes,
  seal: LockSeal,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<Bytes> => {
  const key = await factorKey(scope, ikm, seal, subtle);
  return new Uint8Array(
    await subtle.decrypt(
      { name: 'AES-GCM', iv: seal.nonce, additionalData: sealAAD(scope, seal), tagLength: 128 },
      key,
      seal.ct,
    ),
  );
};
export const envelopeAAD = (scope: CryptoScope, gen: number): Bytes =>
  fields('done/keyenv/v1', scope.principalId, scope.workspaceId, '1', String(gen), 'content-key');
export const sealEnvelope = async (
  scope: CryptoScope,
  root: Bytes,
  gen: number,
  raw: Bytes,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<KeyEnvelope> => {
  const nonce = random(12);
  const ct = new Uint8Array(
    await subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: envelopeAAD(scope, gen), tagLength: 128 },
      await aes(root, subtle),
      raw,
    ),
  );
  return { v: 1, gen, nonce, ct };
};
export const openEnvelope = async (
  scope: CryptoScope,
  root: Bytes,
  envelope: KeyEnvelope,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<Bytes> =>
  new Uint8Array(
    await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: envelope.nonce,
        additionalData: envelopeAAD(scope, envelope.gen),
        tagLength: 128,
      },
      await aes(root, subtle),
      envelope.ct,
    ),
  );

export type CredentialRole = 'wrapping' | 'signing';
export interface CredentialSeal {
  v: 2;
  nonce: Bytes;
  ct: Bytes;
}
export interface SealedCredential {
  role: CredentialRole;
  id: string;
  publicKey: Bytes;
  sealed: CredentialSeal;
}
const credentialAAD = (
  scope: CryptoScope,
  role: CredentialRole,
  id: string,
  publicKey: Bytes,
): Bytes =>
  fields(
    'done/custody-credential/v2',
    scope.principalId,
    scope.workspaceId,
    role,
    id,
    hex(publicKey),
  );
const algorithmOf = (role: CredentialRole) => (role === 'wrapping' ? 'X25519' : 'Ed25519');
const usagesOf = (role: CredentialRole): KeyUsage[] =>
  role === 'wrapping' ? ['deriveBits'] : ['sign'];
const prefixOf = (role: CredentialRole): Bytes =>
  new Uint8Array([
    48,
    46,
    2,
    1,
    0,
    48,
    5,
    6,
    3,
    43,
    101,
    role === 'wrapping' ? 110 : 112,
    4,
    34,
    4,
    32,
  ]);
export const createCredential = async (
  scope: CryptoScope,
  root: Bytes,
  role: CredentialRole,
  id: string,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<SealedCredential> => {
  const pair = (await subtle.generateKey(algorithmOf(role), true, usagesOf(role))) as CryptoKeyPair;
  const privateBytes = new Uint8Array(await subtle.exportKey('pkcs8', pair.privateKey));
  try {
    if (
      privateBytes.length !== 48 ||
      !privateBytes.subarray(0, 16).every((b, i) => b === prefixOf(role)[i])
    )
      throw new Error('Unsupported credential encoding');
    const publicKey = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
    return sealPreparedCredential(scope, root, role, id, { publicKey, privateBytes }, subtle);
  } finally {
    privateBytes.fill(0);
  }
};
/** Fresh custody only; the owner has already reserved this direct-root encryption. */
export const sealPreparedCredential = async (
  scope: CryptoScope,
  root: Bytes,
  role: CredentialRole,
  id: string,
  input: { publicKey: Bytes; privateBytes: Bytes },
  subtle: SubtleCrypto = crypto.subtle,
): Promise<SealedCredential> => {
  const publicKey = input.publicKey.slice(),
    privateBytes = input.privateBytes.slice();
  try {
    if (
      publicKey.length !== 32 ||
      privateBytes.length !== 48 ||
      !privateBytes.subarray(0, 16).every((b, i) => b === prefixOf(role)[i])
    )
      throw Error('Unsupported prepared credential encoding');
    const nonce = random(12);
    // v2 lifecycle's credential carrier: direct root invocation, counted before this call.
    const ct = new Uint8Array(
      await subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: nonce,
          tagLength: 128,
          additionalData: credentialAAD(scope, role, id, publicKey),
        },
        await aes(root, subtle),
        privateBytes.subarray(16),
      ),
    );
    return { role, id, publicKey, sealed: { v: 2, nonce, ct } };
  } finally {
    privateBytes.fill(0);
  }
};
export const openCredential = async (
  scope: CryptoScope,
  root: Bytes,
  credential: SealedCredential,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<CryptoKey> => {
  const raw = new Uint8Array(
    await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: credential.sealed.nonce,
        tagLength: 128,
        additionalData: credentialAAD(scope, credential.role, credential.id, credential.publicKey),
      },
      await aes(root, subtle),
      credential.sealed.ct,
    ),
  );
  const pkcs8 = concat(prefixOf(credential.role), raw);
  try {
    if (raw.length !== 32) throw new Error('Invalid private credential');
    const key = await subtle.importKey(
      'pkcs8',
      pkcs8,
      algorithmOf(credential.role),
      false,
      usagesOf(credential.role),
    );
    // Check public/private correspondence before trusting advertised receiving/signing identity.
    if (credential.role === 'signing') {
      const publicKey = await subtle.importKey('raw', credential.publicKey, 'Ed25519', false, [
        'verify',
      ]);
      const challenge = utf8('done/custody-key-check/v2');
      const sig = await subtle.sign('Ed25519', key, challenge);
      if (!(await subtle.verify('Ed25519', publicKey, sig, challenge)))
        throw new Error('Credential public key mismatch');
    } else {
      const peer = await subtle.generateKey('X25519', false, ['deriveBits']);
      const publicKey = await subtle.importKey('raw', credential.publicKey, 'X25519', false, []);
      const a = new Uint8Array(
        await subtle.deriveBits({ name: 'X25519', public: peer.publicKey }, key, 256),
      );
      let b: Bytes | undefined;
      try {
        b = new Uint8Array(
          await subtle.deriveBits({ name: 'X25519', public: publicKey }, peer.privateKey, 256),
        );
        if (!a.every((n, i) => n === b![i])) throw new Error('Credential public key mismatch');
      } finally {
        a.fill(0);
        b?.fill(0);
      }
    }
    return key;
  } finally {
    raw.fill(0);
    pkcs8.fill(0);
  }
};

/** Each nested native crypto invocation checks its owning task, including after awaits.
 * The surrounding task.wait retains the permit until the complete helper settles. */
export const guardedSubtle = (guard: () => void): SubtleCrypto =>
  new Proxy(crypto.subtle, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        guard();
        return Reflect.apply(value, target, args);
      };
    },
  });
