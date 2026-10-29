/** The worker can read encrypted journal pages and compare/remove committed entries. It cannot append. */
import { requireWindowWorkerCohort, type WindowAccountCohort } from './accountWorkerCohort';
import { readLocalSlot } from './localGenesisStorage';
import { deriveStoreName } from './storeName';
import { journalPrefix, JournalError } from './journalCodec';
import type { SessionTask } from './writeSession';

import {
  RAW_JOURNAL_PAGE_CHARACTERS,
  RAW_JOURNAL_REMOVE_ITEMS,
  type RawJournalPage,
  type RawJournalRemoval,
} from './workerJournalProtocol';
export {
  RAW_JOURNAL_PAGE_CHARACTERS,
  RAW_JOURNAL_REMOVE_ITEMS,
  type RawJournalSnapshot,
  type RawJournalPage,
  type RawJournalRemoval,
} from './workerJournalProtocol';
// Recovery bound only; the original 1MiB append watermark is unchanged. Refusal preserves all data.
const MAX_RECOVERY_CHARACTERS = 16 * 1024 * 1024;
const refuse = () =>
  new JournalError('repair-required', 'Worker journal scope or snapshot changed.');
const pair = (v: unknown, prefix: string): v is readonly [string, string] => {
  if (!Array.isArray(v) || v.length !== 2) return false;
  const d = Object.getOwnPropertyDescriptors(v);
  if (!d['0'] || !d['1'] || !('value' in d['0']) || !('value' in d['1'])) return false;
  const [key, value] = v;
  return (
    typeof key === 'string' &&
    key.startsWith(prefix) &&
    /^[a-f0-9]{32}\.[a-f0-9]{32}\.[0-9]{16}$/.test(key.slice(prefix.length)) &&
    typeof value === 'string' &&
    value.length <= RAW_JOURNAL_PAGE_CHARACTERS - key.length
  );
};

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
  let sequence = 0;
  const snapshots = new Map<
    number,
    { rows: [string, string][]; index: number; characters: number }
  >();
  cohort.disposeWith(() => snapshots.clear());
  const read = () =>
    cohort.write(() => {
      const storage = globalThis.localStorage,
        keys = Object.keys(storage),
        scoped = keys.filter((k) => k.startsWith(prefix)).sort();
      if (scoped.length > 65536) throw refuse();
      let characters = 0;
      const rows: [string, string][] = [];
      for (const key of keys) {
        const value = storage.getItem(key);
        if (value !== null) characters += key.length + value.length;
      }
      for (const key of scoped) {
        const value = storage.getItem(key);
        if (value === null)
          throw new JournalError('journal-changed', 'Journal changed during capture.');
        const row: [string, string] = [key, value];
        if (!pair(row, prefix)) throw refuse();
        rows.push(row);
      }
      const after = Object.keys(storage)
        .filter((k) => k.startsWith(prefix))
        .sort();
      if (after.length !== scoped.length || after.some((k, i) => k !== scoped[i]))
        throw new JournalError('journal-changed', 'Journal changed during capture.');
      for (const [key, value] of rows)
        if (storage.getItem(key) !== value)
          throw new JournalError('journal-changed', 'Journal changed during capture.');
      if (rows.reduce((n, [k, v]) => n + k.length + v.length, 0) > MAX_RECOVERY_CHARACTERS)
        throw refuse();
      return { rows, index: 0, characters };
    });
  return Object.freeze({
    prefix,
    begin() {
      return cohort.write(() => {
        if (snapshots.size >= 2 || sequence === Number.MAX_SAFE_INTEGER) throw refuse();
        const snapshot = read(),
          id = ++sequence;
        snapshots.set(id, snapshot);
        return id;
      });
    },
    page(id: number): RawJournalPage {
      return cohort.write(() => {
        const snapshot = snapshots.get(id);
        if (!snapshot) throw refuse();
        const entries: [string, string][] = [];
        let characters = 0;
        while (snapshot.index < snapshot.rows.length) {
          const row = snapshot.rows[snapshot.index]!;
          if (
            entries.length &&
            characters + row[0].length + row[1].length > RAW_JOURNAL_PAGE_CHARACTERS
          )
            break;
          entries.push(row);
          characters += row[0].length + row[1].length;
          snapshot.index++;
        }
        const done = snapshot.index === snapshot.rows.length;
        if (done) snapshots.delete(id);
        return { entries, characters: snapshot.characters, done };
      });
    },
    finish(id: number) {
      cohort.write(() => snapshots.delete(id));
    },
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
