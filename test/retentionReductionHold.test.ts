// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import {
  createAutomaticLocalRetention,
  localRetentionInterrupted,
  watchLocalRetentionHold,
  LOCAL_RETENTION_MIN_RECORDS as MIN,
  LOCAL_RETENTION_QUIET_MS as QUIET,
  LOCAL_RETENTION_RETRY_MS as RETRY,
  LOCAL_RETENTION_COOLDOWN_MS as COOLDOWN,
  LOCAL_RETENTION_HOLD_MS as HOLD,
  LOCAL_RETENTION_HOLD_YIELD_MS as YIELD,
  LOCAL_RETENTION_POLL_HOLD_MS as POLLS,
  type LocalRetentionObservation,
} from '../src/crdt/automaticLocalRetention';
import { MaintenanceInterrupted } from '../src/crdt/contentMaintenance';

afterEach(() => {
  vi.useRealTimers();
});
type Outcome = { kind: string; reason?: string };
/** A full-check device whose sync lanes are busy until the hold parks them. */
function fixture(initial: Partial<LocalRetentionObservation> = {}) {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const controller = new AbortController();
  let state: LocalRetentionObservation = {
    ready: true,
    synchronized: false,
    hold: true,
    hint: { revision: 0, records: MIN },
    ...initial,
  };
  const calls: { resolve: (r: Outcome) => void; reject: (e: Error) => void }[] = [];
  const run = createAutomaticLocalRetention({
    signal: controller.signal,
    observe: () => state,
    remove: () =>
      new Promise<Outcome>((resolve, reject) => {
        calls.push({ resolve, reject });
      }),
  });
  let notices = 0;
  run.onStatus(() => notices++);
  return {
    run,
    calls,
    controller,
    get notices() {
      return notices;
    },
    set(next: Partial<LocalRetentionObservation>) {
      state = { ...state, ...next };
    },
    replace(next: LocalRetentionObservation) {
      state = next;
    },
    tick: (ms: number) => vi.advanceTimersByTimeAsync(ms),
  };
}
const engaged = { send: true, receive: false };
const settled = { send: true, receive: true };
/** Quiet expires with sync busy, the lanes park, the first attempt starts under the hold. */
async function settle(f: ReturnType<typeof fixture>) {
  f.run.wake();
  await f.tick(QUIET);
  expect(f.run.hold).toEqual(engaged);
  f.set({ synchronized: true });
  f.run.refresh();
  await f.tick(0);
  expect(f.calls).toHaveLength(1);
  expect(f.run.hold).toEqual(settled);
}

it('engages the hold when an attempt is due but sync is busy, instead of waiting forever', async () => {
  const f = fixture();
  f.run.wake();
  await f.tick(QUIET - 1);
  expect(f.run.hold).toBeUndefined();
  const before = f.notices;
  await f.tick(1);
  expect(f.calls).toHaveLength(0);
  expect(f.run.hold).toEqual(engaged);
  expect(f.run.status.phase).toBe('waiting');
  expect(f.notices).toBeGreaterThan(before);
  // Parked lanes report quiet; that readiness refresh starts the attempt without new input.
  f.set({ synchronized: true });
  f.run.refresh();
  await f.tick(0);
  expect(f.calls).toHaveLength(1);
  expect(f.run.hold).toEqual(settled);
  f.calls[0]!.resolve({ kind: 'removed' });
  await f.tick(0);
  expect(f.run.hold).toBeUndefined();
  f.run.dispose();
});

it('a quiet full-check device still settles the hold, so polls cannot cancel its attempt', async () => {
  const f = fixture({ synchronized: true });
  f.run.wake();
  await f.tick(QUIET);
  expect(f.calls).toHaveLength(1);
  expect(f.run.hold).toEqual(settled);
  f.run.dispose();
});

it('busy sync without a hold request schedules nothing; folded readiness keeps its old contract', async () => {
  const f = fixture({ hold: false });
  f.run.wake();
  await f.tick(COOLDOWN);
  expect(f.calls).toHaveLength(0);
  expect(f.run.hold).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
  // A caller that folds sync quiet into `ready` keeps the old contract too.
  f.replace({ ready: false, hint: { revision: 0, records: MIN } });
  f.run.refresh();
  await f.tick(COOLDOWN);
  expect(f.calls).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
  f.run.dispose();
});

