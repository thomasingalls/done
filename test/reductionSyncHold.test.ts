// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { fixture, flush } from './account-sync/scheduler-fixture';
import {
  createSyncScheduler,
  driveOutboundStep,
  type OutboundStep,
  type SyncHold,
  type SyncStatus,
} from '../src/crdt/accountSyncDriver';
import type { DriverOperations } from '../src/crdt/accountDriver';
import {
  createAutomaticLocalRetention,
  localRetentionInterrupted,
  watchLocalRetentionHold,
  LOCAL_RETENTION_MIN_RECORDS as MIN,
  LOCAL_RETENTION_QUIET_MS as QUIET,
} from '../src/crdt/automaticLocalRetention';
import { MaintenanceInterrupted } from '../src/crdt/contentMaintenance';

afterEach(() => {
  vi.useRealTimers();
});

/** A sender whose prelude finds nothing allocated, so the hold hook is its only decision. */
function heldFixture(interval = 3600000) {
  let hold: SyncHold | undefined;
  let held = 0;
  let sendDue: (() => boolean) | undefined;
  const f = fixture((options) =>
    createSyncScheduler({
      ...options,
      // Idle polls are driven explicitly below; the fixture holds one call open until finished.
      receiveInterval: () => interval,
      hold: () => hold,
      receive: (due) => {
        sendDue = due;
        return options.receive(due);
      },
      send: (_batch, holdNewEnvelope) => {
        if (holdNewEnvelope?.()) {
          held++;
          return Promise.resolve<OutboundStep>({ kind: 'held', acceptedThrough: 3 });
        }
        return options.send();
      },
    }),
  );
  return {
    ...f,
    get held() {
      return held;
    },
    get sendDue() {
      return sendDue;
    },
    setHold(next: SyncHold | undefined) {
      hold = next;
      f.scheduler.wake('hold');
    },
  };
}
const settle = async (f: ReturnType<typeof heldFixture>) => {
  f.scheduler.wake('start');
  await f.tick(0);
  f.calls[0]!.finish('idle', 3);
  await flush();
  await f.tick(0);
  f.calls[1]!.finish('idle', 5);
  await flush();
  expect(f.calls.map((c) => c.lane)).toEqual(['send', 'receive']);
};

it('a held sender parks at its boundary, ignores edits while parked and checks once on release', async () => {
  const f = heldFixture();
  await settle(f);
  f.setHold({ send: true, receive: false });
  f.scheduler.wake('local');
  await f.tick(100);
  // One pass reached the new-envelope boundary and parked instead of allocating.
  expect(f.held).toBe(1);
  expect(f.calls.filter((c) => c.lane === 'send')).toHaveLength(1);
  expect(f.scheduler.runtime.status.send).toMatchObject({
    phase: 'idle',
    nextAttemptAt: null,
    acceptedThrough: 3,
    reason: null,
  });
  // A parked lane does not rerun its prelude (a ledger load, a full check on this device).
  for (let n = 0; n < 5; n++) {
    f.scheduler.wake('local');
    await f.tick(2000);
  }
  expect(f.held).toBe(1);
  expect(f.calls.filter((c) => c.lane === 'send')).toHaveLength(1);
  f.setHold(undefined);
  await f.tick(0);
  expect(f.calls.filter((c) => c.lane === 'send')).toHaveLength(2);
  f.calls.at(-1)!.finish('idle', 3);
  await f.scheduler.dispose();
});

it('a settled hold defers receive polls and hints without cancelling or losing them', async () => {
  const f = heldFixture();
  await settle(f);
  f.setHold({ send: true, receive: true });
  f.scheduler.wake('remote');
  await f.tick(60000);
  expect(f.calls.filter((c) => c.lane === 'receive')).toHaveLength(1);
  // Still quiet to the retention owner, and no deadline is advertised while deferred.
  expect(f.scheduler.runtime.status.receive).toMatchObject({ phase: 'idle', nextAttemptAt: null });
  f.setHold(undefined);
  await f.tick(0);
  expect(f.calls.filter((c) => c.lane === 'receive')).toHaveLength(2);
  f.calls.at(-1)!.finish('idle', 5);
  await f.scheduler.dispose();
});

it('a parked sender with queued edits does not cut a receive sweep short', async () => {
  const f = heldFixture();
  await settle(f);
  f.setHold({ send: true, receive: false });
  f.scheduler.wake('local');
  await f.tick(100);
  expect(f.held).toBe(1);
  f.scheduler.wake('local'); // more typing while parked: the send deadline passes
  await f.tick(100);
  f.scheduler.wake('remote');
  await f.tick(0);
  expect(f.calls.at(-1)!.lane).toBe('receive');
  expect(f.sendDue!()).toBe(false);
  f.setHold(undefined);
  expect(f.sendDue!()).toBe(true);
  f.calls.at(-1)!.finish('idle', 5);
  await flush();
  await f.tick(0);
  expect(f.calls.at(-1)!.lane).toBe('send');
  f.calls.at(-1)!.finish('idle', 3);
  await f.scheduler.dispose();
});

