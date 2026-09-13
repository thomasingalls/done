// @vitest-environment node
import { expect, it } from 'vitest';
import fc from 'fast-check';
import {
  createReceiveScheduler,
  driveReceiveStep,
  type ReceiveStep,
  type ReceiveDriverOperations,
} from '../src/crdt/accountReceiveDriver';
import type { DriverClock, DriverGate } from '../src/crdt/accountDriver';
const flush = async () => {
  for (let n = 0; n < 20; n++) await Promise.resolve();
};
function fixture() {
  let now = 0,
    serial = 0,
    gate: DriverGate = 'ready',
    active = 0,
    maximum = 0,
    detached = 0;
  const controller = new AbortController(),
    timers = new Map<number, { at: number; run: () => void }>();
  const calls: { at: number; resolve: (r: ReceiveStep) => void; reject: () => void }[] = [];
  const clock: DriverClock = {
    now: () => now,
    set(run, delay) {
      timers.set(++serial, { at: now + delay, run });
      return serial;
    },
    clear(id) {
      timers.delete(id as number);
    },
  };
  const scheduler = createReceiveScheduler({
    signal: controller.signal,
    gate: () => gate,
    clock,
    detach: () => {
      detached++;
    },
    step: () => {
      active++;
      maximum = Math.max(maximum, active);
      return new Promise<ReceiveStep>((yes, no) => {
        calls.push({
          at: now,
          resolve: (r) => {
            active--;
            yes(r);
          },
          reject: () => {
            active--;
            no(Error('fixture storage failure'));
          },
        });
      });
    },
  });
  return {
    scheduler,
    controller,
    calls,
    timers,
    setGate(value: DriverGate) {
      gate = value;
    },
    get gate() {
      return gate;
    },
    get now() {
      return now;
    },
    get maximum() {
      return maximum;
    },
    get active() {
      return active;
    },
    get detached() {
      return detached;
    },
    async tick(ms: number) {
      const target = now + ms;
      let budget = 100;
      for (;;) {
        const first = [...timers].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!first || first[1].at > target) break;
        if (--budget < 0) throw Error('Timer spin');
        now = first[1].at;
        timers.delete(first[0]);
        first[1].run();
        await flush();
      }
      now = target;
      await flush();
    },
  };
}
const result = (
  kind: 'idle' | 'progress' | 'unknown' | 'expired' | 'paused',
  position = 0,
): ReceiveStep => ({
  kind,
  receivedThrough: position,
});
it('polls five seconds after empty, yields 50ms between pages, and coalesces wakes including reentrant observers', async () => {
  const f = fixture();
  f.scheduler.wake('start');
  await f.tick(0);
  f.calls[0]!.resolve(result('idle'));
  await flush();
  for (let n = 0; n < 100; n++) f.scheduler.wake();
  await f.tick(4999);
  expect(f.calls).toHaveLength(1);
  await f.tick(1);
  expect(f.calls).toHaveLength(2);
  f.calls[1]!.resolve(result('progress', 1));
  await flush();
  await f.tick(49);
  expect(f.calls).toHaveLength(2);
  await f.tick(1);
  expect(f.calls).toHaveLength(3);
  f.calls[2]!.resolve(result('idle', 1));
  await flush();
  let once = false;
  f.scheduler.onStatus((s) => {
    if (s.phase === 'idle' && !once) {
      once = true;
      f.scheduler.wake('retry');
    }
  });
  f.scheduler.wake('retry');
  expect(f.timers.size).toBe(1);
  await f.tick(0);
  f.calls[3]!.resolve(result('idle', 1));
  await flush();
  expect(f.timers.size).toBe(1);
  expect(f.maximum).toBe(1);
  await f.scheduler.dispose();
  expect(f.timers.size).toBe(0);
});
it('caps unknown backoff, preserves its floor through Local pauses, and allows only explicit expedite', async () => {
  const f = fixture();
  f.scheduler.wake('start');
  await f.tick(0);
  for (const [i, delay] of [1000, 2000, 4000, 8000, 16000, 30000, 30000].entries()) {
    f.calls[i]!.resolve(result('unknown'));
    await flush();
    expect(f.scheduler.status().nextAttemptAt).toBe(f.now + delay);
    f.setGate('local-storage');
    f.scheduler.wake();
    f.setGate('ready');
    f.scheduler.wake();
    for (let j = 0; j < 100; j++) f.scheduler.wake();
    await f.tick(delay - 1);
    expect(f.calls).toHaveLength(i + 1);
    await f.tick(1);
    expect(f.calls).toHaveLength(i + 2);
  }
  f.calls.at(-1)!.resolve(result('unknown'));
  await flush();
  f.scheduler.wake('online');
  await f.tick(0);
  expect(f.calls).toHaveLength(9);
  f.calls.at(-1)!.resolve(result('idle'));
  await flush();
  await f.scheduler.dispose();
});
it('offline and pressure pause timers without deleting a permanent halt, including failures while paused', async () => {
  for (const paused of ['offline', 'local-storage'] as const)
    for (const failure of ['error', 'conflict', 'inbound-size', 'response-too-large'] as const) {
      const f = fixture();
      f.scheduler.wake('start');
      await f.tick(0);
      f.setGate(paused);
      f.scheduler.wake();
      if (failure === 'error') f.calls[0]!.reject();
      else f.calls[0]!.resolve({ kind: 'blocked', receivedThrough: 0, reason: failure });
      await flush();
      expect(f.timers.size).toBe(0);
      f.setGate('ready');
      f.scheduler.wake('online');
      f.scheduler.wake();
      await f.tick(60000);
      expect(f.calls).toHaveLength(1);
      expect(f.scheduler.status().reason).toBe(failure === 'error' ? 'operation-failed' : failure);
      f.scheduler.wake('retry');
      await f.tick(0);
      expect(f.calls).toHaveLength(2);
      f.calls[1]!.resolve(result('idle'));
      await flush();
      await f.scheduler.dispose();
    }
});
it('close drains its pass and suppresses late notifications; synchronous observer closure prevents dispatch', async () => {
  const f = fixture();
  f.scheduler.wake('start');
  await f.tick(0);
  let drained = false;
  const closing = f.scheduler.dispose().then(() => {
    drained = true;
  });
  await flush();
  expect(drained).toBe(false);
  f.scheduler.wake('retry');
  await f.tick(60000);
  expect(f.calls).toHaveLength(1);
  f.calls[0]!.resolve(result('progress', 1));
  await closing;
  expect(f.scheduler.status().receivedThrough).toBe(0);
  expect(f.scheduler.status().phase).toBe('closed');
  expect(f.detached).toBe(1);
  expect(f.timers.size).toBe(0);
  for (const action of ['close', 'offline'] as const) {
    const g = fixture();
    g.scheduler.onStatus((s) => {
      if (s.phase === 'working') {
        if (action === 'close') g.controller.abort();
        else {
          g.setGate('offline');
          g.scheduler.wake();
        }
      }
    });
    g.scheduler.wake('start');
    await g.tick(0);
    expect(g.calls).toHaveLength(0);
    await g.scheduler.dispose();
  }
});
it('a gate transition during an unfinished pass cannot overlap work or lose polling after resume', async () => {
  const f = fixture();
  f.scheduler.wake('start');
  await f.tick(0);
  for (let i = 0; i < 100; i++) f.scheduler.wake('online');
  await f.tick(20000);
  expect(f.calls).toHaveLength(1);
  f.setGate('offline');
  f.scheduler.wake();
  f.calls[0]!.resolve(result('idle'));
  await flush();
  expect(f.timers.size).toBe(0);
  await f.tick(60000);
  f.setGate('ready');
  f.scheduler.wake('online');
  await f.tick(0);
  expect(f.calls).toHaveLength(2);
  f.calls[1]!.resolve(result('idle'));
  await flush();
  expect(f.timers.size).toBe(1);
  await f.scheduler.dispose();
});
it('400 generated deferred schedules obey an independent timer/deadline and halt oracle', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(
        fc.record({
          op: fc.constantFrom(
            'tick',
            'wake',
            'retry',
            'online',
            'offline',
            'pause',
            'restore',
            'idle',
            'unknown',
            'paused',
            'progress',
            'error',
            'conflict',
            'close',
          ),
          ms: fc.integer({ min: 0, max: 35000 }),
        }),
        { minLength: 5, maxLength: 90 },
      ),
      async (commands) => {
        const f = fixture();
        let closed = false,
          halted = false,
          urgent = false,
          gate: DriverGate = 'ready',
          active = false,
          cursor = 0,
          failures = 0,
          due: number | null = 0,
          settled = 0,
          seen = 0;
        f.scheduler.wake('start');
        for (const c of commands) {
          if (c.op === 'tick') {
            // The independent oracle predicts whether precisely one deferred invocation can start.
            const expected =
              !closed &&
              !halted &&
              gate === 'ready' &&
              !active &&
              due !== null &&
              due <= f.now + c.ms;
            const at = due === null ? 0 : Math.max(f.now, due);
            await f.tick(c.ms);
            expect(f.calls.length - seen).toBe(expected ? 1 : 0);
            if (expected) {
              expect(f.calls.at(-1)!.at).toBe(at);
              active = true;
              due = null;
              seen++;
            }
          } else if (c.op === 'close') {
            closed = true;
            f.controller.abort();
          } else if (['wake', 'retry', 'online', 'offline', 'pause', 'restore'].includes(c.op)) {
            if (c.op === 'offline') gate = 'offline';
            if (c.op === 'pause') gate = 'local-storage';
            if (c.op === 'online' || c.op === 'restore') gate = 'ready';
            f.setGate(gate);
            if (!closed && (c.op === 'retry' || (c.op === 'online' && !halted))) {
              if (c.op === 'retry') halted = false;
              if (active) urgent = true;
              else due = f.now;
            }
            f.scheduler.wake(c.op === 'retry' ? 'retry' : c.op === 'online' ? 'online' : 'gate');
          } else if (active) {
            active = false;
            if (c.op === 'error') f.calls[settled++]!.reject();
            else if (c.op === 'conflict')
              f.calls[settled++]!.resolve({
                kind: 'blocked',
                receivedThrough: cursor,
                reason: 'conflict',
              });
            else {
              if (c.op === 'progress') cursor++;
              f.calls[settled++]!.resolve(
                result(c.op as 'idle' | 'progress' | 'unknown' | 'paused', cursor),
              );
            }
            if (!closed) {
              if (c.op === 'error' || c.op === 'conflict') {
                halted = true;
                due = null;
                urgent = false;
              } else {
                failures =
                  c.op === 'paused' ? failures : c.op === 'unknown' ? Math.min(failures + 1, 6) : 0;
                due =
                  f.now +
                  (urgent
                    ? 0
                    : c.op === 'unknown'
                      ? [1000, 2000, 4000, 8000, 16000, 30000][failures - 1]!
                      : c.op === 'idle'
                        ? 5000
                        : 50);
                urgent = false;
              }
            }
            await flush();
          }
          expect(f.maximum).toBeLessThanOrEqual(1);
          expect(f.timers.size).toBeLessThanOrEqual(1);
          expect(f.timers.size).toBe(
            !closed && !halted && gate === 'ready' && !active && due !== null ? 1 : 0,
          );
          if (closed) expect(f.scheduler.status().phase).toBe('closed');
        }
        const closing = f.scheduler.dispose();
        if (active) f.calls[settled]!.resolve(result('idle'));
        await closing;
        expect(f.active).toBe(0);
        expect(f.detached).toBe(1);
      },
    ),
    { seed: 9112051, numRuns: 400 },
  );
});
it('uses durable progress only and treats a verified empty result as polling idle', async () => {
  let position = 0,
    state: 'ready' | 'conflict' = 'ready',
    response = 'received',
    sent = 0;
  const ops: ReceiveDriverOperations = {
    receiveStatus: async () => ({ state, receivedThrough: position }),
    receiveNext: async () => {
      sent++;
      return { kind: response };
    },
  };
  expect((await driveReceiveStep(ops, 'token', () => 'ready')).kind).toBe('unknown');
  response = 'empty';
  expect((await driveReceiveStep(ops, 'token', () => 'ready')).kind).toBe('idle');
  ops.receiveNext = async () => {
    position++;
    return { kind: 'unknown' };
  };
  expect((await driveReceiveStep(ops, 'token', () => 'ready')).kind).toBe('progress');
  state = 'conflict';
  expect((await driveReceiveStep(ops, 'token', () => 'ready')).kind).toBe('blocked');
  expect(sent).toBe(2);
  state = 'ready';
  expect((await driveReceiveStep(ops, 'token', () => 'offline')).kind).toBe('paused');
  ops.receiveNext = async () => {
    position--;
    return { kind: 'empty' };
  };
  await expect(driveReceiveStep(ops, 'token', () => 'ready')).rejects.toThrow('regressed');
});

