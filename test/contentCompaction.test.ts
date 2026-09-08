// @vitest-environment node
import { createHash } from 'node:crypto';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { IDBFactory, IDBKeyRange, IDBObjectStore as FakeStore } from 'fake-indexeddb';
import { Y } from '../src/crdt/yjs';
import type { Bytes } from '../src/crdt/custodyCrypto';
import type { StoredRecord, ContentCounter } from '../src/crdt/contentRecord';
import {
  beginCustodyEnrollment,
  initializeContentStore,
  openJournalSession,
  type JournalSession,
} from '../src/crdt/custody';
import { deriveStoreName } from '../src/crdt/storeName';
import { validateContentUpdates } from '../src/crdt/contentCompaction';
const scope = { slotId: 'trim-unit', principalId: 'principal', workspaceId: 'workspace' };
const authority = { ...scope, resolvePrincipal: () => scope.principalId };
const sessions: JournalSession[] = [];
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
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((s) => s.close()));
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

const seed = async () => {
  const e = beginCustodyEnrollment(authority, { checkCreation: () => {} }),
    code = e.displayCode!;
  await e.confirm(code);
  await initializeContentStore(authority, code, { checkCreation: () => {} });
  const s = await openJournalSession(authority, code);
  sessions.push(s);
  return { s, code, name: await deriveStoreName(scope.principalId, scope.workspaceId) };
};
const update = (text: string) => {
  const doc = new Y.Doc();
  doc.getText('text').insert(0, text);
  const bytes = new Uint8Array(Y.encodeStateAsUpdate(doc));
  doc.destroy();
  return bytes;
};
const replay = async (s: JournalSession, later: Uint8Array[] = []) => {
  const d = new Y.Doc(),
    r = await s.loadRecovery();
  try {
    for (const row of r.records)
      if (row.kind === 'state' || row.kind === 'update') Y.applyUpdate(d, row.bytes);
    for (const row of r.journal) Y.applyUpdate(d, row.bytes);
    for (const u of later) Y.applyUpdate(d, u);
    return d.getText('text').toString();
  } finally {
    d.destroy();
    for (const row of [...r.records, ...r.journal]) row.bytes.fill(0);
  }
};
const disk = async (name: string) =>
  (await inventory()).databases[name] as Record<
    'content' | 'heads' | 'outbound',
    { key: number; value: StoredRecord }[]
  > & { meta: { key: string; value: ContentCounter }[] };
const pair = async (s: JournalSession) =>
  s.appendBatch([
    { kind: 'update', bytes: update('A') },
    { kind: 'update', bytes: update('B') },
  ]);

