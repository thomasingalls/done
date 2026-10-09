// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { IDBFactory, IDBObjectStore as FakeStore } from 'fake-indexeddb';
import { setup, slot, options, change } from './legacyCleanupFixture';
import { createLegacyCoordinator } from '../src/crdt/legacyCoordinator';
import { type LegacyImportInput } from '../src/crdt/legacyImportPlan';
import { readImportClaim } from '../src/crdt/legacyImportRecord';
import { withExclusiveSlot } from '../src/crdt/writeSession';
import { verifyLegacyCleanup } from '../src/crdt/legacyCleanup';
import { selectLegacyImport } from '../src/crdt/legacySelection';
import { localClaimKey, readLocalClaim } from '../src/crdt/localGenesisRecord';
import { openLocalWorkspace } from '../src/crdt/localGenesis';
import { clearLocalWorkspace, prepareLocalClear } from '../src/crdt/localClear';
import { seed, modernKey } from './legacy-source/fixture';
import { makeExportSource } from './legacy-export/source';
// @ts-expect-error Independent Node ledger.
import { example, expected } from '../scripts/legacy-export/oracle.mjs';

const source = async (text = 'original') => {
  const input = { ...example(), master: text, days: [] },
    old = makeExportSource(input);
  try {
    await seed([0], [1, 2], old.updates);
  } finally {
    old.doc.destroy();
  }
  const c = createLegacyCoordinator(slot),
    capture = await c.capture();
  await c.close();
  const recovery: LegacyImportInput = {
    recovery: capture.recovery,
    recoveryDigest: capture.recoveryDigest,
    sourceOrigin: location.origin,
    sourceDigest: capture.sourceDigest,
    policy: 'markdown-system-v1',
  };
  return { recovery, expected: expected(input)[0].content };
};
const master = async (code: string) => {
  const opened = await openLocalWorkspace(slot, code, options);
  if (opened.kind !== 'ready') throw Error(opened.reason);
  try {
    return opened.workspace.read().master;
  } finally {
    await opened.workspace.close();
  }
};
const dump = async () => {
  const result: unknown[] = [];
  for (const { name } of await indexedDB.databases()) {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(name!);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([...db.objectStoreNames], 'readonly');
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
        for (const store of db.objectStoreNames) {
          const r = tx.objectStore(store).openCursor();
          r.onsuccess = () => {
            if (r.result) {
              result.push([name, store, r.result.key, r.result.value]);
              r.result.continue();
            }
          };
        }
      });
    } finally {
      db.close();
    }
  }
  return {
    records: result,
    local: Object.keys(localStorage)
      .sort()
      .map((k) => [k, localStorage.getItem(k)]),
  };
};

