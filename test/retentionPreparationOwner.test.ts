// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { preparationOwnerFixture } from './local-baseline/preparation-owner-fixture';
import { task } from './local-baseline/one-shot-fixture';
import { preparationVerifierIdentity } from '../src/crdt/localBaselineMode';
import { preparationStoreName } from '../src/crdt/retentionPreparationDatabase';
import { CONTENT_STORES } from '../src/crdt/contentRecord';
const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach((f) => f());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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
