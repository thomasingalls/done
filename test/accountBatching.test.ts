// @vitest-environment node
import { expect, it } from 'vitest';
import { createBatchWindow } from '../src/crdt/batchWindow';
import { accountBatchPolicy } from '../src/crdt/accountBatchPolicy';
import { createSyncScheduler, driveOutboundStep } from '../src/crdt/accountSyncDriver';
import type { DriverOperations } from '../src/crdt/accountDriver';
import { fixture, flush } from './account-sync/scheduler-fixture';

it('selects the measured policy by default and keeps named reference/publication-only overrides', () => {
  expect(accountBatchPolicy(undefined)).toEqual(accountBatchPolicy('coordinated-2000'));
  expect(accountBatchPolicy('')).toEqual(accountBatchPolicy('coordinated-2000'));
  expect(accountBatchPolicy('reference')).toEqual({});
  expect(accountBatchPolicy('publication-1000')).toEqual({
    publication: { quietMs: 300, maxMs: 1000 },
  });
  expect(accountBatchPolicy('coordinated-2000')).toEqual({
    publication: { quietMs: 300, maxMs: 2000 },
    localFlush: { quietMs: 300, maxMs: 2000 },
  });
  expect(() => accountBatchPolicy('1000')).toThrow();
});

it('closes quiet bursts, bounds continuous activity, and forgets a consumed window', () => {
  let now = 0;
  const b = createBatchWindow({ quietMs: 300, maxMs: 1000 }, () => now);
  b.note();
  now = 200;
  b.note();
  expect(b.due).toBe(500);
  now = 900;
  b.note();
  expect(b.due).toBe(1000);
  b.close();
  expect(b.due).toBe(900);
  now = 950;
  b.note();
  expect(b.due).toBe(900);
  b.clear();
  expect(b.due).toBeUndefined();
  now = 2000;
  b.note();
  expect(b.due).toBe(2300);
  expect(() => createBatchWindow({ quietMs: 300, maxMs: 200 }, () => now)).toThrow();
});

const batchedFixture = (maxMs: number) => {
  let persisted = false;
  const f = fixture((options) =>
    createSyncScheduler({
      ...options,
      publicationBatch: { quietMs: 300, maxMs },
      send: (beforeNewEnvelope) => {
        const due = persisted ? undefined : beforeNewEnvelope?.();
        return due === undefined
          ? options.send()
          : Promise.resolve({ kind: 'batching', due, acceptedThrough: 0 });
      },
    }),
  );
  return {
    ...f,
    persisted(value: boolean) {
      persisted = value;
    },
  };
};
const idleStart = async (f: ReturnType<typeof batchedFixture>) => {
  f.scheduler.wake('start');
  await f.tick(0);
  f.calls[0]!.finish('idle');
  await flush();
  await f.tick(0);
  f.calls[1]!.finish('idle');
  await flush();
};

it.each([1000, 2000])(
  'publishes uninterrupted typing by %i ms and starts a fresh window afterward',
  async (maxMs) => {
    const f = batchedFixture(maxMs);
    await idleStart(f);
    for (let t = 0; t < maxMs; t += 100) {
      f.scheduler.wake('local');
      expect(f.calls).toHaveLength(2);
      await f.tick(100);
    }
    expect(f.calls[2]!.at).toBe(maxMs);
    f.calls[2]!.finish('idle');
    await flush();
    f.scheduler.wake('local');
    await f.tick(299);
    expect(f.calls).toHaveLength(3);
    await f.tick(1);
    expect(f.calls[3]!.at).toBe(maxMs + 300);
    f.calls[3]!.finish('idle');
    await flush();
    await f.scheduler.dispose();
  },
);

it('typing and a hidden-page batch close neither shorten nor extend failed-send backoff', async () => {
  const f = batchedFixture(2000);
  await idleStart(f);
  f.scheduler.wake('local');
  await f.tick(300);
  f.persisted(true);
  f.calls[2]!.finish('unknown');
  await flush();
  await f.tick(0);
  f.calls[3]!.finish('idle');
  await flush();
  for (let i = 0; i < 9; i++) {
    await f.tick(100);
    f.scheduler.wake('local');
  }
  f.scheduler.wake('flush');
  expect(f.scheduler.runtime.status.send.nextAttemptAt).toBe(1300);
  await f.tick(99);
  expect(f.calls).toHaveLength(4);
  await f.tick(1);
  expect(f.calls[4]!.at).toBe(1300);
  f.calls[4]!.finish('progress', 1);
  await flush();
  await f.scheduler.dispose();
});

