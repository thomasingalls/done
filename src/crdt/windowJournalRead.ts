/** Read-only encrypted journal observations. A supervisor is sufficient for data, never storage authority. */
import { requireWindowSupervisor, type WindowAccountCohort } from './accountWorkerCohort';
import { JournalError } from './journalCodec';
import { RAW_JOURNAL_PAGE_CHARACTERS, type RawJournalPage } from './workerJournalProtocol';
// Recovery bound only; the original 1MiB append watermark is unchanged. Refusal preserves all data.
const MAX_RECOVERY_CHARACTERS = 16 * 1024 * 1024;
export const refuseJournalSnapshot = () =>
  new JournalError('repair-required', 'Worker journal scope or snapshot changed.');
export const journalPair = (v: unknown, prefix: string): v is readonly [string, string] => {
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

export function createWindowJournalReader(cohort: WindowAccountCohort) {
  requireWindowSupervisor(cohort);
  let sequence = 0;
  const snapshots = new Map<
    number,
    { rows: [string, string][]; index: number; characters: number; retained?: true; prefix: string }
  >();
  cohort.disposeWith(() => snapshots.clear());
  const read = (prefix: string) =>
    cohort.write(() => {
      if (
        typeof prefix !== 'string' ||
        !/^done\.pending-update\.done(?:\.[a-f0-9]{32})?\.$/u.test(prefix)
      )
        throw refuseJournalSnapshot();
      const storage = globalThis.localStorage,
        keys = Object.keys(storage),
        scoped = keys.filter((k) => k.startsWith(prefix)).sort();
      if (scoped.length > 65536) throw refuseJournalSnapshot();
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
        if (!journalPair(row, prefix)) throw refuseJournalSnapshot();
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
        throw refuseJournalSnapshot();
      return { rows, index: 0, characters, prefix };
    });
  return Object.freeze({
    begin(prefix: string) {
      return cohort.write(() => {
        if (snapshots.size >= 2 || sequence === Number.MAX_SAFE_INTEGER)
          throw refuseJournalSnapshot();
        const snapshot = read(prefix),
          id = ++sequence;
        snapshots.set(id, snapshot);
        return id;
      });
    },
    page(id: number): RawJournalPage {
      return cohort.write(() => {
        const snapshot = snapshots.get(id);
        if (!snapshot) throw refuseJournalSnapshot();
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
        if (done && !snapshot.retained) snapshots.delete(id);
        return { entries, characters: snapshot.characters, done };
      });
    },
    finish(id: number) {
      cohort.write(() => snapshots.delete(id));
    },
    /** A bounded ciphertext observation only. The native Worker must authenticate every page;
     * this number is not permission, a verification receipt or a native task. */
    beginObservation(prefix: string) {
      return cohort.write(() => {
        if (
          snapshots.size >= 2 ||
          [...snapshots.values()].some((v) => v.retained) ||
          sequence === Number.MAX_SAFE_INTEGER
        )
          throw refuseJournalSnapshot();
        const snapshot = read(prefix),
          id = ++sequence;
        snapshots.set(id, { ...snapshot, retained: true });
        return id;
      });
    },
    matchesObservation(id: number): boolean {
      return cohort.write(() => {
        const observed = snapshots.get(id);
        if (!observed?.retained || observed.index !== observed.rows.length)
          throw refuseJournalSnapshot();
        const current = read(observed.prefix);
        return (
          current.rows.length === observed.rows.length &&
          current.rows.every(
            ([key, value], i) => key === observed.rows[i]![0] && value === observed.rows[i]![1],
          )
        );
      });
    },
  });
}
