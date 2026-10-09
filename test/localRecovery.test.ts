// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import fc from 'fast-check';
import { beginLocalGenesis } from '../src/crdt/localGenesis';
import { openJournalSession } from '../src/crdt/custody';
import { recoverLocalWriting } from '../src/crdt/localRecovery';
import { deriveStoreName } from '../src/crdt/storeName';
import { storageUpgradeKey } from '../src/crdt/storageCompatibility';
import { Y } from '../src/crdt/yjs';
import { SCHEMA_VERSION } from '../src/crdt/doc';
import type { Bytes } from '../src/crdt/custodyCrypto';
let values: Record<string, string>;
const reset = () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', {
    locks: { request: async (_n: string, _o: unknown, fn: () => Promise<void>) => fn() },
  });
  values = {};
  vi.stubGlobal(
    'localStorage',
    new Proxy(values, {
      get(target, p) {
        if (p === 'getItem') return (key: string) => target[key] ?? null;
        if (p === 'setItem')
          return (key: string, value: string) => {
            target[key] = value;
          };
        if (p === 'removeItem')
          return (key: string) => {
            delete target[key];
          };
        return target[p as string];
      },
    }),
  );
};
beforeEach(reset);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const database = (name: string) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
const alter = async (name: string, store: string, body: (s: IDBObjectStore) => void) => {
  const db = await database(name);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      body(tx.objectStore(store));
    });
  } finally {
    db.close();
  }
};
const inventory = async () => {
  const all = [];
  for (const name of (await indexedDB.databases()).map((d) => d.name!).sort()) {
    const db = await database(name);
    try {
      for (const store of [...db.objectStoreNames]) {
        const entries = await new Promise((resolve, reject) => {
          const r = db.transaction(store).objectStore(store).getAll();
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        all.push({ name, store, entries });
      }
    } finally {
      db.close();
    }
  }
  return { all, journal: { ...values } };
};
const fixture = async (text = 'intact writing', slotId = 'recovery') => {
  const ceremony = beginLocalGenesis(slotId),
    code = ceremony.displayCode!;
  const receipt = await ceremony.confirm(code),
    scope = receipt.scope;
  const owner = await openJournalSession(
    { slotId, workspaceId: scope.workspaceId, resolvePrincipal: () => scope.principalId },
    code,
  );
  const doc = new Y.Doc({ gc: false });
  doc.getMap('meta').set('schemaVersion', SCHEMA_VERSION);
  doc.getText('master').insert(0, text);
  const stored = await owner.appendBatch([
    { kind: 'update', bytes: new Uint8Array(Y.encodeStateAsUpdate(doc)) },
  ]);
  const name = await deriveStoreName(scope.principalId, scope.workspaceId);
  return { slotId, code, owner, doc, name, seq: stored.sequences[0]! };
};
const corrupt = (name: string, seq: number) =>
  alter(name, 'content', (store) => {
    const request = store.get(seq);
    request.onsuccess = () => {
      const row = request.result;
      row.ct[0] ^= 1;
      store.put(row, seq);
    };
  });
it('recovers authenticated database and journal writing while skipping a damaged record, without writes or encryption', async () => {
  const f = await fixture();
  // A separately authenticated but malformed update must never poison the accumulated document.
  const bad = await f.owner.appendBatch([{ kind: 'update', bytes: new Uint8Array([0, 0]) }]);
  let update!: Bytes;
  f.doc.on('update', (b) => {
    update = new Uint8Array(b);
  });
  f.doc.getText('master').insert(f.doc.getText('master').length, ' plus journal');
  expect(f.owner.appendLocal(update).status).toBe('journalled');
  await f.owner.close();
  f.doc.destroy();
  await corrupt(f.name, bad.sequences[0]!);
  const before = await inventory(),
    encrypt = vi.spyOn(crypto.subtle, 'encrypt');
  const result = await recoverLocalWriting(f.slotId, f.code),
    archive = new TextDecoder().decode(result.archive);
  expect(result.report).toMatchObject({
    complete: false,
    unreadableRecords: 1,
    pendingDependencies: false,
    recoveredFiles: 1,
  });
  expect(archive).toContain('intact writing plus journal');
  expect(archive).not.toContain(f.code);
  expect(archive).toContain('not a verified complete workspace');
  expect(encrypt).not.toHaveBeenCalled();
  expect(await inventory()).toEqual(before);
});
it('reports pending dependencies instead of calling an authenticated but incomplete journal complete', async () => {
  const f = await fixture('base');
  let update!: Bytes;
  f.doc.on('update', (b) => {
    update = new Uint8Array(b);
  });
  f.doc.getText('master').insert(4, ' dependent');
  f.owner.appendLocal(update);
  await f.owner.close();
  f.doc.destroy();
  await corrupt(f.name, f.seq);
  const before = await inventory(),
    result = await recoverLocalWriting(f.slotId, f.code);
  expect(result.report).toMatchObject({
    complete: false,
    pendingDependencies: true,
    unreadableRecords: 1,
  });
  expect(new TextDecoder().decode(result.archive)).not.toContain('base dependent');
  expect(await inventory()).toEqual(before);
});
it('wrong factor, cancellation, absent custody, Account interlock and future schema cannot enable recovery or mutate retained state', async () => {
  const f = await fixture();
  await f.owner.close();
  f.doc.destroy();
  const before = await inventory();
  await expect(recoverLocalWriting(f.slotId, 'wrong')).rejects.toBeDefined();
  await expect(
    recoverLocalWriting(f.slotId, f.code, { signal: AbortSignal.abort() }),
  ).rejects.toBeDefined();
  await expect(recoverLocalWriting('absent', f.code)).rejects.toBeDefined();
  expect(await inventory()).toEqual(before);
  await alter('done.custody', 'entries', (s) =>
    s.put({ unknown: true }, storageUpgradeKey(f.slotId)),
  );
  const interlocked = await inventory();
  await expect(recoverLocalWriting(f.slotId, f.code)).rejects.toBeDefined();
  expect(await inventory()).toEqual(interlocked);
  reset();
  const future = await fixture();
  future.doc.getMap('meta').set('schemaVersion', 999);
  await future.owner.appendBatch([
    { kind: 'update', bytes: new Uint8Array(Y.encodeStateAsUpdate(future.doc)) },
  ]);
  await future.owner.close();
  future.doc.destroy();
  const unsupported = await inventory();
  await expect(recoverLocalWriting(future.slotId, future.code)).rejects.toMatchObject({
    disposition: { kind: 'app-update-required' },
  });
  expect(await inventory()).toEqual(unsupported);
});
it('30 generated damage/journal histories match the independent input ledger and preserve every carrier', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.boolean(),
      async (suffix, damage) => {
        reset();
        const f = await fixture('ledger:');
        let update!: Bytes;
        f.doc.on('update', (b) => {
          update = new Uint8Array(b);
        });
        f.doc.getText('master').insert(7, suffix);
        f.owner.appendLocal(update);
        await f.owner.close();
        f.doc.destroy();
        if (damage) await corrupt(f.name, f.seq);
        const before = await inventory(),
          result = await recoverLocalWriting(f.slotId, f.code);
        expect(result.report.complete).toBe(false);
        expect(result.report.pendingDependencies).toBe(damage);
        if (!damage) expect(new TextDecoder().decode(result.archive)).toContain('ledger:' + suffix);
        expect(await inventory()).toEqual(before);
      },
    ),
    { seed: 120909, numRuns: 30 },
  );
}, 30000);
