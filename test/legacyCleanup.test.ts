// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore as FakeStore } from 'fake-indexeddb';
import * as fc from 'fast-check';
import { setup, slot, options, change } from './legacyCleanupFixture';
import { cleanupLegacySource } from '../src/crdt/legacyCleanup';
import { selectLegacyImport } from '../src/crdt/legacySelection';
import { readLocalClaim, verifyLocalClaim, parseLocalClaim } from '../src/crdt/localGenesisRecord';
import { withExclusiveSlot } from '../src/crdt/writeSession';
import { readLegacyLocal } from '../src/crdt/legacySource';
import { probeDatabase } from '../src/crdt/startupStorage';
import { openLocalWorkspace } from '../src/crdt/localGenesis';
import { prepareLocalClear, clearLocalWorkspace, resumeLocalClear } from '../src/crdt/localClear';
import { openJournalSession } from '../src/crdt/custody';
import { Y } from '../src/crdt/yjs';
import { deriveStoreName } from '../src/crdt/storeName';
import { modernKey } from './legacy-source/fixture';
// @ts-expect-error External Node ledger.
import { example, expected } from '../scripts/legacy-export/oracle.mjs';
const local = () => withExclusiveSlot(slot, (task) => readLocalClaim(task, slot));
const source = () =>
  withExclusiveSlot(slot, async (task) => ({
    local: readLegacyLocal(task),
    database: await probeDatabase(task, 'done', async () => true),
  }));
