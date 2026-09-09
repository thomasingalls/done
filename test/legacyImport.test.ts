// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import * as fc from 'fast-check';
import {
  beginLegacyImport,
  resumeLegacyImport,
  type LegacyImportInput,
} from '../src/crdt/legacyImport';
import { captureLegacyExport } from '../src/crdt/legacyExport';
import { withExclusiveSlot } from '../src/crdt/writeSession';
import { readImportClaim, importScope } from '../src/crdt/legacyImportRecord';
import {
  beginLocalGenesis,
  inspectLocalStartup,
  openLocalWorkspace,
} from '../src/crdt/localGenesis';
import { openContentSession, withPreactiveContentUnderPermit } from '../src/crdt/custody';
import { openSlotIndex } from '../src/crdt/slotIndex';
import { deriveStoreName } from '../src/crdt/storeName';
import { Y } from '../src/crdt/yjs';
import { exportEntries } from '../src/crdt/export';
import { cardBody, unfiledCards } from '../src/crdt/days';
import { seed } from './legacy-source/fixture';
import { makeExportSource, type SourceInput } from './legacy-export/source';
// @ts-expect-error Independent test ledger shared with the native runner.
import { example, expected } from '../scripts/legacy-export/oracle.mjs';
const slot = 'import-unit';
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('location', { origin: 'https://seeded.example' });
  vi.stubGlobal('navigator', {
    locks: { request: async (_n: unknown, _o: unknown, fn: () => Promise<void>) => fn() },
  });
  const local = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    get length() {
      return local.size;
    },
    key: (i: number) => [...local.keys()][i] ?? null,
    getItem: (k: string) => local.get(k) ?? null,
    setItem: (k: string, v: string) => local.set(k, v),
    removeItem: (k: string) => local.delete(k),
    clear: () => local.clear(),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const prepare = async (input: SourceInput = example()): Promise<LegacyImportInput> => {
  const source = makeExportSource(input);
  try {
    await seed([0], [1, 2], source.updates);
  } finally {
    source.doc.destroy();
  }
  const capture = await withExclusiveSlot('capture-test', (task) =>
    captureLegacyExport(task, { preview: 'markdown-v1' }),
  );
  return {
    recovery: capture.recovery,
    recoveryDigest: capture.recoveryDigest,
    sourceDigest: capture.sourceDigest,
    sourceOrigin: 'https://seeded.example',
    policy: 'markdown-system-v1',
  };
};
const read = () => withExclusiveSlot(slot, (task) => readImportClaim(task, slot));
const change = async (name: string, storeName: string, action: (s: IDBObjectStore) => void) => {
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
      action(tx.objectStore(storeName));
    });
  } finally {
    db.close();
  }
};
const finish = async (input: LegacyImportInput, code: string, maxSlices = 32) => {
  let progress;
  do {
    progress = await resumeLegacyImport(slot, code, input, { maxSlices });
  } while (progress.stage !== 'imported');
  return progress;
};
const projection = (code: string) =>
  withExclusiveSlot(slot, async (task) => {
    const claim = (await readImportClaim(task, slot))!,
      scope = importScope(claim);
    return withPreactiveContentUnderPermit(
      task,
      { ...scope, resolvePrincipal: () => scope.principalId },
      code,
      async (content) => {
        const rows = await content.loadRecords(),
          doc = new Y.Doc({ gc: false });
        try {
          for (const row of rows) Y.applyUpdate(doc, row.bytes);
          return {
            entries: exportEntries(doc, doc.getText('master').toString()).filter(
              (e) => e.path !== 'unfiled.md',
            ),
            unfiled: unfiledCards(doc).map(({ card }) => cardBody(card)),
            cards: [...doc.getMap<Y.Map<unknown>>('cards').values()].map((c) => c.toJSON()),
            rows: rows.map((r) => ({ seq: r.seq, length: r.bytes.length })),
          };
        } finally {
          rows.forEach((r) => r.bytes.fill(0));
          doc.destroy();
        }
      },
    );
  });
