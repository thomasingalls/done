// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import {
  createAutomaticLocalRetention,
  LOCAL_RETENTION_MIN_RECORDS as MIN,
  LOCAL_RETENTION_QUIET_MS as QUIET,
  LOCAL_RETENTION_COOLDOWN_MS as COOLDOWN,
  LOCAL_RETENTION_RETRY_MS as RETRY,
} from '../src/crdt/automaticLocalRetention';
import { hasAutomaticLocalRetention } from '../src/crdt/localBaselineMode';
import { PreparationCapacity } from '../src/crdt/preparationCapacity';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
function fixture() {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const controller = new AbortController();
  let state = { ready: true, hint: { revision: 0, records: MIN } };
  const calls: {
    revision: number;
    resolve: (result: { kind: string; reason?: string }) => void;
    reject: (error: Error) => void;
  }[] = [];
  const run = createAutomaticLocalRetention({
    signal: controller.signal,
    observe: () => state,
    remove: (revision) =>
      new Promise((resolve, reject) => {
        calls.push({ revision, resolve, reject });
      }),
  });
  return {
    run,
    calls,
    controller,
    set: (s: typeof state) => {
      state = s;
    },
    tick: (ms: number) => vi.advanceTimersByTimeAsync(ms),
  };
}
it('requires the separate policy opt-in and all existing reader/writer gates', () => {
  const keys = [
    'VITE_ACCOUNT_BASELINE_READ',
    'VITE_ACCOUNT_BASELINE_INSTALL',
    'VITE_ACCOUNT_RETENTION',
    'VITE_ACCOUNT_RETENTION_AUTO',
  ];
  for (let mask = 0; mask < 16; mask++) {
    keys.forEach((key, bit) => vi.stubEnv(key, mask & (1 << bit) ? '1' : '0'));
    expect(hasAutomaticLocalRetention()).toBe(mask === 15);
  }
});
it('schedules nothing below the threshold or while admission/visibility is blocked', async () => {
  const f = fixture();
  for (const state of [
    { ready: true, hint: { revision: 0, records: MIN - 1 } },
    { ready: false, hint: { revision: 0, records: MIN } },
    { ready: true, hint: { revision: -1, records: MIN } },
    { ready: true, hint: { revision: 0, records: Infinity } },
  ]) {
    f.set(state);
    f.run.wake();
    await f.tick(COOLDOWN);
    expect(f.calls).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  }
  f.run.dispose();
});
it('waits for quiet, resets on input and passes only the latest revision to the owner', async () => {
  const f = fixture();
  f.run.wake();
  await f.tick(QUIET - 1);
  expect(f.calls).toHaveLength(0);
  f.set({ ready: true, hint: { revision: 7, records: MIN + 10 } });
  f.run.wake();
  await f.tick(QUIET - 1);
  expect(f.calls).toHaveLength(0);
  await f.tick(1);
  expect(f.calls.map((c) => c.revision)).toEqual([7]);
  f.run.dispose();
  f.calls[0]!.resolve({ kind: 'removed' });
  await f.tick(0);
});
it('rechecks readiness and growth when the timer fires, without polling', async () => {
  const f = fixture();
  f.run.wake();
  f.set({ ready: false, hint: { revision: 0, records: MIN } });
  await f.tick(QUIET);
  expect(f.calls).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
  f.set({ ready: true, hint: { revision: 0, records: MIN } });
  f.run.wake();
  await f.tick(QUIET);
  expect(f.calls).toHaveLength(1);
  f.run.dispose();
  f.calls[0]!.resolve({ kind: 'removed' });
  await f.tick(0);
});
it('keeps one flight through repeated wakes and applies the success cooldown to new growth', async () => {
  const f = fixture();
  f.run.wake();
  await f.tick(QUIET);
  for (let i = 0; i < 20; i++) f.run.wake();
  await f.tick(COOLDOWN);
  expect(f.calls).toHaveLength(1);
  f.set({ ready: true, hint: { revision: 1, records: MIN + 1 } });
  f.calls[0]!.resolve({ kind: 'removed' });
  await f.tick(0);
  await f.tick(COOLDOWN - 1);
  expect(f.calls).toHaveLength(1);
  await f.tick(1);
  expect(f.calls.map((c) => c.revision)).toEqual([0, 1]);
  f.run.dispose();
  f.calls[1]!.resolve({ kind: 'removed' });
  await f.tick(0);
});
it('does not scan after success when the new suffix is small', async () => {
  const f = fixture();
  f.run.wake();
  await f.tick(QUIET);
  f.set({ ready: true, hint: { revision: 1, records: 0 } });
  f.calls[0]!.resolve({ kind: 'removed' });
  await f.tick(COOLDOWN * 3);
  expect(f.calls).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
  f.run.dispose();
});
for (const reason of ['capacity', 'history-required', 'ineligible'])
  it(`parks an unchanged ${reason} refusal until a different ledger hint`, async () => {
    const f = fixture();
    f.run.wake();
    await f.tick(QUIET);
    f.calls[0]!.resolve({ kind: 'skipped', reason });
    await f.tick(0);
    for (let i = 0; i < 3; i++) {
      f.run.wake();
      await f.tick(RETRY * 2);
    }
    expect(f.calls).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    f.set({ ready: true, hint: { revision: 0, records: MIN + 1 } });
    f.run.wake();
    await f.tick(QUIET);
    expect(f.calls).toHaveLength(2);
    f.run.dispose();
    f.calls[1]!.resolve({ kind: 'removed' });
    await f.tick(0);
  });
