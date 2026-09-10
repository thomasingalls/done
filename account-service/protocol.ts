import { createHash, randomBytes } from 'node:crypto';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';

export type Operation = 'register' | 'confirm-registration' | 'authenticate';
export type BeginRequest = { operation: 'register' | 'authenticate'; retryKey: string };
export type AttemptRequest = { retryKey: string };
export type FinishRequest = AttemptRequest & { ceremonyId: string } & (
    | { operation: 'register'; response: RegistrationResponseJSON }
    | { operation: 'confirm-registration' | 'authenticate'; response: AuthenticationResponseJSON }
  );
export type Refusal =
  | 'malformed'
  | 'unknown-attempt'
  | 'operation-mismatch'
  | 'cancelled'
  | 'expired'
  | 'proof-conflict'
  | 'invalid-proof'
  | 'credential-in-use'
  | 'account-not-active'
  | 'account-not-pending'
  | 'recovery-conflict'
  | 'already-finished'
  | 'storage-unavailable';
export type Result =
  | { ok: false; refusal: Refusal }
  | {
      ok: true;
      attemptId: string;
      stage: 'ceremony';
      operation: Operation;
      ceremonyId: string;
      expiresAt: number;
      options: PublicKeyCredentialCreationOptionsJSON | PublicKeyCredentialRequestOptionsJSON;
    }
  | {
      ok: true;
      attemptId: string;
      stage: 'credential-confirmed' | 'account-proof';
      accountId: string;
      credentialId: string;
      /** A receipt identifier, never a bearer token or a content/relay grant. */
      receiptId: string;
    }
  | { ok: true; attemptId: string; stage: 'cancelled' };

export const refuse = (refusal: Refusal): { ok: false; refusal: Refusal } => ({
  ok: false,
  refusal,
});
export const fresh = (): string => randomBytes(32).toString('base64url');
export const hash = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');
export const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export const fields = (value: Record<string, unknown>, names: string[]): boolean =>
  Object.keys(value).every((key) => names.includes(key)) && names.every((key) => key in value);
export const bytes = (value: unknown, min = 1, max = 65536): Buffer => {
  if (
    typeof value !== 'string' ||
    value.length > Math.ceil((max * 4) / 3) ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    throw Error('Invalid base64url');
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length < min || decoded.length > max || decoded.toString('base64url') !== value)
    throw Error('Non-canonical base64url');
  return decoded;
};
export const retryHash = (value: unknown): string => hash(bytes(value, 32, 32));

/** Fixed-order LP UTF-8 fields; the nonce is service-owned, never caller supplied. */
export const challenge = (
  operation: Operation,
  attemptId: string,
  accountId: string,
  rpId: string,
  origin: string,
): string => {
  const parts = [`done/account/${operation}/v1`, attemptId, accountId, rpId, origin, fresh()].map(
    (value) => {
      const body = Buffer.from(value);
      const length = Buffer.alloc(2);
      if (body.length > 65535) throw Error('Challenge field too long');
      length.writeUInt16BE(body.length);
      return Buffer.concat([length, body]);
    },
  );
  return createHash('sha256').update(Buffer.concat(parts)).digest('base64url');
};

/** JSON key order is immaterial; exact clientDataJSON/authenticator bytes remain base64url strings. */
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  throw Error('Not JSON');
}
