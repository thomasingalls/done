// @vitest-environment node
import { expect, it } from 'vitest';
import fc from 'fast-check';
import { fixture, flush } from './account-sync/scheduler-fixture';
import {
  createSyncScheduler,
  driveOutboundStep,
  type SyncLane,
} from '../src/crdt/accountSyncDriver';
import type { DriverGate, DriverOperations } from '../src/crdt/accountDriver';

it('alternates ready lanes, keeps independent idle deadlines and wakes an idle sender', async () => {
  const f = fixture();
  f.scheduler.wake('start');
  await f.tick(0);
  expect(f.calls.map((c) => c.lane)).toEqual(['send']);
  f.calls[0]!.finish('progress', 1);
  await flush();
  await f.tick(0);
  expect(f.calls.map((c) => c.lane)).toEqual(['send', 'receive']);
  f.calls[1]!.finish('idle');
  await flush();
  await f.tick(50);
  f.calls[2]!.finish('idle', 1);
  await flush();
  expect([...f.timers.values()].map((t) => t.at)).toEqual([5000]);
  f.scheduler.wake('local');
  await f.tick(50);
  expect(f.calls[3]!.lane).toBe('send');
  f.calls[3]!.finish('idle', 1);
  await flush();
  await f.tick(4900);
  expect(f.calls[4]!.lane).toBe('receive');
  f.calls[4]!.finish('idle');
  await flush();
  expect(f.maximum).toBe(1);
  await f.scheduler.dispose();
});
it('retains local wakes during send, but cannot accelerate unknown backoff or clear a halt', async () => {
  const f = fixture();
  f.scheduler.wake('start');
  await f.tick(0);
  f.scheduler.wake('local');
  f.calls[0]!.finish('idle');
  await flush();
  await f.tick(0);
  f.calls[1]!.finish('idle');
  await flush();
  await f.tick(50);
  expect(f.calls[2]!.lane).toBe('send');
  f.calls[2]!.finish('unknown');
  await flush();
  for (let i = 0; i < 20; i++) f.scheduler.wake('local');
  await f.tick(999);
  expect(f.calls.length).toBe(3);
  await f.tick(1);
  expect(f.calls[3]!.lane).toBe('send');
  f.setGate('offline');
  f.scheduler.wake('gate');
  f.calls[3]!.finish('error');
  await flush();
  f.setGate('ready');
  f.scheduler.wake('online');
  await f.tick(0);
  expect(f.calls[4]!.lane).toBe('receive');
  f.calls[4]!.finish('idle');
  await flush();
  expect(f.scheduler.runtime.status.send.reason).toBe('operation-failed');
  f.scheduler.runtime.retry('send');
  await f.tick(0);
  expect(f.calls[5]!.lane).toBe('send');
  f.calls[5]!.finish('idle');
  await flush();
  await f.scheduler.dispose();
});
it('observer pause before dispatch retains the startup deadline; observer close drains without dispatch', async () => {
  for (const action of ['pause', 'close']) {
    const f = fixture();
    let done = false;
    f.scheduler.runtime.onStatus((s) => {
      if (!done && s.send.phase === 'working') {
        done = true;
        if (action === 'pause') {
          f.setGate('local-storage');
          f.scheduler.wake('gate');
        } else f.controller.abort();
      }
    });
    f.scheduler.wake('start');
    await f.tick(0);
    expect(f.calls.length).toBe(0);
    if (action === 'pause') {
      f.setGate('ready');
      f.scheduler.wake('gate');
      await f.tick(0);
      expect(f.calls.length).toBe(1);
      f.calls[0]!.finish('idle');
      await flush();
    }
    await f.scheduler.dispose();
    expect(f.detached).toBe(1);
    expect(f.timers.size).toBe(0);
  }
});
it('close waits for active work and cannot start the due opposite lane', async () => {
  const f = fixture();
  f.scheduler.wake('start');
  await f.tick(0);
  let closed = false;
  const closing = f.scheduler.dispose().then(() => (closed = true));
  await flush();
  expect(closed).toBe(false);
  expect(f.timers.size).toBe(0);
  f.calls[0]!.finish('progress', 1);
  await closing;
  await f.tick(10000);
  expect(f.calls.length).toBe(1);
  expect(f.scheduler.runtime.status.send.acceptedThrough).toBe(0);
});
it('outbound progress comes only from durable decisions and pending exact submissions bypass all sealing', async () => {
  let gate: DriverGate = 'ready',
    accepted = 0;
  const events: string[] = [];
  const ops: DriverOperations = {
    deliveryStatus: async () => ({ state: 'ready', acceptedThrough: accepted, submissions: [1] }),
    spoolStatus: async () => {
      throw Error('must not allocate');
    },
    prepareNextEnvelope: async () => {
      throw Error('must not seal');
    },
    prepareSubmission: async () => {
      throw Error('must not sign');
    },
    submitPending: async (token) => {
      events.push(token);
      return { kind: 'accepted' };
    },
  };
  expect(await driveOutboundStep(ops, 'token', () => gate)).toEqual({
    kind: 'unknown',
    acceptedThrough: 0,
  });
  gate = 'offline';
  expect((await driveOutboundStep(ops, 'token', () => gate)).kind).toBe('paused');
  expect(events.length).toBe(1);
  gate = 'ready';
  ops.submitPending = async () => {
    accepted = 1;
    return { kind: 'unknown' };
  };
  expect(await driveOutboundStep(ops, 'token', () => gate)).toEqual({
    kind: 'progress',
    acceptedThrough: 1,
  });
});