it('resumes after reentrant Local pressure interrupts startup before the owned step begins', async () => {
  const f = fixture();
  let once = false;
  f.scheduler.onStatus((s) => {
    if (s.phase === 'working' && !once) {
      once = true;
      f.setGate('local-storage');
      f.scheduler.wake();
    }
  });
  f.scheduler.wake('start');
  await f.tick(0);
  expect(f.calls).toHaveLength(0);
  expect(f.timers.size).toBe(0);
  f.setGate('ready');
  f.scheduler.wake();
  await f.tick(0);
  expect(f.calls).toHaveLength(1);
  f.calls[0]!.resolve(result('idle'));
  await flush();
  await f.scheduler.dispose();
});

it('100 generated observer-pause durations resume the unstarted pass through an ordinary gate wake', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 0, max: 60000 }),
      fc.constantFrom('offline', 'local-storage'),
      async (delay, paused) => {
        const f = fixture();
        let once = false;
        f.scheduler.onStatus((s) => {
          if (s.phase === 'working' && !once) {
            once = true;
            f.setGate(paused as DriverGate);
            f.scheduler.wake();
          }
        });
        f.scheduler.wake('start');
        await f.tick(delay);
        expect(f.calls).toHaveLength(0);
        f.setGate('ready');
        f.scheduler.wake();
        await f.tick(0);
        expect(f.calls).toHaveLength(1);
        expect(f.calls[0]!.at).toBe(delay);
        f.calls[0]!.resolve(result('idle'));
        await flush();
        await f.scheduler.dispose();
      },
    ),
    { seed: 9112053, numRuns: 100 },
  );
});

