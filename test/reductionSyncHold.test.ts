// @vitest-environment node
import { expect, it } from 'vitest';
import { fixture, flush } from './account-sync/scheduler-fixture';
import {
  createSyncScheduler,
  driveOutboundStep,
  type OutboundStep,
  type SyncHold,
} from '../src/crdt/accountSyncDriver';
import type { DriverOperations } from '../src/crdt/accountDriver';

/** A sender whose prelude finds nothing allocated, so the hold hook is its only decision. */
function heldFixture() {
  let hold: SyncHold | undefined;
  let held = 0;
  let sendDue: (() => boolean) | undefined;
  const f = fixture((options) =>
    createSyncScheduler({
      ...options,
      // Idle polls are driven explicitly below; the fixture holds one call open until finished.
      receiveInterval: () => 3600000,
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
