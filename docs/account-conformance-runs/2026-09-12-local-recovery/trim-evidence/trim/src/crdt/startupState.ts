/** Startup dispositions are observations, never permission to create, migrate or clear. */
export type StartupKind =
  | 'app-update-required'
  | 'unlock-required'
  | 'fresh'
  | 'creation-pending'
  | 'migration-required'
  | 'clearing'
  | 'cleared'
  | 'repair-required'
  | 'slot-closed'
  | 'identity-required'
  | 'unlock-failed'
  | 'busy'
  | 'unavailable'
  | 'unsupported'
  | 'cancelled';
export interface StartupDisposition {
  readonly kind: StartupKind;
  readonly reason: string;
}
export class StartupError extends Error {
  override readonly name = 'StartupError';
  constructor(readonly disposition: StartupDisposition) {
    super(disposition.reason);
  }
}
export function stopStartup(kind: StartupKind, reason: string): never {
  throw new StartupError(Object.freeze({ kind, reason }));
}
