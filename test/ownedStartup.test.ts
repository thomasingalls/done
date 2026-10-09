// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { inspectWorkspaceStartup, type StartupAuthority } from '../src/crdt/ownedStartup';
import { deriveStoreName } from '../src/crdt/storeName';
import { journalPrefix } from '../src/crdt/journalCodec';
const scope = { slotId: 'slot', principalId: 'principal', workspaceId: 'workspace' };
const authority: StartupAuthority = {
  ...scope,
  resolveIdentity: () => ({ kind: 'local', principalId: scope.principalId }),
};
let name: string;
const key = [scope.slotId, scope.principalId, scope.workspaceId];
const witness = (state = 'ready') => ({
  v: 1,
  state,
  intent: '33'.repeat(16),
  mac: new Uint8Array(32),
});
const counter = () => ({
  v: 1,
  store_id: '11'.repeat(16),
  intent: '33'.repeat(16),
  active_gen: 1,
  next_seq: 1,
  reserved: { '1': 0 },
  mac: new Uint8Array(32),
});
const custody = () => ({
  v: 2,
  state: 'protected',
  slot_id: scope.slotId,
  principal_id: scope.principalId,
  workspace_id: scope.workspaceId,
  store_id: '11'.repeat(16),
  root_id: '22'.repeat(16),
  seal_reserved: 3,
  rotation_owed: false,
  creation_intent: null,
  seals: [
    {
      v: 1,
      factor: 'code',
      id: 'code',
      salt: new Uint8Array(16),
      nonce: new Uint8Array(12),
      ct: new Uint8Array(48),
    },
  ],
  envelope: { v: 1, gen: 1, nonce: new Uint8Array(12), ct: new Uint8Array(48) },
  credentials: ['wrapping', 'signing'].map((role, i) => ({
    role,
    id: (i ? '55' : '44').repeat(16),
    publicKey: new Uint8Array(32),
    sealed: { v: 2, nonce: new Uint8Array(12), ct: new Uint8Array(48) },
  })),
  mac: new Uint8Array(32),
});
const slot = () => ({
  id: scope.slotId,
  status: 'active',
  unlockBinding: null,
  stores: [{ principal: scope.principalId, workspace: scope.workspaceId, dbName: name }],
});
const put = async (
  dbName: string,
  stores: Record<string, string | null>,
  rows: { store: string; value: unknown; key?: IDBValidKey }[] = [],
  version = 1,
) => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(dbName, version);
    req.onupgradeneeded = () => {
      for (const [s, keyPath] of Object.entries(stores))
        if (!req.result.objectStoreNames.contains(s))
          req.result.createObjectStore(s, keyPath ? { keyPath } : {});
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(Object.keys(stores), 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      for (const row of rows) {
        if (row.key === undefined) tx.objectStore(row.store).put(row.value);
        else tx.objectStore(row.store).put(row.value, row.key);
      }
    });
  } finally {
    db.close();
  }
};
const index = (value: unknown = slot()) =>
  put('done.slots', { slots: 'id' }, [{ store: 'slots', value }]);
const control = (value: unknown, suffix: IDBValidKey[] = []) =>
  put('done.custody', { entries: null }, [{ store: 'entries', key: [...key, ...suffix], value }]);
const disk = (value: unknown = counter(), version = 1) =>
  put(
    name,
    { meta: null, content: null, heads: null, outbound: null },
    [{ store: 'meta', key: 'counter', value }],
    version,
  );
