/** Disposable native crash fixture. Test keys are stored only in this isolated test origin. */
import { setup, identity, cryptFor, readCensus, type keys } from './anchor-fixture';
import { withExclusiveSlot, type SessionTask } from '../../src/crdt/writeSession';
import { createContentOwner } from '../../src/crdt/contentStore';
import { openContentDb, contentTransaction } from '../../src/crdt/contentDatabase';
import {
  counterPayload,
  equalCounter,
  reserveCounter,
  parseStoredRecord,
} from '../../src/crdt/contentRecord';
import { deriveStoreName } from '../../src/crdt/storeName';
import { createPreparationJournal } from '../../src/crdt/retentionPreparation';
import {
  loadPreparationCheckpoint,
  importPreparationCheckpoint,
  savePreparationCheckpoint,
  disposePreparationCheckpoint,
  type PreparationStorageOwner,
} from '../../src/crdt/retentionPreparationStorage';
import { eraseVerified } from '../../src/crdt/verifiedRecords';
import { hex } from '../../src/crdt/custodyCrypto';
const id = 'native-preparation',
  context = '01'.repeat(32),
  intent = 'ab'.repeat(16);
let stage = 'idle';
export const state = () => stage;
interface Saved {
  keys: Awaited<ReturnType<typeof keys>>;
  rows: string;
}
async function saved(value?: Saved): Promise<Saved> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('disposable-preparation-test-keys', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('fixture');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction('fixture', value ? 'readwrite' : 'readonly'),
        r = value
          ? t.objectStore('fixture').put(value, 'current')
          : t.objectStore('fixture').get('current');
      t.oncomplete = () => resolve(value ?? r.result);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}
const rows = (value: unknown) =>
  JSON.stringify(value, (_key, v) => (v instanceof Uint8Array ? hex(v) : v));
function ownerFor(
  db: IDBDatabase,
  crypt: ReturnType<typeof cryptFor>,
  name: string,
): PreparationStorageOwner {
  const scope = identity(id),
    native = { db, identity: scope, intent };
  return {
    name,
    crypt,
    capture: async (t) => {
      const c = await readCensus(t, native),
        counter = c.counter!;
      if (!(await crypt.verify(t, counterPayload(scope, counter), counter.mac)))
        throw Error('Counter authentication');
      return {
        context,
        counter,
        inventory: { rows: c.rows, metadata: [{ key: 'counter', value: counter }] },
      };
    },
    reserve: async (t, n) => {
      const before = (await readCensus(t, native)).counter!,
        next = reserveCounter(before, n, 1);
      next.mac = await crypt.sign(t, counterPayload(scope, next));
      await contentTransaction<void>(
        db,
        t,
        ['meta'],
        'readwrite',
        (tx, _result, guard) => {
          const get = tx.objectStore('meta').get('counter');
          get.onsuccess = () =>
            guard(() => {
              if (!equalCounter(scope, get.result, before)) throw Error('Counter changed');
              tx.objectStore('meta').put(next, 'counter');
            });
        },
        'strict',
      );
      return { first: before.next_seq, generation: 1 };
    },
  };
}
async function opened(task: SessionTask, owner: PreparationStorageOwner) {
  const source = await owner.capture(task),
    read = await loadPreparationCheckpoint(task, owner, source),
    journal = createPreparationJournal({ context, current: () => task.step(() => {}) });
  if (read.status === 'ready') importPreparationCheckpoint(read.checkpoint, journal);
  const r = source.inventory.rows
    .map((r) => parseStoredRecord(r.value))
    .sort((a, b) => a.seq - b.seq)
    .at(-1)!;
  eraseVerified(source.inventory);
  return {
    ...read,
    journal,
    row: r,
    save: () => savePreparationCheckpoint(task, owner, read.checkpoint, journal),
    dispose: () => {
      disposePreparationCheckpoint(read.checkpoint);
      journal.dispose();
      eraseVerified(r);
    },
  };
}
export async function run(mode: 'complete' | 'reserved' | 'abort' | 'committed') {
  return withExclusiveSlot(id, async (task) => {
    const f = await setup(task, id, 4096),
      name = await deriveStoreName(id, id),
      owner = ownerFor(f.owner.db, f.owner.crypt, name);
    try {
      const first = await opened(task, owner);
      await first.journal.memo.check(
        'opened:' + first.row.seq,
        'physical',
        [first.row.nonce, first.row.ct],
        () => owner.crypt.open(task, first.row),
        () => task.step(() => {}),
      );
      await first.save();
      first.dispose();
      const census = await readCensus(task, f.owner),
        bytes = await f.owner.crypt.open(task, parseStoredRecord(census.rows[0]!.value));
      try {
        await f.carrier.append(task, [{ kind: 'state', bytes }]);
      } finally {
        bytes.fill(0);
      }
      const latest = await readCensus(task, f.owner);
      await saved({ keys: f.keys, rows: rows(latest.rows) });
      const p = await opened(task, owner);
      await p.journal.memo.check(
        'opened:' + p.row.seq,
        'physical',
        [p.row.nonce, p.row.ct],
        () => owner.crypt.open(task, p.row),
        () => task.step(() => {}),
      );
      if (mode === 'reserved')
        owner.crypt.seal = async () => {
          stage = 'reserved';
          await new Promise(() => {});
          throw Error('unreachable');
        };
      const put = IDBObjectStore.prototype.put;
      if (mode === 'abort')
        IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
          const r = put.apply(this, args);
          if (this.name === 'head') this.transaction.abort();
          return r;
        };
      const capture = owner.capture;
      let calls = 0;
      if (mode === 'committed')
        owner.capture = async (t) => {
          if (++calls === 2) {
            stage = 'committed';
            await new Promise(() => {});
          }
          return capture(t);
        };
      try {
        const result = await p.save();
        stage = 'saved';
        return result;
      } catch (cause) {
        if (mode !== 'abort') throw cause;
        stage = 'aborted';
        return { kind: 'aborted' };
      } finally {
        IDBObjectStore.prototype.put = put;
        p.dispose();
      }
    } finally {
      f.close();
    }
  });
}
export async function inspect() {
  return withExclusiveSlot(id, async (task) => {
    const retained = await saved(),
      scope = identity(id),
      crypt = cryptFor(scope, retained.keys),
      name = await deriveStoreName(id, id),
      db = await openContentDb(task, name, false);
    const owner = ownerFor(db, crypt, name);
    let p: Awaited<ReturnType<typeof loadPreparationCheckpoint>> | undefined;
    const journal = createPreparationJournal({ context, current: () => task.step(() => {}) });
    try {
      const source = await owner.capture(task);
      p = await loadPreparationCheckpoint(task, owner, source);
      if (p.status === 'ready') importPreparationCheckpoint(p.checkpoint, journal);
      const ordinary = createContentOwner(scope, 1, crypt);
      let ordinaryRows = 0;
      try {
        await ordinary.initialize(task);
        const r = await ordinary.load(task);
        ordinaryRows = r.length;
        eraseVerified(r);
      } finally {
        ordinary.dispose();
      }
      return {
        status: p.status,
        entries: journal.statistics.entries,
        originalsUnchanged: rows(source.inventory.rows) === retained.rows,
        ordinaryRows,
        next: source.counter.next_seq,
      };
    } finally {
      if (p) disposePreparationCheckpoint(p.checkpoint);
      journal.dispose();
      db.close();
    }
  });
}
