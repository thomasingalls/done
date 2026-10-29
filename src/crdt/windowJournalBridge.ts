import { createSlotJournalRemover } from './windowJournalMutation';
/** The worker can read encrypted journal pages and compare/remove committed entries. It cannot append. */
import { requireWindowWorkerCohort, type WindowAccountCohort } from './accountWorkerCohort';
import { readLocalSlot } from './localGenesisStorage';
import { deriveStoreName } from './storeName';
import { journalPrefix } from './journalCodec';
import { createWindowJournalReader, refuseJournalSnapshot as refuse } from './windowJournalRead';
import type { SessionTask } from './writeSession';

export {
  RAW_JOURNAL_PAGE_CHARACTERS,
  RAW_JOURNAL_REMOVE_ITEMS,
  type RawJournalSnapshot,
  type RawJournalPage,
  type RawJournalRemoval,
} from './workerJournalProtocol';
export async function createWindowJournalBridge(cohort: WindowAccountCohort) {
  requireWindowWorkerCohort(cohort);
  const task: SessionTask = {
    signal: cohort.signal,
    step<T>(effect: () => T & (T extends PromiseLike<unknown> ? never : T)): T {
      return cohort.write<T>(effect);
    },
    wait: async (start) => {
      cohort.write(() => {});
      const value = await start();
      cohort.write(() => {});
      return value;
    },
  };
  const slot = await readLocalSlot(task, cohort.ticket.slotId);
  if (!slot || slot.status !== 'active' || slot.stores.length !== 1) throw refuse();
  const selected = slot.stores[0]!;
  if (
    selected.dbName !==
    (await task.wait(() => deriveStoreName(selected.principal, selected.workspace)))
  )
    throw refuse();
  const prefix = journalPrefix(selected.dbName);
  const reader = createWindowJournalReader(cohort),
    remover = createSlotJournalRemover(cohort, prefix);
  return Object.freeze({
    prefix,
    begin: () => reader.begin(prefix),
    page: reader.page,
    finish: reader.finish,
    beginObservation: () => reader.beginObservation(prefix),
    matchesObservation: reader.matchesObservation,
    remove: remover.remove,
  });
}
export type WindowJournalBridge = Awaited<ReturnType<typeof createWindowJournalBridge>>;
