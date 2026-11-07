// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openWindowAccountCohort } from '../src/crdt/accountWorkerCohort';
import { createWindowJournalBridge } from '../src/crdt/windowJournalBridge';
import { deriveStoreName } from '../src/crdt/storeName';
import { journalPrefix } from '../src/crdt/journalCodec';
const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
class StorageMap implements Storage {
  [key: string]: unknown;
  get length() {
    return Object.keys(this).length;
  }
  key(i: number) {
    return Object.keys(this)[i] ?? null;
  }
  getItem(k: string) {
    return Object.hasOwn(this, k) ? (this[k] as string) : null;
  }
  setItem(k: string, v: string) {
    Object.defineProperty(this, k, {
      value: v,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  removeItem(k: string) {
    delete this[k];
  }
  clear() {
    for (const k of Object.keys(this)) delete this[k];
  }
}
async function fixture(wrongRoute = false) {
  const held: { name: string; mode: LockMode; clientId: string }[] = [];
  vi.stubGlobal('window', {});
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('navigator', {
    locks: {
      query: async () => ({ held, pending: [] }),
      request: async (
        name: string,
        options: LockOptions,
        callback: (lock: Lock) => Promise<unknown>,
      ) => {
        const lock = { name, mode: options.mode ?? 'exclusive', clientId: 'window-unit' };
        held.push(lock);
        try {
          return await callback(lock);
        } finally {
          held.splice(held.indexOf(lock), 1);
        }
      },
    },
  });
  const storage = new StorageMap();
  vi.stubGlobal('localStorage', storage);
  const dbName = await deriveStoreName('11'.repeat(16), '22'.repeat(16));
  await new Promise<void>((resolve, reject) => {
    const q = indexedDB.open('done.slots', 1);
    q.onupgradeneeded = () => q.result.createObjectStore('slots', { keyPath: 'id' });
    q.onerror = () => reject(q.error);
    q.onsuccess = () => {
      const db = q.result,
        t = db.transaction('slots', 'readwrite');
      t.objectStore('slots').put({
        id: 'bridge-slot',
        status: 'active',
        unlockBinding: null,
        stores: [
          {
            principal: '11'.repeat(16),
            workspace: '22'.repeat(16),
            dbName: wrongRoute ? 'done.' + 'ff'.repeat(16) : dbName,
          },
        ],
      });
      t.oncomplete = () => {
        db.close();
        resolve();
      };
      t.onerror = () => reject(t.error);
    };
  });
  const cohort = await openWindowAccountCohort('bridge-slot', async () => {});
  stops.push(() => cohort.close());
  const prefix = journalPrefix(dbName),
    key = (n: number) =>
      prefix + '33'.repeat(16) + '.' + '44'.repeat(16) + '.' + String(n).padStart(16, '0');
  return { storage, cohort, key, prefix, open: () => createWindowJournalBridge(cohort) };
}
it('retained ciphertext observation survives final page but expires at explicit finish', async () => {
  const f = await fixture();
  f.storage.setItem(f.key(1), 'ciphertext');
  const bridge = await f.open(),
    id = bridge.beginObservation();
  expect(bridge.page(id).done).toBe(true);
  expect(bridge.matchesObservation(id)).toBe(true);
  bridge.finish(id);
  expect(() => bridge.matchesObservation(id)).toThrow();
  expect(f.storage.getItem(f.key(1))).toBe('ciphertext');
});
it('all bounded pages must be consumed before the observation can be compared', async () => {
  const f = await fixture();
  f.storage.setItem(f.key(1), 'a'.repeat(20000));
  f.storage.setItem(f.key(2), 'b'.repeat(20000));
  const bridge = await f.open(),
    id = bridge.beginObservation();
  expect(bridge.page(id).done).toBe(false);
  expect(() => bridge.matchesObservation(id)).toThrow();
  expect(bridge.page(id).done).toBe(true);
  expect(bridge.matchesObservation(id)).toBe(true);
  bridge.finish(id);
});
it('added, removed or replaced scoped ciphertext refuses equality without erasing any entry', async () => {
  for (const fault of ['added', 'removed', 'replaced']) {
    const f = await fixture();
    f.storage.setItem(f.key(1), 'ciphertext');
    const bridge = await f.open(),
      id = bridge.beginObservation();
    bridge.page(id);
    if (fault === 'added') f.storage.setItem(f.key(2), 'new');
    else if (fault === 'removed') f.storage.removeItem(f.key(1));
    else f.storage.setItem(f.key(1), 'replacement');
    const retained = { ...f.storage };
    expect(bridge.matchesObservation(id)).toBe(false);
    expect({ ...f.storage }).toEqual(retained);
    bridge.finish(id);
  }
});
it('unrelated scope writes and global storage budget changes do not invalidate this scope', async () => {
  const f = await fixture();
  f.storage.setItem(f.key(1), 'ciphertext');
  const bridge = await f.open(),
    id = bridge.beginObservation();
  bridge.page(id);
  f.storage.setItem('other-account-journal', 'other ciphertext');
  expect(bridge.matchesObservation(id)).toBe(true);
  bridge.finish(id);
});
it('one retained observation shares the two-snapshot bound and does not change ordinary completion', async () => {
  const f = await fixture(),
    bridge = await f.open(),
    observed = bridge.beginObservation();
  expect(() => bridge.beginObservation()).toThrow();
  const ordinary = bridge.begin();
  expect(() => bridge.begin()).toThrow();
  expect(bridge.page(ordinary).done).toBe(true);
  expect(() => bridge.page(ordinary)).toThrow();
  bridge.page(observed);
  expect(bridge.matchesObservation(observed)).toBe(true);
  bridge.finish(observed);
  const next = bridge.beginObservation();
  expect(next).toBeGreaterThan(ordinary);
  bridge.finish(next);
});
it('unavailable storage is a refusal, and retired Root cannot compare a previously consumed observation', async () => {
  const f = await fixture();
  f.storage.setItem(f.key(1), 'ciphertext');
  const bridge = await f.open(),
    id = bridge.beginObservation();
  bridge.page(id);
  const original = f.storage.getItem.bind(f.storage);
  vi.spyOn(f.storage, 'getItem').mockImplementation(() => {
    throw Error('Storage denied');
  });
  expect(() => bridge.matchesObservation(id)).toThrow('denied');
  vi.spyOn(f.storage, 'getItem').mockImplementation(original);
  await f.cohort.close();
  expect(() => bridge.matchesObservation(id)).toThrow('inactive');
  expect(f.storage.getItem(f.key(1))).toBe('ciphertext');
});