it('a pass skipped for readiness neither claims a verified end nor resets the unknown streak', async () => {
  const f = fixture();
  f.scheduler.wake('start');
  await f.tick(0);
  f.calls[0]!.resolve(result('unknown'));
  await flush();
  await f.tick(1000);
  f.calls[1]!.resolve({ kind: 'paused', receivedThrough: 0 });
  await flush();
  expect(f.scheduler.status().phase).toBe('working');
  expect(f.scheduler.status().failures).toBe(1);
  await f.tick(50);
  f.calls[2]!.resolve(result('unknown'));
  await flush();
  expect(f.scheduler.status().nextAttemptAt).toBe(f.now + 2000);
  await f.scheduler.dispose();
  let calls = 0;
  const ops: ReceiveDriverOperations = {
    receiveStatus: async () => ({ state: 'ready', receivedThrough: 0 }),
    receiveNext: async () => {
      calls++;
      return { kind: 'unknown' };
    },
  };
  expect((await driveReceiveStep(ops, 'token', () => 'local-storage')).kind).toBe('paused');
  expect(calls).toBe(0);
});

it('generated expiry streaks remain visible, obey capped deadlines through pauses, and recover automatically', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 12 }),
      fc.constantFrom('offline', 'local-storage'),
      fc.constantFrom('idle', 'progress'),
      async (count, gate, recovered) => {
        const f = fixture();
        f.scheduler.wake('start');
        await f.tick(0);
        for (let i = 0; i < count; i++) {
          f.calls.at(-1)!.resolve(result('expired'));
          await flush();
          const delay = [1000, 2000, 4000, 8000, 16000, 30000][Math.min(i, 5)]!;
          const deadline = f.now + delay;
          expect(f.scheduler.status()).toMatchObject({
            phase: 'retrying',
            failures: Math.min(i + 1, 6),
            reason: 'request-expired',
            nextAttemptAt: deadline,
            receivedThrough: 0,
          });
          f.setGate(gate);
          f.scheduler.wake();
          expect(f.scheduler.status().reason).toBe(
            gate === 'local-storage' ? 'local-storage' : 'request-expired',
          );
          expect(f.scheduler.status().nextAttemptAt).toBeNull();
          f.setGate('ready');
          for (let n = 0; n < 20; n++) f.scheduler.wake();
          expect(f.scheduler.status().reason).toBe('request-expired');
          await f.tick(delay - 1);
          expect(f.calls).toHaveLength(i + 1);
          await f.tick(1);
          expect(f.calls).toHaveLength(i + 2);
          expect(f.calls.at(-1)!.at).toBe(deadline);
        }
        f.calls.at(-1)!.resolve(result(recovered, recovered === 'progress' ? 1 : 0));
        await flush();
        expect(f.scheduler.status()).toMatchObject({ reason: null, failures: 0 });
        expect(f.maximum).toBe(1);
        await f.scheduler.dispose();
        expect(f.scheduler.status()).toMatchObject({ phase: 'closed', reason: null });
        expect(f.timers.size).toBe(0);
      },
    ),
    { seed: 1209051, numRuns: 80 },
  );
});

