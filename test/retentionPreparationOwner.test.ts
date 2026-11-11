// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { preparationOwnerFixture } from './local-baseline/preparation-owner-fixture';
import { task } from './local-baseline/one-shot-fixture';
import { preparationVerifierIdentity } from '../src/crdt/localBaselineMode';
import { preparationStoreName } from '../src/crdt/retentionPreparationDatabase';
import { CONTENT_STORES } from '../src/crdt/contentRecord';
import { PREPARATION_MAX_BYTES } from '../src/crdt/retentionPreparationStorage';
import {
  MaintenanceInterrupted,
  type MaintenanceInterruptionConditions,
} from '../src/crdt/contentMaintenance';
// Pass-through wrappers. A case may make the physical prefix capture refuse at its real
// ceiling (a history too large to bind any journal), or replace the room the owner passes.
const forced = vi.hoisted(() => ({
  prefix: false,
  room: undefined as number | undefined,
  rooms: [] as (number | undefined)[],
}));
vi.mock('../src/crdt/retentionPreparationBinding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/crdt/retentionPreparationBinding')>();
  const { PreparationCapacity } = await import('../src/crdt/preparationCapacity');
  return {
    ...actual,
    async capturePreparationPrefix(...args: Parameters<typeof actual.capturePreparationPrefix>) {
      if (forced.prefix) throw new PreparationCapacity();
      return actual.capturePreparationPrefix(...args);
    },
  };
});
vi.mock('../src/crdt/retentionPreparation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/crdt/retentionPreparation')>();
  return {
    ...actual,
    createPreparationJournal(options: Parameters<typeof actual.createPreparationJournal>[0]) {
      forced.rooms.push(options.room);
      return actual.createPreparationJournal(
        forced.room === undefined ? options : { ...options, room: forced.room },
      );
    },
  };
});
const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach((f) => f());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  forced.prefix = false;
  forced.room = undefined;
  forced.rooms.length = 0;
});
async function fixture() {
  const f = await preparationOwnerFixture(cleanup);
  vi.stubEnv('VITE_ACCOUNT_RETENTION_RESUME', '1');
  vi.stubEnv('PROD', true);
  expect(preparationVerifierIdentity()).toMatch(/^[a-f0-9]{64}$/);
  const owner = f.makeOwner();
  await owner.initialize(task);
  const census = () =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const t = f.db.transaction([...CONTENT_STORES]),
        result: Record<string, unknown> = {};
      for (const name of CONTENT_STORES) {
        const s = t.objectStore(name),
          keys = s.getAllKeys(),
          values = s.getAll();
        values.onsuccess = () => (result[name] = [keys.result, values.result]);
      }
      t.oncomplete = () => resolve(result);
      t.onabort = () => reject(t.error);
    });
  return { ...f, owner, census };
}
function budget() {
  let n = 0;
  return vi.spyOn(performance, 'now').mockImplementation(() => ++n * 2100);
}
it('a paused read task returns only a sealed handoff; fresh task persists without changing logical rows and cold owner completes', async () => {
  const f = await fixture(),
    before = await f.census(),
    clock = budget();
  const first = await f.owner.prepareHistoryRemoval(
    task,
    async () => {},
    () => {},
    0,
    () => {},
  );
  clock.mockRestore();
  expect(first.kind).toBe('preparation-checkpoint');
  if (first.kind !== 'preparation-checkpoint') throw Error(first.kind);
  const newTask = { ...task, signal: new AbortController().signal };
  expect(
    await first.persist(
      newTask,
      async () => {},
      () => {},
    ),
  ).toMatchObject({ kind: 'preparation-saved', newEntries: 1 });
  const saved = await f.census();
  for (const key of ['content', 'heads', 'outbound']) expect(saved[key]).toEqual(before[key]);
  f.owner.dispose();
  const cold = f.makeOwner();
  await cold.initialize(newTask);
  const secondClock = budget();
  const opened = vi.spyOn(f.crypt, 'open');
  const resumed = await cold.prepareHistoryRemoval(
    newTask,
    async () => {},
    () => {},
    0,
    () => {},
  );
  secondClock.mockRestore();
  if (resumed.kind !== 'preparation-checkpoint') throw Error(resumed.kind);
  // First captured row was already authenticated and opened before the first durable checkpoint.
  // Auxiliary head/chunk decryption is still fresh, as is opening the next original row.
  expect(opened.mock.calls.some(([, row]) => row.seq === 1)).toBe(false);
  expect(opened.mock.calls.length).toBeGreaterThan(0);
  resumed.dispose();
  opened.mockRestore();
  const completed = await cold.removeHistory(
    newTask,
    async () => {},
    () => {},
    0,
  );
  expect(completed.kind).toBe('removed');
  const names = await indexedDB.databases();
  expect(names.some((d) => d.name === preparationStoreName(f.db.name))).toBe(false);
});
it('owner disposal retires a queued delta so it cannot reserve or save later', async () => {
  const f = await fixture(),
    clock = budget();
  const p = await f.owner.prepareHistoryRemoval(
    task,
    async () => {},
    () => {},
    0,
    () => {},
  );
  clock.mockRestore();
  if (p.kind !== 'preparation-checkpoint') throw Error(p.kind);
  const before = await f.census();
  f.owner.dispose();
  await expect(
    p.persist(
      task,
      async () => {},
      () => {},
    ),
  ).rejects.toThrow();
  expect(await f.census()).toEqual(before);
});
it('authority or journal change before the fresh serialized save refuses without consuming an allocation', async () => {
  const f = await fixture(),
    clock = budget();
  const p = await f.owner.prepareHistoryRemoval(
    task,
    async () => {},
    () => {},
    0,
    () => {},
  );
  clock.mockRestore();
  if (p.kind !== 'preparation-checkpoint') throw Error(p.kind);
  const before = await f.census();
  await expect(
    p.persist(
      task,
      async () => {
        throw Error('authority changed');
      },
      () => {},
    ),
  ).rejects.toThrow('authority changed');
  expect(await f.census()).toEqual(before);
});
it('durable reuse requires production, an explicit opt-in and every writer gate', async () => {
  await fixture();
  for (const [key, value] of [
    ['VITE_ACCOUNT_RETENTION_RESUME', '0'],
    ['VITE_ACCOUNT_RETENTION', '0'],
    ['VITE_ACCOUNT_BASELINE_READ', '0'],
    ['VITE_ACCOUNT_BASELINE_INSTALL', '0'],
  ] as const) {
    vi.stubEnv(key, value);
    expect(preparationVerifierIdentity()).toBeUndefined();
    vi.stubEnv(key, '1');
  }
  vi.stubEnv('PROD', false);
  expect(preparationVerifierIdentity()).toBeUndefined();
});
it('each journal gets its checkpoint room, and one with none left completes in one uncached pass', async () => {
  const f = await fixture();
  let clock = budget();
  const first = await f.owner.prepareHistoryRemoval(
    task,
    async () => {},
    () => {},
    0,
    () => {},
  );
  clock.mockRestore();
  if (first.kind !== 'preparation-checkpoint') throw Error(first.kind);
  await first.persist(
    task,
    async () => {},
    () => {},
  );
  first.dispose();
  // Every fresh miss still runs past the slice clock; with no room left nothing is kept or saved.
  forced.room = 0;
  clock = budget();
  const completed = await f.owner.removeHistory(
    task,
    async () => {},
    () => {},
    0,
  );
  clock.mockRestore();
  expect(completed.kind).toBe('removed');
  expect(forced.rooms[0]).toBe(PREPARATION_MAX_BYTES);
  expect(forced.rooms[1]).toBeGreaterThan(0);
  expect(forced.rooms[1]).toBeLessThan(PREPARATION_MAX_BYTES);
  expect(forced.rooms).toHaveLength(2);
});
it('a history too large to bind any saved journal completes in one uncached pass instead of refusing', async () => {
  const f = await fixture(),
    clock = budget();
  forced.prefix = true;
  const completed = await f.owner.removeHistory(
    task,
    async () => {},
    () => {},
    0,
  );
  clock.mockRestore();
  expect(completed.kind).toBe('removed');
  // No journal was opened, so no slice could pause and nothing auxiliary was written.
  expect(forced.rooms).toHaveLength(0);
  const names = await indexedDB.databases();
  expect(names.some((d) => d.name === preparationStoreName(f.db.name))).toBe(false);
});
it('routine work cutting an uncached pass parks it as capacity; foreground activity still yields', async () => {
  const f = await fixture();
  const attempt = async (uncached: boolean, condition: MaintenanceInterruptionConditions) => {
    let armed = false;
    forced.prefix = uncached;
    try {
      return await f.owner.prepareHistoryRemoval(
        task,
        async () => {},
        () => {
          if (armed) throw new MaintenanceInterrupted([condition]);
        },
        0,
        () => {},
        (progress) => {
          if (progress.stage === 'verifying') armed = true;
        },
      );
    } finally {
      forced.prefix = false;
    }
  };
  expect(await attempt(true, { queuePriority: true })).toEqual({
    kind: 'skipped',
    reason: 'capacity',
  });
  // Local writing or other non-routine causes keep their normal yield and retry.
  await expect(attempt(true, { journal: true })).rejects.toBeInstanceOf(MaintenanceInterrupted);
  await expect(attempt(true, { queuePriority: true, suspended: true })).rejects.toBeInstanceOf(
    MaintenanceInterrupted,
  );
  // A pass whose journal still has room resumes from saved slices, so it yields as before.
  await expect(attempt(false, { queuePriority: true })).rejects.toBeInstanceOf(
    MaintenanceInterrupted,
  );
});