const selected = async (s?: ReturnType<typeof example>) => {
  const f = await setup(s);
  await selectLegacyImport(slot, f.code, f.input);
  return f;
};
const openedMaster = async (code: string) => {
  const o = await openLocalWorkspace(slot, code, options);
  if (o.kind !== 'ready') throw Error(o.reason);
  try {
    return o.workspace.read().master;
  } finally {
    await o.workspace.close();
  }
};
const interruptProgress = (next: number) => {
  const native = FakeStore.prototype.put;
  return vi.spyOn(FakeStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    const r = native.call(this, value, key);
    if (
      this.name === 'entries' &&
      (value as { sourceCleanup?: { next: number } })?.sourceCleanup?.next === next
    )
      r.addEventListener('success', () => this.transaction.abort(), { once: true });
    return r;
  });
};
describe('authenticated journal-inclusive legacy cleanup', () => {
  it('removes only bound DB/WAL/ancillary carriers; preserves later journal-only edits and permits imported clear', async () => {
    const { code, input, progress } = await selected();
    const scope = progress.scope;
    const owner = await openJournalSession(
      { ...scope, resolvePrincipal: async () => scope.principalId },
      code,
    );
    const doc = new Y.Doc();
    try {
      for (const r of await owner.loadRecords()) {
        Y.applyUpdate(doc, r.bytes);
        r.bytes.fill(0);
      }
      const before = Y.encodeStateVector(doc);
      doc.getText('master').insert(0, 'journal-new ');
      expect(owner.appendLocal(new Uint8Array(Y.encodeStateAsUpdate(doc, before))).status).toBe(
        'journalled',
      );
    } finally {
      doc.destroy();
      await owner.close();
    }
    expect(await cleanupLegacySource(slot, code, input)).toMatchObject({
      kind: 'source-cleaned',
      storeId: progress.storeId,
    });
    expect(await source()).toEqual({ database: null, local: [] });
    expect(localStorage.getItem(modernKey)).toBe('2:unrelated-encrypted-carrier');
    expect(localStorage.getItem('other-app')).toBe('unrelated');
    expect(await openedMaster(code)).toBe(
      'journal-new ' + expected({ ...example(), days: [] })[0].content,
    );
    expect(await selectLegacyImport(slot, code, input)).toMatchObject({
      sourceCleanup: 'complete',
    });
    await cleanupLegacySource(slot, code, input);
    const target = await prepareLocalClear(slot, code);
    expect(target.legacySourceOrigin).toBe(location.origin);
    await clearLocalWorkspace(target, code);
    expect(await resumeLocalClear(slot, code)).toMatchObject({ kind: 'cleared' });
    localStorage.setItem('done.device', 'reappeared');
    await expect(resumeLocalClear(slot, code)).rejects.toMatchObject({
      disposition: { reason: 'cleanup-source-remains' },
    });
  });
  it('refuses unselected input, wrong factor, changed binding/source, and damaged destination without deleting source', async () => {
    const f = await setup(),
      before = await source();
    await expect(cleanupLegacySource(slot, f.code, f.input)).rejects.toThrow();
    await selectLegacyImport(slot, f.code, f.input);
    await expect(cleanupLegacySource(slot, 'bad', f.input)).rejects.toThrow();
    await expect(
      cleanupLegacySource(slot, f.code, { ...f.input, sourceDigest: '0'.repeat(64) }),
    ).rejects.toThrow();
    expect(await source()).toEqual(before);
    const name = await deriveStoreName(f.progress.scope.principalId, f.progress.scope.workspaceId);
    await change(name, 'content', (s) => s.delete(1));
    await expect(cleanupLegacySource(slot, f.code, f.input)).rejects.toThrow();
    expect(await source()).toEqual(before);
  });
  it('refuses incomplete destination dependencies in a valid encrypted journal', async () => {
    const f = await selected(),
      scope = f.progress.scope;
    const c = await openJournalSession(
      { ...scope, resolvePrincipal: async () => scope.principalId },
      f.code,
    );
    const doc = new Y.Doc();
    try {
      doc.getText('master').insert(0, 'missing');
      const sv = Y.encodeStateVector(doc);
      doc.getText('master').insert(7, 'dependent');
      expect(c.appendLocal(new Uint8Array(Y.encodeStateAsUpdate(doc, sv))).status).toBe(
        'journalled',
      );
    } finally {
      doc.destroy();
      await c.close();
    }
    const before = await source();
    await expect(cleanupLegacySource(slot, f.code, f.input)).rejects.toMatchObject({
      disposition: { reason: 'cleanup-destination-pending' },
    });
    expect(await source()).toEqual(before);
  });
  it.each(['changed', 'unknown', 'early-missing', 'reappeared'] as const)(
    'refuses %s material on partial cleanup',
    async (kind) => {
      const f = await selected();
      const fault = interruptProgress(2);
      await expect(cleanupLegacySource(slot, f.code, f.input)).rejects.toThrow();
      fault.mockRestore();
      const c = (await local())!,
        r = c.sourceCleanup!;
      expect(r.next).toBe(1);
      if (kind === 'changed') localStorage.setItem(r.entries[1]!.key, 'changed');
      if (kind === 'unknown')
        localStorage.setItem('done.pending-update.done.unknown.0', '1:unknown');
      if (kind === 'early-missing') localStorage.removeItem(r.entries.at(-1)!.key);
      if (kind === 'reappeared') {
        const db = await new Promise<IDBDatabase>((resolve) => {
          const q = indexedDB.open('done');
          q.onsuccess = () => resolve(q.result);
        });
        db.close();
      }
      const before = [...Array(localStorage.length)]
        .map((_, i) => localStorage.key(i))
        .map((k) => [k, localStorage.getItem(k!)]);
      await expect(cleanupLegacySource(slot, f.code, f.input)).rejects.toThrow();
      expect(
        [...Array(localStorage.length)]
          .map((_, i) => localStorage.key(i))
          .map((k) => [k, localStorage.getItem(k!)]),
      ).toEqual(before);
      expect(await openedMaster(f.code)).toBe(expected({ ...example(), days: [] })[0].content);
      await expect(prepareLocalClear(slot, f.code)).rejects.toThrow();
    },
  );
  it('refuses an overlong manifest key before persisting an unreadable Local claim', async () => {
    const f = await setup(undefined, true, () => {
      const key = 'done.pending-update.done.fixture.0',
        value = localStorage.getItem(key)!;
      localStorage.removeItem(key);
      localStorage.setItem('done.pending-update.done.' + 'x'.repeat(5000) + '.0', value);
    });
    await selectLegacyImport(slot, f.code, f.input);
    const before = await source();
    await expect(cleanupLegacySource(slot, f.code, f.input)).rejects.toMatchObject({
      disposition: { reason: 'invalid-source-cleanup-entry' },
    });
    expect((await local())!.sourceCleanup).toBeUndefined();
    expect(await source()).toEqual(before);
    await openedMaster(f.code);
  });
  it('checks source absence after the terminal progress observer runs', async () => {
    const f = await selected();
    await expect(
      cleanupLegacySource(slot, f.code, f.input, {
        onProgress: (p) => {
          if (p.next === p.total) localStorage.setItem('done.actor', 'observer-reappearance');
        },
      }),
    ).rejects.toMatchObject({ disposition: { reason: 'cleanup-source-reappeared' } });
    expect(localStorage.getItem('done.actor')).toBe('observer-reappearance');
    await openedMaster(f.code);
  });
  it('authenticates cleanup presence, cursor and each manifest field; malformed keys cannot widen deletion', async () => {
    const f = await selected(),
      fault = interruptProgress(1);
    await expect(cleanupLegacySource(slot, f.code, f.input)).rejects.toThrow();
    fault.mockRestore();
    const c = (await local())!;
    for (const mutate of [
      (v: typeof c) => {
        delete v.sourceCleanup;
      },
      (v: typeof c) => {
        v.sourceCleanup!.next++;
      },
      (v: typeof c) => {
        v.sourceCleanup!.intentId = '0'.repeat(32);
      },
      (v: typeof c) => {
        v.sourceCleanup!.databaseDigest = null;
      },
      (v: typeof c) => {
        v.sourceCleanup!.entries[0]!.digest = '0'.repeat(64);
      },
      (v: typeof c) => {
        v.sourceCleanup!.entries[0]!.key = 'other-app';
      },
    ]) {
      const v = structuredClone(c);
      mutate(v);
      await expect(
        withExclusiveSlot(slot, (task) => verifyLocalClaim(task, v, f.code)),
      ).rejects.toThrow();
    }
    const malformed = structuredClone(c);
    malformed.sourceCleanup!.entries[0]!.key = modernKey;
    expect(() => parseLocalClaim(malformed, slot)).toThrow();
  });
  it('generated Unicode sources and interrupted native-progress writes converge; missing future keys refuse', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('a', 'é', '🔒', '\n', ' '), { maxLength: 25 }),
        fc.integer({ min: 0, max: 6 }),
        fc.boolean(),
        async (parts, boundary, damage) => {
          vi.stubGlobal('indexedDB', new IDBFactory());
          const s = { ...example(), master: parts.join(''), days: [] },
            f = await selected(s);
          const fault = interruptProgress(boundary);
          try {
            await cleanupLegacySource(slot, f.code, f.input);
          } catch {
            /* Inspect durable progress below. */
          }
          fault.mockRestore();
          const c = await local(),
            r = c!.sourceCleanup;
          if (damage && r && r.next < r.entries.length) {
            localStorage.setItem(r.entries.at(-1)!.key, 'changed');
            await expect(cleanupLegacySource(slot, f.code, f.input)).rejects.toThrow();
          } else {
            await cleanupLegacySource(slot, f.code, f.input);
            expect(await source()).toEqual({ database: null, local: [] });
          }
          expect(await openedMaster(f.code)).toBe(expected(s)[0].content);
        },
      ),
      { seed: 8941, numRuns: 40 },
    );
  }, 30000);
});