it('classifies explicit expiry without giving it authority over durable progress, conflict or the Local gate', async () => {
  for (const mode of ['expired', 'progress', 'conflict', 'paused'] as const) {
    let after = false;
    const ops: ReceiveDriverOperations = {
      receiveStatus: async () => ({
        state: after && mode === 'conflict' ? 'conflict' : 'ready',
        receivedThrough: after && mode === 'progress' ? 1 : 0,
      }),
      receiveNext: async () => {
        after = true;
        return { kind: 'expired' };
      },
    };
    const step = await driveReceiveStep(ops, 'token', () =>
      after && mode === 'paused' ? 'local-storage' : 'ready',
    );
    expect(step.kind).toBe(mode === 'conflict' ? 'blocked' : mode);
    expect(step.receivedThrough).toBe(mode === 'progress' ? 1 : 0);
  }
});

it('terminal size observations retain only a closed reason and the authenticated durable cursor', async () => {
  for (const reason of ['inbound-size', 'response-too-large', 'arbitrary writing from network']) {
    const step = await driveReceiveStep(
      {
        receiveStatus: async () => ({ state: 'ready', receivedThrough: 7 }),
        receiveNext: async () => ({ kind: 'rejected', reason, receivedThrough: 999 }),
      },
      'token',
      () => 'ready',
    );
    expect(step).toEqual({
      kind: 'blocked',
      receivedThrough: 7,
      reason:
        reason === 'inbound-size' || reason === 'response-too-large' ? reason : 'operation-failed',
    });
  }
});
