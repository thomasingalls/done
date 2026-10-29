// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openWindowAccountCohort, type WindowAccountCohort } from '../src/crdt/accountWorkerCohort';
import {
  createWindowJournalBridge,
  RAW_JOURNAL_PAGE_CHARACTERS,
} from '../src/crdt/windowJournalBridge';
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
it('captures bounded encrypted pages without leaking unrelated slot values', async () => {
  const f = await fixture();
  f.storage.setItem('unrelated-secret', 'other account');
  f.storage.setItem(f.key(1), 'x'.repeat(20000));
  f.storage.setItem(f.key(2), 'y'.repeat(20000));
  const b = await f.open(),
    id = b.begin();
  f.storage.setItem(f.key(3), 'later suffix');
  const a = b.page(id),
    z = b.page(id);
  expect(a.done).toBe(false);
  expect(z.done).toBe(true);
  expect(a.entries).toEqual([[f.key(1), 'x'.repeat(20000)]]);
  expect(z.entries).toEqual([[f.key(2), 'y'.repeat(20000)]]);
  expect(a.entries.reduce((n, [k, v]) => n + k.length + v.length, 0)).toBeLessThanOrEqual(
    RAW_JOURNAL_PAGE_CHARACTERS,
  );
  expect(a.characters).toBeGreaterThan(40000);
  expect(() => b.page(id)).toThrow();
  expect(f.storage.getItem('unrelated-secret')).toBe('other account');
});
it('cleanup removes only current exact values and preserves altered or unavailable entries', async () => {
  const f = await fixture(),
    b = await f.open();
  f.storage.setItem(f.key(1), 'a');
  f.storage.setItem(f.key(2), 'changed');
  f.storage.setItem(f.key(3), 'c');
  const original = f.storage.removeItem.bind(f.storage);
  vi.spyOn(f.storage, 'removeItem').mockImplementation((k) => {
    if (k === f.key(3)) throw Error('denied');
    original(k);
  });
  expect(
    b.remove([
      [f.key(1), 'a'],
      [f.key(2), 'b'],
      [f.key(3), 'c'],
      [f.key(4), 'absent'],
    ]),
  ).toEqual({ removed: 1, changed: 1, retained: 1 });
  expect(f.storage.getItem(f.key(2))).toBe('changed');
  expect(f.storage.getItem(f.key(3))).toBe('c');
});
it('rejects an entire malformed cleanup before deleting any prefix, duplicate or over-budget entry', async () => {
  const f = await fixture(),
    b = await f.open();
  f.storage.setItem(f.key(1), 'a');
  const before = { ...f.storage };
  for (const input of [
    [
      [f.key(1), 'a'],
      ['other-account', 'a'],
    ],
    [
      [f.key(1), 'a'],
      [f.key(1), 'a'],
    ],
    Array.from({ length: 17 }, (_, i) => [f.key(i), 'a']),
  ]) {
    expect(() => b.remove(input as [string, string][])).toThrow();
    expect({ ...f.storage }).toEqual(before);
  }
});
it('expired and canceled snapshots cannot be read or reused after close', async () => {
  const f = await fixture(),
    b = await f.open(),
    id = b.begin();
  b.finish(id);
  expect(() => b.page(id)).toThrow();
  await f.cohort.close();
  expect(() => b.begin()).toThrow();
  expect(() => b.remove([])).toThrow();
});
it('bounds snapshot credit and explicit finish returns its credit', async () => {
  const f = await fixture(),
    b = await f.open(),
    a = b.begin(),
    z = b.begin();
  expect(() => b.begin()).toThrow();
  b.finish(a);
  const third = b.begin();
  expect(b.page(z).done).toBe(true);
  expect(b.page(third).done).toBe(true);
});
it('refuses a public index whose name does not derive from its scoped identity', async () => {
  const f = await fixture(true);
  await expect(f.open()).rejects.toThrow('scope');
  expect(f.storage.length).toBe(0);
});
it('detects a raw immutable-entry change during capture and preserves it for worker authentication', async () => {
  const f = await fixture(),
    b = await f.open();
  f.storage.setItem(f.key(1), 'original');
  const get = f.storage.getItem.bind(f.storage);
  let count = 0;
  vi.spyOn(f.storage, 'getItem').mockImplementation((k) => {
    if (k === f.key(1) && ++count === 3) f.storage.setItem(k, 'changed');
    return get(k);
  });
  expect(() => b.begin()).toThrow('changed');
  expect(get(f.key(1))).toBe('changed');
});
it('does not create data or claim a snapshot when storage is denied or an entry exceeds a page', async () => {
  const f = await fixture(),
    b = await f.open();
  f.storage.setItem(f.key(1), 'x'.repeat(RAW_JOURNAL_PAGE_CHARACTERS));
  expect(() => b.begin()).toThrow();
  f.storage.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    get: () => {
      throw Error('denied');
    },
    configurable: true,
  });
  expect(() => b.begin()).toThrow('denied');
});
it('a structurally similar fake coordinator cannot authorize index access', async () => {
  const write = vi.fn();
  await expect(
    createWindowJournalBridge({ write } as unknown as WindowAccountCohort),
  ).rejects.toThrow();
  expect(write).not.toHaveBeenCalled();
});