it('transient readiness, a withdrawn hint and input never release the hold; a stable refusal does', async () => {
  const f = fixture();
  f.run.wake();
  await f.tick(QUIET);
  expect(f.run.hold).toEqual(engaged);
  f.set({ hint: undefined }); // validation in flight
  f.run.refresh();
  f.set({ hint: { revision: 0, records: MIN }, ready: false }); // pending input items
  f.run.refresh();
  f.run.wake(); // keystroke: restarts quiet, keeps the lanes parked
  await f.tick(QUIET / 2);
  expect(f.run.hold).toEqual(engaged);
  f.set({ hold: false }); // page hidden, pressure, or the view is indexed again
  f.run.refresh();
  expect(f.run.hold).toBeUndefined();
  f.run.dispose();
});

it('a hidden page releases the lanes even while an attempt is running', async () => {
  const f = fixture();
  await settle(f);
  f.set({ hold: false, ready: false });
  f.run.wake(); // visibilitychange
  expect(f.run.hold).toBeUndefined();
  expect(f.run.status.phase).toBe('running');
  f.run.dispose();
});

it('a transient refusal under the hold retries behind its clock without another event', async () => {
  const f = fixture();
  await settle(f);
  f.calls[0]!.resolve({ kind: 'skipped', reason: 'activity-or-journal' });
  await f.tick(0);
  expect(f.run.hold).toEqual(settled);
  await f.tick(RETRY - 1);
  expect(f.calls).toHaveLength(1);
  await f.tick(1);
  expect(f.calls).toHaveLength(2);
  f.calls[1]!.resolve({ kind: 'preparation-saved' });
  await f.tick(0);
  expect(f.calls).toHaveLength(3);
  expect(f.run.hold).toEqual(settled);
  f.run.dispose();
});

it('the budget starts when sync is parked under the hold, bounds even a running attempt, then yields', async () => {
  const f = fixture();
  f.run.wake();
  await f.tick(QUIET);
  // The envelope already being prepared may take minutes; while sync is still busy the
  // unsettled hold has no deadline.
  await f.tick(2 * HOLD);
  expect(f.run.hold).toEqual(engaged);
  f.set({ synchronized: true });
  f.run.refresh();
  await f.tick(0);
  expect(f.run.hold).toEqual(settled);
  f.calls[0]!.resolve({ kind: 'skipped', reason: 'pending-promotion' });
  await f.tick(RETRY);
  expect(f.calls).toHaveLength(2);
  await f.tick(HOLD - RETRY - 1);
  expect(f.run.hold).toEqual(settled);
  await f.tick(1);
  expect(f.run.hold).toBeUndefined();
  expect(f.run.status.phase).toBe('running');
  f.calls[1]!.resolve({ kind: 'skipped', reason: 'activity-or-journal' });
  await f.tick(0);
  // Released lanes are busy again. No hold during the yield window.
  f.set({ synchronized: false });
  f.run.refresh();
  await f.tick(YIELD - 1);
  expect(f.run.hold).toBeUndefined();
  await f.tick(1);
  // Phase 546: that window ended without progress, so the same history is not held again.
  expect(f.run.hold).toBeUndefined();
  expect(f.calls).toHaveLength(2);
  // New writing or sync changes the history; the next due attempt may hold again.
  f.set({ hint: { revision: 0, records: MIN + 1 } });
  f.run.refresh();
  await f.tick(0);
  expect(f.run.hold).toEqual(engaged);
  f.run.dispose();
});

it('a hold that parked sync but cannot start its attempt yields after the same budget', async () => {
  const f = fixture();
  f.run.wake();
  await f.tick(QUIET);
  expect(f.run.hold).toEqual(engaged);
  // The sender has parked, but pending input keeps the attempt from starting. Without a bound
  // here the parked sender would wait for as long as the person keeps writing.
  f.set({ synchronized: true, ready: false });
  f.run.refresh();
  await f.tick(HOLD - 1);
  expect(f.run.hold).toEqual(engaged);
  expect(f.calls).toHaveLength(0);
  await f.tick(1);
  expect(f.run.hold).toBeUndefined();
  // Released lanes are busy again. No hold during the yield window.
  f.set({ synchronized: false, ready: true });
  f.run.refresh();
  await f.tick(YIELD - 1);
  expect(f.run.hold).toBeUndefined();
  await f.tick(1);
  // Phase 546: the window ended without progress, so the same history is not held again; the
  // person kept writing, which is new history, and that may hold again once it is due.
  expect(f.run.hold).toBeUndefined();
  expect(f.calls).toHaveLength(0);
  f.set({ hint: { revision: 0, records: MIN + 1 } });
  f.run.refresh();
  await f.tick(0);
  expect(f.run.hold).toEqual(engaged);
  f.run.dispose();
});
it('an attempt that starts late under a parked hold keeps the budget already running', async () => {
  const f = fixture();
  f.run.wake();
  await f.tick(QUIET);
  f.set({ synchronized: true, ready: false });
  f.run.refresh();
  await f.tick(HOLD / 2);
  f.set({ ready: true });
  f.run.refresh();
  await f.tick(0);
  expect(f.calls).toHaveLength(1);
  expect(f.run.hold).toEqual(settled);
  await f.tick(HOLD / 2 - 1);
  expect(f.run.hold).toEqual(settled);
  await f.tick(1);
  expect(f.run.hold).toBeUndefined();
  f.run.dispose();
});
it('capacity and missing history spend the hold until a manual retry; ineligible only releases', async () => {
  for (const reason of ['capacity', 'history-required', 'ineligible']) {
    const f = fixture();
    await settle(f);
    f.calls[0]!.resolve({ kind: 'skipped', reason });
    await f.tick(0);
    expect(f.run.hold).toBeUndefined();
    // New growth would permit another attempt behind the retry clock.
    f.set({ synchronized: false, hint: { revision: 0, records: MIN + 1 } });
    f.run.refresh();
    await f.tick(RETRY);
    expect(f.run.hold).toEqual(reason === 'ineligible' ? engaged : undefined);
    expect(f.calls).toHaveLength(1);
    if (reason !== 'ineligible') {
      expect(f.run.retry()).toBe(true);
      await f.tick(QUIET);
      expect(f.run.hold).toEqual(engaged);
    }
    f.run.dispose();
    vi.useRealTimers();
  }
});

