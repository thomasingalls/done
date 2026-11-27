// @vitest-environment node
/** Phase 564: a device whose setup is long still saves and finishes, online and offline. The real
 * sync scheduler (idle polls, hints, the send lane) runs with the real reduction scheduler on a
 * simulated clock. The owner is a model of `prepareHistoryRemoval`: a setup, a slice sized by the
 * owner's budget law (`retentionPreparation.ts`, checked on the real owner in
 * `retentionSliceBudget.test.ts`), then a fenced save or the commit. A receive pass cuts a running
 * attempt, as its first storage job does through the preparation token (phase 83). */
import { afterEach, expect, it, vi } from 'vitest';
import { createSyncScheduler, type SyncStatus } from '../src/crdt/accountSyncDriver';
import {
  createAutomaticLocalRetention,
  localRetentionInterrupted,
  watchLocalRetentionHold,
  LOCAL_RETENTION_MIN_RECORDS as MIN,
  LOCAL_RETENTION_POLL_HOLD_MS as POLLS,
  LOCAL_RETENTION_HOLD_YIELD_MS as YIELD,
} from '../src/crdt/automaticLocalRetention';
import { MaintenanceInterrupted } from '../src/crdt/contentMaintenance';
import {
  PREPARATION_SLICE_MS as FLOOR,
  PREPARATION_SETUP_RATIO as RATIO,
} from '../src/crdt/retentionPreparation';

afterEach(() => {
  vi.useRealTimers();
});
const SECOND = 1000,
  MINUTE = 60 * SECOND,
  HOUR = 60 * MINUTE;
/** Idle receive polls with a healthy notification stream come every 15 to 20 s. */
const POLL_EVERY = 17 * SECOND;
interface Device {
  /** Reading every row and re-hashing saved work, before the first fresh check. */
  setup: number;
  /** One fenced save. */
  save: number;
  /** All fresh verification work the reduction needs. */
  work: number;
  /** Building, coverage and the commit, after verification completes in one attempt. */
  commit: number;
}
type Outcome = { kind: string; reason?: string };