it('a lifecycle boundary closes a healthy pending batch, while lock cancels all work', async () => {
  const f = batchedFixture(2000);
  await idleStart(f);
  f.scheduler.wake('local');
  await f.tick(50);
  f.scheduler.wake('flush');
  await f.tick(0);
  expect(f.calls[2]!.at).toBe(50);
  f.calls[2]!.finish('idle');
  await flush();
  f.scheduler.wake('local');
  f.controller.abort();
  await f.tick(3000);
  expect(f.calls).toHaveLength(3);
  expect(f.timers.size).toBe(0);
  await f.scheduler.dispose();
});

it('rechecks a quiet deadline after asynchronous reads, but an already sealed envelope bypasses it', async () => {
  let now = 0,
    accepted = 0,
    persisted = false,
    release!: () => void;
  const b = createBatchWindow({ quietMs: 300, maxMs: 2000 }, () => now);
  b.note();
  now = 300;
  const pause = new Promise<void>((r) => {
    release = r;
  });
  const ops: DriverOperations = {
    deliveryStatus: async () => ({ state: 'ready', acceptedThrough: accepted, submissions: [] }),
    spoolStatus: async () => {
      await pause;
      return { positions: persisted ? [{ position: 1, persisted: true }] : [] };
    },
    prepareNextEnvelope: async () => {
      throw Error('must not allocate early or reseal');
    },
    prepareSubmission: async () => ({ kind: 'ready' }),
    submitPending: async () => {
      accepted = 1;
      return { kind: 'accepted' };
    },
  };
  const pending = driveOutboundStep(
    ops,
    'test',
    () => 'ready',
    () => b.due,
  );
  await flush();
  now = 450;
  b.note();
  release();
  expect(await pending).toEqual({ kind: 'batching', acceptedThrough: 0, due: 750 });
  persisted = true;
  expect(
    await driveOutboundStep(
      ops,
      'test',
      () => 'ready',
      () => {
        throw Error('must not postpone persisted bytes');
      },
    ),
  ).toEqual({ kind: 'progress', acceptedThrough: 1, acceptedNow: true });
});

it('manual send retry closes its batch immediately; receive retry leaves that batch alone', async () => {
  const f = batchedFixture(2000);
  await idleStart(f);
  f.scheduler.wake('local');
  await f.tick(50);
  f.scheduler.runtime.retry('receive');
  await f.tick(0);
  expect(f.calls[2]!.lane).toBe('receive');
  expect(f.scheduler.runtime.status.send.nextAttemptAt).toBe(300);
  f.calls[2]!.finish('idle');
  await flush();
  f.scheduler.runtime.retry('send');
  await f.tick(0);
  expect(f.calls[3]!).toMatchObject({ lane: 'send', at: 50 });
  f.calls[3]!.finish('idle');
  await flush();
  await f.scheduler.dispose();
});

const deadlineFixture = () =>
  fixture((options) =>
    createSyncScheduler({
      ...options,
      publicationBatch: { quietMs: 300, maxMs: 2000 },
      send: (beforeNewEnvelope) => {
        const due = beforeNewEnvelope?.();
        return due === undefined
          ? options.send()
          : Promise.resolve({ kind: 'batching' as const, due, acceptedThrough: 0 });
      },
    }),
  );

it.each([300, 500])(
  'keeps a publication deadline due when input at %i ms arrives during receiving',
  async (at) => {
    const f = deadlineFixture();
    await startDeadlineFixture(f);
    f.scheduler.wake('local');
    await f.tick(250);
    f.scheduler.runtime.retry('receive');
    await f.tick(0);
    expect(f.calls[2]!.lane).toBe('receive');
    await f.tick(at - 250);
    f.scheduler.wake('local');
    expect(f.scheduler.runtime.status.send.nextAttemptAt).toBe(300);
    f.calls[2]!.finish('idle');
    await flush();
    await f.tick(0);
    expect(f.calls[3]!).toMatchObject({ lane: 'send', at });
    f.calls[3]!.finish('idle');
    await flush();
    expect(f.maximum).toBe(1);
    await f.scheduler.dispose();
  },
);

const preludeFixture = () => {
  let hold = false;
  let release: (() => void) | undefined;
  const f = fixture((options) =>
    createSyncScheduler({
      ...options,
      publicationBatch: { quietMs: 300, maxMs: 2000 },
      send: async (beforeNewEnvelope) => {
        if (hold)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        const due = beforeNewEnvelope?.();
        return due === undefined
          ? options.send()
          : { kind: 'batching' as const, due, acceptedThrough: 0 };
      },
    }),
  );
  return Object.assign(f, {
    hold() {
      hold = true;
    },
    release() {
      hold = false;
      release!();
    },
  });
};
const startDeadlineFixture = async (f: ReturnType<typeof fixture>) => {
  f.scheduler.wake('start');
  await f.tick(0);
  f.calls[0]!.finish('idle');
  await flush();
  await f.tick(0);
  f.calls[1]!.finish('idle');
  await flush();
};

