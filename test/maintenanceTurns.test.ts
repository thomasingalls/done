// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createMaintenanceTurns } from '../src/crdt/maintenanceTurns';
import { createWarmAuditScheduler } from '../src/crdt/warmAuditScheduler';
import { MaintenanceInterrupted } from '../src/crdt/contentMaintenance';

const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((yes) => (resolve = yes));
  return { promise, resolve };
};
afterEach(() => {
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('a forced audit waits to join storage until an open preparation journal observation settles', async () => {
  vi.useFakeTimers();
  const abort = new AbortController();
  const turns = createMaintenanceTurns(abort.signal);
  const opened = deferred(),
    release = deferred();
  let priority = {},
    auditEntries = 0,
    completed = false,
    due = true;
  const preparation = turns.run(async () => {
    const captured = priority;
    opened.resolve();
    await release.promise;
    // Queue arrival is still an interruption, as at the owner's journal observation.
    if (priority !== captured) throw new MaintenanceInterrupted([{ queuePriority: true }]);
    completed = true;
  });
  void preparation.catch(() => {});
  await opened.promise;
  const requested = vi.fn(() =>
    turns.run(async () => {
      priority = {};
      auditEntries++;
      due = false;
      return true;
    }),
  );
  const audit = createWarmAuditScheduler({
    signal: abort.signal,
    due: () => due,
    delay: () => 300_000,
    pendingRows: () => (due ? 1024 : 0),
    run: requested,
  });
  try {
    audit.input();
    await vi.advanceTimersByTimeAsync(0);
    // The cap still forces an attempt; only its storage-queue entry waits its turn.
    expect(requested).toHaveBeenCalledTimes(1);
    expect(auditEntries).toBe(0);
    expect(completed).toBe(false);
    release.resolve();
    await preparation;
    await turns.settled();
    expect(completed).toBe(true);
    expect(auditEntries).toBe(1);
  } finally {
    audit.close();
    abort.abort();
    release.resolve();
    await turns.settled();
  }
});

it('a queued audit runs before later preparation slices and cannot be overtaken', async () => {
  const turns = createMaintenanceTurns(new AbortController().signal);
  const started = deferred(),
    release = deferred();
  const order: string[] = [];
  const first = turns.run(async () => {
    order.push('preparation-1');
    started.resolve();
    await release.promise;
  });
  await started.promise;
  const audit = turns.run(async () => {
    order.push('audit');
  });
  const later = Array.from({ length: 4 }, (_, i) =>
    turns.run(async () => {
      order.push(`preparation-${i + 2}`);
    }),
  );
  release.resolve();
  await Promise.all([first, audit, ...later]);
  expect(order).toEqual([
    'preparation-1',
    'audit',
    'preparation-2',
    'preparation-3',
    'preparation-4',
    'preparation-5',
  ]);
});

it('foreground arrival still interrupts preparation while its queued audit remains behind it', async () => {
  const turns = createMaintenanceTurns(new AbortController().signal);
  const entered = deferred(),
    release = deferred();
  let priority = {},
    foregroundFinished = false,
    audited = false;
  const preparation = turns.run(async () => {
    const captured = priority;
    entered.resolve();
    await release.promise;
    if (priority !== captured) throw new MaintenanceInterrupted([{ queuePriority: true }]);
  });
  const refused = expect(preparation).rejects.toBeInstanceOf(MaintenanceInterrupted);
  await entered.promise;
  const audit = turns.run(async () => {
    audited = true;
  });
  // Foreground work uses the native queue directly, not the maintenance-turn lane.
  priority = {};
  await Promise.resolve().then(() => {
    foregroundFinished = true;
  });
  expect(foregroundFinished).toBe(true);
  expect(audited).toBe(false);
  release.resolve();
  await refused;
  await audit;
  expect(audited).toBe(true);
});

it('a waiting audit rechecks foreground readiness at its actual turn', async () => {
  vi.useFakeTimers();
  const abort = new AbortController();
  const turns = createMaintenanceTurns(abort.signal);
  const entered = deferred(),
    release = deferred();
  const preparation = turns.run(async () => {
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  let due = true,
    effects = 0;
  const requested = vi.fn((mayStart: () => boolean) =>
    turns.run(async () => {
      if (!mayStart()) return 'deferred' as const;
      due = false;
      effects++;
      return true;
    }),
  );
  const audit = createWarmAuditScheduler({
    signal: abort.signal,
    due: () => due,
    delay: () => 300_000,
    pendingRows: () => (due ? 256 : 0),
    run: requested,
  });
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(requested).toHaveBeenCalledTimes(1);
    const settleForeground = audit.foreground();
    release.resolve();
    await preparation;
    await turns.settled();
    expect(effects).toBe(0);
    settleForeground();
    await vi.advanceTimersByTimeAsync(0);
    await turns.settled();
    expect(effects).toBe(1);
  } finally {
    audit.close();
    abort.abort();
    release.resolve();
    await turns.settled();
  }
});

it('a preparation refusal reaches its caller unchanged and does not poison a later audit', async () => {
  const turns = createMaintenanceTurns(new AbortController().signal);
  const refused = new MaintenanceInterrupted([{ journal: true }]);
  const first = turns.run(async () => {
    throw refused;
  });
  const second = turns.run(async () => 'audited');
  await expect(first).rejects.toBe(refused);
  await expect(second).resolves.toBe('audited');
});

it('an audit integrity failure is not reclassified or swallowed', async () => {
  const turns = createMaintenanceTurns(new AbortController().signal);
  const integrity = Error('integrity control');
  await expect(
    turns.run(async () => {
      throw integrity;
    }),
  ).rejects.toBe(integrity);
});

it('close refuses queued turns and settlement waits for active native cleanup', async () => {
  const abort = new AbortController();
  const turns = createMaintenanceTurns(abort.signal);
  const entered = deferred(),
    release = deferred();
  let cleaned = false;
  const active = turns.run(async () => {
    entered.resolve();
    try {
      await release.promise;
    } finally {
      cleaned = true;
    }
  });
  await entered.promise;
  const startQueued = vi.fn(async () => {});
  const pending = turns.run(startQueued);
  const cause = Error('owner closed');
  abort.abort(cause);
  const refused = expect(pending).rejects.toBe(cause);
  let settled = false;
  const drained = turns.settled().then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  expect(cleaned).toBe(false);
  release.resolve();
  await active;
  await refused;
  await drained;
  expect(cleaned).toBe(true);
  expect(startQueued).not.toHaveBeenCalled();
});

it('an already closed owner starts no callback and owners have independent turns', async () => {
  const abort = new AbortController(),
    cause = Error('closed');
  abort.abort(cause);
  const closed = createMaintenanceTurns(abort.signal),
    start = vi.fn(async () => {});
  await expect(closed.run(start)).rejects.toBe(cause);
  expect(start).not.toHaveBeenCalled();
  const first = createMaintenanceTurns(new AbortController().signal);
  const second = createMaintenanceTurns(new AbortController().signal);
  const entered = deferred(),
    release = deferred();
  const pending = first.run(async () => {
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  await expect(second.run(async () => 'independent')).resolves.toBe('independent');
  release.resolve();
  await pending;
});