describe('exact-coverage content compaction (unit wiring locks only)', () => {
  it('merges the disk union and preserves heads, outbound, journal and reservation history', async () => {
    const { s, name } = await seed();
    await pair(s);
    await s.appendBatch([
      { kind: 'heads', bytes: new Uint8Array([3]) },
      { kind: 'outbound', bytes: new Uint8Array([4]) },
    ]);
    s.appendLocal(update('J'));
    const expected = await replay(s),
      before = await disk(name),
      journal = { ...values };
    const r = await s.compactContent();
    expect(r).toMatchObject({ status: 'compacted', stateSequence: 5, removed: [1, 2] });
    expect(await replay(s)).toBe(expected);
    const after = await disk(name);
    expect(after.heads).toEqual(before.heads);
    expect(after.outbound).toEqual(before.outbound);
    expect(values).toEqual(journal);
    expect(after.meta![0]!.value).toMatchObject({ next_seq: 6, reserved: { 1: 5 } });
    expect(after.content!.map((r) => r.key)).toEqual([5]);
  });
  it('leaves empty and already compacted content unchanged without another reservation', async () => {
    const { s, name } = await seed();
    const empty = await inventory();
    expect((await s.compactContent()).status).toBe('unchanged');
    expect(await inventory()).toEqual(empty);
    await pair(s);
    await s.compactContent();
    const before = await disk(name);
    expect((await s.compactContent()).status).toBe('unchanged');
    expect(await disk(name)).toEqual(before);
  });
  it('preserves a deletion-only update whose state vector equals its predecessor', async () => {
    const { s } = await seed(),
      doc = new Y.Doc(),
      updates: Bytes[] = [];
    doc.on('update', (u) => updates.push(new Uint8Array(u)));
    doc.getText('text').insert(0, 'ABCD');
    const sv = Y.encodeStateVector(doc);
    doc.getText('text').delete(1, 2);
    expect(Y.encodeStateVector(doc)).toEqual(sv);
    doc.destroy();
    await s.appendBatch(updates.map((bytes) => ({ kind: 'update', bytes })));
    await s.compactContent();
    expect(await replay(s)).toBe('AD');
  });
  it.each(['struct', 'delete'] as const)(
    'keeps unresolved %s bytes until their dependency arrives',
    async (mode) => {
      const { s } = await seed(),
        doc = new Y.Doc(),
        updates: Bytes[] = [];
      doc.on('update', (u) => updates.push(new Uint8Array(u)));
      doc.getText('text').insert(0, 'BASE');
      if (mode === 'struct') doc.getText('text').insert(2, 'LATE');
      else doc.getText('text').delete(1, 2);
      const expected = doc.getText('text').toString();
      doc.destroy();
      await s.appendBatch([{ kind: 'update', bytes: updates[1]! }]);
      await s.compactContent();
      expect(await replay(s, [updates[0]!])).toBe(expected);
    },
  );
  it.each(['update', 'state'] as const)(
    'refuses an authenticated malformed %s even when it is the only record',
    async (kind) => {
      const { s } = await seed();
      await s.appendBatch([{ kind, bytes: new Uint8Array([255]) }]);
      const before = await inventory();
      await expect(s.compactContent()).rejects.toMatchObject({ code: 'repair-required' });
      expect(await inventory()).toEqual(before);
      expect(s.state).toBe('closed');
    },
  );
  it('refuses malformed persisted journal CRDT bytes and closes ordinary admission', async () => {
    const { s } = await seed();
    await pair(s);
    s.appendLocal(new Uint8Array([255]));
    const before = await inventory();
    await expect(s.compactContent()).rejects.toMatchObject({ code: 'repair-required' });
    expect(await inventory()).toEqual(before);
    expect(() => s.appendLocal(update('NO'))).toThrow();
  });
  it('authenticates retained heads too and performs no partial content trim on failure', async () => {
    const { s, name } = await seed();
    await pair(s);
    await s.appendBatch([{ kind: 'heads', bytes: new Uint8Array([3]) }]);
    await modify(name, ['heads'], (tx) => {
      const store = tx.objectStore('heads'),
        r = store.get(3);
      r.onsuccess = () => {
        r.result.ct[0] ^= 1;
        store.put(r.result, 3);
      };
    });
    const before = await inventory();
    await expect(s.compactContent()).rejects.toMatchObject({ code: 'repair-required' });
    expect(await inventory()).toEqual(before);
  });
  it('aborts every deletion after native request success; a fresh retry safely removes duplicates', async () => {
    const { s, name } = await seed();
    await pair(s);
    const before = await disk(name);
    const native = FakeStore.prototype.delete;
    let aborted = false;
    vi.spyOn(FakeStore.prototype, 'delete').mockImplementation(
      function (this: IDBObjectStore, key) {
        const r = native.call(this, key);
        if (this.name === 'content' && !aborted) {
          aborted = true;
          r.addEventListener('success', () => this.transaction.abort());
        }
        return r;
      },
    );
    await expect(s.compactContent()).rejects.toMatchObject({ code: 'storage-failed' });
    const after = await disk(name);
    expect(after.content!.slice(0, 2)).toEqual(before.content);
    expect(after.content).toHaveLength(3);
    expect(s.state).toBe('active');
    expect((await s.compactContent()).removed).toEqual([1, 2, 3]);
    expect((await disk(name)).content).toHaveLength(1);
  });
  it('bounds replacement size before reserving a nonce and leaves input intact', async () => {
    const { s, name } = await seed();
    await s.appendBatch([{ kind: 'update', bytes: update('A'.repeat(2100000)) }]);
    await s.appendBatch([{ kind: 'update', bytes: update('B'.repeat(2100000)) }]);
    const fingerprint = async () => {
      const rows = await disk(name);
      return {
        ...rows,
        content: rows.content.map((r) => ({
          ...r,
          value: { ...r.value, ct: createHash('sha256').update(r.value.ct).digest('hex') },
        })),
      };
    };
    const before = await fingerprint();
    await expect(s.compactContent()).rejects.toMatchObject({ code: 'batch-too-large' });
    expect(await fingerprint()).toEqual(before);
    expect(s.state).toBe('active');
  });
  it('normalizes missing initialized metadata to repair and prevents later journal admission', async () => {
    const { s, name } = await seed();
    await pair(s);
    await modify(name, ['meta'], (tx) => {
      tx.objectStore('meta').delete('counter');
    });
    const before = await inventory();
    await expect(s.compactContent()).rejects.toMatchObject({ code: 'repair-required' });
    expect(await inventory()).toEqual(before);
    expect(s.state).toBe('closed');
    expect(() => s.appendLocal(update('NO'))).toThrow();
  });
  it('does not let mergeUpdates singleton passthrough accept truncated encodings', () => {
    expect(() => validateContentUpdates([new Uint8Array([255])])).toThrow(
      expect.objectContaining({ code: 'repair-required' }),
    );
  });
});
