/** Private second-device preparation. No membership, slot or content grant. */
import { closed, accountIdentifier } from './preparation.ts';
import { parseAuthorityPin, type AuthorityPin } from './authority.ts';
import { digest, lp, unhex } from './recovery.ts';

export const ENROLLMENT_LIFETIME_MS = 600_000;
export const ENROLLMENT_REQUEST_LIMIT = 131_072;
export const ENROLLMENT_RESULT_LIMIT = 16_384;
export const ENROLLMENT_WORKSPACE_LIMIT = 64;
export const ENROLLMENT_TOTAL_LIMIT = 4096;
export interface EnrollmentCandidate {
  v: 1;
  workspaceId: string;
  lineageId: string;
  head: string;
  credentialId: string;
  sPub: string;
  wPub: string;
}
export interface EnrollmentContext {
  v: 1;
  pin: AuthorityPin;
  accountId: string;
  attemptId: string;
  candidate: EnrollmentCandidate;
  epoch: 1;
  certifiedSetDigest: string;
  recoveryStateDigest: string;
  passkeyId: string;
  nonce: string;
  expiresAt: number;
}
export interface EnrollmentChallenge {
  v: 1;
  kind: 'enrollment-preparation-challenge';
  context: EnrollmentContext;
  signature: string;
}
export interface EnrollmentReceipt {
  v: 1;
  kind: 'enrollment-preparation-receipt';
  context: EnrollmentContext;
  receiptId: string;
  preparedAt: number;
  expiresAt: number;
  assertionHash: string;
  possessionHash: string;
  signature: string;
}
export type EnrollmentStage = 'challenge' | 'prepared' | 'cancelled' | 'expired' | 'stale';
export type EnrollmentRefusal =
  | 'malformed'
  | 'unknown-attempt'
  | 'request-conflict'
  | 'proof-conflict'
  | 'invalid-proof'
  | 'unavailable'
  | 'candidate-in-use'
  | 'capacity'
  | 'storage-unavailable';
export type EnrollmentResult =
  | { ok: false; refusal: EnrollmentRefusal }
  | {
      ok: true;
      stage: EnrollmentStage;
      challenge: EnrollmentChallenge;
      receipt: EnrollmentReceipt | null;
    };
