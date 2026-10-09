// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { initializeEmptyAccountGeneration } from '../src/crdt/contentRotation';
import { CONTENT_STORES, counterPayload, type ContentCounter } from '../src/crdt/contentRecord';
import type { ContentCrypto } from '../src/crdt/contentStore';
import type { SessionTask } from '../src/crdt/writeSession';
const scope = {
  slotId: 'slot',
  principalId: 'principal',
  workspaceId: 'workspace',
  storeId: '11'.repeat(16),
  rootId: '22'.repeat(16),
};
const task: SessionTask = {
  signal: new AbortController().signal,
  step: (f) => f(),
  wait: async (f) => f(),
};
let db: IDBDatabase;
beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  db = await new Promise((resolve, reject) => {
    const r = indexedDB.open('initial');
    r.onupgradeneeded = () => {
      for (const name of CONTENT_STORES) r.result.createObjectStore(name);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
});
afterEach(() => {
  db.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function write(fn: (tx: IDBTransaction) => void) {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([...CONTENT_STORES], 'readwrite', { durability: 'strict' });
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    fn(tx);
  });
}
async function fixture() {
  const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
  const crypt: ContentCrypto = {
    open: async () => {
      throw Error('Must not open content');
    },
    seal: async () => {
      throw Error('Must not seal content');
    },
    sign: async (_t, b) => new Uint8Array(await crypto.subtle.sign('HMAC', key, b)),
    verify: (_t, b, mac) => crypto.subtle.verify('HMAC', key, mac, b),
  };
  let counter: ContentCounter = {
    v: 1,
    store_id: scope.storeId,
    intent: '33'.repeat(16),
    active_gen: 1,
    next_seq: 1,
    reserved: { 1: 0 },
    mac: new Uint8Array(32),
  };
  const save = async (next: ContentCounter) => {
    counter = { ...next, mac: await crypt.sign(task, counterPayload(scope, next)) };
    await write((tx) => tx.objectStore('meta').put(counter, 'counter'));
  };
  await save(counter);
  const read = () =>
    new Promise<{
      counter: ContentCounter;
      rows: { store: string; key: IDBValidKey; value: unknown }[];
    }>((resolve, reject) => {
      const tx = db.transaction([...CONTENT_STORES]);
      const result = {
        counter: null as unknown as ContentCounter,
        rows: [] as { store: string; key: IDBValidKey; value: unknown }[],
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error);
      for (const name of CONTENT_STORES) {
        const req = tx.objectStore(name).openCursor();
        req.onsuccess = () => {
          const r = req.result;
          if (!r) return;
          if (name === 'meta') result.counter = r.value;
          else result.rows.push({ store: name, key: r.key, value: r.value });
          r.continue();
        };
      }
    });
  const owner = { db, scope, generation: 3, intent: counter.intent, read, crypt };
  return {
    counter,
    save,
    read,
    owner,
    run: (check = () => {}) => initializeEmptyAccountGeneration(task, owner, check),
  };
}
it('initializes directly at the admitted generation and resumes exact committed state', async () => {
  const f = await fixture();
  await f.run();
  await f.run();
  const saved = await f.read();
  expect(saved.rows).toEqual([]);
  expect(saved.counter).toMatchObject({ active_gen: 3, next_seq: 1, reserved: { 1: 0, 3: 0 } });
  expect(
    await f.owner.crypt.verify(task, counterPayload(scope, saved.counter), saved.counter.mac),
  ).toBe(true);
});
it('refuses allocated or occupied carriers, other generations and forged metadata', async () => {
  const f = await fixture();
  for (const counter of [
    { ...f.counter, next_seq: 2, reserved: { 1: 1 } },
    { ...f.counter, active_gen: 2, reserved: { 1: 0, 2: 0 } },
  ]) {
    await f.save(counter);
    await expect(f.run()).rejects.toThrow('untouched empty');
  }
  await f.save(f.counter);
  await write((tx) => tx.objectStore('content').put({ writing: 'retained' }, 1));
  await expect(f.run()).rejects.toThrow('untouched empty');
  await write((tx) => {
    tx.objectStore('content').clear();
    tx.objectStore('meta').put({ ...f.counter, mac: new Uint8Array(32) }, 'counter');
  });
  await expect(f.run()).rejects.toThrow('authentication');
});
it('refuses journal work both before and inside the committing transaction', async () => {
  const f = await fixture();
  await expect(
    f.run(() => {
      throw Error('journal');
    }),
  ).rejects.toThrow('journal');
  let checks = 0;
  await expect(
    f.run(() => {
      if (++checks === 2) throw Error('late journal');
    }),
  ).rejects.toThrow('late journal');
  expect((await f.read()).counter).toEqual(f.counter);
});
it('compares the complete census again and never overwrites a concurrent content row', async () => {
  const f = await fixture(),
    sign = f.owner.crypt.sign;
  f.owner.crypt.sign = async (task, bytes) => {
    await write((tx) => tx.objectStore('outbound').put({ retained: true }, 1));
    return sign(task, bytes);
  };
  await expect(f.run()).rejects.toThrow('Carrier changed');
  expect((await f.read()).rows).toHaveLength(1);
  expect((await f.read()).counter).toEqual(f.counter);
});
it('aborted activation leaves the original counter intact and can retry', async () => {
  const f = await fixture(),
    put = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(
    function (this: IDBObjectStore, value, key) {
      if (key === 'counter' && value.active_gen === 3) this.transaction.abort();
      return put.call(this, value, key);
    },
  );
  await expect(f.run()).rejects.toThrow();
  vi.restoreAllMocks();
  expect((await f.read()).counter).toEqual(f.counter);
  await f.run();
  expect((await f.read()).counter.active_gen).toBe(3);
});
