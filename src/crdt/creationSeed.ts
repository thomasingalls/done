/** One factor-sealed recovery seed, captured atomically with the fresh Local claim.
 * Its keys predate lock setup. It never stores a recovery code or an unencrypted private key. */
import {
  fields,
  hkdf,
  random,
  utf8,
  hex,
  type Bytes,
  type CryptoScope,
  type CredentialRole,
} from './custodyCrypto';
import { closed } from '../../account-protocol/preparation';
import { unhex } from '../../account-protocol/recovery';
export const CREATION_SEED_LIMIT = 96 * 1024 * 1024;
export interface CreationCredential {
  role: CredentialRole;
  id: string;
  publicKey: Bytes;
  privateBytes: Bytes;
}
export interface CreationSeed {
  credentials: [CreationCredential, CreationCredential];
  progress: unknown;
}
export interface SealedCreationSeed {
  v: 1;
  salt: Bytes;
  nonce: Bytes;
  ct: Bytes;
}
export function captureCreationSeed(seed: CreationSeed): CreationSeed {
  if (!seed || !Array.isArray(seed.credentials) || seed.credentials.length !== 2)
    throw Error('Invalid creation seed');
  seed.credentials.forEach((c, i) => {
    if (
      !c ||
      c.role !== (i === 0 ? 'wrapping' : 'signing') ||
      !/^[a-f0-9]{32}$/.test(c.id) ||
      !(c.publicKey instanceof Uint8Array) ||
      c.publicKey.length !== 32 ||
      !(c.privateBytes instanceof Uint8Array) ||
      c.privateBytes.length !== 48
    )
      throw Error('Invalid creation credential');
  });
  if (seed.credentials[0].id === seed.credentials[1].id)
    throw Error('Duplicate creation credential');
  const progress = structuredClone(seed.progress);
  const credentials = seed.credentials.map((c) => ({
    ...c,
    publicKey: c.publicKey.slice(),
    privateBytes: c.privateBytes.slice(),
  })) as CreationSeed['credentials'];
  return { credentials, progress };
}
export function eraseCreationSeed(seed: CreationSeed) {
  for (const c of seed.credentials) c.privateBytes.fill(0);
}
const info = (scope: CryptoScope, id: string) =>
  fields('done/custody-creation-seed/v1', scope.principalId, scope.workspaceId, id);
export async function sealCreationSeed(
  seed: CreationSeed,
  scope: CryptoScope,
  id: string,
  factor: Bytes,
  subtle: SubtleCrypto,
): Promise<SealedCreationSeed> {
  const salt = random(16),
    nonce = random(12),
    aad = info(scope, id),
    plain = utf8(
      JSON.stringify({
        v: 1,
        credentials: seed.credentials.map((c) => ({
          ...c,
          publicKey: hex(c.publicKey),
          privateBytes: hex(c.privateBytes),
        })),
        progress: seed.progress,
      }),
    );
  try {
    if (plain.length > CREATION_SEED_LIMIT - 16) throw Error('Recovery progress is too large');
    const key = await hkdf(
      factor,
      salt,
      aad,
      { name: 'AES-GCM', length: 256 },
      ['encrypt'],
      subtle,
    );
    return {
      v: 1,
      salt,
      nonce,
      ct: new Uint8Array(
        await subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad }, key, plain),
      ),
    };
  } finally {
    plain.fill(0);
  }
}
export function parseSealedCreationSeed(input: unknown): SealedCreationSeed {
  const s = closed(input, ['v', 'salt', 'nonce', 'ct']);
  if (
    s['v'] !== 1 ||
    !(s['salt'] instanceof Uint8Array) ||
    s['salt'].length !== 16 ||
    !(s['nonce'] instanceof Uint8Array) ||
    s['nonce'].length !== 12 ||
    !(s['ct'] instanceof Uint8Array) ||
    s['ct'].length < 16 ||
    s['ct'].length > CREATION_SEED_LIMIT
  )
    throw Error('Invalid sealed creation seed');
  return { v: 1, salt: s['salt'].slice(), nonce: s['nonce'].slice(), ct: s['ct'].slice() };
}
export async function openCreationSeed(
  input: SealedCreationSeed,
  scope: CryptoScope,
  id: string,
  factor: Bytes,
  subtle: SubtleCrypto,
): Promise<CreationSeed> {
  const sealed = parseSealedCreationSeed(input),
    aad = info(scope, id),
    key = await hkdf(
      factor,
      sealed.salt,
      aad,
      { name: 'AES-GCM', length: 256 },
      ['decrypt'],
      subtle,
    ),
    plain = new Uint8Array(
      await subtle.decrypt(
        { name: 'AES-GCM', iv: sealed.nonce, additionalData: aad },
        key,
        sealed.ct,
      ),
    );
  try {
    const s = closed(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain)), [
      'v',
      'credentials',
      'progress',
    ]);
    if (s['v'] !== 1 || !Array.isArray(s['credentials']) || s['credentials'].length !== 2)
      throw Error('Invalid creation seed');
    const credentials = s['credentials'].map((input) => {
      const c = closed(input, ['role', 'id', 'publicKey', 'privateBytes']);
      return {
        role: c['role'],
        id: c['id'],
        publicKey: unhex(c['publicKey'], 32),
        privateBytes: unhex(c['privateBytes'], 48),
      };
    }) as CreationSeed['credentials'];
    try {
      return captureCreationSeed({ credentials, progress: s['progress'] });
    } finally {
      for (const c of credentials) c.privateBytes.fill(0);
    }
  } finally {
    plain.fill(0);
  }
}
