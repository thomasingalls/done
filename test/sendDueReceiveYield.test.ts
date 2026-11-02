// @vitest-environment node
import { expect, it, vi } from 'vitest';
import {
  createReceiveSweep,
  createSyncScheduler,
  type OutboundStep,
  type SyncReceiveStep,
} from '../src/crdt/accountSyncDriver';
import type { ReceiveStep } from '../src/crdt/accountReceiveDriver';
import type { DriverClock } from '../src/crdt/accountDriver';
import { fixture, flush } from './account-sync/scheduler-fixture';

function harness(
  send: () => Promise<OutboundStep>,
  receive: (sendDue: () => boolean) => Promise<SyncReceiveStep>,
) {
  let clock!: DriverClock;
  const f = fixture((options) => {
    clock = options.clock!;
    return createSyncScheduler({
      ...options,
      publicationBatch: { quietMs: 300, maxMs: 2000 },
      send,
      receive,
    });
  });
  return {
    f,
    wait: (ms: number) => new Promise<void>((resolve) => clock.set(resolve, ms)),
  };
}

it('offers due sending the next turn between completed publisher checks', async () => {
  const sends: number[] = [];
  const checks: number[] = [];
  const sweep = createReceiveSweep(),
    context = {};
  const h = harness(
    async () => {
      sends.push(h.f.now);
      return { kind: 'idle', acceptedThrough: 0 };
    },
    (sendDue) =>
      sweep.run(
        context,
        6,
        async () => {
          await h.wait(100);
          checks.push(h.f.now);
          return { kind: 'idle', receivedThrough: 0 };
        },
        sendDue,
      ),
  );
  h.f.scheduler.wake('start');
  await h.f.tick(0);
  h.f.scheduler.wake('local');
  await h.f.tick(299);
  expect(sends).toEqual([0]);
  await h.f.tick(1);
  expect(checks).toEqual([100, 200, 300]);
  expect(sends).toEqual([0, 300]);
  expect(h.f.scheduler.runtime.status.receive.lastSuccessAt).toBeNull();
  await h.f.tick(300);
  expect(checks).toEqual([100, 200, 300, 400, 500, 600]);
  expect(h.f.scheduler.runtime.status.receive.nextAttemptAt).toBe(5600);
  await h.f.scheduler.dispose();
});

it('finishes all publishers across repeated yields without restarting or starving receiving', async () => {
  const sweep = createReceiveSweep(),
    context = {};
  const check = vi.fn(async (): Promise<ReceiveStep> => ({ kind: 'idle', receivedThrough: 7 }));
  for (let i = 0; i < 5; i++) {
    expect(await sweep.run(context, 6, check, () => true)).toEqual({
      kind: 'yielded',
      receivedThrough: 7,
    });
    expect(check).toHaveBeenCalledTimes(i + 1);
  }
  expect(await sweep.run(context, 6, check, () => true)).toEqual({
    kind: 'idle',
    receivedThrough: 7,
  });
  expect(check).toHaveBeenCalledTimes(6);
  await sweep.run(context, 6, check, () => false);
  expect(check).toHaveBeenCalledTimes(12);
});

it('a changed authority identity starts a complete fresh sweep even with the same publisher count', async () => {
  const sweep = createReceiveSweep();
  const check = vi.fn(async (): Promise<ReceiveStep> => ({ kind: 'idle', receivedThrough: 0 }));
  await sweep.run({}, 4, check, () => true);
  await sweep.run({}, 4, check, () => false);
  expect(check).toHaveBeenCalledTimes(5);
});

it('a changed publisher count starts a complete fresh sweep', async () => {
  const sweep = createReceiveSweep(),
    context = {};
  const check = vi.fn(async (): Promise<ReceiveStep> => ({ kind: 'idle', receivedThrough: 0 }));
  await sweep.run(context, 4, check, () => true);
  await sweep.run(context, 6, check, () => false);
  expect(check).toHaveBeenCalledTimes(7);
});

it.each(['progress', 'unknown', 'expired', 'paused', 'blocked'] as const)(
  '%s ends the partial sweep without masking or reclassifying the verified result',
  async (kind) => {
    const sweep = createReceiveSweep(),
      context = {};
    const idle = vi.fn(async (): Promise<ReceiveStep> => ({ kind: 'idle', receivedThrough: 7 }));
    await sweep.run(context, 4, idle, () => true);
    const result: ReceiveStep =
      kind === 'blocked'
        ? { kind, receivedThrough: 7, reason: 'conflict' }
        : { kind, receivedThrough: 7 };
    const sendDue = vi.fn(() => true);
    expect(await sweep.run(context, 4, async () => result, sendDue)).toBe(result);
    expect(sendDue).not.toHaveBeenCalled();
    await sweep.run(context, 4, idle, () => false);
    expect(idle).toHaveBeenCalledTimes(5);
  },
);

