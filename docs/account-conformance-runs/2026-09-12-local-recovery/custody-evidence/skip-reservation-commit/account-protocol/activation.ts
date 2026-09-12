/** Fixed-purpose first activation. Context is public; no assertion or credential secret is persisted here. */
import { closed, accountIdentifier } from './preparation.ts';
import { parseAuthorityPin, type AuthorityPin } from './authority.ts';
import { digest, lp, unhex } from './recovery.ts';
export const ACTIVATION_LIFETIME_MS = 10 * 60 * 1000;
export interface ActivationTarget {
  accountId: string;
  requestDigest: string;
  offerHead: string;
  completionDigest: string;
}
export interface ActivationContext extends ActivationTarget {
  v: 1;
  pin: AuthorityPin;
  credentialId: string;
  nonce: string;
  expiresAt: number;
}
export interface ActivationChallenge {
  v: 1;
  kind: 'promotion-activation-challenge';
  context: ActivationContext;
  signature: string;
}
export interface ActivationAuthorization {
  context: ActivationContext;
  proofHash: string;
}
export interface RetainedActivation {
  challenge: ActivationChallenge;
  proofHash: string | null;
}
const h = (input: unknown, size = 32): string => {
  unhex(input, size);
  return input as string;
};
const encode = (s: string) => btoa(s).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
function credentialId(input: unknown): string {
  if (typeof input !== 'string' || !/^[A-Za-z0-9_-]{1,1364}$/.test(input))
    throw Error('Invalid activation credential');
  const raw = atob(input.replaceAll('-', '+').replaceAll('_', '/'));
  if (raw.length > 1023 || encode(raw) !== input) throw Error('Invalid activation credential');
  return input;
}
export function parseActivationContext(input: unknown): ActivationContext {
  const c = closed(input, [
    'v',
    'pin',
    'accountId',
    'requestDigest',
    'offerHead',
    'completionDigest',
    'credentialId',
    'nonce',
    'expiresAt',
  ]);
  if (c['v'] !== 1 || !Number.isSafeInteger(c['expiresAt']) || (c['expiresAt'] as number) < 0)
    throw Error('Unsupported activation context');
  return {
    v: 1,
    pin: parseAuthorityPin(c['pin']),
    accountId: accountIdentifier(c['accountId']),
    requestDigest: h(c['requestDigest']),
    offerHead: h(c['offerHead']),
    completionDigest: h(c['completionDigest']),
    credentialId: credentialId(c['credentialId']),
    nonce: h(c['nonce']),
    expiresAt: c['expiresAt'] as number,
  };
}
export function requireActivationTarget(
  input: ActivationContext,
  expected: ActivationTarget,
  pin: AuthorityPin,
): void {
  const c = parseActivationContext(input);
  if (
    JSON.stringify(c.pin) !== JSON.stringify(parseAuthorityPin(pin)) ||
    Object.keys(expected).some(
      (k) => c[k as keyof ActivationTarget] !== expected[k as keyof ActivationTarget],
    )
  )
    throw Error('Activation target changed');
}
export function parseActivationChallenge(input: unknown): ActivationChallenge {
  const c = closed(input, ['v', 'kind', 'context', 'signature']);
  if (c['v'] !== 1 || c['kind'] !== 'promotion-activation-challenge')
    throw Error('Unsupported activation challenge');
  return {
    v: 1,
    kind: 'promotion-activation-challenge',
    context: parseActivationContext(c['context']),
    signature: h(c['signature'], 64),
  };
}
export function parseActivationAuthorization(input: unknown): ActivationAuthorization {
  const a = closed(input, ['context', 'proofHash']);
  return { context: parseActivationContext(a['context']), proofHash: h(a['proofHash']) };
}
export function parseRetainedActivation(input: unknown): RetainedActivation {
  const a = closed(input, ['challenge', 'proofHash']);
  return {
    challenge: parseActivationChallenge(a['challenge']),
    proofHash: a['proofHash'] === null ? null : h(a['proofHash']),
  };
}
const contextDigest = (c: ActivationContext) =>
  digest(new TextEncoder().encode(JSON.stringify(parseActivationContext(c))));
export const activationMessage = async (c: ActivationContext) =>
  lp('done/promotion-activation-challenge/v1', await contextDigest(c));
export async function activationNonce(c: ActivationContext): Promise<string> {
  const hash = await digest(lp('done/promotion-activation/v1', await contextDigest(c)));
  return encode(String.fromCharCode(...unhex(hash, 32)));
}
export async function activationOptions(c: ActivationContext) {
  return {
    challenge: await activationNonce(c),
    rpId: c.pin.rpId,
    timeout: ACTIVATION_LIFETIME_MS,
    userVerification: 'required' as const,
    allowCredentials: [{ type: 'public-key' as const, id: c.credentialId }],
  };
}
