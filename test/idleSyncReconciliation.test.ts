// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createSyncScheduler, idleReceiveInterval } from '../src/crdt/accountSyncDriver';
import { fixture, flush } from './account-sync/scheduler-fixture';

afterEach(() => vi.restoreAllMocks());

async function idle(healthy = true, jitter = 0.999999) {
  vi.spyOn(Math, 'random').mockReturnValue(jitter);
  const f = fixture((options) =>
    createSyncScheduler({ ...options, receiveInterval: () => idleReceiveInterval(healthy) }),
  );
  f.scheduler.wake('start');
  await f.tick(0);
  f.calls[0]!.finish('idle');
  await flush();
  await f.tick(0);
  f.calls[1]!.finish('idle');
  await flush();
  return f;
}

it.each([0, 0.999999])(
  'discovers accepted work after a lost last hint within30s at jitter %s, without maintenance or new input',
  async (jitter) => {
    const f = await idle(true, jitter);
    // Server acceptance happens just after the receiver becomes idle. No remote/local wake occurs.
    await f.tick(20000);
    expect(f.calls[2]?.lane).toBe('receive');
    expect(f.calls[2]!.at).toBeLessThan(30000);
    f.calls[2]!.finish('idle', 1);
    await flush();
    expect(f.scheduler.runtime.status.receive.receivedThrough).toBe(1);
    expect(f.maximum).toBe(1);
    await f.scheduler.dispose();
  },
);

it('bounds a quiescent healthy receiver to four extra passes per minute with no send work', async () => {
  const f = await idle(true, 0);
  for (let n = 0; n < 4; n++) {
    await f.tick(15000);
    expect(f.calls.at(-1)?.lane).toBe('receive');
    f.calls.at(-1)!.finish('idle');
    await flush();
  }
  expect(f.calls.filter((c) => c.lane === 'receive')).toHaveLength(5); // Initial + four repairs.
  expect(f.calls.filter((c) => c.lane === 'send')).toHaveLength(1);
  expect(f.timers.size).toBe(1);
  expect(f.maximum).toBe(1);
  await f.scheduler.dispose();
});

it('still discovers immediately when the content hint arrives', async () => {
  const f = await idle();
  f.scheduler.wake('remote');
  await f.tick(0);
  expect(f.calls[2]?.lane).toBe('receive');
  expect(f.calls[2]!.at).toBe(0);
  f.calls[2]!.finish('idle', 1);
  await flush();
  expect(f.scheduler.runtime.status.receive.receivedThrough).toBe(1);
  await f.scheduler.dispose();
});

it('retains the existing five-second repair when notifications are unavailable', async () => {
  const f = await idle(false);
  await f.tick(4999);
  expect(f.calls).toHaveLength(2);
  await f.tick(1);
  expect(f.calls[2]?.lane).toBe('receive');
  f.calls[2]!.finish('idle');
  await flush();
  await f.scheduler.dispose();
});

it('does not let the shorter idle interval or repeated hints accelerate a failed receive retry', async () => {
  const f = await idle();
  await f.tick(20000);
  f.calls[2]!.finish('unknown');
  await flush();
  const due = f.scheduler.runtime.status.receive.nextAttemptAt!;
  for (let n = 0; n < 20; n++) f.scheduler.wake('remote');
  await f.tick(due - f.now - 1);
  expect(f.calls).toHaveLength(3);
  await f.tick(1);
  expect(f.calls[3]?.lane).toBe('receive');
  f.calls[3]!.finish('idle', 1);
  await flush();
  expect(f.scheduler.runtime.status.receive.failures).toBe(0);
  await f.scheduler.dispose();
});

it.each(['offline', 'local-storage', 'sign-in-required'] as const)(
  'does not run idle reconciliation through the %s gate',
  async (gate) => {
    const f = await idle();
    f.setGate(gate);
    f.scheduler.wake('gate');
    await f.tick(60000);
    expect(f.calls).toHaveLength(2);
    expect(f.scheduler.runtime.status.receive.nextAttemptAt).toBeNull();
    await f.scheduler.dispose();
  },
);

it('cannot turn a retained conflict into an automatic receive retry', async () => {
  const f = await idle();
  await f.tick(20000);
  f.calls[2]!.finish('blocked');
  await flush();
  f.scheduler.wake('remote');
  await f.tick(60000);
  expect(f.calls).toHaveLength(3);
  expect(f.scheduler.runtime.status.receive).toMatchObject({
    phase: 'blocked',
    reason: 'conflict',
    nextAttemptAt: null,
  });
  await f.scheduler.dispose();
});
