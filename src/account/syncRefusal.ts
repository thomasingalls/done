/** Why a send or receive request got no result, as a closed list (phase 552). It travels beside
 * the lane's unchanged `network-unavailable` reason and chooses the sentence the sync notice
 * shows. A service reply is unsigned: its reason chooses a code and nothing else, never a cursor,
 * a halt, or whether or when the lane retries. No runtime dependencies, so the page can use it. */
import { HISTORY_FAILURES, type HistoryFailureCode } from './historyFailureCodes';

export const DELIVERY_REFUSALS = [
  // No usable answer: the only codes whose sentence says to check the connection.
  'unreachable',
  'timeout',
  // The service's own delivery hints (`account-protocol/diagnostics.ts` SERVICE_HINTS).
  'removal-pending',
  'ledger-integrity',
  'storage-unavailable',
  'invalid-request',
  'envelope-size',
  'unsupported-epoch',
  'out-of-order',
  'parent-required',
  'unissued-parent',
  'unavailable',
  'state-changed',
  // The service's hint envelope with a reason this version does not know, or a malformed one.
  'refused',
  // An answer too large to use.
  'unusable',
  // From the scoped transport and the network login.
  'capacity',
  'access-refused',
  'authority-changed',
  'login-disconnected',
] as const;
export type DeliveryRefusal = (typeof DELIVERY_REFUSALS)[number];
/** On the receive lane, a history failure keeps its phase 551 code. */
export type SyncRefusal = DeliveryRefusal | HistoryFailureCode;
export const isSyncRefusal = (v: unknown): v is SyncRefusal =>
  typeof v === 'string' &&
  ((DELIVERY_REFUSALS as readonly string[]).includes(v) ||
    (HISTORY_FAILURES as readonly string[]).includes(v));

const NO_ANSWER = new Set<SyncRefusal>([
  'unreachable',
  'timeout',
  'history-unreachable',
  'history-timeout',
  'history-stopped',
]);
/** One lane step's explanation. An answer the service gave outranks no answer; within each, the
 * first one noted stands. Presentation only: nothing reads it to decide what the lane does. */
export function createRefusalNote() {
  let noted: SyncRefusal | undefined;
  return {
    reset() {
      noted = undefined;
    },
    note(refusal: SyncRefusal | undefined) {
      if (!refusal) return;
      if (!noted || (NO_ANSWER.has(noted) && !NO_ANSWER.has(refusal))) noted = refusal;
    },
    take() {
      const value = noted;
      noted = undefined;
      return value;
    },
  };
}