it('400 generated deferred histories agree with an independent two-lane event model', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(
        fc.record({
          action: fc.constantFrom(
            'tick',
            'finish',
            'local',
            'online',
            'offline',
            'pressure',
            'resume',
            'retrySend',
            'retryReceive',
            'close',
          ),
          ms: fc.integer({ min: 0, max: 6000 }),
          result: fc.constantFrom('idle', 'progress', 'unknown', 'paused', 'blocked', 'error'),
        }),
        { minLength: 20, maxLength: 65 },
      ),
      async (actions) => {
        const f = fixture();
        type Name = SyncLane;
        const m = {
          time: 0,
          ready: true,
          closed: false,
          last: 'receive' as Name,
          active: undefined as Name | undefined,
          log: [] as { lane: Name; at: number }[],
          lanes: {
            send: {
              at: 0 as number | undefined,
              fail: 0,
              pos: 0,
              halt: false,
              dirty: false,
              fast: false,
            },
            receive: {
              at: 0 as number | undefined,
              fail: 0,
              pos: 0,
              halt: false,
              dirty: false,
              fast: false,
            },
          },
        };
        const names: Name[] = ['send', 'receive'];
        const advance = (ms: number) => {
          const end = m.time + ms;
          if (!m.closed && m.ready && !m.active) {
            const available = names.filter((n) => !m.lanes[n].halt && m.lanes[n].at !== undefined);
            const next = Math.min(...available.map((n) => m.lanes[n].at!));
            if (next <= end) {
              m.time = Math.max(m.time, next);
              const due = available.filter((n) => m.lanes[n].at! <= m.time),
                name = due.find((n) => n !== m.last) ?? due[0]!;
              m.active = name;
              m.last = name;
              const l = m.lanes[name];
              l.at = undefined;
              l.dirty = l.fast = false;
              m.log.push({ lane: name, at: m.time });
            }
          }
          m.time = end;
        };
        f.scheduler.wake('start');
        advance(0);
        await f.tick(0);
        for (const a of actions) {
          if (a.action === 'tick') {
            advance(a.ms);
            await f.tick(a.ms);
          } else if (a.action === 'finish' && m.active) {
            const n = m.active,
              l = m.lanes[n],
              pos = l.pos + (a.result === 'progress' ? 1 : 0);
            f.calls.at(-1)!.finish(a.result, pos);
            if (!m.closed) {
              l.pos = pos;
              if (a.result === 'blocked' || a.result === 'error') {
                l.halt = true;
                l.at = undefined;
                l.fast = l.dirty = false;
              } else if (a.result === 'paused') {
                l.at = m.time + (l.fast ? 0 : 50);
                l.fast = false;
              } else {
                l.fail = a.result === 'unknown' ? Math.min(6, l.fail + 1) : 0;
                const wait =
                  a.result === 'unknown'
                    ? Math.min(30000, 1000 * 2 ** (l.fail - 1))
                    : a.result === 'progress'
                      ? 50
                      : n === 'receive'
                        ? 5000
                        : undefined;
                l.at = l.fast
                  ? m.time
                  : wait !== undefined
                    ? m.time + wait
                    : l.dirty
                      ? m.time + 50
                      : undefined;
                l.fast = l.dirty = false;
              }
            }
            m.active = undefined;
            await flush();
          } else if (a.action === 'close') {
            m.closed = true;
            for (const n of names) m.lanes[n].at = undefined;
            f.controller.abort();
            await flush();
          } else if (!m.closed) {
            if (['offline', 'pressure', 'resume', 'online'].includes(a.action)) {
              m.ready = ['resume', 'online'].includes(a.action);
              f.setGate(
                a.action === 'offline'
                  ? 'offline'
                  : a.action === 'pressure'
                    ? 'local-storage'
                    : 'ready',
              );
            }
            if (a.action === 'local') {
              const l = m.lanes.send;
              l.dirty = true;
              if (!l.halt && m.active !== 'send' && l.at === undefined) l.at = m.time + 50;
              f.scheduler.wake('local');
            } else if (a.action === 'online' || a.action.startsWith('retry')) {
              const target =
                a.action === 'retrySend'
                  ? 'send'
                  : a.action === 'retryReceive'
                    ? 'receive'
                    : undefined;
              for (const n of names) {
                if (target && target !== n) continue;
                const l = m.lanes[n];
                if (target) l.halt = false;
                if (!l.halt) {
                  if (m.active === n) l.fast = true;
                  else l.at = m.time;
                }
              }
              if (target) f.scheduler.runtime.retry(target);
              else f.scheduler.wake('online');
            } else f.scheduler.wake('gate');
            await flush();
          }
          expect(f.calls.map(({ lane, at }) => ({ lane, at }))).toEqual(m.log);
          expect(f.maximum).toBeLessThanOrEqual(1);
          expect(f.timers.size).toBeLessThanOrEqual(1);
          for (const n of names)
            expect(f.scheduler.runtime.status[n].failures).toBe(m.lanes[n].fail);
        }
        const done = f.scheduler.dispose();
        if (m.active) {
          f.calls.at(-1)!.finish('idle', m.lanes[m.active].pos);
        }
        await done;
      },
    ),
    { seed: 9112061, numRuns: 400, endOnFailure: true },
  );
});