it('keeps an expired window through a send prelude and starts a fresh window after consumption', async () => {
  const f = preludeFixture();
  await startDeadlineFixture(f);
  f.hold();
  f.scheduler.wake('local');
  await f.tick(300);
  expect(f.calls).toHaveLength(2);
  await f.tick(200);
  f.scheduler.wake('local');
  f.release();
  await flush();
  expect(f.calls[2]!).toMatchObject({ lane: 'send', at: 500 });
  f.calls[2]!.finish('idle');
  await flush();
  f.scheduler.wake('local');
  expect(f.scheduler.runtime.status.send.nextAttemptAt).toBe(800);
  await f.tick(299);
  expect(f.calls).toHaveLength(3);
  await f.tick(1);
  expect(f.calls[3]!).toMatchObject({ lane: 'send', at: 800 });
  f.calls[3]!.finish('idle');
  await flush();
  expect(f.maximum).toBe(1);
  await f.scheduler.dispose();
});

it('continues collecting a publication window when later input precedes its deadline', async () => {
  const f = deadlineFixture();
  await startDeadlineFixture(f);
  f.scheduler.runtime.retry('receive');
  await f.tick(0);
  f.scheduler.wake('local');
  await f.tick(299);
  f.scheduler.wake('local');
  expect(f.scheduler.runtime.status.send.nextAttemptAt).toBe(599);
  f.calls[2]!.finish('idle');
  await flush();
  await f.tick(299);
  expect(f.calls).toHaveLength(3);
  await f.tick(1);
  expect(f.calls[3]!).toMatchObject({ lane: 'send', at: 599 });
  f.calls[3]!.finish('idle');
  await flush();
  await f.scheduler.dispose();
});

it('latching an expired send window leaves the failed receive clock untouched', async () => {
  const f = preludeFixture();
  await startDeadlineFixture(f);
  f.scheduler.runtime.retry('receive');
  await f.tick(0);
  f.calls[2]!.finish('unknown');
  await flush();
  f.hold();
  f.scheduler.wake('local');
  await f.tick(300);
  await f.tick(200);
  f.scheduler.wake('local');
  f.release();
  await flush();
  expect(f.calls[3]!).toMatchObject({ lane: 'send', at: 500 });
  expect(f.scheduler.runtime.status.receive.nextAttemptAt).toBe(1000);
  f.calls[3]!.finish('idle');
  await flush();
  await f.tick(50);
  expect(f.calls[4]!).toMatchObject({ lane: 'send', at: 550 });
  f.calls[4]!.finish('idle');
  await flush();
  await f.tick(449);
  expect(f.calls).toHaveLength(5);
  await f.tick(1);
  expect(f.calls[5]!).toMatchObject({ lane: 'receive', at: 1000 });
  f.calls[5]!.finish('idle');
  await flush();
  await f.scheduler.dispose();
});

it('cancels a latched window while draining the active receive without sending', async () => {
  const f = deadlineFixture();
  await startDeadlineFixture(f);
  f.scheduler.wake('local');
  await f.tick(250);
  f.scheduler.runtime.retry('receive');
  await f.tick(0);
  await f.tick(250);
  f.scheduler.wake('local');
  f.controller.abort();
  f.calls[2]!.finish('idle');
  await flush();
  await f.tick(3000);
  expect(f.calls).toHaveLength(3);
  expect(f.timers.size).toBe(0);
  expect(f.detached).toBe(1);
  await f.scheduler.dispose();
});

it('does not latch the separate local-flush window when publication becomes overdue', async () => {
  const f = deadlineFixture();
  await startDeadlineFixture(f);
  const local = createBatchWindow({ quietMs: 300, maxMs: 2000 }, () => f.now);
  f.scheduler.wake('local');
  local.note();
  await f.tick(250);
  f.scheduler.runtime.retry('receive');
  await f.tick(0);
  await f.tick(250);
  f.scheduler.wake('local');
  local.note();
  expect(f.scheduler.runtime.status.send.nextAttemptAt).toBe(300);
  expect(local.due).toBe(800);
  f.calls[2]!.finish('idle');
  await flush();
  await f.tick(0);
  f.calls[3]!.finish('idle');
  await flush();
  await f.scheduler.dispose();
});
