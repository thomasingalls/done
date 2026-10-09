// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { IDBObjectStore as FakeStore } from 'fake-indexeddb';
import * as fc from 'fast-check';
import { setup, slot, options } from './legacyCleanupFixture';
import { cleanupLegacySource } from '../src/crdt/legacyCleanup';
import { selectLegacyImport } from '../src/crdt/legacySelection';
import { readLocalClaim, verifyLocalClaim, signLocalClaim } from '../src/crdt/localGenesisRecord';
import { withExclusiveSlot } from '../src/crdt/writeSession';
import { inspectLegacySource, readLegacyUpdates, readLegacyLocal } from '../src/crdt/legacySource';
import {
  cleanupFingerprinter,
  cleanupPayload,
  type LegacyCleanupRecord,
} from '../src/crdt/legacyCleanupRecord';
import { databaseFingerprint, writeCleanupClaim } from '../src/crdt/legacyCleanupStorage';
import { fields, hex, utf8 } from '../src/crdt/custodyCrypto';
import { openLocalWorkspace } from '../src/crdt/localGenesis';
import { cleanupFields } from '../src/crdt/legacyCleanupEncoding';
import { parseLegacyCleanup } from '../src/crdt/legacyCleanupRecord';
import { type SourceInput } from './legacy-export/source';
const saved = JSON.parse(
  readFileSync(
    new URL('./legacy-cleanup/regressions/field-too-long-2026-09-09/input.json', import.meta.url),
    'utf8',
  ),
) as {
  source: { input: SourceInput; disk: number[]; wal: number[] };
};
const ready = async (code: string) => {
  const opened = await openLocalWorkspace(slot, code, options);
  expect(opened.kind).toBe('ready');
  if (opened.kind === 'ready') await opened.workspace.close();
};

describe('cleanup bulk encoding boundaries', () => {
  it('cleans the confirmed generated database exceeding the old field width', async () => {
    const f = await setup(saved.source.input, true, undefined, saved.source);
    await selectLegacyImport(slot, f.code, f.input);
    await withExclusiveSlot(slot, async (task) => {
      const rows = (await readLegacyUpdates(task))!;
      expect(utf8(JSON.stringify(rows.map((r) => [r.key, hex(r.bytes)]))).length).toBeGreaterThan(
        65535,
      );
      rows.forEach((r) => r.bytes.fill(0));
    });
    expect(await cleanupLegacySource(slot, f.code, f.input)).toMatchObject({
      kind: 'source-cleaned',
    });
    await withExclusiveSlot(slot, async (task) => {
      expect((await readLocalClaim(task, slot))!.sourceCleanup!.v).toBe(2);
      expect(await readLegacyUpdates(task)).toBeNull();
      expect(readLegacyLocal(task)).toEqual([]);
    });
    await ready(f.code);
  }, 30000);

  it('accepts an allowed large local value and preserves a cold-openable destination', async () => {
    const f = await setup(undefined, true, () =>
      localStorage.setItem('done.sync', '🔒'.repeat(17000)),
    );
    await selectLegacyImport(slot, f.code, f.input);
    expect(await cleanupLegacySource(slot, f.code, f.input)).toMatchObject({
      kind: 'source-cleaned',
    });
    expect(localStorage.getItem('done.sync')).toBeNull();
    await ready(f.code);
  });

  it('cleans a large valid legacy journal entry and retains its text', async () => {
    const source = { ...saved.source.input, master: 'a'.repeat(52000), days: [] };
    const f = await setup(source, true, undefined, { disk: [], wal: [0, 1, 2] });
    expect(
      utf8(localStorage.getItem('done.pending-update.done.fixture.0')!).length,
    ).toBeGreaterThan(65535);
    await selectLegacyImport(slot, f.code, f.input);
    await cleanupLegacySource(slot, f.code, f.input);
    expect(localStorage.getItem('done.pending-update.done.fixture.0')).toBeNull();
    const opened = await openLocalWorkspace(slot, f.code, options);
    expect(opened.kind).toBe('ready');
    if (opened.kind === 'ready') {
      try {
        expect(opened.workspace.read().master).toBe(source.master + source.suffix.slice(1));
      } finally {
        await opened.workspace.close();
      }
    }
  }, 30000);

  it('persists, authenticates and resumes a manifest larger than 64 KiB', async () => {
    const f = await setup(undefined, true, () => {
      const value = localStorage.getItem('done.pending-update.done.fixture.0')!;
      for (let n = 0; n < 20; n++)
        localStorage.setItem(`done.pending-update.done.${'x'.repeat(3600)}.${n}`, value);
    });
    await selectLegacyImport(slot, f.code, f.input);
    const native = FakeStore.prototype.put;
    let boundaryReached = false;
    const fault = vi.spyOn(FakeStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      const request = native.call(this, value, key);
      if (
        this.name === 'entries' &&
        (value as { sourceCleanup?: { next: number } })?.sourceCleanup?.next === 1
      ) {
        boundaryReached = true;
        request.addEventListener('success', () => this.transaction.abort(), { once: true });
      }
      return request;
    });
    await expect(cleanupLegacySource(slot, f.code, f.input)).rejects.toThrow();
    fault.mockRestore();
    expect(boundaryReached).toBe(true);
    await withExclusiveSlot(slot, async (task) => {
      const claim = (await readLocalClaim(task, slot))!;
      expect(utf8(cleanupPayload(claim.sourceCleanup!)).length).toBeGreaterThan(65535);
      await verifyLocalClaim(task, claim, f.code);
      const altered = structuredClone(claim);
      altered.sourceCleanup!.entries.at(-1)!.digest = '0'.repeat(64);
      await expect(verifyLocalClaim(task, altered, f.code)).rejects.toThrow();
    });
    await ready(f.code);
    await cleanupLegacySource(slot, f.code, f.input);
    await cleanupLegacySource(slot, f.code, f.input);
    await ready(f.code);
  }, 30000);

  it('fingerprints bind all UTF-8 bytes across the former width, field boundaries and carrier kind', async () => {
    const f = await setup();
    await selectLegacyImport(slot, f.code, f.input);
    await withExclusiveSlot(slot, async (task) => {
      const claim = (await readLocalClaim(task, slot))!;
      const fp = await cleanupFingerprinter(task, claim, f.code, '4'.repeat(32));
      try {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 65530, max: 65542 }),
            fc.constantFrom('a', 'é', '🔒'),
            async (targetBytes, char) => {
              const size = utf8(char).length;
              const bytesLeft = targetBytes - utf8(JSON.stringify(['done.sync', 'x'])).length;
              const prefix =
                char.repeat(Math.floor(bytesLeft / size)) + 'a'.repeat(bytesLeft % size);
              const a = ['done.sync', prefix + 'x'];
              expect(utf8(JSON.stringify(a)).length).toBe(targetBytes);
              const digest = await fp.digest('local', a);
              expect(await fp.digest('local', a)).toBe(digest);
              expect(await fp.digest('local', ['done.sync', prefix + 'y'])).not.toBe(digest);
              expect(await fp.digest('database', a)).not.toBe(digest);
            },
          ),
          { seed: 8941, numRuns: 30 },
        );
        expect(await fp.digest('local', ['ab', 'c'])).not.toBe(
          await fp.digest('local', ['a', 'bc']),
        );
        expect(await fp.digest('local', ['done.sync', '\ud800'])).not.toBe(
          await fp.digest('local', ['done.sync', '\ufffd']),
        );
      } finally {
        fp.dispose();
      }
    });
  });
});

