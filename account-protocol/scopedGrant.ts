/** A network grant supplements, and never replaces, the operation's signed authority. */
import { closed, accountIdentifier } from './preparation.ts';
import { parseAuthorityPin, type AuthorityPin } from './authority.ts';
import { lp, unhex } from './recovery.ts';
import type { SessionRefusal } from './session.ts';

export const GRANT_LIFETIME_MS = 5 * 60 * 1000;
export const GRANT_CHALLENGE_MS = 60 * 1000;
export type GrantScope =
  | { kind: 'workspace'; workspaceId: string; credentialId: string }
  | { kind: 'removal'; workspaceId: string; credentialId: string }
  | { kind: 'enrollment'; workspaceId: string; credentialId: string; attemptId: string };
export type GrantAction =
  | 'remove'
  | 'submit'
  | 'read'
  | 'checkpoint'
  | 'discover'
  | 'admit'
  | 'ceremony'
  | 'transfer';
export type GrantTarget = GrantScope & { action: GrantAction };
export interface GrantChallenge {
  v: 1;
  pin: AuthorityPin;
  accountId: string;
  sessionId: string;
  scope: GrantScope;
  head: string;
  actions: GrantAction[];
  challengeId: string;
  expiresAt: number;
}
export type GrantRefusal =
  | SessionRefusal
  | 'insufficient-scope'
  | 'grant-required'
  | 'authority-changed';
export type GrantResult =
  | { ok: false; refusal: GrantRefusal }
  | { ok: true; stage: 'challenge'; challenge: GrantChallenge }
  | { ok: true; stage: 'granted'; grantToken: string; expiresAt: number; scope: GrantScope };
const hex = (input: unknown, size: number): string => {
  unhex(input, size);
  return input as string;
};
export function parseGrantScope(input: unknown): GrantScope {
  const kind = (input as GrantScope | null)?.kind;
  const v = closed(
    input,
    kind === 'enrollment'
      ? ['kind', 'workspaceId', 'credentialId', 'attemptId']
      : ['kind', 'workspaceId', 'credentialId'],
  );
  if (kind !== 'workspace' && kind !== 'enrollment' && kind !== 'removal')
    throw Error('Invalid grant scope');
  const shared = {
    workspaceId: hex(v['workspaceId'], 16),
    credentialId: hex(v['credentialId'], 16),
  };
  return kind !== 'enrollment'
    ? { kind, ...shared }
    : { kind, ...shared, attemptId: accountIdentifier(v['attemptId']) };
}
export function grantActions(scope: GrantScope): GrantAction[] {
  return scope.kind === 'workspace'
    ? ['submit', 'read', 'checkpoint', 'discover', 'remove']
    : scope.kind === 'removal'
      ? ['discover']
      : ['admit', 'ceremony', 'transfer'];
}
export function grantMessage(c: GrantChallenge): Uint8Array<ArrayBuffer> {
  const pin = parseAuthorityPin(c.pin),
    scope = parseGrantScope(c.scope);
  if (
    c.v !== 1 ||
    !Number.isSafeInteger(c.expiresAt) ||
    c.expiresAt < 0 ||
    JSON.stringify(c.actions) !== JSON.stringify(grantActions(scope))
  )
    throw Error('Invalid grant challenge');
  return lp(
    'done/scoped-network-grant/v1',
    '1',
    pin.serviceId,
    pin.origin,
    pin.rpId,
    pin.authRoot,
    accountIdentifier(c.accountId),
    accountIdentifier(c.sessionId),
    scope.kind,
    scope.workspaceId,
    scope.credentialId,
    scope.kind === 'enrollment' ? scope.attemptId : '',
    hex(c.head, 32),
    c.actions.join(','),
    accountIdentifier(c.challengeId),
    String(c.expiresAt),
  );
}
