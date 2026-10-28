// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { beginLocalGenesis } from '../src/crdt/localGenesis';
import { removeDeviceData } from '../src/crdt/deviceDataRemoval';
import { preparationStoreName } from '../src/crdt/retentionPreparationDatabase';
import { deriveStoreName } from '../src/crdt/storeName';

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('location', { origin: 'https://preparation.invalid' });
  const tails = new Map<string, Promise<unknown>>();
  vi.stubGlobal('navigator', {
    locks: {
      request: (
        name: string,
        _options: unknown,
        work: (lock: { name: string }) => Promise<unknown>,
      ) => {
        const next = (tails.get(name) ?? Promise.resolve()).then(() => work({ name }));
        tails.set(
          name,
          next.catch(() => {}),
        );
        return next;
      },
    },
  });
  const values: Record<string, string> = {};
  vi.stubGlobal('localStorage', {
    get length() {
      return Object.keys(values).length;
    },
    key: (i: number) => Object.keys(values)[i] ?? null,
    getItem: (k: string) => values[k] ?? null,
    setItem: (k: string, v: string) => {
      values[k] = v;
    },
    removeItem: (k: string) => {
      delete values[k];
    },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function local(slot: string) {
  const creation = beginLocalGenesis(slot),
    receipt = await creation.confirm(creation.displayCode!);
  return deriveStoreName(receipt.scope.principalId, receipt.scope.workspaceId);
}
async function cache(content: string, hold = false) {
  const name = preparationStoreName(content);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('head');
      r.result.createObjectStore('chunks');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(['head'], 'readwrite', { durability: 'strict' });
    t.objectStore('head').put({ ciphertext: new Uint8Array([1, 2, 3]) }, 'current');
    t.oncomplete = () => resolve();
    t.onabort = () => reject(t.error);
  });
  if (!hold) db.close();
  return db;
}
const names = async () => new Set((await indexedDB.databases()).map((d) => d.name));
it('credential-free device removal erases its preparation cache and preserves another workspace', async () => {
  const first = await local('local'),
    second = await local('other');
  await cache(first);
  await cache(second);
  await removeDeviceData('local');
  const left = await names();
  expect(left.has(first)).toBe(false);
  expect(left.has(preparationStoreName(first))).toBe(false);
  expect(left.has(second)).toBe(true);
  expect(left.has(preparationStoreName(second))).toBe(true);
});
it('a blocked auxiliary deletion reports the existing close-tabs guidance and finishes automatically', async () => {
  const first = await local('local'),
    db = await cache(first, true),
    messages: string[] = [];
  const removal = removeDeviceData('local', (m) => {
    messages.push(m);
  });
  await vi.waitFor(() =>
    expect(messages).toContain('Close other tabs using this workspace to finish removal.'),
  );
  db.close();
  await removal;
  expect((await names()).has(preparationStoreName(first))).toBe(false);
});
it('interrupted content deletion retains the removal intent and retries without recreating the cache', async () => {
  const first = await local('local');
  await cache(first);
  const remove = indexedDB.deleteDatabase.bind(indexedDB);
  let failed = false;
  const fault = vi.spyOn(indexedDB, 'deleteDatabase').mockImplementation((name) => {
    if (name === first && !failed) {
      failed = true;
      throw Error('interrupted content deletion');
    }
    return remove(name);
  });
  await expect(removeDeviceData('local')).rejects.toThrow('interrupted content deletion');
  fault.mockRestore();
  expect((await names()).has(preparationStoreName(first))).toBe(false);
  await removeDeviceData('local');
  const left = await names();
  expect(left.has(first)).toBe(false);
  expect(left.has(preparationStoreName(first))).toBe(false);
});
