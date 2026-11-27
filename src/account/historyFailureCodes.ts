/** The closed list of history failure codes (phase 551), with no runtime dependencies, so the
 * page and the sync notice can name them (phase 552). */
/** Refusals the history route names in a 409 reply (`account-service/historyCheckpoint.ts`). */
export const HISTORY_ROUTE_REFUSALS = [
  'checkpoint-busy',
  'checkpoint-cancelled',
  'sources-changed',
  'checkpoint-required',
  'admission-conflict',
  'checkpoint-conflict',
  'retention-boundary-changed',
  'source-unavailable',
  'state-changed',
  'checkpoint-too-large',
  'ledger-integrity',
  'unavailable',
  'invalid-proof',
  'malformed',
] as const;
export const HISTORY_FAILURES = [
  // No usable reply: the only failures that say to check the connection.
  'history-unreachable',
  'history-timeout',
  'history-stopped',
  // Named by the history route, and its 404 and malformed replies.
  ...HISTORY_ROUTE_REFUSALS.map((r) => `history-${r}` as const),
  'history-not-found',
  // Sign-in and access, from the scoped transport.
  'history-sign-in-required',
  'history-sync-disconnected',
  'history-authority-changed',
  'history-capacity',
  'history-storage-unavailable',
  'history-access-refused',
  // A refusal whose reason is unknown or malformed.
  'history-refused',
  // A reply that arrived but did not verify.
  'history-reply-unverified',
  // This device's own checks.
  'history-advanced',
  'history-finish-saved',
  'history-prune-unchanged',
  'history-not-producer',
  'history-receive-pending',
  'history-local-progress',
  // Anything else.
  'history-failed',
] as const;
export type HistoryFailureCode = (typeof HISTORY_FAILURES)[number];
export const isHistoryFailureCode = (v: unknown): v is HistoryFailureCode =>
  typeof v === 'string' && (HISTORY_FAILURES as readonly string[]).includes(v);