it('an exception discards only the scheduling continuation and propagates the exact failure', async () => {
  const sweep = createReceiveSweep(),
    context = {},
    failure = Error('authority changed');
  const check = vi.fn(async (): Promise<ReceiveStep> => ({ kind: 'idle', receivedThrough: 0 }));
  await sweep.run(context, 3, check, () => true);
  await expect(
    sweep.run(
      context,
      3,
      async () => {
        throw failure;
      },
      () => true,
    ),
  ).rejects.toBe(failure);
  await sweep.run(context, 3, check, () => false);
  expect(check).toHaveBeenCalledTimes(4);
});

it('an explicit history reset discards a saved sweep', async () => {
  const sweep = createReceiveSweep(),
    context = {};
  const check = vi.fn(async (): Promise<ReceiveStep> => ({ kind: 'idle', receivedThrough: 0 }));
  await sweep.run(context, 3, check, () => true);
  sweep.reset();
  await sweep.run(context, 3, check, () => false);
  expect(check).toHaveBeenCalledTimes(4);
});

it('a single publisher completes its verified check without yielding or consulting a hint', async () => {
  const sweep = createReceiveSweep(),
    sendDue = vi.fn(() => true);
  expect(
    await sweep.run({}, 1, async () => ({ kind: 'idle', receivedThrough: 0 }), sendDue),
  ).toEqual({ kind: 'idle', receivedThrough: 0 });
  expect(sendDue).not.toHaveBeenCalled();
});