function simulate(device: Device, gate: 'ready' | 'offline' = 'ready') {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const controller = new AbortController();
  let quiet = true,
    hinted = false;
  // Owner state: the last measured save, and whether the last slice was cut (phase 556 keeps the
  // next one to the plain target until one saves).
  let lastSave: number | undefined,
    cutSince = false,
    remaining = device.work;
  let current: { resolve(o: Outcome): void; timers: ReturnType<typeof setTimeout>[] } | undefined;
  const log = {
    attempts: 0,
    saves: 0,
    pollCuts: 0,
    hintCuts: 0,
    pollCutsBeforeSave: 0,
    firstSaveAt: undefined as number | undefined,
    attemptsAtFirstSave: undefined as number | undefined,
    removedAt: undefined as number | undefined,
    receives: [] as number[],
    sends: 0,
    windowEnds: new Set<number>(),
    budgets: [] as number[],
  };
  const retention = createAutomaticLocalRetention({
    signal: controller.signal,
    observe: () => ({
      ready: true,
      synchronized: quiet,
      hold: false,
      deferPolls: true,
      routineSync: gate === 'ready',
      hint: { revision: 0, records: MIN },
    }),
    remove: (_revision, _report, protectedUntil, measure) =>
      new Promise<Outcome>((resolve) => {
        log.attempts++;
        const a = { resolve, timers: [] as ReturnType<typeof setTimeout>[] };
        current = a;
        const later = (ms: number, f: () => void) => a.timers.push(setTimeout(f, ms));
        const finish = (o: Outcome) => {
          if (current === a) current = undefined;
          resolve(o);
        };
        later(device.setup, () => {
          measure?.('setup', device.setup);
          // The owner's budget law at the first fresh check (phase 556 change A; phase 564 reserve).
          let budget = FLOOR;
          if (!cutSince) {
            const grown = RATIO * (device.setup + (lastSave ?? 0));
            const windowed =
              protectedUntil === undefined
                ? grown
                : Math.min(grown, protectedUntil - Date.now() - (lastSave ?? device.setup));
            budget = Math.max(FLOOR, windowed);
          }
          log.budgets.push(budget);
          const fresh = Math.min(budget, remaining);
          later(fresh, () => {
            if (fresh >= remaining) {
              later(device.commit, () => {
                remaining = 0;
                log.removedAt = Date.now();
                finish({ kind: 'removed' });
              });
              return;
            }
            later(device.save, () => {
              remaining -= fresh;
              lastSave = device.save;
              cutSince = false;
              measure?.('save', device.save);
              log.saves++;
              log.firstSaveAt ??= Date.now();
              log.attemptsAtFirstSave ??= log.attempts;
              finish({ kind: 'preparation-saved' });
            });
          });
        });
      }),
  });
  const cut = () => {
    const a = current;
    if (!a) return;
    current = undefined;
    a.timers.forEach(clearTimeout);
    cutSince = true;
    if (hinted) log.hintCuts++;
    else {
      log.pollCuts++;
      if (!log.saves) log.pollCutsBeforeSave++;
    }
    a.resolve(localRetentionInterrupted(new MaintenanceInterrupted([{ queuePriority: true }])));
  };
  const scheduler = createSyncScheduler({
    signal: controller.signal,
    gate: () => gate,
    detach() {},
    receiveInterval: () => POLL_EVERY,
    hold: () => retention.hold,
    send: async () => {
      log.sends++;
      return { kind: 'idle', acceptedThrough: 0 };
    },
    receive: async () => {
      log.receives.push(Date.now());
      cut();
      hinted = false;
      return { kind: 'idle', receivedThrough: 0 };
    },
  });
  const changed = (status: SyncStatus) => {
    const next = [status.send.phase, status.receive.phase].every((phase) =>
      ['idle', 'offline', 'blocked', 'closed'].includes(phase),
    );
    if (next === quiet) return;
    quiet = next;
    retention.refresh();
  };
  scheduler.runtime.onStatus(changed);
  changed(scheduler.runtime.status);
  watchLocalRetentionHold(retention, () => scheduler.wake('hold'));
  scheduler.wake('start');
  vi.advanceTimersByTime(1);
  retention.wake();
  return {
    retention,
    scheduler,
    log,
    hint() {
      hinted = true;
      scheduler.wake('remote');
    },
    async until(done: () => boolean, limit: number) {
      const end = Date.now() + limit;
      while (!done() && Date.now() < end) {
        await vi.advanceTimersByTimeAsync(SECOND);
        const window = retention.diagnostics.windowEndsAt;
        if (window !== undefined) log.windowEnds.add(window);
      }
    },
    async close() {
      controller.abort();
      await scheduler.dispose();
    },
  };
}

it('a setup longer than sixty seconds, online with polls running, saves and finishes', async () => {
  // The affected phone's shape: reading every row takes about 90 s, more than the 60 s window.
  const device = { setup: 90 * SECOND, save: 20 * SECOND, work: 600 * SECOND, commit: 30 * SECOND };
  const s = simulate(device);
  await s.until(() => s.log.removedAt !== undefined, 6 * HOUR);
  // At 76aade840 every attempt was cut by a routine poll after the fixed window: nothing saved in
  // six simulated hours. Now the first run's window grows until it saves, and each later window
  // is what the device measured one saved slice needs.
  expect(s.log.firstSaveAt).toBeDefined();
  expect(s.log.pollCutsBeforeSave).toBe(0);
  expect(s.log.removedAt).toBeDefined();
  expect(s.log.removedAt!).toBeLessThan(40 * MINUTE);
  expect(s.log.attempts).toBeLessThan(30);
  // Routine sync still got its turn: a poll ran in every yield.
  expect(s.log.receives.length).toBeGreaterThan(s.log.saves);
  await s.close();
});

it('with routine sync unable to run, slices are not held to the two-second floor', async () => {
  const device = { setup: 90 * SECOND, save: 20 * SECOND, work: 600 * SECOND, commit: 30 * SECOND };
  const s = simulate(device, 'offline');
  await s.until(() => s.log.removedAt !== undefined, 12 * HOUR);
  // At 76aade840 the deferral's window (then the yield's "now") capped every slice at the floor:
  // about work / floor = 300 cycles of a 90 s setup. Now each slice gets the grown budget.
  expect(s.log.removedAt).toBeDefined();
  expect(s.log.pollCuts + s.log.hintCuts).toBe(0);
  expect(s.log.attempts).toBeLessThanOrEqual(4);
  expect(Math.min(...s.log.budgets)).toBeGreaterThan(FLOOR);
  await s.close();
});

