// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb';
import * as fc from 'fast-check';
import { beginLegacyImport, resumeLegacyImport } from '../src/crdt/legacyImport';
import { selectLegacyImport } from '../src/crdt/legacySelection';
import { captureLegacyExport } from '../src/crdt/legacyExport';
import { withExclusiveSlot } from '../src/crdt/writeSession';
import { readImportClaim, advanceImportClaim } from '../src/crdt/legacyImportRecord';
import { readLocalClaim, parseLocalClaim, verifyLocalClaim } from '../src/crdt/localGenesisRecord';
import { installLocalIndex } from '../src/crdt/localGenesisStorage';
import {
  inspectLocalStartup,
  openLocalWorkspace,
  listLocalWorkspaces,
} from '../src/crdt/localGenesis';
import { prepareLocalClear } from '../src/crdt/localClear';
import { deriveStoreName } from '../src/crdt/storeName';
import { seed } from './legacy-source/fixture';
import { makeExportSource } from './legacy-export/source';
// @ts-expect-error External string ledger shared with the browser harness.
import { example, expected } from '../scripts/legacy-export/oracle.mjs';
const slot = 'selection-unit';
const options = {
  identity: {
    id: 'test-human',
    actor: { kind: 'human' as const, name: 'Human', color: '#000000' },
    device: { id: 'test-device', name: 'Device' },
  },
  validateReceive: () => {},
  today: () => '2026-01-01',
};
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('location', { origin: 'https://seeded.example' });
  vi.stubGlobal('navigator', {
    locks: { request: async (_n: unknown, _o: unknown, fn: () => Promise<void>) => fn() },
  });
  const data = new Map<string, string>();
  vi.stubGlobal(
    'localStorage',
    new Proxy(
      {
        get length() {
          return data.size;
        },
        key: (i: number) => [...data.keys()][i] ?? null,
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => data.set(k, v),
        removeItem: (k: string) => data.delete(k),
        clear: () => data.clear(),
      },
      {
        ownKeys: () => [...data.keys()],
        getOwnPropertyDescriptor: (_t, key) =>
          data.has(String(key))
            ? { configurable: true, enumerable: true, value: data.get(String(key)) }
            : undefined,
      },
    ),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const setup = async (source = { ...example(), days: [] }, complete = true) => {
  const old = makeExportSource(source);
  try {
    await seed([0], [1, 2], old.updates);
  } finally {
    old.doc.destroy();
  }
  const capture = await withExclusiveSlot('capture', (task) =>
    captureLegacyExport(task, { preview: 'markdown-v1' }),
  );
  const input = {
    recovery: capture.recovery,
    recoveryDigest: capture.recoveryDigest,
    sourceOrigin: location.origin,
    sourceDigest: capture.sourceDigest,
    policy: 'markdown-system-v1' as const,
  };
  const ceremony = beginLegacyImport(slot, input, { maxSlices: 1 }),
    code = ceremony.displayCode!;
  let progress = await ceremony.confirm(code);
  while (complete && progress.stage !== 'imported')
    progress = await resumeLegacyImport(slot, code, input, { maxSlices: 32 });
  return { input, code, progress };
};
const change = async (name: string, storeName: string, fn: (s: IDBObjectStore) => void) => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      fn(tx.objectStore(storeName));
    });
  } finally {
    db.close();
  }
};
const advance = (code: string, index: boolean) =>
  withExclusiveSlot(slot, async (task) => {
    const c = (await readImportClaim(task, slot))!;
    const selecting = await advanceImportClaim(task, c, code, 'selecting');
    if (index) await installLocalIndex(task, { ...selecting, stage: 'ready' });
  });
