/** Internal exact-coverage owner. No caller document, coverage token, or arbitrary deletion API. */
import { Y, hasPendingUpdates } from './yjs';
import type { Bytes } from './custodyCrypto';
import {
  CONTENT_STORES,
  MAX_BATCH_BYTES,
  ContentError,
  corrupt,
  equalCounter,
  parseCounter,
  parseStoredRecord,
  recordStore,
  type ContentIdentity,
  type ContentCounter,
  type StoredRecord,
  type OpenedRecord,
} from './contentRecord';
import { contentTransaction } from './contentDatabase';
import type { SessionTask } from './writeSession';

export interface DiskRow {
  store: string;
  key: IDBValidKey;
  value: unknown;
}
export interface DiskState {
  counter: ContentCounter | null;
  rows: DiskRow[];
}
export interface ContentCompactionReceipt {
  readonly status: 'unchanged' | 'compacted' | 'retained';
  readonly storeId: string;
  readonly generation: number;
  readonly stateSequence: number | null;
  readonly removed: readonly number[];
}
interface Owner {
  scope: ContentIdentity;
  generation: number;
  intent: string;
  db: IDBDatabase;
  read(): Promise<DiskState>;
  authenticate(snapshot: DiskState): Promise<OpenedRecord[]>;
  publish(bytes: Bytes): Promise<StoredRecord>;
  checkJournal(): void;
}
const equalBytes = (a: Bytes, b: Bytes) => a.length === b.length && a.every((v, i) => v === b[i]);
export const equalStoredRecord = (a: StoredRecord, b: StoredRecord): boolean =>
  a.v === b.v &&
  a.gen === b.gen &&
  a.seq === b.seq &&
  a.kind === b.kind &&
  true;

/** Validate even a singleton; return whether every struct/deletion dependency integrated. */
export const validateContentUpdates = (updates: readonly Bytes[]): boolean => {
  const doc = new Y.Doc({ gc: false });
  try {
    for (const bytes of updates) {
      Y.decodeUpdate(bytes);
      Y.applyUpdate(doc, bytes);
    }
    return !hasPendingUpdates(doc);
  } catch (cause) {
    throw new ContentError('repair-required', 'Persisted CRDT bytes are unreadable.', { cause });
  } finally {
    doc.destroy();
  }
};
const content = (records: OpenedRecord[]) =>
  records.filter((r) => r.kind === 'update' || r.kind === 'state');
const erase = (records: OpenedRecord[]) => {
  for (const r of records) r.bytes.fill(0);
};

/** Recheck the entire authenticated census in one native transaction before any deletion. */
const removeCovered = (
  task: SessionTask,
  owner: Owner,
  audited: DiskState,
  covered: StoredRecord[],
) =>
  task.wait(() =>
    contentTransaction<boolean>(
      owner.db,
      task,
      [...CONTENT_STORES],
      'readwrite',
      (tx, result, guard) => {
        result(false);
        const rows: DiskRow[] = [];
        let counter: ContentCounter | null = null,
          complete = 0;
        const done = () => {
          if (++complete !== CONTENT_STORES.length) return;
          const current = counter ?? corrupt('The content counter disappeared during trim.');
          const expectedCounter =
            audited.counter ?? corrupt('The content counter disappeared during trim.');
          if (current.active_gen !== owner.generation)
            throw new ContentError('generation-changed', 'Content generation changed before trim.');
          if (
            !equalCounter(owner.scope, current, expectedCounter) ||
            rows.length !== audited.rows.length
          )
            return;
          const expectedRows = new Map(audited.rows.map((r) => [r.store + ':' + String(r.key), r]));
          for (const row of rows) {
            const expected = expectedRows.get(row.store + ':' + String(row.key));
            if (
              !expected ||
              row.key !== expected.key ||
              !equalStoredRecord(parseStoredRecord(row.value), parseStoredRecord(expected.value))
            )
              return;
          }
          // Synchronous authenticated journal census: a known unreadable carrier aborts the whole deletion.
          owner.checkJournal();
          for (const record of covered) tx.objectStore('content').delete(record.seq);
          result(true);
        };
        for (const name of CONTENT_STORES) {
          const req = tx.objectStore(name).openCursor();
          req.onsuccess = () =>
            guard(() => {
              const c = req.result;
              if (!c) {
                done();
                return;
              }
              if (name === 'meta') {
                if (counter || c.key !== 'counter')
                  corrupt('Unknown content metadata during trim.');
                counter = parseCounter(c.value, owner.scope, owner.intent);
              } else rows.push({ store: name, key: c.key, value: c.value });
              c.continue();
            });
        }
      },
    ),
  );

export const compactContent = async (
  task: SessionTask,
  owner: Owner,
): Promise<ContentCompactionReceipt> => {
  const receipt = (
    status: ContentCompactionReceipt['status'],
    stateSequence: number | null,
    removed: number[] = [],
  ) =>
    Object.freeze({
      status,
      storeId: owner.scope.storeId,
      generation: owner.generation,
      stateSequence,
      removed: Object.freeze(removed),
    });
  task.step(owner.checkJournal);
  const initial = await owner.read(),
    opened = await owner.authenticate(initial);
  let merged: Bytes | undefined;
  let replacement: StoredRecord;
  const covered = initial.rows
    .filter((r) => r.store === 'content')
    .map((r) => parseStoredRecord(r.value));
  try {
    const updates = content(opened).map((r) => r.bytes);
    const complete = task.step(() => validateContentUpdates(updates));
    // Pinned Yjs can strand cross-client structs after merging an incomplete union, even
    // after later dependencies arrive. Keep original framing until the disk union integrates.
    if (!complete) return receipt('retained', null);
    if (!covered.length || (covered.length === 1 && covered[0]!.kind === 'state'))
      return receipt('unchanged', null);
    // Merge only an integrated disk union; coverage still comes from exact records, never a vector.
    merged = task.step(() => new Uint8Array(Y.mergeUpdates(updates)));
    if (merged.length > MAX_BATCH_BYTES)
      throw new ContentError(
        'batch-too-large',
        'Compacted state exceeds the bounded record limit.',
      );
    task.step(owner.checkJournal);
    replacement = await owner.publish(merged);
  } finally {
    merged?.fill(0);
    erase(opened);
  }
  // Bounded contention leaves safe duplication. Retrying starts from a fresh census, never a saved watermark.
  for (let attempt = 0; attempt < 8; attempt++) {
    task.step(owner.checkJournal);
    const audited = await owner.read(),
      verified = await owner.authenticate(audited);
    try {
      task.step(() => validateContentUpdates(content(verified).map((r) => r.bytes)));
    } finally {
      erase(verified);
    }
    let missing = false;
    const currentRows = new Map(
      audited.rows.map((row) => [row.store + ':' + String(row.key), row]),
    );
    for (const record of [replacement, ...covered]) {
      const row = currentRows.get(recordStore(record.kind) + ':' + record.seq);
      if (!row) {
        missing = true;
        continue;
      }
      if (!equalStoredRecord(parseStoredRecord(row.value), record))
        corrupt('A covered record or its replacement changed during trim.');
    }
    // Another compactor may have removed these immutable records with its own replacement.
    if (missing) return receipt('retained', replacement.seq);
    if (await removeCovered(task, owner, audited, covered))
      return receipt(
        'compacted',
        replacement.seq,
        covered.map((r) => r.seq),
      );
  }
  return receipt('retained', replacement.seq);
};
