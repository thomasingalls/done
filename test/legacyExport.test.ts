// @vitest-environment node
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { Y } from '../src/crdt/yjs';
import { captureLegacyExport, replayLegacyExport } from '../src/crdt/legacyExport';
import type { SessionTask } from '../src/crdt/writeSession';
import { seed, reset } from './legacy-source/fixture';
import { makeExportSource, type SourceInput } from './legacy-export/source';
// Test-only independent string ledger; no production serializer/Yjs reads.
// @ts-expect-error The runner oracle intentionally remains JavaScript outside the application program.
import { example, checkEntries } from '../scripts/legacy-export/oracle.mjs';
const task: SessionTask = {
  signal: new AbortController().signal,
  step: (fn) => fn(),
  wait: async (fn) => fn(),
};
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const preview = { preview: 'markdown-v1' } as const;
beforeEach(() => {
  const local = new Map<string, string>();
  vi.stubGlobal('location', { origin: 'https://seeded.example' });
  vi.stubGlobal('localStorage', {
    get length() {
      return local.size;
    },
    key: (i: number) => [...local.keys()][i] ?? null,
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => local.set(key, value),
    clear: () => local.clear(),
  });
});
afterEach(async () => {
  await reset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const prepare = async (input: SourceInput = example()) => {
  const source = makeExportSource(input);
  try {
    await seed([0], [1, 2], source.updates);
  } finally {
    source.doc.destroy();
  }
};

describe('verified legacy export candidate preparation', () => {
  it('recovers all ten days, uncapped Next, unfiled text and dependent journal-only changes', async () => {
    const input = example();
    await prepare(input);
    const result = await captureLegacyExport(task, preview);
    const recovered = await replayLegacyExport(result.recovery, result.recoveryDigest);
    checkEntries(recovered.entries, input);
    expect(result.markdownDigest).toBe(hash(result.markdown));
    expect(recovered.sourceDigest).toBe(result.sourceDigest);
    const recoveryText = new TextDecoder().decode(result.recovery);
    expect(recoveryText).not.toContain('private-token');
    expect(recoveryText).not.toContain('private-name');
    expect(JSON.parse(recoveryText).records.map((r: { carrier: string }) => r.carrier)).toEqual([
      'journal',
      'journal',
      'disk',
    ]);
  });
  it('requires an explicit preview adapter without selecting a cutover carrier', async () => {
    await prepare();
    await expect(captureLegacyExport(task, {} as typeof preview)).rejects.toMatchObject({
      reason: 'explicit-preview-required',
    });
  });
  it.each([1, 2])(
    'refuses incomplete semantic basis for update %i and preserves original WAL',
    async (id) => {
      const source = makeExportSource(example());
      try {
        await seed([], [id], source.updates);
      } finally {
        source.doc.destroy();
      }
      const before = localStorage.getItem('done.pending-update.done.fixture.0');
      await expect(captureLegacyExport(task, preview)).rejects.toMatchObject({
        reason: 'legacy-dependencies-missing',
      });
      expect(localStorage.getItem('done.pending-update.done.fixture.0')).toBe(before);
    },
  );
  it.each(['schema', 'membership', 'path', 'unknown-root', 'rich-text'])(
    'refuses %s rather than silently dropping or repairing source material',
    async (kind) => {
      const { doc } = makeExportSource(example());
      if (kind === 'schema') doc.getMap('meta').set('schemaVersion', 3);
      if (kind === 'membership') doc.getMap('cardLocations').set('orphan', '2026-08-01:next');
      if (kind === 'path') doc.getMap('days').set('../escape', new Y.Map());
      if (kind === 'unknown-root') doc.getText('hidden').insert(0, 'retained');
      if (kind === 'rich-text') doc.getText('master').format(0, 1, { bold: true });
      await seed([0], [], [[...Y.encodeStateAsUpdate(doc)]]);
      doc.destroy();
      await expect(captureLegacyExport(task, preview)).rejects.toBeInstanceOf(Error);
    },
  );
  it('does not silently reinterpret map fields stored under the text root', async () => {
    const doc = new Y.Doc();
    doc.getMap('meta').set('schemaVersion', 4);
    doc.getMap('master').set('body', 'hidden');
    await seed([0], [], [[...Y.encodeStateAsUpdate(doc)]]);
    doc.destroy();
    await expect(captureLegacyExport(task, preview)).rejects.toMatchObject({
      reason: 'unsupported-legacy-text',
    });
  });
  it('does not silently reinterpret sequence items stored under a map root', async () => {
    const doc = new Y.Doc();
    doc.getMap('meta').set('schemaVersion', 4);
    doc.getArray('days').insert(0, ['hidden']);
    await seed([0], [], [[...Y.encodeStateAsUpdate(doc)]]);
    doc.destroy();
    await expect(captureLegacyExport(task, preview)).rejects.toMatchObject({
      reason: 'unsupported-legacy-root-type',
    });
  });
  it('does not silently lose array elements interpreted as text inserts', async () => {
    const doc = new Y.Doc();
    doc.getMap('meta').set('schemaVersion', 4);
    doc.getArray('master').insert(0, ['first', 'second']);
    await seed([0], [], [[...Y.encodeStateAsUpdate(doc)]]);
    doc.destroy();
    await expect(captureLegacyExport(task, preview)).rejects.toMatchObject({
      reason: 'unsupported-legacy-text',
    });
  });
  it('refuses truncated or modified files relative to the separately held digest', async () => {
    await prepare();
    const result = await captureLegacyExport(task, preview);
    await expect(
      replayLegacyExport(result.recovery.slice(0, -1), result.recoveryDigest),
    ).rejects.toMatchObject({ reason: 'recovery-digest-mismatch' });
    const changed = result.recovery.slice();
    changed[changed.length - 1] = 0;
    await expect(replayLegacyExport(changed, result.recoveryDigest)).rejects.toMatchObject({
      reason: 'recovery-digest-mismatch',
    });
  });
  it.each(['counter', 'custodyRoot'])(
    'does not accept a writable %s field in the diagnostic packet',
    async (field) => {
      await prepare();
      const result = await captureLegacyExport(task, preview);
      const value = JSON.parse(new TextDecoder().decode(result.recovery));
      value[field] = 'must-not-install';
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      await expect(replayLegacyExport(bytes, hash(bytes))).rejects.toMatchObject({
        reason: 'unsupported-recovery-packet',
      });
    },
  );
  it('copies packet bytes before asynchronous integrity verification', async () => {
    await prepare();
    const result = await captureLegacyExport(task, preview);
    const work = replayLegacyExport(result.recovery, result.recoveryDigest);
    result.recovery.fill(0);
    checkEntries((await work).entries, example());
  });
  it('preserves generated multiline and Unicode authored bodies against the independent ledger', async () => {
    const text = fc
      .array(fc.constantFrom('a', ' ', '\n', '\t', '#', '-', 'é', '🔒'), { maxLength: 35 })
      .map((v) => v.join(''));
    await fc.assert(
      fc.asyncProperty(text, text, text, async (master, body, orphan) => {
        const input = example();
        input.master = master;
        input.orphan = orphan;
        input.days.forEach((d: { next: string[]; done: string[] }) => {
          d.next = [body, '', body];
          d.done = [body];
        });
        await prepare(input);
        const result = await captureLegacyExport(task, preview);
        checkEntries(
          (await replayLegacyExport(result.recovery, result.recoveryDigest)).entries,
          input,
        );
      }),
      { seed: 8941, numRuns: 100 },
    );
  });
});
