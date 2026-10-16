// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBKeyRange } from 'fake-indexeddb';
import { installDiscoveryEnvironment } from './helpers/discoveryEnvironment';
import {
  beginLocalGenesis,
  inspectLocalStartup,
  listLocalWorkspaces,
} from '../src/crdt/localGenesis';

const slot = 'empty-legacy-regression';
beforeEach(() => {
  installDiscoveryEnvironment();
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  const values: Record<string, string> = {};
  vi.stubGlobal(
    'localStorage',
    new Proxy(values, {
      get(target, key) {
        if (key === 'getItem') return (name: string) => target[name] ?? null;
        if (key === 'setItem')
          return (name: string, value: string) => {
            target[name] = value;
          };
        if (key === 'removeItem')
          return (name: string) => {
            delete target[name];
          };
        return target[key as string];
      },
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function legacy(version = 1, stores: string[] = [], data = false) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('done', version);
    request.onupgradeneeded = () => {
      for (const name of stores) {
        const store = request.result.createObjectStore(name);
        if (data) store.add(new Uint8Array([0, 9, 255]), 'retained');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
}
async function snapshot() {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('done');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const stores: { name: string; keys: IDBValidKey[]; values: unknown[] }[] = [];
    for (const name of db.objectStoreNames)
      stores.push(
        await new Promise((resolve, reject) => {
          const tx = db.transaction(name, 'readonly'),
            store = tx.objectStore(name);
          const keys = store.getAllKeys(),
            values = store.getAll();
          tx.oncomplete = () => resolve({ name, keys: keys.result, values: values.result });
          tx.onabort = () => reject(tx.error);
        }),
      );
    return { version: db.version, stores };
  } finally {
    db.close();
  }
}
async function refuseCreation(emptyCustodyDatabase = false) {
  const ceremony = beginLocalGenesis(slot),
    code = ceremony.displayCode!;
  await expect(ceremony.confirm(code)).rejects.toMatchObject({
    disposition: { kind: 'migration-required' },
  });
  expect((await indexedDB.databases()).map((d) => d.name)).toEqual(
    emptyCustodyDatabase ? ['done', 'done.custody'] : ['done'],
  );
  if (emptyCustodyDatabase) {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('done.custody');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      expect(
        await new Promise<number>((resolve, reject) => {
          const tx = db.transaction('entries', 'readonly'),
            count = tx.objectStore('entries').count();
          tx.oncomplete = () => resolve(count.result);
          tx.onabort = () => reject(tx.error);
        }),
      ).toBe(0);
    } finally {
      db.close();
    }
  }
}

it('classifies only the version-one zero-store placeholder as fresh without deleting, upgrading or enumerating databases', async () => {
  await legacy();
  const before = await snapshot(),
    deletion = vi.spyOn(indexedDB, 'deleteDatabase');
  const enumeration = vi
    .spyOn(indexedDB, 'databases')
    .mockRejectedValue(Error('Forbidden discovery'));
  expect(await inspectLocalStartup(slot)).toEqual({
    kind: 'fresh',
    reason: 'local-slot-carriers-absent',
  });
  expect(await snapshot()).toEqual(before);
  expect(deletion).not.toHaveBeenCalled();
  expect(enumeration).not.toHaveBeenCalled();
});

it('creates new factor-protected custody beside the placeholder and still rejects the wrong factor', async () => {
  await legacy();
  const before = await snapshot(),
    deletion = vi.spyOn(indexedDB, 'deleteDatabase');
  const ceremony = beginLocalGenesis(slot),
    code = ceremony.displayCode!;
  await ceremony.confirm(code);
  expect(await inspectLocalStartup(slot)).toMatchObject({ kind: 'unlock-required' });
  await expect(listLocalWorkspaces(slot, 'wrong')).rejects.toMatchObject({
    disposition: { kind: 'unlock-failed' },
  });
  expect(await listLocalWorkspaces(slot, code)).toHaveLength(1);
  expect(await snapshot()).toEqual(before);
  expect(deletion).not.toHaveBeenCalled();
});

it('preserves and refuses a zero-store database with an unknown version', async () => {
  await legacy(2);
  const before = await snapshot();
  expect(await inspectLocalStartup(slot)).toMatchObject({ kind: 'migration-required' });
  await refuseCreation();
  expect(await snapshot()).toEqual(before);
});

it.each(['updates', 'custom', 'unknown'])(
  'preserves and refuses an existing empty %s store',
  async (name) => {
    await legacy(1, [name]);
    const before = await snapshot();
    expect(await inspectLocalStartup(slot)).toMatchObject({ kind: 'migration-required' });
    await refuseCreation();
    expect(await snapshot()).toEqual(before);
  },
);

it('preserves every legacy key and byte and refuses fresh custody beside real legacy writing', async () => {
  await legacy(1, ['custom', 'updates'], true);
  const before = await snapshot();
  expect(await inspectLocalStartup(slot)).toMatchObject({ kind: 'migration-required' });
  await refuseCreation();
  expect(await snapshot()).toEqual(before);
});

it('preserves and refuses a legacy journal even beside a zero-store placeholder', async () => {
  await legacy();
  localStorage.setItem('done.pending-update.done.legacy', 'retained journal bytes');
  expect(await inspectLocalStartup(slot)).toMatchObject({ kind: 'migration-required' });
  await refuseCreation();
  expect(localStorage.getItem('done.pending-update.done.legacy')).toBe('retained journal bytes');
  expect(await snapshot()).toEqual({ version: 1, stores: [] });
});

it('rechecks a journal arriving after presentation inspection before creating any custody', async () => {
  await legacy();
  expect(await inspectLocalStartup(slot)).toMatchObject({ kind: 'fresh' });
  localStorage.setItem('done.pending-update.done.late', 'late journal bytes');
  await refuseCreation();
  expect(localStorage.getItem('done.pending-update.done.late')).toBe('late journal bytes');
});

it('rechecks an upgrade arriving during confirmation before installing the first custody claim', async () => {
  await legacy();
  const open = indexedDB.open.bind(indexedDB);
  let probes = 0;
  vi.spyOn(indexedDB, 'open').mockImplementation((name, version) => {
    if (name === 'done' && version === undefined && ++probes === 2) {
      const upgrade = open('done', 2);
      upgrade.onupgradeneeded = () =>
        upgrade.result.createObjectStore('new-writer').add('late bytes', 'retained');
      upgrade.onsuccess = () => upgrade.result.close();
    }
    return open(name, version);
  });
  await refuseCreation(true);
  expect(probes).toBe(2);
  expect(await snapshot()).toEqual({
    version: 2,
    stores: [{ name: 'new-writer', keys: ['retained'], values: ['late bytes'] }],
  });
});

it('does not classify an unreadable legacy database as an empty placeholder', async () => {
  await legacy();
  const open = indexedDB.open.bind(indexedDB);
  vi.spyOn(indexedDB, 'open').mockImplementation((name, version) => {
    if (name === 'done') throw Error('Storage read refused');
    return open(name, version);
  });
  expect(await inspectLocalStartup(slot)).toMatchObject({ kind: 'unavailable' });
  const ceremony = beginLocalGenesis(slot);
  await expect(ceremony.confirm(ceremony.displayCode!)).rejects.toThrow('Storage read refused');
  expect((await indexedDB.databases()).map((d) => d.name)).toEqual(['done']);
});