it('durable send progress expedites an idle receiver; unchanged progress leaves its poll deadline alone', async () => {
  const f = fixture();
  f.scheduler.wake('start');
  await f.tick(0);
  f.calls[0]!.finish('idle');
  await flush();
  await f.tick(0);
  f.calls[1]!.finish('idle');
  await flush();
  f.scheduler.wake('local');
  await f.tick(50);
  f.calls[2]!.finish('progress', 1);
  await flush();
  await f.tick(0);
  expect(f.calls[3]!.lane).toBe('receive');
  expect(f.calls[3]!.at).toBe(50);
  f.calls[3]!.finish('idle', 1);
  await flush();
  await f.tick(50);
  f.calls[4]!.finish('idle', 1);
  await flush();
  expect(f.scheduler.runtime.status.receive.nextAttemptAt).toBe(5050);
  await f.scheduler.dispose();
});
it.each(['unknown', 'blocked'] as const)(
  'send progress preserves a receiver %s backoff or halt',
  async (kind) => {
    const f = fixture();
    f.scheduler.wake('start');
    await f.tick(0);
    f.calls[0]!.finish('idle');
    await flush();
    await f.tick(0);
    f.calls[1]!.finish(kind);
    await flush();
    const deadline = f.scheduler.runtime.status.receive.nextAttemptAt;
    f.scheduler.wake('local');
    await f.tick(50);
    f.calls[2]!.finish('progress', 1);
    await flush();
    expect(f.scheduler.runtime.status.receive.nextAttemptAt).toBe(deadline);
    await f.tick(0);
    expect(f.calls.length).toBe(3);
    await f.scheduler.dispose();
  },
);