const complete = async () => {
  await index();
  await control(custody());
  await control(witness(), ['content-v1']);
  await disk();
};
const inspect = (a = authority) => inspectWorkspaceStartup(a);
beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('isSecureContext', true);
  // Unit seam supplies immediate grants, not browser exclusion evidence.
  vi.stubGlobal('navigator', {
    locks: {
      request: (_name: string, _options: unknown, fn: () => Promise<unknown>) =>
        Promise.resolve().then(fn),
    },
  });
  const values: Record<string, string> = {};
  vi.stubGlobal(
    'localStorage',
    new Proxy(values, {
      get(target, p) {
        if (p === 'getItem') return (key: string) => target[key] ?? null;
        if (p === 'setItem')
          return (key: string, value: string) => {
            target[key] = value;
          };
        return target[p as string];
      },
    }),
  );
  name = await deriveStoreName(scope.principalId, scope.workspaceId);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('owned startup preflight', () => {
  it('reports absent carriers without persisting any database or enumerating databases', async () => {
    const listing = indexedDB.databases.bind(indexedDB),
      enumerated = vi.spyOn(indexedDB, 'databases');
    expect(await inspect()).toMatchObject({ kind: 'fresh' });
    expect(await listing()).toEqual([]);
    expect(enumerated).not.toHaveBeenCalled();
  });
  it('does not mistake a retained undefined-valued record for absence', async () => {
    await control(undefined);
    expect(await inspect()).toMatchObject({
      kind: 'repair-required',
      reason: 'retained-material-without-index',
    });
  });
  it('refuses an orphan journal without custody or index', async () => {
    localStorage.setItem(journalPrefix(name) + 'entry', '2:opaque');
    expect(await inspect()).toMatchObject({ kind: 'repair-required' });
    expect(localStorage.getItem(journalPrefix(name) + 'entry')).toBe('2:opaque');
  });
  it('keeps unassigned legacy persistence on the migration path', async () => {
    await put('done', { updates: null });
    expect(await inspect()).toMatchObject({
      kind: 'migration-required',
      reason: 'unassigned-legacy-carrier',
    });
  });
  it('does not invoke identity verification or open stores through a closed slot', async () => {
    await index({ ...slot(), status: 'closed' });
    const verify = vi.fn(authority.resolveIdentity);
    expect(await inspect({ ...authority, resolveIdentity: verify })).toMatchObject({
      kind: 'slot-closed',
    });
    expect(verify).not.toHaveBeenCalled();
  });
  it('requires independently verified identity before treating an index as authority', async () => {
    await complete();
    expect(
      await inspect({
        ...authority,
        resolveIdentity: () => {
          throw Error('bad binding');
        },
      }),
    ).toMatchObject({ kind: 'identity-required' });
  });
  it('does not substitute a supplied principal for an Account binding', async () => {
    await index({
      ...slot(),
      unlockBinding: { binding: { principalId: 'other' }, bindingSignature: 'ff' },
    });
    expect(
      await inspect({
        ...authority,
        resolveIdentity: () => ({ kind: 'account', principalId: scope.principalId }),
      }),
    ).toMatchObject({ kind: 'identity-required' });
  });
  it('does not substitute an Account binding for Local identity', async () => {
    await index({
      ...slot(),
      unlockBinding: { binding: { principalId: scope.principalId }, bindingSignature: 'ff' },
    });
    expect(await inspect()).toMatchObject({ kind: 'identity-required' });
  });
  it('refuses missing custody beside an indexed identity', async () => {
    await index();
    expect(await inspect()).toMatchObject({
      kind: 'repair-required',
      reason: 'indexed-custody-missing',
    });
  });
  it('refuses mismatched or duplicate routes rather than deriving around them', async () => {
    await index({ ...slot(), stores: [{ ...slot().stores[0], dbName: 'other' }] });
    expect(await inspect()).toMatchObject({
      kind: 'repair-required',
      reason: 'store-routing-mismatch',
    });
    await index({ ...slot(), stores: [...slot().stores, ...slot().stores] });
    expect(await inspect()).toMatchObject({
      kind: 'repair-required',
      reason: 'ambiguous-store-routing',
    });
  });
  it('preserves an explicitly selected legacy route', async () => {
    await index({ ...slot(), stores: [{ ...slot().stores[0], dbName: 'done' }] });
    expect(await inspect()).toMatchObject({
      kind: 'migration-required',
      reason: 'selected-legacy-route',
    });
  });
  it('reports structurally complete but unauthenticated carriers as needing unlock', async () => {
    await complete();
    const decrypt = vi.spyOn(crypto.subtle, 'decrypt');
    expect(await inspect()).toMatchObject({ kind: 'unlock-required' });
    expect(decrypt).not.toHaveBeenCalled(); // Dummy MAC/tag bytes are deliberately not authenticated by inspection.
  });
  it('refuses protected custody without a content creation witness', async () => {
    await index();
    await control(custody());
    expect(await inspect()).toMatchObject({
      kind: 'repair-required',
      reason: 'content-witness-missing',
    });
  });
  it('never recreates a missing initialized content database', async () => {
    await index();
    await control(custody());
    await control(witness(), ['content-v1']);
    expect(await inspect()).toMatchObject({
      kind: 'repair-required',
      reason: 'initialized-content-missing',
    });
    expect((await indexedDB.databases()).some((db) => db.name === name)).toBe(false);
  });
  it('refuses a counter belonging to another store instance', async () => {
    await complete();
    await disk({ ...counter(), store_id: '66'.repeat(16) });
    expect(await inspect()).toMatchObject({ kind: 'repair-required' });
  });
  it('recognizes unfinished content without completing or consuming reservations', async () => {
    await index();
    await control(custody());
    await control(witness('creating'), ['content-v1']);
    expect(await inspect()).toMatchObject({ kind: 'creation-pending' });
    await disk({ ...counter(), next_seq: 2, reserved: { '1': 1 } });
    expect(await inspect()).toMatchObject({
      kind: 'repair-required',
      reason: 'conflicting-content-creation',
    });
  });
  it('recognizes custody creation and refuses unrelated surviving content beside it', async () => {
    await index();
    await control({
      ...custody(),
      state: 'creating',
      seal_reserved: 0,
      envelope: null,
      credentials: null,
      creation_intent: {
        id: '33'.repeat(16),
        storeId: '11'.repeat(16),
        rootId: '22'.repeat(16),
        wrappingId: '44'.repeat(16),
        signingId: '55'.repeat(16),
      },
    });
    expect(await inspect()).toMatchObject({ kind: 'creation-pending' });
    await disk();
    expect(await inspect()).toMatchObject({
      kind: 'repair-required',
      reason: 'conflicting-custody-creation',
    });
  });
  for (const state of ['clearing', 'cleared', 'migrating', 'unknown'])
    it('refuses a scoped ' + state + ' control without performing its action', async () => {
      await complete();
      await control({ state }, ['future-transition']);
      expect(await inspect()).toMatchObject({
        kind:
          state === 'migrating'
            ? 'migration-required'
            : state === 'unknown'
              ? 'repair-required'
              : state,
      });
      expect((await indexedDB.databases()).some((db) => db.name === name)).toBe(true);
    });
  it('finds unsupported scoped rows with array-valued key suffixes', async () => {
    await complete();
    await control({ state: 'unknown' }, [['beyond-string-range']]);
    expect(await inspect()).toMatchObject({
      kind: 'repair-required',
      reason: 'unsupported-scoped-control-record',
    });
  });
  it('does not classify unrelated custody rows as target material', async () => {
    await put('done.custody', { entries: null }, [
      {
        store: 'entries',
        key: ['other-slot', 'other-principal', 'other-workspace', 'transition'],
        value: { state: 'clearing' },
      },
    ]);
    expect(await inspect()).toMatchObject({ kind: 'fresh' });
  });
  it('refuses unknown database versions without upgrading them', async () => {
    await complete();
    await disk(counter(), 2);
    expect(await inspect()).toMatchObject({
      kind: 'repair-required',
      reason: 'unsupported-database-layout',
    });
    expect((await indexedDB.databases()).find((db) => db.name === name)?.version).toBe(2);
  });
  it('reports unavailable native storage rather than fresh', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw Error('denied');
    });
    expect(await inspect()).toMatchObject({ kind: 'unavailable' });
  });
  it('refuses unsupported coordination before inspecting persistence', async () => {
    vi.stubGlobal('navigator', {});
    const open = vi.spyOn(indexedDB, 'open');
    expect(await inspect()).toMatchObject({ kind: 'unsupported' });
    expect(open).not.toHaveBeenCalled();
  });
  it('cancels a delayed identity read without returning an old classification', async () => {
    const controller = new AbortController();
    let release!: () => void;
    const waiting = new Promise<void>((r) => {
      release = r;
    });
    let entered = false;
    const result = inspectWorkspaceStartup(
      {
        ...authority,
        resolveIdentity: async () => {
          entered = true;
          await waiting;
          return { kind: 'local', principalId: scope.principalId };
        },
      },
      { signal: controller.signal },
    );
    while (!entered) await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    release();
    expect(await result).toMatchObject({ kind: 'cancelled' });
  });
});
