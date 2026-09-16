/** Row-11 primitive bytes. Opening commitments proves neither exchange order nor approval. */
import { closed } from './preparation.ts';
import { hex, lp, unhex } from './recovery.ts';

export interface CeremonyTranscript {
  workspaceId: string;
  epoch: number;
  head: string;
  existingCredentialId: string;
  newCredentialId: string;
  wPub: string;
  sPub: string;
  recoveryStateDigest: string;
  nonceExisting: string;
  nonceNew: string;
}
export interface CeremonyCommitments {
  existing: string;
  new: string;
}
export type CeremonyRole = 'existing' | 'new';
const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const h = (input: unknown): string => {
  unhex(input, 32);
  return input as string;
};
const identity = (input: unknown): string => {
  if (typeof input !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input))
    throw Error('Invalid ceremony identity');
  return input;
};
const role = (input: unknown): CeremonyRole => {
  if (input !== 'existing' && input !== 'new') throw Error('Invalid ceremony role');
  return input;
};
const hash = async (bytes: Uint8Array<ArrayBuffer>, subtle: SubtleCrypto): Promise<string> =>
  hex(new Uint8Array(await subtle.digest('SHA-256', bytes)));

/** Bounds every scalar; copies input before asynchronous crypto. No authority lookup. */
export function parseCeremonyTranscript(input: unknown): CeremonyTranscript {
  const r = closed(input, [
    'workspaceId',
    'epoch',
    'head',
    'existingCredentialId',
    'newCredentialId',
    'wPub',
    'sPub',
    'recoveryStateDigest',
    'nonceExisting',
    'nonceNew',
  ]);
  const epoch = r['epoch'];
  if (!Number.isSafeInteger(epoch) || (epoch as number) < 1) throw Error('Invalid ceremony epoch');
  const existingCredentialId = identity(r['existingCredentialId']),
    newCredentialId = identity(r['newCredentialId']);
  if (existingCredentialId === newCredentialId) throw Error('Ceremony roles need distinct devices');
  return {
    workspaceId: identity(r['workspaceId']),
    epoch: epoch as number,
    head: h(r['head']),
    existingCredentialId,
    newCredentialId,
    wPub: h(r['wPub']),
    sPub: h(r['sPub']),
    recoveryStateDigest: h(r['recoveryStateDigest']),
    nonceExisting: h(r['nonceExisting']),
    nonceNew: h(r['nonceNew']),
  };
}

export function parseCeremonyCommitments(input: unknown): CeremonyCommitments {
  const r = closed(input, ['existing', 'new']);
  return { existing: h(r['existing']), new: h(r['new']) };
}

export function ceremonyCommitment(
  inputRole: unknown,
  nonce: unknown,
  subtle = crypto.subtle,
): Promise<string> {
  return hash(lp('done/enroll-commit/v1', role(inputRole), h(nonce)), subtle);
}

export function ceremonyTranscriptBytes(input: unknown): Uint8Array<ArrayBuffer> {
  const r = parseCeremonyTranscript(input);
  return lp(
    'done/enroll/v1',
    r.workspaceId,
    String(r.epoch),
    r.head,
    r.existingCredentialId,
    r.newCredentialId,
    r.wPub,
    r.sPub,
    r.recoveryStateDigest,
    r.nonceExisting,
    r.nonceNew,
  );
}

export function ceremonyWrapInfo(transcriptHash: unknown): Uint8Array<ArrayBuffer> {
  return lp('done/enroll-wrap/v1', h(transcriptHash));
}

/**
 * Verifies nonce openings and derives public bytes. Callers must separately own
 * both commitments before disclosure, eligibility and the durable one-guess gate.
 * Returning this value never grants key release or recipient certification.
 */
export async function deriveCeremonyOpening(
  input: unknown,
  inputCommitments: unknown,
  subtle = crypto.subtle,
): Promise<Readonly<{ transcriptHash: string; sas: string; wrapInfo: string }>> {
  const r = parseCeremonyTranscript(input),
    commitments = parseCeremonyCommitments(inputCommitments),
    bytes = ceremonyTranscriptBytes(r);
  const [existing, candidate] = await Promise.all([
    ceremonyCommitment('existing', r.nonceExisting, subtle),
    ceremonyCommitment('new', r.nonceNew, subtle),
  ]);
  if (existing !== commitments.existing || candidate !== commitments.new)
    throw Error('Ceremony commitment mismatch');
  const transcriptHash = await hash(bytes, subtle),
    key = await subtle.importKey('raw', bytes, 'HKDF', false, ['deriveBits']),
    symbols = new Uint8Array(
      await subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: lp('done/enroll-sas/v1') },
        key,
        40,
      ),
    );
  const sas = Array.from(symbols, (b) => alphabet[b & 31]!).join('');
  return Object.freeze({ transcriptHash, sas, wrapInfo: hex(ceremonyWrapInfo(transcriptHash)) });
}

/** Shape validation only. A normalized input still needs the owner's single durable comparison. */
export function normalizeCeremonyCode(input: unknown): string {
  if (
    typeof input !== 'string' ||
    input.length > 64 ||
    [...input].some((c) => {
      const n = c.charCodeAt(0);
      return !(n >= 32 && n <= 126) && !(n >= 9 && n <= 13);
    })
  )
    throw Error('Invalid ceremony code');
  const value = input
    .replaceAll(/[-\s]/gu, '')
    .toUpperCase()
    .replaceAll('O', '0')
    .replaceAll(/[IL]/gu, '1');
  if (value.length !== 5 || [...value].some((symbol) => !alphabet.includes(symbol)))
    throw Error('A ceremony code has five Crockford Base32 symbols');
  return value;
}