const local = () => withExclusiveSlot(slot, (task) => readLocalClaim(task, slot));
describe('verified imported Local selection', () => {
  it('cold-verifies, selects, opens through the normal owner, and preserves post-selection work on retry', async () => {
    const source = { ...example(), days: [] },
      { input, code, progress } = await setup(source);
    const result = await selectLegacyImport(slot, code, input);
    expect(result).toMatchObject({
      kind: 'selected',
      sourceCleanup: 'pending',
      scope: progress.scope,
      storeId: progress.storeId,
    });
    expect((await local())!.imported).toMatchObject({
      sourceDigest: input.sourceDigest,
      recoveryDigest: input.recoveryDigest,
    });
    expect(await inspectLocalStartup(slot)).toMatchObject({ kind: 'unlock-required' });
    expect(await listLocalWorkspaces(slot, code)).toHaveLength(1);
    const opened = await openLocalWorkspace(slot, code, options);
    expect(opened.kind).toBe('ready');
    if (opened.kind !== 'ready') throw Error(opened.reason);
    try {
      expect(opened.workspace.exportEntries().filter((e) => e.path !== 'unfiled.md')).toEqual(
        expected(source).filter((e: { path: string }) => e.path !== 'unfiled.md'),
      );
      await opened.workspace.text({ kind: 'master' }).input({ name: 'insert', text: 'new ' })
        .accepted;
      await opened.workspace.whenDurable();
    } finally {
      await opened.workspace.close();
    }
    expect(await selectLegacyImport(slot, code, input)).toEqual(result);
    const reopened = await openLocalWorkspace(slot, code, options);
    expect(reopened.kind).toBe('ready');
    if (reopened.kind !== 'ready') throw Error(reopened.reason);
    try {
      expect(reopened.workspace.read().master).toContain('new ');
    } finally {
      await reopened.workspace.close();
    }
    await expect(prepareLocalClear(slot, code)).rejects.toMatchObject({
      disposition: { reason: 'import-source-cleanup-needs-owner' },
    });
  });
  it.each([false, true])(
    'resumes intent with index=%s; ordinary opening stays blocked beforehand',
    async (index) => {
      const { input, code, progress } = await setup();
      await advance(code, index);
      expect(await openLocalWorkspace(slot, code, options)).toMatchObject({
        kind: 'migration-required',
      });
      await expect(resumeLegacyImport(slot, code, input)).rejects.toMatchObject({
        reason: 'import-selection-needs-owner',
      });
      expect(await selectLegacyImport(slot, code, input)).toMatchObject({
        scope: progress.scope,
        storeId: progress.storeId,
      });
    },
  );
  it.each([false, true])(
    'rechecks cold destination despite signed intent, index=%s',
    async (index) => {
      const { input, code, progress } = await setup();
      await advance(code, index);
      const name = await deriveStoreName(progress.scope.principalId, progress.scope.workspaceId);
      await change(name, 'content', (s) => s.delete(1));
      await expect(selectLegacyImport(slot, code, input)).rejects.toMatchObject({
        reason: 'selection-slices-missing',
      });
      expect(await inspectLocalStartup(slot)).toMatchObject({ kind: 'migration-required' });
    },
  );
  it('rejects incomplete import, wrong factor, source mutation and changed packet binding', async () => {
    const { input, code } = await setup(undefined, false);
    await expect(selectLegacyImport(slot, code, input)).rejects.toMatchObject({
      reason: 'import-not-complete',
    });
    let p;
    do {
      p = await resumeLegacyImport(slot, code, input, { maxSlices: 32 });
    } while (p.stage !== 'imported');
    await expect(selectLegacyImport(slot, 'bad', input)).rejects.toMatchObject({
      reason: 'import-unlock-failed',
    });
    await expect(
      selectLegacyImport(slot, code, { ...input, sourceDigest: '0'.repeat(64) }),
    ).rejects.toThrow();
    localStorage.setItem('done.actor', 'changed');
    await expect(selectLegacyImport(slot, code, input)).rejects.toMatchObject({
      reason: 'selection-source-changed',
    });
  });
  it('never rebuilds a lost selected index, and refuses a conflicting pre-active index', async () => {
    const { input, code } = await setup();
    await advance(code, true);
    await change('done.slots', 'slots', (s) => {
      const r = s.get(slot);
      r.onsuccess = () => s.put({ ...r.result, status: 'closed' });
    });
    await expect(selectLegacyImport(slot, code, input)).rejects.toThrow();
    await change('done.slots', 'slots', (s) => {
      const r = s.get(slot);
      r.onsuccess = () => s.put({ ...r.result, status: 'active' });
    });
    await selectLegacyImport(slot, code, input);
    await change('done.slots', 'slots', (s) => s.delete(slot));
    await expect(selectLegacyImport(slot, code, input)).rejects.toThrow();
    expect(await openLocalWorkspace(slot, code, options)).toMatchObject({
      kind: 'repair-required',
    });
  });
  it('requires the reread index route before committing the active decision', async () => {
    const { input, code } = await setup();
    const add = FakeObjectStore.prototype.add;
    const fault = vi.spyOn(FakeObjectStore.prototype, 'add').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      const request = add.call(this, value, key);
      if (this.name === 'slots')
        request.addEventListener('success', () => this.delete(slot), { once: true });
      return request;
    });
    await expect(selectLegacyImport(slot, code, input)).rejects.toMatchObject({
      reason: 'selection-index-missing',
    });
    fault.mockRestore();
    expect(await inspectLocalStartup(slot)).toMatchObject({ kind: 'migration-required' });
    await expect(selectLegacyImport(slot, code, input)).resolves.toMatchObject({
      kind: 'selected',
    });
  });
  it('authenticates every provenance field, including its presence', async () => {
    const { input, code } = await setup();
    await selectLegacyImport(slot, code, input);
    const c = (await local())!;
    for (const field of Object.keys(c.imported!)) {
      const altered = structuredClone(c);
      (altered.imported as unknown as Record<string, string>)[field] += 'x';
      await expect(
        withExclusiveSlot(slot, (task) => verifyLocalClaim(task, altered, code)),
      ).rejects.toThrow();
      expect(() => parseLocalClaim({ ...altered, stage: 'content' }, slot)).toThrow();
    }
    const stripped = structuredClone(c);
    delete stripped.imported;
    await expect(
      withExclusiveSlot(slot, (task) => verifyLocalClaim(task, stripped, code)),
    ).rejects.toThrow();
  });
  it('generated interruption states either refuse damage or converge to the same external master text', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('a', ' ', '\n', '🔒', 'é'), { maxLength: 30 }),
        fc.constantFrom('imported', 'intent', 'indexed'),
        fc.boolean(),
        async (parts, phase, damaged) => {
          vi.stubGlobal('indexedDB', new IDBFactory());
          const source = { ...example(), master: parts.join(''), days: [] },
            { input, code, progress } = await setup(source);
          if (phase !== 'imported') await advance(code, phase === 'indexed');
          if (damaged) {
            const name = await deriveStoreName(
              progress.scope.principalId,
              progress.scope.workspaceId,
            );
            await change(name, 'content', (s) => s.delete(1));
            await expect(selectLegacyImport(slot, code, input)).rejects.toMatchObject({
              reason: 'selection-slices-missing',
            });
          } else {
            await selectLegacyImport(slot, code, input);
            const opened = await openLocalWorkspace(slot, code, options);
            expect(opened.kind).toBe('ready');
            if (opened.kind !== 'ready') throw Error(opened.reason);
            try {
              expect(opened.workspace.read().master).toBe(expected(source)[0].content);
            } finally {
              await opened.workspace.close();
            }
            await selectLegacyImport(slot, code, input);
          }
        },
      ),
      { seed: 8941, numRuns: 30 },
    );
  }, 60_000);
});