it.each(['offline', 'local-storage', 'sign-in-required', 'closed'] as const)(
  'the due-send predicate remains false through the %s gate',
  async (gate) => {
    let due!: () => boolean, finish!: (s: ReceiveStep) => void;
    const h = harness(
      async () => ({ kind: 'idle', acceptedThrough: 0 }),
      (check) => {
        due = check;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    );
    h.f.scheduler.wake('start');
    await h.f.tick(0);
    h.f.scheduler.wake('local');
    await h.f.tick(300);
    expect(due()).toBe(true);
    h.f.setGate(gate);
    expect(due()).toBe(false);
    h.f.controller.abort();
    expect(due()).toBe(false);
    finish({ kind: 'idle', receivedThrough: 0 });
    await flush();
    await h.f.scheduler.dispose();
  },
);

it('a retained callback cannot yield a later receive turn or influence a stopped owner', async () => {
  const turns: { due: () => boolean; finish: (s: ReceiveStep) => void }[] = [];
  const h = harness(
    async () => ({ kind: 'idle', acceptedThrough: 0 }),
    (due) =>
      new Promise((finish) => {
        turns.push({ due, finish });
      }),
  );
  h.f.scheduler.wake('start');
  await h.f.tick(0);
  const first = turns[0]!;
  first.finish({ kind: 'idle', receivedThrough: 0 });
  await flush();
  h.f.scheduler.wake('remote');
  await h.f.tick(0);
  h.f.scheduler.wake('local');
  await h.f.tick(300);
  expect(turns[1]!.due()).toBe(true);
  expect(first.due()).toBe(false);
  h.f.controller.abort();
  expect(turns[1]!.due()).toBe(false);
  turns[1]!.finish({ kind: 'idle', receivedThrough: 0 });
  await flush();
  await h.f.scheduler.dispose();
});

it('failed-send retry timing remains independent of local and remote wakes', async () => {
  let due!: () => boolean, finish!: (s: ReceiveStep) => void;
  const sends: number[] = [];
  const h = harness(
    async () => {
      sends.push(h.f.now);
      return { kind: 'unknown', acceptedThrough: 0 };
    },
    (check) => {
      due = check;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  );
  h.f.scheduler.wake('start');
  await h.f.tick(0);
  for (let i = 0; i < 10; i++) {
    h.f.scheduler.wake('local');
    h.f.scheduler.wake('remote');
  }
  await h.f.tick(999);
  expect(due()).toBe(false);
  expect(sends).toEqual([0]);
  await h.f.tick(1);
  expect(due()).toBe(true);
  expect(h.f.scheduler.runtime.status.send.nextAttemptAt).toBe(1000);
  h.f.controller.abort();
  finish({ kind: 'idle', receivedThrough: 0 });
  await flush();
  await h.f.scheduler.dispose();
});

it('a halted sender never requests a yield or gets unblocked by hints', async () => {
  let due!: () => boolean, finish!: (s: ReceiveStep) => void;
  const h = harness(
    async () => ({ kind: 'blocked', acceptedThrough: 0, reason: 'conflict' }),
    (check) => {
      due = check;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  );
  h.f.scheduler.wake('start');
  await h.f.tick(0);
  h.f.scheduler.wake('local');
  h.f.scheduler.wake('remote');
  await h.f.tick(30000);
  expect(due()).toBe(false);
  expect(h.f.scheduler.runtime.status.send).toMatchObject({
    reason: 'conflict',
    nextAttemptAt: null,
  });
  h.f.controller.abort();
  finish({ kind: 'idle', receivedThrough: 0 });
  await flush();
  await h.f.scheduler.dispose();
});

it.each(['before-yield', 'during-send'] as const)(
  'a hint %s survives continuation and forces a complete repair sweep before idle polling',
  async (when) => {
    const turns: { finish: (s: SyncReceiveStep) => void; due: () => boolean }[] = [];
    const sendEnds: ((s: OutboundStep) => void)[] = [];
    let sends = 0;
    const h = harness(
      () =>
        ++sends === 1
          ? Promise.resolve({ kind: 'idle', acceptedThrough: 0 })
          : new Promise((finish) => {
              sendEnds.push(finish);
            }),
      (due) =>
        new Promise((finish) => {
          turns.push({ due, finish });
        }),
    );
    h.f.scheduler.wake('start');
    await h.f.tick(0);
    h.f.scheduler.wake('local');
    await h.f.tick(300);
    if (when === 'before-yield') h.f.scheduler.wake('remote');
    expect(turns[0]!.due()).toBe(true);
    turns[0]!.finish({ kind: 'yielded', receivedThrough: 0 });
    await flush();
    await h.f.tick(0);
    expect(sendEnds).toHaveLength(1);
    if (when === 'during-send') h.f.scheduler.wake('remote');
    sendEnds[0]!({ kind: 'idle', acceptedThrough: 0 });
    await flush();
    await h.f.tick(0);
    turns[1]!.finish({ kind: 'idle', receivedThrough: 0 });
    await flush();
    await h.f.tick(0);
    expect(turns).toHaveLength(3);
    turns[2]!.finish({ kind: 'idle', receivedThrough: 0 });
    await flush();
    expect(h.f.scheduler.runtime.status.receive.nextAttemptAt).toBe(5300);
    await h.f.scheduler.dispose();
  },
);

it('yielding cannot regress the durable receive prefix or hide an integrity halt', async () => {
  const turns: ((s: SyncReceiveStep) => void)[] = [];
  const h = harness(
    async () => ({ kind: 'idle', acceptedThrough: 0 }),
    () =>
      new Promise((finish) => {
        turns.push(finish);
      }),
  );
  h.f.scheduler.wake('start');
  await h.f.tick(0);
  turns[0]!({ kind: 'progress', receivedThrough: 3 });
  await flush();
  await h.f.tick(0);
  turns[1]!({ kind: 'yielded', receivedThrough: 2 });
  await flush();
  expect(h.f.scheduler.runtime.status.receive).toMatchObject({
    reason: 'integrity',
    receivedThrough: 3,
    nextAttemptAt: null,
  });
  h.f.scheduler.wake('remote');
  await h.f.tick(30000);
  expect(turns).toHaveLength(2);
  await h.f.scheduler.dispose();
});

it('a scheduling yield preserves receive failure evidence until actual reconciliation succeeds', async () => {
  const turns: ((s: SyncReceiveStep) => void)[] = [];
  const h = harness(
    async () => ({ kind: 'idle', acceptedThrough: 0 }),
    () =>
      new Promise((finish) => {
        turns.push(finish);
      }),
  );
  h.f.scheduler.wake('start');
  await h.f.tick(0);
  turns[0]!({ kind: 'unknown', receivedThrough: 0 });
  await flush();
  await h.f.tick(1000);
  h.f.scheduler.wake('local');
  await h.f.tick(300);
  turns[1]!({ kind: 'yielded', receivedThrough: 0 });
  await flush();
  await h.f.tick(0);
  expect(h.f.scheduler.runtime.status.receive).toMatchObject({
    failures: 1,
    reason: 'network-unavailable',
    issueSince: 0,
    lastSuccessAt: null,
  });
  turns[2]!({ kind: 'unknown', receivedThrough: 0 });
  await flush();
  expect(h.f.scheduler.runtime.status.receive).toMatchObject({ failures: 2, nextAttemptAt: 3300 });
  await h.f.scheduler.dispose();
});
