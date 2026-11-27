/** The history replay bound, kept apart from the replay so page-side code can name it (phase 547). */
import type { HistoryCheckpoint } from '../../account-protocol/historyCheckpoint';

/** Accepted positions one history replay may read, across every publisher. The value is
 * unchanged; `historySource.ts` re-exports it. Past it no snapshot can be prepared or verified. */
export const HISTORY_REPLAY_EVENTS = 4096;

/** Preparing or verifying a snapshot would read more positions than one replay may. Raised
 * before any position is read; the message is the one the replay always used. */
export class HistoryReplayLimit extends Error {
  constructor(
    readonly needed: number,
    readonly allowed: number,
  ) {
    super('History replay exceeds its event bound');
  }
}

/** Positions a replay from `start` to `cuts` reads: per publisher, its cut less its start. */
export function historyReplayPositions(
  cuts: HistoryCheckpoint['heads'],
  start: HistoryCheckpoint['heads'],
): number {
  let total = 0;
  for (const cut of cuts) {
    const from = start.find((h) => h.credentialId === cut.credentialId)?.position ?? 0;
    total += Math.max(0, cut.position - from);
  }
  return total;
}