const h = (v: unknown, n = 32): string => {
  unhex(v, n);
  return v as string;
};
const timestamp = (v: unknown): number => {
  if (
    !Number.isSafeInteger(v) ||
    (v as number) < 0 ||
    (v as number) > Number.MAX_SAFE_INTEGER - ENROLLMENT_LIFETIME_MS
  )
    throw Error('Invalid enrollment timestamp');
  return v as number;
};
const b64 = (v: unknown, min: number, max: number): string => {
  if (typeof v !== 'string' || v.length > Math.ceil((max * 4) / 3) || !/^[A-Za-z0-9_-]+$/.test(v))
    throw Error('Invalid enrollment base64url');
  const raw = atob(v.replaceAll('-', '+').replaceAll('_', '/'));
  if (
    raw.length < min ||
    raw.length > max ||
    btoa(raw).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '') !== v
  )
    throw Error('Noncanonical enrollment base64url');
  return v;
};
export function parseEnrollmentCandidate(input: unknown): EnrollmentCandidate {
  const c = closed(input, [
    'v',
    'workspaceId',
    'lineageId',
    'head',
    'credentialId',
    'sPub',
    'wPub',
  ]);
  if (c['v'] !== 1) throw Error('Unsupported enrollment candidate');
  return {
    v: 1,
    workspaceId: h(c['workspaceId'], 16),
    lineageId: h(c['lineageId']),
    head: h(c['head']),
    credentialId: h(c['credentialId'], 16),
    sPub: h(c['sPub']),
    wPub: h(c['wPub']),
  };
}
export function parseEnrollmentContext(input: unknown): EnrollmentContext {
  const c = closed(input, [
    'v',
    'pin',
    'accountId',
    'attemptId',
    'candidate',
    'epoch',
    'certifiedSetDigest',
    'recoveryStateDigest',
    'passkeyId',
    'nonce',
    'expiresAt',
  ]);
  if (c['v'] !== 1 || c['epoch'] !== 1) throw Error('Unsupported enrollment authority');
  return {
    v: 1,
    pin: parseAuthorityPin(c['pin']),
    accountId: accountIdentifier(c['accountId']),
    attemptId: accountIdentifier(c['attemptId']),
    candidate: parseEnrollmentCandidate(c['candidate']),
    epoch: 1,
    certifiedSetDigest: h(c['certifiedSetDigest']),
    recoveryStateDigest: h(c['recoveryStateDigest']),
    passkeyId: b64(c['passkeyId'], 1, 1023),
    nonce: h(c['nonce']),
    expiresAt: timestamp(c['expiresAt']),
  };
}
export function parseEnrollmentChallenge(input: unknown): EnrollmentChallenge {
  const c = closed(input, ['v', 'kind', 'context', 'signature']);
  if (c['v'] !== 1 || c['kind'] !== 'enrollment-preparation-challenge')
    throw Error('Invalid enrollment challenge');
  return {
    v: 1,
    kind: 'enrollment-preparation-challenge',
    context: parseEnrollmentContext(c['context']),
    signature: h(c['signature'], 64),
  };
}
export function parseEnrollmentReceipt(input: unknown): EnrollmentReceipt {
  const r = closed(input, [
    'v',
    'kind',
    'context',
    'receiptId',
    'preparedAt',
    'expiresAt',
    'assertionHash',
    'possessionHash',
    'signature',
  ]);
  if (r['v'] !== 1 || r['kind'] !== 'enrollment-preparation-receipt')
    throw Error('Invalid enrollment receipt');
  const preparedAt = timestamp(r['preparedAt']),
    expiresAt = timestamp(r['expiresAt']),
    context = parseEnrollmentContext(r['context']);
  if (expiresAt !== preparedAt + ENROLLMENT_LIFETIME_MS || preparedAt >= context.expiresAt)
    throw Error('Invalid enrollment lifetime');
  return {
    v: 1,
    kind: 'enrollment-preparation-receipt',
    context,
    receiptId: accountIdentifier(r['receiptId']),
    preparedAt,
    expiresAt,
    assertionHash: h(r['assertionHash']),
    possessionHash: h(r['possessionHash']),
    signature: h(r['signature'], 64),
  };
}
export const enrollmentContextBytes = (c: EnrollmentContext) =>
  JSON.stringify(parseEnrollmentContext(c));
export const enrollmentChallengeMessage = (c: EnrollmentContext) =>
  lp('done/enrollment-preparation-challenge/v1', enrollmentContextBytes(c));
export const enrollmentPossessionMessage = (c: EnrollmentContext) =>
  lp('done/enrollment-preparation-possession/v1', enrollmentContextBytes(c));