it('an engaged but unsettled hold leaves receive running', async () => {
  const f = heldFixture();
  await settle(f);
  f.setHold({ send: true, receive: false });
  f.scheduler.wake('remote');
  await f.tick(0);
  expect(f.calls.filter((c) => c.lane === 'receive')).toHaveLength(2);
  f.calls.at(-1)!.finish('idle', 5);
  await f.scheduler.dispose();
});

const polls: SyncHold = { send: false, receive: false, idlePoll: true };
const lane = (f: ReturnType<typeof heldFixture>, name: 'send' | 'receive') =>
  f.calls.filter((c) => c.lane === name).length;

it('an idle-poll hold skips only the routine poll; a content hint still receives at once', async () => {
  const f = heldFixture(5000);
  await settle(f);
  f.setHold(polls);
  await f.tick(60000);
  expect(lane(f, 'receive')).toBe(1);
  // Quiet to the retention owner, and no deadline is advertised while the poll is skipped.
  expect(f.scheduler.runtime.status.receive).toMatchObject({ phase: 'idle', nextAttemptAt: null });
  f.scheduler.wake('remote');
  await f.tick(0);
  expect(lane(f, 'receive')).toBe(2);
  f.calls.at(-1)!.finish('idle', 5);
  await flush();
  // The poll after a clean idle sweep is routine again.
  await f.tick(60000);
  expect(lane(f, 'receive')).toBe(2);
  // Release runs the skipped poll at once.
  f.setHold(undefined);
  await f.tick(0);
  expect(lane(f, 'receive')).toBe(3);
  f.calls.at(-1)!.finish('idle', 5);
  await f.scheduler.dispose();
});

it('an idle-poll hold never parks the sender; retry, reconnection and an unknown submit still receive', async () => {
  const f = heldFixture(5000);
  await settle(f);
  f.setHold(polls);
  f.scheduler.wake('local');
  await f.tick(100);
  expect(f.held).toBe(0);
  expect(f.calls.at(-1)!.lane).toBe('send');
  f.calls.at(-1)!.finish('idle', 3);
  await flush();
  await f.tick(10000); // the routine poll is due and skipped
  expect(lane(f, 'receive')).toBe(1);
  f.scheduler.runtime.retry('receive');
  await f.tick(0);
  expect(lane(f, 'receive')).toBe(2);
  f.calls.at(-1)!.finish('idle', 5);
  await flush();
  await f.tick(10000);
  f.scheduler.wake('online'); // both lanes: the sender has the turn, then receive
  await f.tick(0);
  expect(f.calls.at(-1)!.lane).toBe('send');
  f.calls.at(-1)!.finish('idle', 3);
  await flush();
  await f.tick(0);
  expect(lane(f, 'receive')).toBe(3);
  f.calls.at(-1)!.finish('idle', 5);
  await flush();
  await f.tick(10000);
  f.scheduler.wake('local');
  await f.tick(100);
  f.calls.at(-1)!.finish('unknown', 3); // the submit may have committed: reconcile now
  await flush();
  await f.tick(0);
  expect(f.calls.at(-1)!.lane).toBe('receive');
  expect(lane(f, 'receive')).toBe(4);
  f.calls.at(-1)!.finish('idle', 5);
  await flush();
  expect(f.held).toBe(0);
  await f.scheduler.dispose();
});

it('a pass dirtied by a hint, or one that made progress, is followed at once under an idle-poll hold', async () => {
  const f = heldFixture(5000);
  await settle(f);
  f.setHold(polls);
  f.scheduler.wake('remote');
  await f.tick(0);
  expect(lane(f, 'receive')).toBe(2);
  f.scheduler.wake('remote'); // another hint lands while that pass is running
  f.calls.at(-1)!.finish('idle', 5);
  await flush();
  await f.tick(0);
  expect(lane(f, 'receive')).toBe(3);
  f.calls.at(-1)!.finish('progress', 6);
  await flush();
  await f.tick(0);
  expect(lane(f, 'receive')).toBe(4); // catch-up continues
  f.calls.at(-1)!.finish('idle', 6);
  await flush();
  await f.tick(60000);
  expect(lane(f, 'receive')).toBe(4); // only now is the next poll routine
  await f.scheduler.dispose();
});

/**
 * The real retention owner and the real scheduler, wired as the composed owner wires them. A
 * receive pass stands for its first storage job: it cancels a running attempt the way the queue
 * token in accountCapture run() does. Polls fall due every five seconds (no live notifications).
 */