describe('cleanup version compatibility', () => {
  it('keeps v1 MAC bytes exact; v2 binds framing and refuses unknown record versions', () => {
    const values = ['database', '[1,"é"]'];
    expect(cleanupFields(1, 'done/legacy-cleanup-entry', ...values)).toEqual(
      fields('done/legacy-cleanup-entry/v1', ...values),
    );
    expect(cleanupFields(1, 'done/local-import-cleanup', ...values)).toEqual(
      fields('done/local-import-cleanup/v1', ...values),
    );
    expect(new TextDecoder().decode(cleanupFields(2, 'done/legacy-cleanup-entry', ...values))).toBe(
      '["done/legacy-cleanup-entry/v2","database","[1,\\\"é\\\"]"]',
    );
    expect(() => fields('x'.repeat(65536))).toThrow('Field too long');
    expect(() =>
      parseLegacyCleanup({
        v: 3,
        intentId: '4'.repeat(32),
        databaseDigest: null,
        entries: [],
        next: 0,
      }),
    ).toThrow();
  });
  it('resumes an existing v1 intent and rejects changing its authenticated version', async () => {
    const f = await setup();
    await selectLegacyImport(slot, f.code, f.input);
    await withExclusiveSlot(slot, async (task) => {
      const claim = (await readLocalClaim(task, slot))!;
      const fp = await cleanupFingerprinter(task, claim, f.code, '4'.repeat(32), 1);
      try {
        const source = await inspectLegacySource(task);
        const entries = [];
        for (const e of [...source.journal, ...source.ancillary])
          entries.push({ key: e.key, digest: await fp.digest('local', [e.key, e.value]) });
        source.updates.forEach((r) => r.bytes.fill(0));
        source.journal.forEach((r) => r.bytes.fill(0));
        const record: LegacyCleanupRecord = {
          v: 1,
          intentId: '4'.repeat(32),
          databaseDigest: await databaseFingerprint(task, fp),
          entries,
          next: 0,
        };
        const next = await signLocalClaim(task, { ...claim, sourceCleanup: record }, f.code);
        await writeCleanupClaim(task, claim, next);
        const changedVersion = structuredClone(next);
        changedVersion.sourceCleanup!.v = 2;
        await expect(verifyLocalClaim(task, changedVersion, f.code)).rejects.toThrow();
      } finally {
        fp.dispose();
      }
    });
    await ready(f.code);
    await cleanupLegacySource(slot, f.code, f.input);
    await withExclusiveSlot(slot, async (task) => {
      const claim = (await readLocalClaim(task, slot))!;
      expect(claim.sourceCleanup!.v).toBe(1);
      expect(claim.sourceCleanup!.next).toBe(claim.sourceCleanup!.entries.length + 1);
      await verifyLocalClaim(task, claim, f.code);
    });
    await ready(f.code);
  });
});