describe('pre-active Local import', () => {
  it('confirms a generated factor before writes and leaves source intact', async () => {
    const input = await prepare(),
      before = await indexedDB.databases(),
      ceremony = beginLegacyImport(slot, input);
    await expect(ceremony.confirm('bad')).rejects.toMatchObject({ code: 'confirmation-required' });
    ceremony.cancel();
    await expect(ceremony.confirm('bad')).rejects.toMatchObject({ code: 'enrollment-closed' });
    expect(await indexedDB.databases()).toEqual(before);
    expect(await read()).toBeNull();
  });
  it('imports every old day and uncapped multiline/empty card with fresh system attribution, then replays idempotently', async () => {
    const source = example();
    source.master = 'long 🔒\n'.repeat(500);
    const input = await prepare(source),
      ceremony = beginLegacyImport(slot, input, { maxSlices: 1 }),
      code = ceremony.displayCode!;
    const first = await ceremony.confirm(code);
    expect(first.committedSlices).toBe(1);
    expect(first.stage).toBe('importing');
    const claim = await read(),
      final = await finish(input, code);
    const value = await projection(code);
    expect(value.entries).toEqual(
      expected(source).filter((e: { path: string }) => e.path !== 'unfiled.md'),
    );
    expect(value.unfiled).toEqual([source.orphan]);
    expect(
      value.cards.every(
        (c) =>
          c['author'] === 'system' && c['origin'] === null && c['createdAt'] === claim!.createdAt,
      ),
    ).toBe(true);
    expect(value.rows.length).toBe(final.totalSlices);
    expect(value.rows.every((r) => r.length <= 16384)).toBe(true);
    expect(await finish(input, code, 1)).toEqual(final);
    expect(await projection(code)).toEqual(value);
    expect((await indexedDB.databases()).some((d) => d.name === 'done.slots')).toBe(false);
  }, 30000);
  it('blocks ordinary startup, low-level custody, index mutation and fresh genesis while pre-active', async () => {
    const input = await prepare(),
      ceremony = beginLegacyImport(slot, input, { maxSlices: 1 }),
      code = ceremony.displayCode!,
      p = await ceremony.confirm(code);
    expect(await inspectLocalStartup(slot)).toMatchObject({ kind: 'migration-required' });
    expect(await openLocalWorkspace(slot, code, {} as never)).toMatchObject({
      kind: 'migration-required',
    });
    await expect(
      openContentSession({ ...p.scope, resolvePrincipal: () => p.scope.principalId }, code),
    ).rejects.toMatchObject({ disposition: { kind: 'migration-required' } });
    const index = await openSlotIndex();
    try {
      await expect(index.createSlot(slot)).rejects.toMatchObject({
        disposition: { kind: 'migration-required' },
      });
    } finally {
      index.close();
    }
    const fresh = beginLocalGenesis('other-slot'),
      freshCode = fresh.displayCode!;
    await expect(fresh.confirm(freshCode)).rejects.toMatchObject({
      disposition: { kind: 'migration-required' },
    });
  });
  it('refuses wrong factor, altered source/plan/policy and competing enrollment without replacing the winner', async () => {
    const input = await prepare(),
      ceremony = beginLegacyImport(slot, input, { maxSlices: 1 }),
      code = ceremony.displayCode!;
    await ceremony.confirm(code);
    const before = await read();
    const other = beginLegacyImport(slot, input),
      wrong = other.displayCode!;
    await expect(other.confirm(wrong)).rejects.toMatchObject({
      reason: 'import-destination-retains-material',
    });
    await expect(resumeLegacyImport(slot, wrong, input)).rejects.toMatchObject({
      reason: 'import-unlock-failed',
    });
    await expect(
      resumeLegacyImport(slot, code, { ...input, sourceDigest: '0'.repeat(64) }),
    ).rejects.toMatchObject({ reason: 'import-source-binding-mismatch' });
    expect(() => beginLegacyImport(slot, { ...input, policy: 'fidelity' as never })).toThrow();
    const another = await prepare({ ...example(), master: 'another' });
    await expect(resumeLegacyImport(slot, code, another)).rejects.toMatchObject({
      reason: 'import-intent-mismatch',
    });
    expect(await read()).toEqual(before);
  });
  it.each(['stage', 'binding', 'createdAt'])(
    'authenticates %s without using tampered progress',
    async (field) => {
      const input = await prepare(),
        ceremony = beginLegacyImport(slot, input, { maxSlices: 1 }),
        code = ceremony.displayCode!;
      await ceremony.confirm(code);
      const claim = (await read())!;
      if (field === 'stage') claim.stage = 'imported';
      if (field === 'binding') claim.binding.planDigest = '0'.repeat(64);
      if (field === 'createdAt') claim.createdAt = '2020-01-01T00:00:00.000Z';
      await change('done.custody', 'entries', (s) => s.put(claim, [slot, 'legacy-import-v1']));
      await expect(resumeLegacyImport(slot, code, input)).rejects.toMatchObject({
        reason: 'import-claim-authentication-failed',
      });
    },
  );
  it.each(['counter', 'custody', 'slice'])(
    'refuses missing %s instead of reminting or trusting completion',
    async (missing) => {
      const input = await prepare({ ...example(), days: [] }),
        ceremony = beginLegacyImport(slot, input),
        code = ceremony.displayCode!;
      await ceremony.confirm(code);
      const done = await finish(input, code),
        name = await deriveStoreName(done.scope.principalId, done.scope.workspaceId);
      if (missing === 'custody')
        await change('done.custody', 'entries', (s) =>
          s.delete([slot, done.scope.principalId, done.scope.workspaceId]),
        );
      else
        await change(name, missing === 'counter' ? 'meta' : 'content', (s) =>
          s.delete(missing === 'counter' ? 'counter' : 1),
        );
      await expect(resumeLegacyImport(slot, code, input)).rejects.toThrow();
    },
  );
  it('retains the file presence of an empty archived day without inventing a card', async () => {
    const source = {
      ...example(),
      days: [
        {
          date: '2026-01-01',
          next: [],
          scheduled: [],
          done: [],
          archive: '## Next\n\n\n## Scheduled\n\n\n## Done\n\n',
        },
      ],
    };
    const input = await prepare(source),
      ceremony = beginLegacyImport(slot, input),
      code = ceremony.displayCode!;
    await ceremony.confirm(code);
    await finish(input, code);
    expect((await projection(code)).entries).toEqual(
      expected(source).filter((e: { path: string }) => e.path !== 'unfiled.md'),
    );
  });
  it('copies the packet before caller mutation or the confirmation await', async () => {
    const input = await prepare({ ...example(), days: [] }),
      ceremony = beginLegacyImport(slot, input),
      code = ceremony.displayCode!;
    input.recovery.fill(0);
    await expect(ceremony.confirm(code)).resolves.toMatchObject({ kind: 'pre-active' });
  });
  it('generated text and resumptions retain the external logical ledger', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('a', '\n', '🔒', ' ', 'é'), { maxLength: 50 }),
        fc.integer({ min: 1, max: 8 }),
        async (parts, size) => {
          vi.stubGlobal('indexedDB', new IDBFactory());
          const source = {
            ...example(),
            master: parts.join(''),
            orphan: parts.join('') + '\n',
            days: example().days.slice(0, 2),
          };
          const input = await prepare(source),
            ceremony = beginLegacyImport(slot, input, { maxSlices: size }),
            code = ceremony.displayCode!;
          await ceremony.confirm(code);
          await finish(input, code, size);
          const result = await projection(code);
          expect(result.entries).toEqual(
            expected(source).filter((e: { path: string }) => e.path !== 'unfiled.md'),
          );
          expect(result.unfiled).toEqual([source.orphan]);
        },
      ),
      { seed: 8941, numRuns: 25 },
    );
  }, 30000);
});
