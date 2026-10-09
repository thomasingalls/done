/** Explicit dual-purpose challenge. Neither ordinary offline nor login assertions use this domain. */
import { parseAuthorityPin, type AuthorityPin } from './authority.ts';
import { lp, unhex } from './recovery.ts';

export interface SessionUnlockInput {
  nonce: string;
  principalId: string;
  credentialId: string;
}
export interface SessionUnlockContext extends SessionUnlockInput {
  v: 1;
  pin: AuthorityPin;
  accountId: string;
  attemptId: string;
  retryHash: string;
  serverNonce: string;
  expiresAt: number;
}
export function parseSessionUnlock(input: unknown): SessionUnlockInput {
  const x = input as SessionUnlockInput;
  if (!x || Object.keys(x).sort().join() !== 'credentialId,nonce,principalId')
    throw Error('Invalid combined unlock context');
  unhex(x.nonce, 32);
  if (
    typeof x.principalId !== 'string' ||
    !x.principalId ||
    x.principalId.length > 512 ||
    typeof x.credentialId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,2048}$/.test(x.credentialId)
  )
    throw Error('Invalid combined unlock identity');
  return { nonce: x.nonce, principalId: x.principalId, credentialId: x.credentialId };
}
export function sessionUnlockMessage(x: SessionUnlockContext): Uint8Array<ArrayBuffer> {
  if (
    !x ||
    Object.keys(x).sort().join() !==
      'accountId,attemptId,credentialId,expiresAt,nonce,pin,principalId,retryHash,serverNonce,v' ||
    x.v !== 1
  )
    throw Error('Invalid combined challenge');
  const pin = parseAuthorityPin(x.pin);
  parseSessionUnlock({ nonce: x.nonce, principalId: x.principalId, credentialId: x.credentialId });
  unhex(x.retryHash, 32);
  for (const value of [x.accountId, x.attemptId, x.serverNonce])
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value))
      throw Error('Invalid combined service identity');
  if (!Number.isSafeInteger(x.expiresAt) || x.expiresAt < 0) throw Error('Invalid combined expiry');
  return lp(
    'done/account-session-and-slot-unlock/v1',
    '1',
    pin.serviceId,
    pin.origin,
    pin.rpId,
    pin.authRoot,
    x.accountId,
    x.principalId,
    x.credentialId,
    x.attemptId,
    x.retryHash,
    x.nonce,
    x.serverNonce,
    String(x.expiresAt),
  );
}
export async function sessionUnlockChallenge(
  x: SessionUnlockContext,
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', sessionUnlockMessage(x)));
}