it('a capacity refusal that arrives after the hold expired still spends it', async () => {
  const f = fixture();
  await settle(f);
  // The budget lapses mid-attempt; the pass is then cut short and parks as capacity.
  await f.tick(HOLD);
  expect(f.run.hold).toBeUndefined();
  expect(f.run.status.phase).toBe('running');
  f.calls[0]!.resolve({ kind: 'skipped', reason: 'capacity' });
  await f.tick(0);
  // New growth permits another attempt, but holding sync for it again cannot help.
  f.set({ synchronized: false, hint: { revision: 0, records: MIN + 1 } });
  f.run.refresh();
  await f.tick(YIELD + RETRY);
  expect(f.run.hold).toBeUndefined();
  expect(f.calls).toHaveLength(1);
  expect(f.run.retry()).toBe(true);
  await f.tick(QUIET);
  expect(f.run.hold).toEqual(engaged);
  f.run.dispose();
});

/** An already-reduced device: indexed ledger view, so no full hold, and quiet sync lanes. */
const ordinary = { hold: false, synchronized: true, deferPolls: true };
const polls = { send: false, receive: false, idlePoll: true };
const priorityOnly = () =>
  localRetentionInterrupted(new MaintenanceInterrupted([{ queuePriority: true }]));
const microtasks = async () => {
  for (let n = 0; n < 10; n++) await Promise.resolve();
};

it('an ordinary device defers routine polls only while its attempt runs and never parks the sender', async () => {
  const f = fixture(ordinary);
  f.run.wake();
  await f.tick(QUIET - 1);
  expect(f.run.hold).toBeUndefined(); // waiting for quiet: polls run as usual
  await f.tick(1);
  expect(f.calls).toHaveLength(1);
  expect(f.run.hold).toEqual(polls);
  f.calls[0]!.resolve({ kind: 'removed' });
  await f.tick(0);
  expect(f.run.hold).toBeUndefined();
  f.run.dispose();
});

it('a saved slice continuing at once keeps the deferral; input that delays the next slice releases it', async () => {
  const f = fixture(ordinary);
  f.run.wake();
  await f.tick(QUIET);
  f.calls[0]!.resolve({ kind: 'preparation-saved' });
  await microtasks();
  // Between slices: the next one is due at once, so the receive lane keeps skipping polls.
  expect(f.calls).toHaveLength(1);
  expect(f.run.hold).toEqual(polls);
  await f.tick(0);
  expect(f.calls).toHaveLength(2);
  expect(f.run.hold).toEqual(polls);
  f.calls[1]!.resolve({ kind: 'preparation-saved' });
  await microtasks();
  f.run.wake(); // a click without a journal entry restarts quiet, so the next slice waits
  expect(f.run.hold).toBeUndefined();
  await f.tick(QUIET);
  expect(f.calls).toHaveLength(3);
  expect(f.run.hold).toEqual(polls);
  f.run.dispose();
});