// Property: no setup duration keeps a device from saving. Each case fails at 76aade840 when the
// setup is above sixty seconds (every attempt is cut by the first poll after the window).
// Literal milliseconds (30 s to 45 min), so the release inventory can count the cases.
it.each([30000, 61000, 120000, 300000, 600000, 1200000, 1800000, 2700000])(
  'setup %i ms online: the first run saves, within log2 extensions of its window',
  async (setup) => {
    const device = { setup, save: setup / 4, work: 100 * setup, commit: setup };
    const s = simulate(device);
    await s.until(() => s.log.firstSaveAt !== undefined, 12 * HOUR);
    await vi.advanceTimersByTimeAsync(SECOND);
    expect(s.log.firstSaveAt).toBeDefined();
    // The bound: one window. No routine poll cuts an unsaved run; its window starts at sixty
    // seconds and doubles while it runs, so it is extended at most ceil(log2(need / 60 s)) times.
    expect(s.log.pollCutsBeforeSave).toBe(0);
    expect(s.log.attemptsAtFirstSave).toBe(1);
    const need = setup + FLOOR + device.save;
    expect(s.log.windowEnds.size).toBeLessThanOrEqual(
      1 + Math.max(0, Math.ceil(Math.log2(need / POLLS))),
    );
    // The poll that waited ran within one poll interval of the save that ended the window.
    const after = s.log.receives.find((t) => t >= s.log.firstSaveAt!);
    expect(after).toBeDefined();
    expect(after! - s.log.firstSaveAt!).toBeLessThanOrEqual(POLL_EVERY + SECOND);
    await s.close();
  },
);

it('unchanged: during a long window the sender is never parked and a hint still cuts at once', async () => {
  const device = { setup: 10 * MINUTE, save: MINUTE, work: HOUR, commit: MINUTE };
  const s = simulate(device);
  await vi.advanceTimersByTimeAsync(5 * MINUTE);
  expect(s.retention.status.phase).toBe('running');
  // Still the first attempt, inside a window that outlasted sixty seconds.
  expect(s.log.attempts).toBe(1);
  expect(s.retention.diagnostics.windowEndsAt).toBeGreaterThan(5 * MINUTE);
  // Past the old sixty seconds: only routine idle polls wait; the sender is not parked.
  expect(s.retention.hold).toEqual({ send: false, receive: false, idlePoll: true });
  const sends = s.log.sends;
  s.scheduler.wake('local');
  await vi.advanceTimersByTimeAsync(100);
  expect(s.log.sends).toBe(sends + 1);
  // A hint from another device receives at once and cuts the attempt, as before.
  const receives = s.log.receives.length;
  s.hint();
  await vi.advanceTimersByTimeAsync(0);
  expect(s.log.receives).toHaveLength(receives + 1);
  expect(s.log.hintCuts).toBe(1);
  expect(s.retention.hold).toBeUndefined();
  await s.close();
});

it('a routine poll waits no longer than the run takes to its first save, then gets the yield', async () => {
  const device = { setup: 4 * MINUTE, save: MINUTE, work: HOUR, commit: MINUTE };
  const s = simulate(device);
  await s.until(() => s.log.saves >= 2, 3 * HOUR);
  expect(s.log.saves).toBeGreaterThanOrEqual(2);
  // The longest gap between idle polls is the first run (setup, a floor slice, the save) plus at
  // most one poll interval; afterwards each window is the measured need, and a yield follows.
  const gaps = s.log.receives.slice(1).map((t, i) => t - s.log.receives[i]!);
  const firstRun = device.setup + FLOOR + device.save;
  const measured = (1 + RATIO) * (device.setup + device.save);
  expect(Math.max(...gaps)).toBeLessThanOrEqual(Math.max(firstRun, measured) + 2 * POLL_EVERY);
  // The yield runs routine polls between windows.
  expect(gaps.filter((g) => g <= POLL_EVERY + SECOND).length).toBeGreaterThanOrEqual(
    YIELD / POLL_EVERY - 1,
  );
  await s.close();
});
