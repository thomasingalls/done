/** Detached admission projection AFTER the real worker has authenticated its entire native recovery.
 * This grants no verification/coverage authority and never fabricates a record, receipt or cursor. */
import type { JournalRecovery } from './custody';

export function copyAccountMirrorRecovery(input: JournalRecovery): JournalRecovery {
  return {
    records: input.records
      .filter((record) => record.kind === 'state' || record.kind === 'update')
      .map(({ kind, gen, seq, bytes }) => ({ kind, gen, seq, bytes: bytes.slice() })),
    journal: input.journal.map(({ key, generation, bytes }) => ({
      key,
      generation,
      bytes: bytes.slice(),
    })),
  };
}
