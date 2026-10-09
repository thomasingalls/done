// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore as FakeStore } from 'fake-indexeddb';
import * as fc from 'fast-check';
import { openWriteSession, withExclusiveSlot } from '../src/crdt/writeSession';
import { storageUpgradeKey } from '../src/crdt/storageCompatibility';
import { inspectLocalStartup } from '../src/crdt/localGenesis';

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('isSecureContext', true);
  // Real lock queuing belongs to the native campaign, not this wiring fixture.
  vi.stubGlobal('navigator', {
    locks: { request: async (_name: string, _opts: unknown, fn: () => Promise<void>) => fn() },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const change = async (key: IDBValidKey, value: unknown, remove = false, version = 1) => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('done.custody', version);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains('entries')) r.result.createObjectStore('entries');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('entries', 'readwrite');
      if (remove) tx.objectStore('entries').delete(key);
      else tx.objectStore('entries').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};
const census = async () => {
  const db = await new Promise<IDBDatabase>((resolve) => {
    const r = indexedDB.open('done.custody');
    r.onsuccess = () => resolve(r.result);
  });
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction('entries');
      const keys = tx.objectStore('entries').getAllKeys();
      const values = tx.objectStore('entries').getAll();
      tx.oncomplete = () =>
        resolve({ version: db.version, keys: keys.result, values: values.result });
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};
const acquire = async (slot: string, exclusive: boolean, initialize: () => void) => {
  if (exclusive) await withExclusiveSlot(slot, () => {}, { initialize, dispose: () => {} });
  else await (await openWriteSession(slot, { initialize, dispose: () => {} })).close();
};

describe('storage compatibility interlock', () => {
  it('does not create custody storage on a fresh acquisition', async () => {
    await acquire('local', false, () => {});
    await acquire('local', true, () => {});
    expect(await indexedDB.databases()).toEqual([]);
  });
  it('refuses an unknown custody database version before initialization and preserves its bytes', async () => {
    await change('sentinel', new Uint8Array([1, 2, 3]), false, 2);
    const before = await census(),
      init = vi.fn();
    await expect(acquire('local', false, init)).rejects.toHaveProperty(
      'code',
      'app-update-required',
    );
    expect(init).not.toHaveBeenCalled();
    expect(await census()).toEqual(before);
  });
  it('treats a failed native probe as a refusal, never absence', async () => {
    const init = vi.fn();
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw Error('denied');
    });
    await expect(acquire('local', false, init)).rejects.toThrow('denied');
    expect(init).not.toHaveBeenCalled();
  });
  it('does not expose initialization when request success is followed by transaction abort', async () => {
    await change('sentinel', 'keep');
    const native = FakeStore.prototype.count;
    vi.spyOn(FakeStore.prototype, 'count').mockImplementation(
      function (this: IDBObjectStore, query) {
        const r = native.call(this, query);
        r.addEventListener('success', () => this.transaction.abort());
        return r;
      },
    );
    const init = vi.fn();
    await expect(acquire('local', false, init)).rejects.toThrow();
    expect(init).not.toHaveBeenCalled();
  });
  it('reports an interlock through ordinary Local startup, including a forged ready claim', async () => {
    await change(storageUpgradeKey('local'), { v: 1, state: 'ready', minReader: 0, minWriter: 0 });
    expect(await inspectLocalStartup('local')).toMatchObject({ kind: 'app-update-required' });
  });
  it('preserves storage through 160 generated marker/reacquisition histories', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 24 }),
        fc.array(
          fc.record({
            present: fc.boolean(),
            exclusive: fc.boolean(),
            value: fc.oneof(fc.jsonValue(), fc.constant(undefined)),
          }),
          { minLength: 1, maxLength: 12 },
        ),
        async (slot, history) => {
          vi.stubGlobal('indexedDB', new IDBFactory());
          // Other slots' interlocks and unrelated values are outside this acquisition.
          await change(storageUpgradeKey(slot + '/other'), { v: 999, state: 'migrating' });
          await change('sentinel', new Uint8Array([4, 5, 6]));
          for (const step of history) {
            // Test-only stand-in for a future owner; no format conversion occurs in this model.
            await change(storageUpgradeKey(slot), step.value, !step.present);
            const before = await census(),
              init = vi.fn();
            const result = acquire(slot, step.exclusive, init);
            if (step.present) {
              await expect(result).rejects.toHaveProperty('code', 'app-update-required');
              expect(init).not.toHaveBeenCalled();
            } else {
              await result;
              expect(init).toHaveBeenCalledOnce();
            }
            expect(await census()).toEqual(before);
          }
        },
      ),
      { seed: 8941, numRuns: 160 },
    );
  });
  it('detects the get-instead-of-count fault for an undefined retained value', async () => {
    await change(storageUpgradeKey('local'), undefined);
    await expect(acquire('local', false, () => {})).rejects.toHaveProperty(
      'code',
      'app-update-required',
    );
    // Fault control: a value read converted to presence misclassifies this valid retained key.
    const native = FakeStore.prototype.get;
    vi.spyOn(FakeStore.prototype, 'count').mockImplementation(function (this: IDBObjectStore, key) {
      const r = native.call(this, key!);
      r.addEventListener('success', () =>
        Object.defineProperty(r, 'result', { value: r.result === undefined ? 0 : 1 }),
      );
      return r;
    });
    const init = vi.fn();
    await acquire('local', false, init);
    expect(init).toHaveBeenCalledOnce();
  });
});
