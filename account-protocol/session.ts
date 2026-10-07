import type { SessionUnlockContext } from './sessionUnlock.ts';
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
