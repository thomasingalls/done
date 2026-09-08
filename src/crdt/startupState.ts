/** Startup dispositions are observations, never permission to create, migrate or clear. */
export type StartupKind =
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
export const stopStartup = (kind: StartupKind, reason: string): never => {
  throw new StartupError(Object.freeze({ kind, reason }));
};