it('the poll deferral is bounded from its first slice, announced when it lapses, then yields', async () => {
  const f = fixture(ordinary);
  f.run.wake();
  await f.tick(QUIET);
  // Slices that continue at once share one budget.
  for (let n = 0; n < 3; n++) {
    await f.tick(POLLS / 4);
    f.calls.at(-1)!.resolve({ kind: 'preparation-saved' });
    await f.tick(0);
  }
  expect(f.calls).toHaveLength(4);
  await f.tick(POLLS / 4 - 1);
  expect(f.run.hold).toEqual(polls);
  const before = f.notices;
  await f.tick(1);
  expect(f.run.hold).toBeUndefined();
  expect(f.run.status.phase).toBe('running');
  expect(f.notices).toBeGreaterThan(before); // the sync scheduler must re-arm the poll
  // The resumed poll interrupts the attempt through the storage queue, as before this change.
  f.calls[3]!.resolve(priorityOnly());
  await f.tick(0);
  f.run.refresh(); // the lanes went busy and quiet again
  await f.tick(QUIET);
  expect(f.calls).toHaveLength(5);
  expect(f.run.hold).toBeUndefined(); // inside the yield window: unprotected
  f.calls[4]!.resolve(priorityOnly());
  await f.tick(YIELD - QUIET);
  f.run.refresh();
  await f.tick(0);
  expect(f.calls).toHaveLength(6);
  expect(f.run.hold).toEqual(polls);
  f.run.dispose();
});

it('a hidden page, a halt, disposal or any final outcome releases the poll deferral', async () => {
  for (const end of ['hidden', 'error', 'dispose', 'interrupted', 'ineligible'] as const) {
    const f = fixture(ordinary);
    f.run.wake();
    await f.tick(QUIET);
    expect(f.run.hold).toEqual(polls);
    if (end === 'hidden') {
      f.set({ deferPolls: false, ready: false });
      f.run.wake(); // visibilitychange
      expect(f.run.hold).toBeUndefined();
      expect(f.run.status.phase).toBe('running');
    } else if (end === 'error') f.calls[0]!.reject(Error('owner failure'));
    else if (end === 'dispose') f.controller.abort();
    else if (end === 'interrupted') f.calls[0]!.resolve(priorityOnly());
    else f.calls[0]!.resolve({ kind: 'skipped', reason: end });
    await f.tick(0);
    expect(f.run.hold).toBeUndefined();
    f.run.dispose();
    vi.useRealTimers();
  }
});

it('without a running attempt, or without the observation, polls are never deferred', async () => {
  const f = fixture({ ...ordinary, ready: false });
  f.run.wake();
  await f.tick(COOLDOWN);
  expect(f.calls).toHaveLength(0);
  expect(f.run.hold).toBeUndefined();
  // Callers that never pass deferPolls keep the old contract, even while an attempt runs.
  f.replace({ ready: true, synchronized: true, hold: false, hint: { revision: 0, records: MIN } });
  f.run.refresh();
  await f.tick(0);
  expect(f.calls).toHaveLength(1);
  expect(f.run.hold).toBeUndefined();
  f.run.dispose();
});

it('a full-check device keeps its full hold, and polls stay undeferred in its yield window', async () => {
  const f = fixture({ deferPolls: true });
  await settle(f);
  expect(f.run.hold).toEqual(settled);
  await f.tick(HOLD);
  expect(f.run.hold).toBeUndefined();
  f.calls[0]!.resolve({ kind: 'preparation-saved' });
  await f.tick(0);
  expect(f.calls).toHaveLength(2);
  expect(f.run.hold).toBeUndefined();
  f.run.dispose();
});

it('the lane watcher wakes the scheduler once per tier change, never synchronously', async () => {
  const f = fixture(ordinary);
  let wakes = 0;
  const stop = watchLocalRetentionHold(f.run, () => wakes++);
  f.run.wake();
  await f.tick(QUIET);
  expect(f.run.hold).toEqual(polls);
  expect(wakes).toBe(1);
  f.calls[0]!.resolve({ kind: 'preparation-saved' });
  await f.tick(0); // the next slice: same tier, no wake
  expect(f.calls).toHaveLength(2);
  expect(wakes).toBe(1);
  f.set({ deferPolls: false });
  f.run.refresh(); // released synchronously; the wake follows in a microtask
  expect(f.run.hold).toBeUndefined();
  expect(wakes).toBe(1);
  await microtasks();
  expect(wakes).toBe(2);
  stop();
  f.run.dispose();
});

it('a halt or disposal releases the hold', async () => {
  for (const end of ['error', 'unexpected', 'dispose'] as const) {
    const f = fixture();
    await settle(f);
    if (end === 'error') f.calls[0]!.reject(Error('owner failure'));
    else if (end === 'unexpected') f.calls[0]!.resolve({ kind: 'surprise' });
    else f.controller.abort();
    await f.tick(0);
    expect(f.run.hold).toBeUndefined();
    expect(f.run.status.phase).toBe(end === 'dispose' ? 'closed' : 'halted');
    vi.useRealTimers();
  }
});
