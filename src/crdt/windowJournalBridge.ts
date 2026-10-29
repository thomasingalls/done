/** The worker can read encrypted journal pages and compare/remove committed entries. It cannot append. */
import { requireWindowWorkerCohort, type WindowAccountCohort } from './accountWorkerCohort';
import { readLocalSlot } from './localGenesisStorage';
import { deriveStoreName } from './storeName';
import { journalPrefix } from './journalCodec';
import {
  createWindowJournalReader,
  journalPair as pair,
  refuseJournalSnapshot as refuse,
} from './windowJournalRead';
import type { SessionTask } from './writeSession';

import { RAW_JOURNAL_REMOVE_ITEMS, type RawJournalRemoval } from './workerJournalProtocol';
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
  const reader = createWindowJournalReader(cohort);
  return Object.freeze({
    prefix,
    begin: () => reader.begin(prefix),
    page: reader.page,
    finish: reader.finish,
    beginObservation: () => reader.beginObservation(prefix),
    matchesObservation: reader.matchesObservation,
    remove(input: readonly (readonly [string, string])[]): RawJournalRemoval {
      return cohort.write(() => {
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
      });
    },
  });
}
export type WindowJournalBridge = Awaited<ReturnType<typeof createWindowJournalBridge>>;
