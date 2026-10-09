import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  createDeliveryScheduler,
  driveDeliveryStep,
  type DriverGate,
  type DriverStep,
  type DriverOperations,
  type DriverClock,
} from '../src/crdt/accountDriver';
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
function fixture() {
  let now = 0,
    serial = 0,
    gate: DriverGate = 'ready',
    detached = 0,
    active = 0,
    maximum = 0;
  const controller = new AbortController(),
    timers = new Map<number, { at: number; run: () => void }>();
  const calls: { at: number; resolve: (r: DriverStep) => void; reject: (e: Error) => void }[] = [];
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
  const scheduler = createDeliveryScheduler({
    signal: controller.signal,
    gate: () => gate,
    clock,
    detach: () => detached++,
    step: () => {
      active++;
      maximum = Math.max(maximum, active);
      return new Promise<DriverStep>((resolve, reject) =>
        calls.push({
          at: now,
          resolve: (r) => {
            active--;
            resolve(r);
          },
          reject: (e) => {
            active--;
            reject(e);
          },
        }),
      );
    },
  });
  const tick = async (ms: number) => {
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
  };
  return {
    scheduler,
    controller,
    calls,
    timers,
    tick,
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
    setGate(g: DriverGate) {
      gate = g;
    },
    get gate() {
      return gate;
    },
  };
}
const answer = (kind: 'idle' | 'progress' | 'unknown'): DriverStep => ({
  kind,
  acceptedThrough: kind === 'progress' ? 1 : 0,
});
describe('owned delivery scheduling', () => {
  it('coalesces wake storms, keeps one pass, and does not lose an edit arriving during idle detection', async () => {
    const f = fixture();
    expect(Object.isFrozen(f.scheduler.status())).toBe(true);
    expect(Reflect.set(f.scheduler.status(), 'phase', 'blocked')).toBe(false);
    for (let i = 0; i < 100; i++) f.scheduler.wake();
    expect(f.timers.size).toBe(1);
    await f.tick(50);
    expect(f.calls).toHaveLength(1);
    for (let i = 0; i < 100; i++) f.scheduler.wake();
    await f.tick(1000);
    expect(f.calls).toHaveLength(1);
    f.calls[0]!.resolve(answer('idle'));
    await flush();
    await f.tick(0);
    expect(f.calls).toHaveLength(2);
    expect(f.maximum).toBe(1);
    f.calls[1]!.resolve(answer('idle'));
    await flush();
    expect(f.timers.size).toBe(0);
    await f.scheduler.dispose();
    const backlog = fixture();
    backlog.scheduler.wake(true);
    await backlog.tick(0);
    backlog.calls[0]!.resolve(answer('progress'));
    await flush();
    expect(backlog.scheduler.status().phase).toBe('working');
    await backlog.tick(0);
    backlog.calls[1]!.resolve(answer('idle'));
    await flush();
    expect(backlog.scheduler.status().phase).toBe('idle');
    await backlog.scheduler.dispose();
  });
  it('unknown backoff caps at 30 seconds and ordinary edits cannot accelerate it', async () => {
    const f = fixture();
    f.scheduler.wake(true);
    await f.tick(0);
    for (const [i, delay] of [1000, 2000, 4000, 8000, 16000, 30000, 30000].entries()) {
      f.calls[i]!.resolve(answer('unknown'));
      await flush();
      expect(f.scheduler.status().retryAt).toBe(f.now + delay);
      for (let n = 0; n < 40; n++) f.scheduler.wake();
      await f.tick(delay - 1);
      expect(f.calls).toHaveLength(i + 1);
      await f.tick(1);
      expect(f.calls).toHaveLength(i + 2);
    }
    f.calls.at(-1)!.resolve(answer('idle'));
    await flush();
    await f.scheduler.dispose();
  });
  it('offline and Local pressure cancel timers, and restore/manual retry expedite work', async () => {
    const f = fixture();
    f.scheduler.wake(true);
    await f.tick(0);
    f.calls[0]!.resolve(answer('unknown'));
    await flush();
    f.setGate('offline');
    f.scheduler.wake();
    expect(f.timers.size).toBe(0);
    await f.tick(60000);
    expect(f.calls).toHaveLength(1);
    f.setGate('ready');
    f.scheduler.wake(true);
    await f.tick(0);
    expect(f.calls).toHaveLength(2);
    f.calls[1]!.resolve(answer('unknown'));
    await flush();
    f.scheduler.wake(true);
    await f.tick(0);
    expect(f.calls).toHaveLength(3);
    f.setGate('local-storage');
    f.scheduler.wake();
    f.calls[2]!.resolve(answer('idle'));
    await flush();
    expect(f.timers.size).toBe(0);
    f.setGate('ready');
    f.scheduler.wake();
    await f.tick(50);
    expect(f.calls).toHaveLength(4);
    f.calls[3]!.resolve(answer('idle'));
    await flush();
    await f.scheduler.dispose();
  });
  it('permanent evidence and unexpected operation failures suppress automatic retries', async () => {
    for (const reason of ['closed', 'conflict', 'finalized', 'operation-failed'] as const) {
      const f = fixture();
      f.scheduler.wake(true);
      await f.tick(0);
      if (reason === 'operation-failed') f.calls[0]!.reject(Error('storage'));
      else f.calls[0]!.resolve({ kind: 'blocked', acceptedThrough: 0, reason });
      await flush();
      for (let i = 0; i < 30; i++) f.scheduler.wake();
      await f.tick(60000);
      expect(f.calls).toHaveLength(1);
      f.scheduler.wake(true);
      await f.tick(0);
      expect(f.calls).toHaveLength(2);
      f.calls[1]!.resolve({ kind: 'blocked', acceptedThrough: 0, reason });
      await flush();
      await f.scheduler.dispose();
    }
  });
  it('abort clears backoff immediately and drains unfinished work; observers cannot start work after close', async () => {
    const f = fixture();
    f.scheduler.wake(true);
    await f.tick(0);
    let drained = false;
    const closing = f.scheduler.dispose().then(() => (drained = true));
    await flush();
    expect(drained).toBe(false);
    expect(f.detached).toBe(1);
    f.scheduler.wake(true);
    await f.tick(60000);
    expect(f.calls).toHaveLength(1);
    f.calls[0]!.resolve(answer('unknown'));
    await closing;
    expect(f.timers.size).toBe(0);
    expect(f.scheduler.status().phase).toBe('closed');
    const g = fixture();
    g.scheduler.onStatus((s) => {
      if (s.phase === 'working') g.controller.abort();
    });
    g.scheduler.wake(true);
    await g.tick(0);
    expect(g.calls).toHaveLength(0);
    await g.scheduler.dispose();
    const h = fixture();
    h.scheduler.wake(true);
    await h.tick(0);
    h.calls[0]!.resolve(answer('unknown'));
    await flush();
    h.controller.abort();
    expect(h.timers.size).toBe(0);
    await h.scheduler.dispose();
  });
  it('200 generated deferred event histories preserve single ownership, bounded timers and the retry floor', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            op: fc.constantFrom(
              'wake',
              'manual',
              'tick',
              'offline',
              'online',
              'pause',
              'restore',
              'unknown',
              'idle',
              'progress',
              'close',
            ),
            ms: fc.integer({ min: 0, max: 35000 }),
          }),
          { minLength: 5, maxLength: 80 },
        ),
        async (commands) => {
          const f = fixture();
          let settled = 0,
            seen = 0,
            failures = 0,
            floor = 0,
            closed = false;
          f.scheduler.wake();
          for (const c of commands) {
            if (c.op === 'close') {
              closed = true;
              f.controller.abort();
            } else if (c.op === 'wake') f.scheduler.wake();
            else if (c.op === 'manual') {
              floor = f.now;
              f.scheduler.wake(true);
            } else if (c.op === 'offline' || c.op === 'pause') {
              f.setGate(c.op === 'offline' ? 'offline' : 'local-storage');
              f.scheduler.wake();
            } else if (c.op === 'online' || c.op === 'restore') {
              f.setGate('ready');
              floor = f.now;
              f.scheduler.wake(c.op === 'online');
            } else if (c.op === 'tick') await f.tick(c.ms);
            else if (settled < f.calls.length) {
              const result = c.op as 'unknown' | 'idle' | 'progress';
              f.calls[settled++]!.resolve(answer(result));
              if (!closed && f.gate === 'ready') {
                if (result === 'unknown') {
                  failures++;
                  floor =
                    f.now + [1000, 2000, 4000, 8000, 16000, 30000][Math.min(failures - 1, 5)]!;
                } else {
                  failures = 0;
                  floor = f.now;
                }
              }
              await flush();
            }
            await flush();
            expect(f.maximum).toBeLessThanOrEqual(1);
            expect(f.timers.size).toBeLessThanOrEqual(1);
            for (; seen < f.calls.length; seen++)
              expect(f.calls[seen]!.at).toBeGreaterThanOrEqual(floor);
            if (closed) expect(f.timers.size).toBe(0);
          }
          const closing = f.scheduler.dispose();
          while (settled < f.calls.length) f.calls[settled++]!.resolve(answer('idle'));
          await closing;
          expect(f.detached).toBe(1);
          expect(f.active).toBe(0);
        },
      ),
      { seed: 9122026, numRuns: 200 },
    );
  });
});
function ownedFixture(initial: 'empty' | 'envelope' | 'submission' | 'abandoned') {
  const calls: string[] = [],
    bytes = new Uint8Array([7, 8]);
  let envelopes = initial === 'envelope' || initial === 'submission' ? 1 : 0,
    submissions = initial === 'submission' ? 1 : 0,
    accepted = 0,
    attempts = initial === 'abandoned' ? 1 : envelopes;
  const ops: DriverOperations = {
    deliveryStatus: async () => ({
      state: 'ready',
      acceptedThrough: accepted,
      submissions: submissions ? [1] : [],
    }),
    spoolStatus: async () => ({ positions: envelopes ? [{ position: 1, persisted: true }] : [] }),
    prepareNextEnvelope: async () => {
      calls.push('seal');
      attempts++;
      envelopes++;
      return { position: 1, bytes: bytes.slice() };
    },
    prepareSubmission: async () => {
      calls.push('wrap');
      submissions++;
      return { kind: 'ready', bytes: bytes.slice() };
    },
    submitPending: async () => {
      calls.push('send');
      return { kind: 'unknown' };
    },
  };
  return {
    ops,
    calls,
    bytes,
    get attempts() {
      return attempts;
    },
    accept() {
      accepted = 1;
    },
  };
}
describe('owned delivery step', () => {
  it('resolves persisted wrappers before preparation and never reseals a persisted envelope on an unknown reply', async () => {
    for (const mode of ['empty', 'envelope', 'submission', 'abandoned'] as const) {
      const f = ownedFixture(mode);
      expect((await driveDeliveryStep(f.ops, 'token', () => 'ready')).kind).toBe('unknown');
      const attempts = f.attempts;
      await driveDeliveryStep(f.ops, 'token', () => 'ready');
      expect(f.attempts).toBe(attempts);
      expect(f.calls).toEqual(
        mode === 'submission'
          ? ['send', 'send']
          : mode === 'envelope'
            ? ['wrap', 'send', 'send']
            : ['seal', 'wrap', 'send', 'send'],
      );
      expect([...f.bytes]).toEqual([7, 8]);
    }
  });
  it('derives progress only from durable status and halts on owned publication evidence', async () => {
    const f = ownedFixture('submission');
    f.ops.submitPending = async () => ({ kind: 'accepted' });
    expect((await driveDeliveryStep(f.ops, 'token', () => 'ready')).kind).toBe('unknown');
    f.ops.submitPending = async () => {
      f.accept();
      return { kind: 'unknown' };
    };
    expect((await driveDeliveryStep(f.ops, 'token', () => 'ready')).kind).toBe('progress');
    for (const state of ['closed', 'conflict', 'finalized'] as const) {
      f.ops.deliveryStatus = async () => ({ state, acceptedThrough: 1, submissions: [2] });
      f.ops.submitPending = async () => {
        throw Error('must not send');
      };
      expect(await driveDeliveryStep(f.ops, 'token', () => 'ready')).toEqual({
        kind: 'blocked',
        acceptedThrough: 1,
        reason: state,
      });
    }
  });
});