function composed(attemptMs: number) {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const controller = new AbortController();
  let quiet = false;
  let pending: ((outcome: { kind: string; reason?: string }) => void) | undefined;
  const receives: number[] = [];
  const retention = createAutomaticLocalRetention({
    signal: controller.signal,
    observe: () => ({
      ready: true,
      synchronized: quiet,
      hold: false,
      deferPolls: true,
      hint: { revision: 0, records: MIN },
    }),
    remove: () =>
      new Promise((resolve) => {
        pending = resolve;
        setTimeout(() => {
          if (pending === resolve) pending = undefined;
          resolve({ kind: 'removed' });
        }, attemptMs);
      }),
  });
  const scheduler = createSyncScheduler({
    signal: controller.signal,
    gate: () => 'ready',
    detach() {},
    receiveInterval: () => 5000,
    hold: () => retention.hold,
    send: async () => ({ kind: 'idle', acceptedThrough: 0 }),
    receive: async () => {
      receives.push(Date.now());
      pending?.(localRetentionInterrupted(new MaintenanceInterrupted([{ queuePriority: true }])));
      pending = undefined;
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
  // Input stops at 1 ms, so the attempt does not start on a poll's own timer tick.
  vi.advanceTimersByTime(1);
  retention.wake();
  return { retention, scheduler, receives, controller };
}

it('composed: a 36-second attempt on an ordinary device finishes while polls fall due, then the poll runs', async () => {
  const c = composed(36000);
  await vi.advanceTimersByTimeAsync(QUIET);
  expect(c.retention.status.phase).toBe('running');
  const before = c.receives.length;
  await vi.advanceTimersByTimeAsync(36000 - 2);
  expect(c.receives).toHaveLength(before); // the poll due at 10 s waited; none started
  expect(c.retention.status.phase).toBe('running');
  await vi.advanceTimersByTimeAsync(2);
  expect(c.retention.diagnostics).toMatchObject({ completions: 1, interruptions: 0 });
  expect(c.retention.hold).toBeUndefined();
  // The release re-arms the lane at once (fake timers defer a zero delay set mid-tick by 1 ms).
  expect(c.scheduler.runtime.status.receive.nextAttemptAt).toBe(QUIET + 1);
  await vi.advanceTimersByTimeAsync(1);
  expect(c.receives).toHaveLength(before + 1); // the skipped poll ran as soon as it finished
  expect(c.receives.at(-1)).toBeLessThanOrEqual(QUIET + 1 + 36000 + 1);
  c.controller.abort();
  await c.scheduler.dispose();
});

it('composed: a content hint during the attempt receives at once and interrupts it, as before', async () => {
  const c = composed(36000);
  await vi.advanceTimersByTimeAsync(QUIET + 5000);
  const before = c.receives.length;
  c.scheduler.wake('remote');
  await vi.advanceTimersByTimeAsync(0);
  expect(c.receives).toHaveLength(before + 1);
  expect(c.retention.diagnostics).toMatchObject({ completions: 0, interruptions: 1 });
  expect(c.retention.hold).toBeUndefined();
  c.controller.abort();
  await c.scheduler.dispose();
});

it('a throwing hold observer cannot stop synchronization', async () => {
  const f = fixture((options) =>
    createSyncScheduler({
      ...options,
      hold: () => {
        throw Error('observer failure');
      },
    }),
  );
  f.scheduler.wake('start');
  await f.tick(0);
  expect(f.calls.map((c) => c.lane)).toEqual(['send']);
  f.calls[0]!.finish('idle');
  await f.scheduler.dispose();
});

it('drives an allocated position to acceptance before parking, and never allocates while held', async () => {
  let accepted = 4,
    allocations = 0,
    submits = 0;
  const allocated = new Set([5]);
  const ops: DriverOperations = {
    deliveryStatus: async () => ({ state: 'ready', acceptedThrough: accepted, submissions: [] }),
    spoolStatus: async () => ({
      positions: [...allocated].map((position) => ({ position, persisted: true })),
    }),
    prepareNextEnvelope: async () => {
      allocations++;
      return { position: accepted + 1, bytes: new Uint8Array(1) };
    },
    prepareSubmission: async () => ({ kind: 'ready' }),
    submitPending: async () => {
      submits++;
      accepted++;
      allocated.delete(accepted);
      return { kind: 'accepted' };
    },
  };
  const held = () => true;
  // Position 5 was allocated before the hold engaged: it still drains.
  expect(await driveOutboundStep(ops, 'token', () => 'ready', undefined, held)).toEqual({
    kind: 'progress',
    acceptedThrough: 5,
    acceptedNow: true,
  });
  // acceptedThrough === spool head: the settled cut. Park instead of allocating position 6.
  expect(await driveOutboundStep(ops, 'token', () => 'ready', undefined, held)).toEqual({
    kind: 'held',
    acceptedThrough: 5,
  });
  // The hold is consulted before a batch delay, and the batch window is left untouched.
  expect(
    await driveOutboundStep(
      ops,
      'token',
      () => 'ready',
      () => {
        throw Error('a held boundary must not consume the batch window');
      },
      held,
    ),
  ).toMatchObject({ kind: 'held' });
  expect({ allocations, submits }).toEqual({ allocations: 0, submits: 1 });
  expect(
    await driveOutboundStep(
      ops,
      'token',
      () => 'ready',
      undefined,
      () => false,
    ),
  ).toEqual({
    kind: 'progress',
    acceptedThrough: 6,
    acceptedNow: true,
  });
  expect(allocations).toBe(1);
});