describe('private migration coordinator', () => {
  it('discovers without writing; one action never implicitly selects or deletes', async () => {
    const { recovery, expected: text } = await source();
    const c = createLegacyCoordinator(slot),
      initial = await dump();
    expect(await c.inspect()).toEqual({ kind: 'unused' });
    expect(await dump()).toEqual(initial);
    const ceremony = c.enroll(recovery, 1),
      code = ceremony.displayCode!;
    expect(await dump()).toEqual(initial);
    await ceremony.confirm(code);
    expect(await c.inspect()).toEqual({ kind: 'unlock-required', owner: 'import' });
    let current = await c.inspect(code, recovery);
    while (current.kind === 'import' && current.stage !== 'imported') {
      await c.advance('import', code, recovery, { maxSlices: 32 });
      current = await c.inspect(code, recovery);
    }
    expect(current).toMatchObject({ kind: 'import', stage: 'imported', input: 'verified' });
    expect((await openLocalWorkspace(slot, code, options)).kind).not.toBe('ready');
    await c.advance('select', code, recovery);
    expect(await c.inspect(code)).toMatchObject({
      kind: 'selected',
      input: 'required',
      cleanup: 'pending',
    });
    expect(localStorage.getItem('done.actor')).toBe('legacy-human');
    await c.close();
    const restarted = createLegacyCoordinator(slot);
    await expect(
      restarted.advance('verify', code, recovery, { workspace: options }),
    ).rejects.toMatchObject({ disposition: { reason: 'cleanup-not-complete' } });
    await restarted.advance('cleanup', code, recovery);
    expect(await restarted.advance('verify', code, recovery, { workspace: options })).toMatchObject(
      { kind: 'migration-verified' },
    );
    expect(await master(code)).toBe(text);
    expect(localStorage.getItem(modernKey)).toBe('2:unrelated-encrypted-carrier');
    await restarted.close();
  });
  it('refuses missing/wrong packet and factor at retained stages without mutation', async () => {
    const f = await setup(undefined, false),
      c = createLegacyCoordinator(slot),
      before = await dump();
    expect(() => c.advance('import', f.code)).toThrow('migration-recovery-input-required');
    await expect(c.advance('import', 'wrong', f.input)).rejects.toThrow();
    await expect(
      c.advance('import', f.code, { ...f.input, sourceDigest: '0'.repeat(64) }),
    ).rejects.toThrow();
    await expect(c.advance('select', f.code, f.input)).rejects.toThrow(
      'migration-selection-needs-imported',
    );
    await expect(c.capture()).rejects.toThrow('migration-capture-needs-unused-slot');
    const ceremony = c.enroll(f.input);
    await expect(ceremony.confirm(ceremony.displayCode!)).rejects.toThrow(
      'migration-enrollment-needs-unused-slot',
    );
    expect(await dump()).toEqual(before);
    await c.close();
  });
  it('copies input before awaiting classification; cancellation disposes unconfirmed enrollment', async () => {
    const f = await setup(undefined, false),
      c = createLegacyCoordinator(slot);
    const input = { ...f.input, recovery: f.input.recovery.slice() };
    const pending = c.advance('import', f.code, input, { maxSlices: 32 });
    input.recovery.fill(0);
    await pending;
    const before = await dump();
    await c.close();
    expect(() => c.advance('cleanup', f.code, f.input)).toThrow('migration-cancelled');
    const another = createLegacyCoordinator('other-slot'),
      e = another.enroll(f.input);
    await another.close();
    expect(e.displayCode).toBeNull();
    expect(() => e.confirm('bad')).toThrow('migration-cancelled');
    expect(await dump()).toEqual(before);
  });
  it('rejects changed source before initial intent without minting', async () => {
    const { recovery } = await source(),
      c = createLegacyCoordinator(slot),
      e = c.enroll(recovery);
    localStorage.setItem('done.actor', 'changed');
    const before = await dump();
    await expect(e.confirm(e.displayCode!)).rejects.toThrow('migration-source-changed');
    expect(await dump()).toEqual(before);
    await c.close();
  });
  it('does not turn an index into selection or remint a missing completed route', async () => {
    const f = await setup(),
      c = createLegacyCoordinator(slot);
    await c.advance('select', f.code, f.input);
    await change('done.slots', 'slots', (s) => s.delete(slot));
    const before = await dump();
    await expect(c.inspect(f.code, f.input)).rejects.toThrow();
    await expect(c.advance('import', f.code, f.input)).rejects.toThrow();
    await expect(c.advance('select', f.code, f.input)).rejects.toThrow();
    expect(await dump()).toEqual(before);
    await c.close();
  });
  it('refuses mixed authenticated claims rather than choosing the latest-looking stage', async () => {
    const f = await setup(),
      old = await withExclusiveSlot(slot, (t) => readImportClaim(t, slot));
    await selectLegacyImport(slot, f.code, f.input);
    await change('done.custody', 'entries', (s) => s.add(old, [slot, 'legacy-import-v1']));
    const c = createLegacyCoordinator(slot),
      before = await dump();
    await expect(c.inspect(f.code, f.input)).rejects.toThrow('migration-conflicting-claims');
    expect(await dump()).toEqual(before);
    await c.close();
  });
  it('resumes a partial manifest without recapturing source and never lets verification perform deletion', async () => {
    const f = await setup(),
      c = createLegacyCoordinator(slot);
    await c.advance('select', f.code, f.input);
    const native = FakeStore.prototype.put;
    const fault = vi
      .spyOn(FakeStore.prototype, 'put')
      .mockImplementation(function (this: IDBObjectStore, value, key) {
        const r = native.call(this, value, key);
        if ((value as { sourceCleanup?: { next: number } }).sourceCleanup?.next === 1)
          r.addEventListener('success', () => this.transaction.abort(), { once: true });
        return r;
      });
    await expect(c.advance('cleanup', f.code, f.input)).rejects.toThrow();
    fault.mockRestore();
    await c.close();
    const restarted = createLegacyCoordinator(slot),
      before = await dump();
    expect(await restarted.inspect(f.code, f.input)).toMatchObject({
      kind: 'selected',
      cleanup: 'partial',
    });
    await expect(verifyLegacyCleanup(slot, f.code, f.input)).rejects.toMatchObject({
      disposition: { reason: 'cleanup-not-complete' },
    });
    expect(await dump()).toEqual(before);
    await restarted.advance('cleanup', f.code, f.input);
    const terminal = await dump();
    await verifyLegacyCleanup(slot, f.code, f.input);
    expect(await dump()).toEqual(terminal);
    localStorage.setItem('done.actor', 'reappeared');
    await expect(
      restarted.advance('verify', f.code, f.input, { workspace: options }),
    ).rejects.toThrow();
    expect(localStorage.getItem('done.actor')).toBe('reappeared');
    await restarted.close();
  });
  it('keeps selected work open without a packet, rejects reimport, and defers cleared slots to their owner', async () => {
    const f = await setup(),
      c = createLegacyCoordinator(slot);
    await c.advance('select', f.code, f.input);
    const opened = await openLocalWorkspace(slot, f.code, options);
    if (opened.kind !== 'ready') throw Error(opened.reason);
    await opened.workspace
      .text({ kind: 'master' })
      .input({ name: 'insert', text: 'later ' }, { ranges: [{ anchor: 0, head: 0 }], main: 0 })
      .accepted;
    await opened.workspace.whenDurable();
    await opened.workspace.close();
    const before = await dump();
    await expect(c.advance('import', f.code, f.input)).rejects.toThrow(
      'migration-import-needs-preactive',
    );
    expect(await dump()).toEqual(before);
    expect(await master(f.code)).toMatch(/^later /u);
    await c.advance('cleanup', f.code, f.input);
    await clearLocalWorkspace(await prepareLocalClear(slot, f.code), f.code);
    expect(await c.inspect()).toEqual({ kind: 'owner-required', owner: 'clear' });
    await expect(c.advance('import', f.code, f.input)).rejects.toThrow();
    await c.close();
  });
  it('authenticates terminal metadata; a cursor hint cannot bypass the MAC', async () => {
    const f = await setup(),
      c = createLegacyCoordinator(slot);
    await c.advance('select', f.code, f.input);
    await c.advance('cleanup', f.code, f.input);
    const claim = await withExclusiveSlot(slot, (t) => readLocalClaim(t, slot));
    claim!.sourceCleanup!.intentId = '0'.repeat(32);
    await change('done.custody', 'entries', (s) => s.put(claim, localClaimKey(slot)));
    const before = await dump();
    await expect(c.advance('verify', f.code, f.input, { workspace: options })).rejects.toThrow();
    expect(await dump()).toEqual(before);
    await c.close();
  });
  it('generated bounded imports survive repeated coordinator disposal, missing input, and wrong-step requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('a', 'é', '🔒', '\n'), { maxLength: 20 }),
        fc.integer({ min: 1, max: 4 }),
        async (text, budget) => {
          vi.stubGlobal('indexedDB', new IDBFactory());
          const f = await source(text.join(''));
          let c = createLegacyCoordinator(slot);
          const e = c.enroll(f.recovery, 1),
            code = e.displayCode!;
          await e.confirm(code);
          for (let n = 0; n < 100; n++) {
            const s = await c.inspect(code, f.recovery);
            if (s.kind === 'import' && s.stage === 'imported') break;
            const before = await dump();
            expect(() => c.advance('import', code)).toThrow('migration-recovery-input-required');
            expect(await dump()).toEqual(before);
            await c.advance('import', code, f.recovery, { maxSlices: budget });
            await c.close();
            c = createLegacyCoordinator(slot);
          }
          await c.advance('select', code, f.recovery);
          await c.close();
          c = createLegacyCoordinator(slot);
          await c.advance('cleanup', code, f.recovery);
          await c.close();
          c = createLegacyCoordinator(slot);
          await c.advance('verify', code, f.recovery, { workspace: options });
          expect(await master(code)).toBe(f.expected);
          await c.close();
        },
      ),
      { seed: 9141, numRuns: 30 },
    );
  }, 60000);
});
