/** Trusted internal matched cleanup effects. Lists carry ciphertext data, never verification/leases.
 * Callers own either original slot fencing or the fixed protection flight after native target coverage. */
import {
  requireWindowWorkerCohort,
  requireWindowCeremonyCohort,
  type WindowAccountCohort,
} from './accountWorkerCohort';
import { requireExclusiveSessionTask, type SessionTask } from './writeSession';
import { journalPair as pair, refuseJournalSnapshot as refuse } from './windowJournalRead';
import { RAW_JOURNAL_REMOVE_ITEMS, type RawJournalRemoval } from './workerJournalProtocol';
function removeMatched(
  prefix: string,
  input: readonly (readonly [string, string])[],
): RawJournalRemoval {
  if (
    !Array.isArray(input) ||
    input.length > RAW_JOURNAL_REMOVE_ITEMS ||
    input.some((v) => !pair(v, prefix)) ||
    new Set(input.map((v) => v[0])).size !== input.length
  )
    throw refuse();
  let removed = 0,
    changed = 0,
    retained = 0;
  for (const [key, value] of input) {
    try {
      const storage = globalThis.localStorage,
        current = storage.getItem(key);
      if (current === null) continue;
      if (current !== value) {
        changed++;
        continue;
      }
      storage.removeItem(key);
      removed++;
    } catch {
      retained++;
    }
  }
  return { removed, changed, retained };
}
/** Original fixed-index/old-slot mutation path; ceremony supervisors never pass this guard. */
export function createSlotJournalRemover(cohort: WindowAccountCohort, prefix: string) {
  requireWindowWorkerCohort(cohort);
  return Object.freeze({
    remove(input: readonly (readonly [string, string])[]) {
      requireWindowWorkerCohort(cohort);
      return cohort.write(() => removeMatched(prefix, input));
    },
  });
}
/** Original Page protection owns the actual exclusive task; higher owner authenticates copy/coverage. */
export function retirePageLocalJournal(
  task: SessionTask,
  slotId: string,
  prefix: string,
  input: readonly (readonly [string, string])[],
) {
  requireExclusiveSessionTask(task, slotId);
  return task.step(() => removeMatched(prefix, input));
}
/** Private startup-client effect, active ONLY for its requested protection command. Native owner first
 * authenticates target/source and exact covered immutable bytes. No broad prefix/slot-clear operation. */
export function createProtectionJournalRetirement(cohort: WindowAccountCohort) {
  requireWindowCeremonyCohort(cohort);
  let sequence = 0,
    current: { id: number; prefix?: string } | undefined;
  cohort.disposeWith(() => {
    current = undefined;
  });
  return Object.freeze({
    start(id: number) {
      requireWindowCeremonyCohort(cohort);
      if (current || !Number.isSafeInteger(id) || id <= sequence) throw refuse();
      sequence = id;
      current = { id };
    },
    stop(id: number) {
      if (current?.id === id) current = undefined;
    },
    remove(input: { id: number; prefix: string; entries: readonly (readonly [string, string])[] }) {
      requireWindowCeremonyCohort(cohort);
      if (
        !current ||
        input.id !== current.id ||
        typeof input.prefix !== 'string' ||
        !/^done\.pending-update\.done\.[a-f0-9]{32}\.$/u.test(input.prefix) ||
        (current.prefix !== undefined && current.prefix !== input.prefix)
      )
        throw refuse();
      current.prefix = input.prefix;
      return cohort.write(() => removeMatched(input.prefix, input.entries));
    },
  });
}
