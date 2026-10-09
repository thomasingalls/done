import type { SessionUnlockContext } from './sessionUnlock.ts';
import { closed, accountIdentifier } from './preparation.ts';
/** Network login only. None of these credentials opens writing or grants device membership. */
export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_ACCESS_MS = 5 * 60 * 1000;
export const SESSION_RETRY_MS = 10 * 60 * 1000;
export const SESSION_REQUEST_LIMIT = 65536;
export type SessionOperation = 'begin' | 'finish' | 'cancel' | 'acknowledge' | 'renew' | 'revoke';
export type SessionRefusal =
  | 'malformed'
  | 'unknown-attempt'
  | 'request-conflict'
  | 'proof-conflict'
  | 'invalid-proof'
  | 'expired'
  | 'cancelled'
  | 'retry-unavailable'
  | 'sign-in-required'
  | 'access-required'
  | 'wrong-account'
  | 'capacity'
  | 'storage-unavailable';
export interface SessionIssued {
  ok: true;
  stage: 'issued';
  sessionId: string;
  accountId: string;
  credentialId: string;
  issuedAt: number;
  expiresAt: number;
  renewalToken: string;
  revokeToken: string;
}
export type SessionIssuanceResult = SessionIssued | { ok: false; refusal: SessionRefusal };
export function parseSessionIssuance(input: unknown): SessionIssuanceResult {
  if ((input as { ok?: unknown } | null)?.ok === false) {
    const r = closed(input, ['ok', 'refusal']);
    const reasons: SessionRefusal[] = [
      'malformed',
      'unknown-attempt',
      'request-conflict',
      'proof-conflict',
      'invalid-proof',
      'expired',
      'cancelled',
      'retry-unavailable',
      'sign-in-required',
      'access-required',
      'wrong-account',
      'capacity',
      'storage-unavailable',
    ];
    if (!reasons.includes(r['refusal'] as SessionRefusal)) throw Error('Invalid session refusal');
    return { ok: false, refusal: r['refusal'] as SessionRefusal };
  }
  const r = closed(input, [
    'ok',
    'stage',
    'sessionId',
    'accountId',
    'credentialId',
    'issuedAt',
    'expiresAt',
    'renewalToken',
    'revokeToken',
  ]);
  if (
    r['ok'] !== true ||
    r['stage'] !== 'issued' ||
    typeof r['credentialId'] !== 'string' ||
    !/^[A-Za-z0-9_-]{1,1364}$/.test(r['credentialId']) ||
    !Number.isSafeInteger(r['issuedAt']) ||
    (r['issuedAt'] as number) < 0 ||
    !Number.isSafeInteger(r['expiresAt']) ||
    (r['expiresAt'] as number) - (r['issuedAt'] as number) !== SESSION_LIFETIME_MS
  )
    throw Error('Invalid session issuance');
  return {
    ok: true,
    stage: 'issued',
    sessionId: accountIdentifier(r['sessionId']),
    accountId: accountIdentifier(r['accountId']),
    credentialId: r['credentialId'],
    issuedAt: r['issuedAt'] as number,
    expiresAt: r['expiresAt'] as number,
    renewalToken: accountIdentifier(r['renewalToken']),
    revokeToken: accountIdentifier(r['revokeToken']),
  };
}
export type SessionResult =
  | { ok: false; refusal: SessionRefusal }
  | {
      ok: true;
      stage: 'challenge';
      attemptId: string;
      unlock?: SessionUnlockContext;
      expiresAt: number;
      options: {
        challenge: string;
        rpId: string;
        timeout: number;
        userVerification: 'required';
      };
    }
  | SessionIssued
  | {
      ok: true;
      stage: 'access';
      sessionId: string;
      accountId: string;
      accessToken: string;
      expiresAt: number;
    }
  | { ok: true; stage: 'cancelled' | 'acknowledged' | 'revoked' };
