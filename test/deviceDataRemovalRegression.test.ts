// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { beginLocalGenesis, listLocalWorkspaces } from '../src/crdt/localGenesis';
import { withExclusiveSlot } from '../src/crdt/writeSession';
import {
  removeDeviceData,
  readDeviceRemoval,
  acknowledgeLocalRemoval,
  LegacyRemovalRequired,
} from '../src/crdt/deviceDataRemoval';
import { createSetupProgress, setupProgress, type Retained } from '../src/account/setupProgress';
import { hasSavedAccountEntry } from '../src/account/packagedConfig';
import { slotCustodyRows, readLocalClaim } from '../src/crdt/localGenesisRecord';
import { beginLegacyImport } from '../src/crdt/legacyImport';
import { selectLegacyImport } from '../src/crdt/legacySelection';
import { captureLegacyExport } from '../src/crdt/legacyExport';
import { cleanupLegacySource } from '../src/crdt/legacyCleanup';
import { seed } from './legacy-source/fixture';
import { makeExportSource } from './legacy-export/source';
// @ts-expect-error Shared browser-harness source oracle.
import { example } from '../scripts/legacy-export/oracle.mjs';

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('location', { origin: 'https://seeded.example' });
  // These cases need actual serialization of metadata owners, not an always-granted lock stub.
  const tails = new Map<string, Promise<unknown>>();
  vi.stubGlobal('navigator', {
    locks: {
      request: (
        name: string,
        _options: unknown,
        work: (lock: { name: string }) => Promise<unknown>,
      ) => {
        const result = (tails.get(name) ?? Promise.resolve()).then(() => work({ name }));
        tails.set(
          name,
          result.catch(() => {}),
        );
        return result;
      },
    },
  });
  const values: Record<string, string> = {};
  vi.stubGlobal(
    'localStorage',
    new Proxy(values, {
      get(target, p) {
        if (p === 'length') return Object.keys(target).length;
        if (p === 'key') return (index: number) => Object.keys(target)[index] ?? null;
        if (p === 'clear')
          return () => {
            for (const key of Object.keys(target)) delete target[key];
          };
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
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const saved = (slotId = 'local'): Retained => ({
  v: 1,
  pin: {
    v: 1,
    origin: location.origin,
    rpId: 'seeded.example',
    serviceId: '01'.repeat(16),
    authRoot: '02'.repeat(32),
  },
  slotId,
  retryKey: 'A'.repeat(43),
  requestedName: 'Private name',
  view: null,
  proof: null,
});
async function local(slot = 'local') {
  const creation = beginLocalGenesis(slot),
    code = creation.displayCode!;
  await creation.confirm(code);
  return code;
}
const marker = (slot = 'local') => withExclusiveSlot(slot, (task) => readDeviceRemoval(task, slot));

it('rejects a delayed setup write after removal and preserves another slot', async () => {
  await local();
  const other = 'account-' + '11'.repeat(16),
    otherCode = await local(other);
  const progress = createSetupProgress();
  await progress(saved());
  await setupProgress(saved(other), other);
  await removeDeviceData('local');
  await expect(progress({ ...saved(), name: 'Late reply' })).rejects.toThrow('removed');
  await expect(setupProgress(saved())).rejects.toThrow('removed');
  expect(await setupProgress()).toBeNull();
  expect(await marker()).toMatchObject({ phase: 'removed' });
  expect(await setupProgress(undefined, other)).toEqual(saved(other));
  expect(await listLocalWorkspaces(other, otherCode)).toHaveLength(1);
});

it('keeps old setup owners retired after explicit Start fresh and permits a new owner', async () => {
  await local();
  const stale = createSetupProgress();
  await stale(saved());
  await removeDeviceData('local');
  await acknowledgeLocalRemoval('local');
  const newCode = await local();
  await expect(stale({ ...saved(), name: 'Late old ceremony' })).rejects.toThrow('retired');
  expect(await setupProgress()).toBeNull();
  expect(await hasSavedAccountEntry()).toBe(false); // non-secret epoch is not an account locator
  const fresh = createSetupProgress();
  await fresh({ ...saved(), retryKey: 'B'.repeat(43) });
  expect((await setupProgress())!.retryKey).toBe('B'.repeat(43));
  expect(await listLocalWorkspaces('local', newCode)).toHaveLength(1);
});

it('serializes a metadata write racing removal so it cannot survive successful erasure', async () => {
  await local();
  const progress = createSetupProgress();
  await progress(saved());
  const writes = Array.from({ length: 12 }, (_, n) => progress({ ...saved(), name: String(n) }));
  const removal = removeDeviceData('local');
  await Promise.allSettled(writes);
  await removal;
  expect(await setupProgress()).toBeNull();
  await expect(progress(saved())).rejects.toThrow('removed');
});

async function imported(select = true) {
  const old = makeExportSource({ ...example(), days: [] });
  try {
    await seed([0], [1, 2], old.updates);
  } finally {
    old.doc.destroy();
  }
  const source = await withExclusiveSlot('capture', (task) =>
    captureLegacyExport(task, { preview: 'markdown-v1' }),
  );
  const input = {
    recovery: source.recovery,
    recoveryDigest: source.recoveryDigest,
    sourceOrigin: location.origin,
    sourceDigest: source.sourceDigest,
    policy: 'markdown-system-v1' as const,
  };
  const enrollment = beginLegacyImport('local', input),
    code = enrollment.displayCode!;
  await enrollment.confirm(code);
  if (select) await selectLegacyImport('local', code, input);
  return { input, code };
}
it('refuses a selected legacy import before any destructive effect or provenance loss', async () => {
  const { input, code } = await imported();
  const before = await withExclusiveSlot('local', (task) => slotCustodyRows(task, 'local'));
  await expect(removeDeviceData('local')).rejects.toBeInstanceOf(LegacyRemovalRequired);
  expect(await marker()).toBeNull();
  expect(await withExclusiveSlot('local', (task) => slotCustodyRows(task, 'local'))).toEqual(
    before,
  );
  expect(await listLocalWorkspaces('local', code)).toHaveLength(1);
  expect(
    (
      await withExclusiveSlot('observe', (task) =>
        captureLegacyExport(task, { preview: 'markdown-v1' }),
      )
    ).sourceDigest,
  ).toBe(input.sourceDigest);
});
it('preserves a pre-selection import and its plaintext source for the cleanup owner', async () => {
  const { input } = await imported(false);
  const before = await withExclusiveSlot('local', (task) => slotCustodyRows(task, 'local'));
  await expect(removeDeviceData('local')).rejects.toBeInstanceOf(LegacyRemovalRequired);
  expect(await withExclusiveSlot('local', (task) => slotCustodyRows(task, 'local'))).toEqual(
    before,
  );
  expect(
    (
      await withExclusiveSlot('observe', (task) =>
        captureLegacyExport(task, { preview: 'markdown-v1' }),
      )
    ).sourceDigest,
  ).toBe(input.sourceDigest);
});
it('permits an imported Local removal after verified source cleanup completes', async () => {
  const { input, code } = await imported();
  // This existing seeded host establishes predecessor exclusion; the app must not invent it.
  await cleanupLegacySource('local', code, input);
  expect(
    (await withExclusiveSlot('local', (task) => readLocalClaim(task, 'local')))!.sourceCleanup,
  ).toBeDefined();
  await removeDeviceData('local');
  expect(await marker()).toMatchObject({ phase: 'removed' });
});