export const enrollmentReceiptMessage = (r: EnrollmentReceipt) => {
  const { signature: _signature, ...body } = parseEnrollmentReceipt(r);
  return lp('done/enrollment-preparation-receipt/v1', JSON.stringify(body));
};
export async function enrollmentNonce(c: EnrollmentContext): Promise<string> {
  const hash = await digest(
    lp('done/enrollment-preparation-assertion/v1', enrollmentContextBytes(c)),
  );
  return btoa(String.fromCharCode(...unhex(hash, 32)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
export async function enrollmentOptions(c: EnrollmentContext) {
  const value = parseEnrollmentContext(c);
  return {
    challenge: await enrollmentNonce(value),
    rpId: value.pin.rpId,
    timeout: ENROLLMENT_LIFETIME_MS,
    userVerification: 'required' as const,
    allowCredentials: [{ type: 'public-key' as const, id: value.passkeyId }],
  };
}
export function requireEnrollmentTarget(
  c: EnrollmentContext,
  pin: AuthorityPin,
  candidate: EnrollmentCandidate,
): void {
  const context = parseEnrollmentContext(c);
  if (
    JSON.stringify(context.pin) !== JSON.stringify(parseAuthorityPin(pin)) ||
    JSON.stringify(context.candidate) !== JSON.stringify(parseEnrollmentCandidate(candidate))
  )
    throw Error('Enrollment target changed');
}
async function verify(pub: string, signature: string, message: Uint8Array<ArrayBuffer>) {
  const key = await crypto.subtle.importKey('raw', unhex(pub, 32), 'Ed25519', false, ['verify']);
  if (!(await crypto.subtle.verify('Ed25519', key, unhex(signature, 64), message)))
    throw Error('Invalid enrollment signature');
}
export async function verifyEnrollmentChallenge(
  input: unknown,
  pin: AuthorityPin,
  candidate: EnrollmentCandidate,
  now: number,
) {
  const c = parseEnrollmentChallenge(input);
  requireEnrollmentTarget(c.context, pin, candidate);
  if (
    !Number.isSafeInteger(now) ||
    now < 0 ||
    c.context.expiresAt <= now ||
    c.context.expiresAt - now > ENROLLMENT_LIFETIME_MS
  )
    throw Error('Expired enrollment challenge');
  await verify(pin.authRoot, c.signature, enrollmentChallengeMessage(c.context));
  return c;
}
/** Checks historical evidence only. Live preparation eligibility comes from the service owner. */
export async function verifyEnrollmentReceipt(
  input: unknown,
  pin: AuthorityPin,
  candidate: EnrollmentCandidate,
) {
  const r = parseEnrollmentReceipt(input);
  requireEnrollmentTarget(r.context, pin, candidate);
  await verify(pin.authRoot, r.signature, enrollmentReceiptMessage(r));
  return r;
}
export const verifyEnrollmentPossession = (context: EnrollmentContext, signature: string) =>
  verify(context.candidate.sPub, signature, enrollmentPossessionMessage(context));
export const parseEnrollmentRetry = (input: unknown) => {
  const r = closed(input, ['retryKey']);
  return { retryKey: b64(r['retryKey'], 32, 32) };
};
export const parseEnrollmentBegin = (input: unknown) => {
  const r = closed(input, ['retryKey', 'candidate']);
  return {
    retryKey: b64(r['retryKey'], 32, 32),
    candidate: parseEnrollmentCandidate(r['candidate']),
  };
};
export const parseEnrollmentFinish = (input: unknown) => {
  const r = closed(input, ['retryKey', 'attemptId', 'response', 'possession']);
  return {
    retryKey: b64(r['retryKey'], 32, 32),
    attemptId: accountIdentifier(r['attemptId']),
    response: r['response'],
    possession: h(r['possession'], 64),
  };
};

/** The stage is an unsigned observation. Only the receipt is immutable signed evidence. */
export function parseEnrollmentResult(input: unknown): EnrollmentResult {
  if (new TextEncoder().encode(JSON.stringify(input)).length > ENROLLMENT_RESULT_LIMIT)
    throw Error('Oversized enrollment result');
  const ok = input !== null && typeof input === 'object' && 'ok' in input && input.ok;
  if (ok === false) {
    const r = closed(input, ['ok', 'refusal']);
    const values: EnrollmentRefusal[] = [
      'malformed',
      'unknown-attempt',
      'request-conflict',
      'proof-conflict',
      'invalid-proof',
      'unavailable',
      'candidate-in-use',
      'capacity',
      'storage-unavailable',
    ];
    if (!values.includes(r['refusal'] as EnrollmentRefusal))
      throw Error('Unknown enrollment refusal');
    return { ok: false, refusal: r['refusal'] as EnrollmentRefusal };
  }
  const r = closed(input, ['ok', 'stage', 'challenge', 'receipt']);
  if (
    r['ok'] !== true ||
    !['challenge', 'prepared', 'cancelled', 'expired', 'stale'].includes(r['stage'] as string)
  )
    throw Error('Unknown enrollment stage');
  const challenge = parseEnrollmentChallenge(r['challenge']),
    receipt = r['receipt'] === null ? null : parseEnrollmentReceipt(r['receipt']);
  if (
    (r['stage'] === 'prepared' && !receipt) ||
    (r['stage'] === 'challenge' && receipt) ||
    (receipt &&
      enrollmentContextBytes(receipt.context) !== enrollmentContextBytes(challenge.context))
  )
    throw Error('Inconsistent enrollment result');
  return { ok: true, stage: r['stage'] as EnrollmentStage, challenge, receipt };
}
