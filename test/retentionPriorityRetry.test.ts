// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import {
  MaintenanceInterrupted,
  addMaintenanceInterruptionConditions,
  isPriorityOnlyMaintenanceInterruption,
  type MaintenanceInterruptionConditions,
} from '../src/crdt/contentMaintenance';
import {
  createAutomaticLocalRetention,
  localRetentionInterrupted,
  LOCAL_RETENTION_MIN_RECORDS as MIN,
  LOCAL_RETENTION_QUIET_MS as QUIET,
  LOCAL_RETENTION_RETRY_MS as RETRY,
} from '../src/crdt/automaticLocalRetention';
import { withPreparationJournalObservation } from '../src/crdt/preparationJournalObservation';
import type { SessionTask } from '../src/crdt/writeSession';
import type { ObservedEntry } from '../src/crdt/journalStore';

afterEach(() => vi.useRealTimers());
function fixture(outcome: { kind: string; reason?: string }) {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  let ready = true;
  const remove = vi.fn(async () => outcome);
  const run = createAutomaticLocalRetention({
    signal: new AbortController().signal,
    observe: () => ({ ready, hint: { revision: 0, records: MIN } }),
    remove,
  });
  return {
    run,
    remove,
    setReady: (v: boolean) => {
      ready = v;
    },
    tick: vi.advanceTimersByTimeAsync,
  };
}
it('priority-only waits 10 seconds, requires a new event and cannot spin', async () => {
  const f = fixture(
    localRetentionInterrupted(new MaintenanceInterrupted([{ queuePriority: true }])),
  );
  try {
    f.run.wake();
    await f.tick(QUIET);
    expect(f.remove).toHaveBeenCalledTimes(1);
    expect(f.run.status).toEqual({ phase: 'idle', reason: 'activity-or-journal' });
    expect(vi.getTimerCount()).toBe(0);
    f.run.refresh();
    await f.tick(QUIET - 1);
    expect(f.remove).toHaveBeenCalledTimes(1);
    await f.tick(1);
    expect(f.remove).toHaveBeenCalledTimes(2);
    await f.tick(RETRY * 3);
    expect(f.remove).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    f.run.dispose();
  }
});
it('every non-priority condition and every mix retains the 60-second clock', async () => {
  const names = [
    'suspended',
    'shadowActivity',
    'journal',
    'handoff',
    'authorityStamp',
    'other',
  ] as const;
  for (let mask = 1; mask < 64; mask++)
    for (const priority of [false, true]) {
      const conditions: Record<string, boolean> = { queuePriority: priority };
      names.forEach((n, i) => {
        conditions[n] = !!(mask & (1 << i));
      });
      const error = new MaintenanceInterrupted([conditions]);
      expect(isPriorityOnlyMaintenanceInterruption(error)).toBe(false);
      const f = fixture(localRetentionInterrupted(error));
      try {
        f.run.wake();
        await f.tick(QUIET);
        f.run.refresh();
        await f.tick(RETRY - 1);
        expect(f.remove).toHaveBeenCalledTimes(1);
        await f.tick(1);
        expect(f.remove).toHaveBeenCalledTimes(2);
      } finally {
        f.run.dispose();
      }
    }
});
it('all observed interruptions must be priority-only, including conditions added while unwinding', () => {
  expect(
    isPriorityOnlyMaintenanceInterruption(
      new MaintenanceInterrupted([{ queuePriority: true }, { queuePriority: true }]),
    ),
  ).toBe(true);
  for (const conditions of [
    {},
    { journal: true },
    { handoff: true },
    { authorityStamp: true },
    { suspended: true },
    { shadowActivity: true },
  ]) {
    const e = new MaintenanceInterrupted([{ queuePriority: true }, conditions]);
    expect(isPriorityOnlyMaintenanceInterruption(e)).toBe(false);
  }
  const error = new MaintenanceInterrupted([{ queuePriority: true }]);
  addMaintenanceInterruptionConditions(error, { handoff: false, authorityStamp: false });
  expect(isPriorityOnlyMaintenanceInterruption(error)).toBe(true);
  addMaintenanceInterruptionConditions(error, { authorityStamp: true });
  expect(isPriorityOnlyMaintenanceInterruption(error)).toBe(false);
});
it('unknown, forged or serialized reasons cannot shorten the retry', async () => {
  const unknown = new MaintenanceInterrupted();
  expect(isPriorityOnlyMaintenanceInterruption(unknown)).toBe(false);
  expect(
    isPriorityOnlyMaintenanceInterruption(Object.create(MaintenanceInterrupted.prototype)),
  ).toBe(false);
  const original = localRetentionInterrupted(new MaintenanceInterrupted([{ queuePriority: true }]));
  for (const outcome of [
    localRetentionInterrupted(unknown),
    JSON.parse(JSON.stringify(original)),
    { ...original, priorityOnly: true },
  ]) {
    const f = fixture(outcome);
    try {
      f.run.wake();
      await f.tick(QUIET);
      f.run.refresh();
      await f.tick(RETRY - 1);
      expect(f.remove).toHaveBeenCalledTimes(1);
      await f.tick(1);
      expect(f.remove).toHaveBeenCalledTimes(2);
    } finally {
      f.run.dispose();
    }
  }
});
it('input quiet and receive readiness still win over the shorter priority retry', async () => {
  const f = fixture(
    localRetentionInterrupted(new MaintenanceInterrupted([{ queuePriority: true }])),
  );
  try {
    f.run.wake();
    await f.tick(QUIET);
    f.run.refresh();
    await f.tick(QUIET - 1);
    f.run.wake();
    await f.tick(QUIET - 1);
    expect(f.remove).toHaveBeenCalledTimes(1);
    f.setReady(false);
    f.run.refresh();
    await f.tick(RETRY);
    expect(f.remove).toHaveBeenCalledTimes(1);
    f.setReady(true);
    f.run.refresh();
    await f.tick(1);
    expect(f.remove).toHaveBeenCalledTimes(2);
  } finally {
    f.run.dispose();
  }
});
it('pending journal evidence is retained when task priority throws before the journal body', async () => {
  const priority = new MaintenanceInterrupted([{ queuePriority: true }]);
  let armed = false;
  const task: SessionTask = {
    signal: new AbortController().signal,
    step: (effect) => {
      if (armed) throw priority;
      return effect();
    },
    wait: async (start) => start(),
  };
  const journal = {
    readSnapshot: async () => {
      armed = true;
      return [
        {
          key: 'journal-entry',
          generation: 1,
          value: 'sealed-journal-entry',
          bytes: new Uint8Array([1]),
        } satisfies ObservedEntry,
      ];
    },
  };
  await expect(withPreparationJournalObservation(task, journal, async () => {})).rejects.toBe(
    priority,
  );
  expect(isPriorityOnlyMaintenanceInterruption(priority)).toBe(false);
});
it('condition labels are closed and diagnostics never invoke a supplied getter', () => {
  const getter = vi.fn(() => true);
  const conditions = { queuePriority: true } as MaintenanceInterruptionConditions;
  Object.defineProperty(conditions, 'journal', { enumerable: true, get: getter });
  expect(isPriorityOnlyMaintenanceInterruption(new MaintenanceInterrupted([conditions]))).toBe(
    false,
  );
  expect(getter).not.toHaveBeenCalled();
  expect(
    isPriorityOnlyMaintenanceInterruption(
      new MaintenanceInterrupted([
        { queuePriority: true, unexpected: true } as MaintenanceInterruptionConditions,
      ]),
    ),
  ).toBe(false);
});
