/** Test-only entry: keys are generated for this disposable profile, never from user custody. */
import { setup, identity, cryptFor, type keys } from './anchor-fixture';
import { withExclusiveSlot } from '../../src/crdt/writeSession';
import { openContentDb } from '../../src/crdt/contentDatabase';
import { createContentOwner } from '../../src/crdt/contentStore';
import { deriveStoreName } from '../../src/crdt/storeName';
import { readEncryptedBaseline } from '../../src/crdt/localBaselineStorage';
import { hex } from '../../src/crdt/custodyCrypto';

const id = 'native-baseline-anchor';
interface Saved {
  keys: Awaited<ReturnType<typeof keys>>;
  hash: string;
  rows: string;
}
let stage = 'idle';
export const state = () => stage;
async function saved(value?: Saved): Promise<Saved> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('disposable-baseline-test-keys', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('keys');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    return await new Promise<Saved>((resolve, reject) => {
      const tx = db.transaction('keys', value ? 'readwrite' : 'readonly');
      const r = value
        ? tx.objectStore('keys').put(value, 'fixture')
        : tx.objectStore('keys').get('fixture');
      tx.oncomplete = () => resolve(value ?? (r.result as Saved));
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function physical(db: IDBDatabase) {
  return new Promise<string>((resolve, reject) => {
    const tx = db.transaction(['content', 'heads', 'outbound']),
      out: unknown[] = [];
    for (const name of ['content', 'heads', 'outbound']) {
      const s = tx.objectStore(name),
        v = s.getAll(),
        k = s.getAllKeys();
      k.onsuccess = () => out.push([name, k.result, v.result]);
    }
    tx.oncomplete = () =>
      resolve(JSON.stringify(out, (_k, v) => (v instanceof Uint8Array ? hex(v) : v)));
    tx.onabort = () => reject(tx.error);
  });
}
export async function run(mode: 'complete' | 'reserved' | 'abort-final' | 'lost-reply') {
  return withExclusiveSlot(id, async (task) => {
    const f = await setup(task, id);
    try {
      await saved({ keys: f.keys, hash: f.input.anchor.hash, rows: await physical(f.owner.db) });
      if (mode === 'reserved')
        f.owner.crypt.seal = async () => {
          stage = 'reserved';
          await new Promise(() => {});
          throw Error('unreachable');
        };
      const put = IDBObjectStore.prototype.put;
      if (mode === 'abort-final')
        IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
          const request = put.apply(this, args);
          if (args[1] === 'counter' && (args[0] as { v: number }).v === 3) this.transaction.abort();
          return request;
        };
      try {
        await f.anchor();
      } catch (e) {
        stage = 'aborted';
        throw e;
      } finally {
        IDBObjectStore.prototype.put = put;
      }
      stage = 'committed';
      if (mode === 'lost-reply') await new Promise(() => {});
      return { hash: f.input.anchor.hash };
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
      db = await openContentDb(task, await deriveStoreName(id, id), false);
    try {
      const counter = await new Promise<{ v: number; next_seq: number }>((resolve, reject) => {
        const tx = db.transaction('meta'),
          r = tx.objectStore('meta').get('counter');
        tx.oncomplete = () => resolve(r.result);
        tx.onabort = () => reject(tx.error);
      });
      const unchanged = (await physical(db)) === retained.rows;
      if (counter.v === 2) return { v: 2, next: counter.next_seq, unchanged };
      const opened = await readEncryptedBaseline(task, {
        db,
        identity: scope,
        generation: 1,
        intent: 'ab'.repeat(16),
        crypt,
        assertCurrent: async () => {},
        checkCommit() {},
      });
      return {
        v: 3,
        next: counter.next_seq,
        unchanged,
        hashMatches: opened.anchor.hash === retained.hash,
        chunks: opened.counter.baseline.chunks,
      };
    } finally {
      db.close();
    }
  });
}
/** Bundled once with the predecessor's exact contentRecord.ts to prove its real refusal. */
export async function ordinaryOpen() {
  return withExclusiveSlot(id, async (task) => {
    const retained = await saved(),
      scope = identity(id),
      carrier = createContentOwner(scope, 1, cryptFor(scope, retained.keys));
    try {
      await carrier.initialize(task);
      return 'opened';
    } catch (e) {
      return String((e as { code?: string }).code ?? (e as Error).message);
    } finally {
      carrier.dispose();
    }
  });
}
