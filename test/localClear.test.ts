// @vitest-environment node
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { IDBFactory, IDBKeyRange, IDBObjectStore as FakeStore } from 'fake-indexeddb';
import {
  beginLocalGenesis,
  inspectLocalStartup,
  resumeLocalGenesis,
} from '../src/crdt/localGenesis';
import { clearLocalWorkspace, prepareLocalClear, resumeLocalClear } from '../src/crdt/localClear';
import { localClearKey, parseLocalClear, type LocalClearRecord } from '../src/crdt/localClearState';
import { journalPrefix } from '../src/crdt/journalCodec';
import { openSlotIndex } from '../src/crdt/slotIndex';
const slot = 'clear-unit';
let values: Record<string, string>,
  removeFailure = false;
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', {
    locks: { request: async (_name: string, _options: unknown, fn: () => Promise<void>) => fn() },
  });
  values = {};
  removeFailure = false;
  vi.stubGlobal(
    'localStorage',
    new Proxy(values, {
      get(target, prop) {
        if (prop === 'getItem') return (k: string) => target[k] ?? null;
        if (prop === 'setItem')
          return (k: string, v: string) => {
            target[k] = v;
          };
        if (prop === 'removeItem')
          return (k: string) => {
            if (removeFailure) throw Error('refused journal removal');
            delete target[k];
          };
        return target[prop as string];
      },
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const db = (name: string) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
const modify = async (name: string, stores: string[], action: (tx: IDBTransaction) => void) => {
  const d = await db(name);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(stores, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      action(tx);
    });
  } finally {
    d.close();
  }
};
const inventory = async () => {
  const result: Record<string, unknown> = {};
  for (const entry of await indexedDB.databases()) {
    const d = await db(entry.name!);
    try {
      result[entry.name!] = await new Promise((resolve, reject) => {
        const tx = d.transaction([...d.objectStoreNames]),
          rows: Record<string, unknown[]> = {};
        for (const name of d.objectStoreNames) {
          rows[name] = [];
          const req = tx.objectStore(name).openCursor();
          req.onsuccess = () => {
            const c = req.result;
            if (c) {
              rows[name]!.push({ key: c.key, value: c.value });
              c.continue();
            }
          };
        }
        tx.oncomplete = () => resolve(rows);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      d.close();
    }
  }
  return { databases: result, journal: { ...values } };
};
const marker = async (id = slot): Promise<LocalClearRecord | undefined> => {
  const d = await db('done.custody');
  try {
    return await new Promise((resolve, reject) => {
      const tx = d.transaction('entries'),
        req = tx.objectStore('entries').get(localClearKey(id));
      tx.oncomplete = () => resolve(req.result as LocalClearRecord | undefined);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    d.close();
  }
};
const seed = async (id = slot) => {
  const c = beginLocalGenesis(id),
    code = c.displayCode!;
  await c.confirm(code);
  const target = await prepareLocalClear(id, code);
  return { code, target };
};
const pending = async () => {
  const s = await seed();
  localStorage.setItem(journalPrefix(s.target.dbName) + 'fixture', 'opaque-ciphertext');
  removeFailure = true;
  await expect(clearLocalWorkspace(s.target, s.code)).rejects.toThrow('refused journal removal');
  return s;
};
describe('journal-inclusive Local clear', () => {
  it('does not mistake another encrypted journal namespace for a legacy Local carrier', async () => {
    const { target } = await seed();
    const key =
      journalPrefix(target.dbName) + target.storeId + '.' + '22'.repeat(16) + '.0000000000000001';
    localStorage.setItem(key, '2:opaque-corrupted-value-in-a-different-namespace');
    const other = await seed('other');
    expect(other.target.slotId).toBe('other');
    expect(localStorage.getItem(key)).toBe('2:opaque-corrupted-value-in-a-different-namespace');
  });
  it('still refuses an unassigned legacy journal with no legacy database', async () => {
    localStorage.setItem(journalPrefix('done') + 'legacy-writer.1', '1:opaque');
    const c = beginLocalGenesis(slot);
    await expect(c.confirm(c.displayCode!)).rejects.toMatchObject({
      disposition: { kind: 'migration-required' },
    });
    expect(localStorage.getItem(journalPrefix('done') + 'legacy-writer.1')).toBe('1:opaque');
  });
  it('prepares a detached target without mutations and refuses a wrong factor', async () => {
    const { code, target } = await seed(),
      before = await inventory();
    expect(await prepareLocalClear(slot, code)).toEqual(target);
    await expect(prepareLocalClear(slot, '0'.repeat(25))).rejects.toMatchObject({
      disposition: { kind: 'unlock-failed' },
    });
    expect(await inventory()).toEqual(before);
  });
  it('removes only the selected carriers, leaving an authenticated marker with no content opener', async () => {
    const { code, target } = await seed();
    localStorage.setItem(journalPrefix(target.dbName) + 'one', 'opaque');
    expect(await clearLocalWorkspace(target, code)).toEqual({ kind: 'cleared', target });
    const result = await inventory(),
      m = (await marker())!;
    expect(result.databases[target.dbName]).toBeUndefined();
    expect(result.journal).toEqual({});
    expect(result.databases['done.slots']).toEqual({ slots: [] });
    expect(result.databases['done.custody']).toEqual({
      entries: [{ key: localClearKey(slot), value: m }],
    });
    expect(m.stage).toBe('cleared');
    expect(JSON.stringify(m)).not.toContain(code);
    expect(await resumeLocalClear(slot, code)).toEqual({ kind: 'cleared', target });
    expect(await inspectLocalStartup(slot)).toMatchObject({ kind: 'cleared' });
  });
  it('rejects a stale target without persisting intent or deleting anything', async () => {
    const { code, target } = await seed(),
      before = await inventory();
    await expect(
      clearLocalWorkspace({ ...target, storeId: 'ff'.repeat(16) }, code),
    ).rejects.toMatchObject({ disposition: { reason: 'clear-target-changed' } });
    expect(await inventory()).toEqual(before);
  });
  it('keeps another slot and unrelated journal prefixes intact', async () => {
    const a = await seed(),
      b = await seed('other');
    localStorage.setItem(journalPrefix(a.target.dbName) + 'one', 'a');
    localStorage.setItem(journalPrefix(b.target.dbName) + 'one', 'b');
    localStorage.setItem('unrelated', 'keep');
    const before = await inventory();
    await clearLocalWorkspace(a.target, a.code);
    const after = await inventory();
    expect(after.databases[b.target.dbName]).toEqual(before.databases[b.target.dbName]);
    expect(after.journal).toEqual({
      [journalPrefix(b.target.dbName) + 'one']: 'b',
      unrelated: 'keep',
    });
    expect(await inspectLocalStartup('other')).toMatchObject({ kind: 'unlock-required' });
  });
  it('retains custody and index after content succeeds but journal removal refuses', async () => {
    const { code, target } = await pending(),
      before = await inventory();
    expect((await marker())?.stage).toBe('journal');
    expect(before.databases[target.dbName]).toBeUndefined();
    expect(await inspectLocalStartup(slot)).toMatchObject({ kind: 'clearing' });
    await expect(resumeLocalClear(slot, '0'.repeat(25))).rejects.toMatchObject({
      disposition: { kind: 'unlock-failed' },
    });
    expect(await inventory()).toEqual(before);
    removeFailure = false;
    expect((await resumeLocalClear(slot, code)).kind).toBe('cleared');
  });
  it('refuses modified progress without carrying out another deletion', async () => {
    const { code } = await pending(),
      m = (await marker())!;
    m.stage = 'custody';
    await modify('done.custody', ['entries'], (tx) => {
      tx.objectStore('entries').put(m, localClearKey(slot));
    });
    removeFailure = false;
    const before = await inventory();
    await expect(resumeLocalClear(slot, code)).rejects.toMatchObject({
      disposition: { kind: 'unlock-failed' },
    });
    expect(await inventory()).toEqual(before);
  });
  it('rereads the surviving content identity on resumption before retrying deletion', async () => {
    const { code, target } = await seed();
    const fault = vi.spyOn(indexedDB, 'deleteDatabase').mockImplementationOnce(() => {
      throw Error('refused native delete');
    });
    await expect(clearLocalWorkspace(target, code)).rejects.toThrow('refused native delete');
    fault.mockRestore();
    await modify(target.dbName, ['meta'], (tx) => {
      const store = tx.objectStore('meta'),
        req = store.get('counter');
      req.onsuccess = () => store.put({ ...req.result, store_id: 'ff'.repeat(16) }, 'counter');
    });
    const before = await inventory();
    await expect(resumeLocalClear(slot, code)).rejects.toMatchObject({ code: 'repair-required' });
    expect(await inventory()).toEqual(before);
  });
  it('refuses unknown scoped opener references before starting deletion', async () => {
    const { code, target } = await seed();
    await modify('done.custody', ['entries'], (tx) => {
      tx.objectStore('entries').put({ key: 'unknown' }, [slot, 'unknown']);
    });
    const before = await inventory();
    await expect(clearLocalWorkspace(target, code)).rejects.toMatchObject({
      disposition: { kind: 'repair-required' },
    });
    expect(await inventory()).toEqual(before);
  });
  it('an undefined clear marker is damaged state, never fresh permission', async () => {
    const { code } = await seed();
    await modify('done.custody', ['entries'], (tx) => {
      tx.objectStore('entries').put(undefined, localClearKey(slot));
    });
    expect(await inspectLocalStartup(slot)).toMatchObject({ kind: 'repair-required' });
    await expect(resumeLocalClear(slot, code)).rejects.toMatchObject({
      disposition: { kind: 'repair-required' },
    });
  });
  it('atomic intent abort leaves every preexisting carrier intact', async () => {
    const { code, target } = await seed(),
      before = await inventory(),
      add = FakeStore.prototype.add;
    vi.spyOn(FakeStore.prototype, 'add').mockImplementation(
      function (this: IDBObjectStore, value, key) {
        const req = add.call(this, value, key);
        if (value?.kind === 'local-clear')
          req.addEventListener('success', () => this.transaction.abort());
        return req;
      },
    );
    await expect(clearLocalWorkspace(target, code)).rejects.toMatchObject({
      code: 'storage-failed',
    });
    expect(await inventory()).toEqual(before);
  });
  it('custody removal and index-stage progress abort together', async () => {
    const { code, target } = await seed(),
      put = FakeStore.prototype.put;
    const fault = vi
      .spyOn(FakeStore.prototype, 'put')
      .mockImplementation(function (this: IDBObjectStore, value, key) {
        const req = put.call(this, value, key);
        if (value?.kind === 'local-clear' && value.stage === 'index')
          req.addEventListener('success', () => this.transaction.abort());
        return req;
      });
    await expect(clearLocalWorkspace(target, code)).rejects.toMatchObject({
      code: 'storage-failed',
    });
    fault.mockRestore();
    expect((await marker())?.stage).toBe('custody');
    expect((await inventory()).databases['done.custody']).toHaveProperty('entries.length', 4);
    expect((await resumeLocalClear(slot, code)).kind).toBe('cleared');
  });
  it('resumes with the factor after all content openers have gone and index deletion aborted', async () => {
    const { code, target } = await seed(),
      del = FakeStore.prototype.delete;
    const fault = vi
      .spyOn(FakeStore.prototype, 'delete')
      .mockImplementation(function (this: IDBObjectStore, key) {
        const req = del.call(this, key);
        if (this.name === 'slots') req.addEventListener('success', () => this.transaction.abort());
        return req;
      });
    await expect(clearLocalWorkspace(target, code)).rejects.toMatchObject({
      code: 'storage-failed',
    });
    fault.mockRestore();
    expect((await marker())?.stage).toBe('index');
    expect((await inventory()).databases['done.custody']).toHaveProperty('entries.length', 1);
    expect((await resumeLocalClear(slot, code)).kind).toBe('cleared');
  });
  it('terminal state blocks genesis, genesis resumption and legacy slot recreation', async () => {
    const { code, target } = await seed();
    await clearLocalWorkspace(target, code);
    const before = await inventory(),
      c = beginLocalGenesis(slot);
    await expect(c.confirm(c.displayCode!)).rejects.toMatchObject({
      disposition: { kind: 'cleared' },
    });
    await expect(resumeLocalGenesis(slot, code)).rejects.toMatchObject({
      disposition: { kind: 'cleared' },
    });
    const index = await openSlotIndex();
    try {
      await expect(index.createSlot(slot)).rejects.toMatchObject({
        disposition: { kind: 'cleared' },
      });
    } finally {
      index.close();
    }
    expect(await inventory()).toEqual(before);
  });
  it('does not report terminal success if a target journal reappears', async () => {
    const { code, target } = await seed();
    await clearLocalWorkspace(target, code);
    localStorage.setItem(journalPrefix(target.dbName) + 'late', 'retained');
    const before = await inventory();
    await expect(resumeLocalClear(slot, code)).rejects.toMatchObject({
      disposition: { kind: 'repair-required' },
    });
    expect(await inventory()).toEqual(before);
  });
  it('parses terminal metadata without accepting extra opener fields', async () => {
    const { code, target } = await seed();
    await clearLocalWorkspace(target, code);
    const m = (await marker())!;
    expect(() => parseLocalClear({ ...m, root: new Uint8Array(32) }, slot)).toThrow();
    expect(() =>
      parseLocalClear({ ...m, target: { ...m.target, dbName: 'done' } }, slot),
    ).toThrow();
  });
});