it('generated receive expiry streaks stay retryable across gates and local wakes, then recover without user action', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 12 }),
      fc.constantFrom('offline', 'local-storage'),
      fc.constantFrom('idle', 'progress'),
      async (count, gate, recovered) => {
        const f = fixture();
        f.scheduler.wake('start');
        await f.tick(0);
        f.calls.at(-1)!.finish('idle');
        await flush();
        await f.tick(0);
        for (let i = 0; i < count; i++) {
          expect(f.calls.at(-1)!.lane).toBe('receive');
          f.calls.at(-1)!.finish('expired');
          await flush();
          const delay = [1000, 2000, 4000, 8000, 16000, 30000][Math.min(i, 5)]!;
          const deadline = f.now + delay;
          expect(f.scheduler.runtime.status.receive).toMatchObject({
            phase: 'retrying',
            failures: Math.min(i + 1, 6),
            reason: 'request-expired',
            nextAttemptAt: deadline,
            receivedThrough: 0,
          });
          expect(f.scheduler.runtime.status.send.reason).toBeNull();
          f.setGate(gate);
          f.scheduler.wake('gate');
          expect(f.scheduler.runtime.status.receive.reason).toBe(
            gate === 'local-storage' ? 'local-storage' : 'request-expired',
          );
          expect(f.scheduler.runtime.status.receive.nextAttemptAt).toBeNull();
          f.setGate('ready');
          f.scheduler.wake('gate');
          for (let n = 0; n < 20; n++) f.scheduler.wake('local');
          await f.tick(50);
          expect(f.calls.at(-1)!.lane).toBe('send');
          f.calls.at(-1)!.finish('idle');
          await flush();
          expect(f.scheduler.runtime.status.receive.nextAttemptAt).toBe(deadline);
          expect(f.scheduler.runtime.status.receive.reason).toBe('request-expired');
          await f.tick(delay - 51);
          expect(f.calls.filter((c) => c.lane === 'receive')).toHaveLength(i + 1);
          await f.tick(1);
          expect(f.calls.filter((c) => c.lane === 'receive')).toHaveLength(i + 2);
          expect(f.calls.at(-1)!.at).toBe(deadline);
        }
        f.calls.at(-1)!.finish(recovered, recovered === 'progress' ? 1 : 0);
        await flush();
        expect(f.scheduler.runtime.status.receive).toMatchObject({ reason: null, failures: 0 });
        expect(f.maximum).toBe(1);
        await f.scheduler.dispose();
        expect(f.scheduler.runtime.status.receive).toMatchObject({ phase: 'closed', reason: null });
        expect(f.timers.size).toBe(0);
      },
    ),
    { seed: 1209052, numRuns: 80 },
  );
});

it('outbound size errors remain terminal observations across automatic wakes', async () => {
  const { EnvelopeSizeError } = await import('../account-protocol/envelope');
  let calls = 0;
  const f = fixture((options) =>
    createSyncScheduler({
      ...options,
      receive: async () => ({ kind: 'idle', receivedThrough: 0 }),
      send: async () => {
        calls++;
        throw new EnvelopeSizeError();
      },
    }),
  );
  f.scheduler.wake('start');
  await f.tick(0);
  expect(f.scheduler.runtime.status.send.reason).toBe('envelope-size');
  await flush();
  f.setGate('offline');
  f.scheduler.wake('gate');
  f.setGate('ready');
  f.scheduler.wake('online');
  f.scheduler.wake('local');
  await f.tick(0);
  expect(calls).toBe(1);
  f.scheduler.runtime.retry('send');
  await f.tick(0);
  expect(calls).toBe(2);
  await f.scheduler.dispose();
});
