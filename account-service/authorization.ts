import type { DatabaseSync } from 'node:sqlite';
import type { GrantRefusal, GrantTarget } from '../account-protocol/scopedGrant.ts';

/** Trusted service composition, not caller-supplied authority. Called by the domain owner after
 * proof verification inside its transaction. The returned check runs immediately before COMMIT,
 * allowing this operation's own authority transition while still checking session retirement. */
export type OperationAuthorization = (db: DatabaseSync, target: GrantTarget) => () => void;
export class AuthorizationRefused extends Error {
  readonly refusal: GrantRefusal;
  constructor(refusal: GrantRefusal) {
    super('Network authorization refused');
    this.refusal = refusal;
  }
}
export function rethrowAuthorization(cause: unknown): void {
  if (cause instanceof AuthorizationRefused) throw cause;
}