it('names the cause beside capacity without changing how long it parks (phase 543)', async () => {
  const f = fixture();
  f.run.wake();
  await f.tick(QUIET);
  const detail = { cause: 'snapshot-size', needed: 9 * 1024 * 1024, allowed: 8 * 1024 * 1024 };
  f.calls[0]!.resolve({ kind: 'skipped', reason: 'capacity', detail } as { kind: string });
  await f.tick(0);
  expect(f.run.status).toEqual({ phase: 'idle', reason: 'capacity', detail });
  expect(Object.isFrozen(f.run.status.detail)).toBe(true);
  // The same park as the plain refusal above: no retry for this hint, no timer left.
  for (let i = 0; i < 3; i++) {
    f.run.wake();
    await f.tick(RETRY * 2);
  }
  expect(f.calls).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
  // A malformed or unknown detail is dropped, not shown and not fatal.
  f.set({ ready: true, hint: { revision: 0, records: MIN + 1 } });
  f.run.wake();
  await f.tick(QUIET);
  f.calls[1]!.resolve({
    kind: 'skipped',
    reason: 'capacity',
    detail: { cause: 'unknown-cause', needed: 1 },
  } as { kind: string });
  await f.tick(0);
  expect(f.run.status).toEqual({ phase: 'idle', reason: 'capacity' });
  // Any other outcome clears it.
  f.set({ ready: true, hint: { revision: 0, records: MIN + 2 } });
  f.run.wake();
  // A changed hint still waits out the existing retry clock after a capacity refusal.
  await f.tick(QUIET);
  expect(f.calls).toHaveLength(2);
  await f.tick(RETRY);
  f.calls[2]!.resolve({ kind: 'skipped', reason: 'ineligible', detail } as { kind: string });
  await f.tick(0);
  expect(f.run.status).toEqual({ phase: 'idle', reason: 'ineligible' });
  f.run.dispose();
});
it('names a preparation refusal by its site and keeps the plain one general (phase 543)', async () => {
  const f = fixture();
  f.run.wake();
  await f.tick(QUIET);
  f.calls[0]!.reject(
    new PreparationCapacity({ cause: 'resume-index', needed: 300000, allowed: 262128 }),
  );
  await f.tick(0);
  expect(f.run.status).toEqual({
    phase: 'idle',
    reason: 'capacity',
    detail: { cause: 'resume-index', needed: 300000, allowed: 262128 },
  });
  expect(f.run.diagnostics?.ownerError).toBeUndefined();
  f.set({ ready: true, hint: { revision: 0, records: MIN + 1 } });
  f.run.wake();
  await f.tick(RETRY);
  f.calls[1]!.reject(new PreparationCapacity());
  await f.tick(0);
  expect(f.run.status).toEqual({ phase: 'idle', reason: 'capacity' });
  f.run.dispose();
});
it('paces a transient refusal only after another event, even if the hint is unchanged', async () => {
  const f = fixture();
  f.run.wake();
  await f.tick(QUIET);
  // Phase 546: a saved account attempt now parks (next case); a pending promotion is transient.
  f.calls[0]!.resolve({ kind: 'skipped', reason: 'pending-promotion' });
  await f.tick(0);
  expect(vi.getTimerCount()).toBe(0);
  f.run.wake();
  await f.tick(RETRY - 1);
  expect(f.calls).toHaveLength(1);
  await f.tick(1);
  expect(f.calls).toHaveLength(2);
  f.run.dispose();
  f.calls[1]!.resolve({ kind: 'removed' });
  await f.tick(0);
});
it('a saved account attempt parks until history changes or a manual check (phase 546)', async () => {
  const f = fixture();
  f.run.wake();
  await f.tick(QUIET);
  f.calls[0]!.resolve({ kind: 'skipped', reason: 'durable-attempt' });
  await f.tick(0);
  expect(f.run.status).toEqual({ phase: 'idle', reason: 'durable-attempt' });
  f.run.wake(); // input, sync and readiness events on the same history do not recheck
  f.run.refresh();
  await f.tick(4 * RETRY);
  expect(f.calls).toHaveLength(1);
  f.set({ ready: true, hint: { revision: 0, records: MIN + 1 } });
  f.run.refresh();
  await f.tick(RETRY);
  expect(f.calls).toHaveLength(2);
  f.calls[1]!.resolve({ kind: 'skipped', reason: 'durable-attempt' });
  await f.tick(0);
  expect(f.run.retry()).toBe(true); // still behind the retry delay, as the panel says
  await f.tick(RETRY);
  expect(f.calls).toHaveLength(3);
  f.run.dispose();
  f.calls[2]!.resolve({ kind: 'removed' });
  await f.tick(0);
});
it('remembers activity arriving during preparation without spinning on interruption', async () => {
  const f = fixture();
  f.run.wake();
  await f.tick(QUIET);
  f.run.wake();
  f.calls[0]!.resolve({ kind: 'skipped', reason: 'activity-or-journal' });
  await f.tick(0);
  await f.tick(RETRY - 1);
  expect(f.calls).toHaveLength(1);
  await f.tick(1);
  expect(f.calls).toHaveLength(2);
  f.calls[1]!.resolve({ kind: 'skipped', reason: 'activity-or-journal' });
  await f.tick(RETRY * 3);
  expect(f.calls).toHaveLength(2);
  expect(vi.getTimerCount()).toBe(0);
  f.run.dispose();
});
it('halts unexpected owner failure rather than retrying an uncertain mutation', async () => {
  const f = fixture();
  f.run.wake();
  await f.tick(QUIET);
  f.calls[0]!.reject(Error('authority or storage failed'));
  await f.tick(0);
  f.run.wake();
  await f.tick(COOLDOWN * 3);
  expect(f.run.status).toEqual({ phase: 'halted', reason: 'owner-error' });
  expect(f.calls).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
  f.run.dispose();
});
it('aborts queued work and ignores both late settlement and later wakes', async () => {
  const f = fixture();
  f.run.wake();
  f.controller.abort();
  await f.tick(QUIET);
  expect(f.calls).toHaveLength(0);
  expect(f.run.status.phase).toBe('closed');
  const g = fixture();
  g.run.wake();
  await g.tick(QUIET);
  g.controller.abort();
  g.calls[0]!.resolve({ kind: 'removed' });
  g.run.wake();
  await g.tick(COOLDOWN * 3);
  expect(g.calls).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
});
it('takes a fresh revision at execution even without another event', async () => {
  const f = fixture();
  f.run.wake();
  f.set({ ready: true, hint: { revision: 9, records: MIN + 1 } });
  await f.tick(QUIET);
  expect(f.calls.map((c) => c.revision)).toEqual([9]);
  f.run.dispose();
  f.calls[0]!.resolve({ kind: 'removed' });
  await f.tick(0);
});
it('halts an unexpected result without retrying after more writing', async () => {
  const f = fixture();
  f.run.wake();
  await f.tick(QUIET);
  f.calls[0]!.resolve({ kind: 'unrecognized' });
  await f.tick(0);
  f.set({ ready: true, hint: { revision: 1, records: MIN + 10 } });
  f.run.wake();
  await f.tick(COOLDOWN);
  expect(f.run.status).toEqual({ phase: 'halted', reason: 'unexpected-result' });
  expect(f.calls).toHaveLength(1);
  f.run.dispose();
});
it('does not inspect an owner whose signal was already aborted', () => {
  const controller = new AbortController();
  controller.abort();
  const observe = vi.fn(),
    remove = vi.fn();
  const run = createAutomaticLocalRetention({ signal: controller.signal, observe, remove });
  run.wake();
  expect(run.status.phase).toBe('closed');
  expect(observe).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});

it('readiness refreshes do not mistake routine sync activity for new user input or starve the quiet window', async () => {
  const f = fixture();
  f.run.wake();
  for (let index = 0; index < 3; index++) {
    await f.tick(3000);
    f.set({ ready: false, hint: { revision: 0, records: MIN } });
    f.run.refresh();
    f.set({ ready: true, hint: { revision: 0, records: MIN } });
    f.run.refresh();
  }
  expect(f.calls).toHaveLength(0);
  await f.tick(1000);
  expect(f.calls).toHaveLength(1);
  f.run.dispose();
  f.calls[0]!.resolve({ kind: 'removed' });
  await f.tick(0);
});
