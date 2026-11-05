// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createReceiveRepairPolling } from '../src/crdt/receiveRepairPolling';
import { createSyncScheduler } from '../src/crdt/accountSyncDriver';
import { createAutomaticLocalRetention } from '../src/crdt/automaticLocalRetention';
import { InboundError } from '../src/crdt/accountInbound';

afterEach(() => vi.useRealTimers());

function fixture() {
  let at = 100;
  const run = createReceiveRepairPolling(() => at),
    context = {};
  const read = (kind: string, quiet = true, publisher = 'peer') =>
    run.completed(run.capture(context, publisher, quiet), kind);
  return {
    run,
    context,
    read,
    time: (next: number) => {
      at = next;
    },
  };
}

it('retains the first-missed-hint delay, then repairs verified quiet discovery for exactly 30s', () => {
  const f = fixture();
  f.read('received');
  expect(f.run.interval(18000)).toBe(18000);
  f.read('received');
  expect(f.run.interval(18000)).toBe(1000);
  expect(f.run.interval(500)).toBe(500);
  f.time(30099);
  expect(f.run.interval(5000)).toBe(1000);
  f.time(30100);
  expect(f.run.interval(5000)).toBe(5000);
});

it('rearmer evidence is fresh quiet discovery, not empty reads or productive backlog drain', () => {
  const f = fixture();
  f.read('empty');
  f.read('received');
  f.time(20000);
  f.read('received', false);
  f.read('empty');
  f.time(30100);
  expect(f.run.interval(19000)).toBe(19000);
  f.read('received');
  f.time(60100);
  expect(f.run.interval(19000)).toBe(19000);
});

it('rearms for a further missed hint and remembers successful hot reads without arming on them', () => {
  const f = fixture();
  f.read('empty');
  f.run.contentHint();
  f.read('received', false);
  expect(f.run.interval(16000)).toBe(16000);
  f.read('received');
  f.time(20000);
  f.read('received');
  f.time(49999);
  expect(f.run.interval(16000)).toBe(1000);
  f.time(50000);
  expect(f.run.interval(16000)).toBe(16000);
});

it('normal hinted writing does not arm repair polling', () => {
  const f = fixture();
  f.read('empty');
  for (let i = 0; i < 100; i++) {
    f.run.contentHint();
    f.read('received');
    f.read('empty');
    expect(f.run.interval(17000)).toBe(17000);
  }
});

it('does not absorb a hint during I/O into the completed read', () => {
  const f = fixture();
  f.read('empty');
  const token = f.run.capture(f.context, 'peer', true);
  f.run.contentHint();
  f.run.completed(token, 'received');
  expect(f.run.interval(19000)).toBe(19000);
  f.read('received'); // A hint intervened since that request started too.
  expect(f.run.interval(19000)).toBe(19000);
  f.read('received');
  expect(f.run.interval(19000)).toBe(1000);
});

it('requires a prior verified read of this publisher and single-use completion evidence', () => {
  const f = fixture();
  f.read('empty', true, 'a');
  const token = f.run.capture(f.context, 'b', true);
  f.run.completed(token, 'received');
  f.run.completed(token, 'received');
  f.run.completed({}, 'received');
  expect(f.run.interval(15000)).toBe(15000);
  f.read('received', true, 'b');
  expect(f.run.interval(15000)).toBe(1000);
});

it('refused, expired and cancelled reads cannot supply missed-hint evidence', () => {
  for (const kind of ['unknown', 'expired', 'rejected', 'duplicate', 'busy', 'range-size']) {
    const f = fixture();
    f.read(kind);
    f.read('received');
    expect(f.run.interval(15000)).toBe(15000);
  }
});

it('bounds publisher history without letting an evicted read stand in for another peer', () => {
  const f = fixture();
  for (let i = 0; i < 129; i++) f.read('empty', true, `peer-${i}`);
  f.read('received', true, 'peer-0');
  expect(f.run.interval(15000)).toBe(15000);
  f.read('received', true, 'peer-128');
  expect(f.run.interval(15000)).toBe(1000);
});

it('clears clocks, windows and outstanding tokens on rollback and nonfinite clocks', () => {
  for (const bad of [99, NaN, Infinity, -Infinity]) {
    const f = fixture();
    f.read('empty');
    f.read('received');
    const held = f.run.capture(f.context, 'peer', true);
    f.time(bad);
    expect(f.run.interval(15000)).toBe(15000);
    f.time(100);
    f.run.completed(held, 'received');
    f.read('received');
    expect(f.run.interval(15000)).toBe(15000);
  }
});

it('does not transfer evidence across authority contexts, owner instances or invalidation', () => {
  const f = fixture();
  f.read('empty');
  f.read('received');
  const held = f.run.capture(f.context, 'peer', true);
  f.run.capture({}, 'peer', true);
  f.run.completed(held, 'received');
  expect(f.run.interval(15000)).toBe(15000);
  f.read('empty');
  f.read('received');
  f.run.invalidate();
  f.run.completed(held, 'received');
  expect(f.run.interval(15000)).toBe(15000);
  expect(createReceiveRepairPolling().interval(15000)).toBe(15000);
});

it('erases on close and creates no independent timers or late reactivation', () => {
  vi.useFakeTimers();
  const f = fixture();
  f.read('empty');
  const token = f.run.capture(f.context, 'peer', true);
  f.run.close();
  f.run.completed(token, 'received');
  f.run.contentHint();
  f.run.invalidate();
  f.read('received');
  f.read('received');
  expect(f.run.interval(15000)).toBe(15000);
  expect(f.run.capture(f.context, 'peer', true)).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});

it('uses the existing scheduler for post-drain repair and leaves hinted idle traffic unchanged', async () => {
  vi.useFakeTimers();
  for (const hinted of [false, true]) {
    vi.setSystemTime(0);
    const repair = createReceiveRepairPolling(),
      context = {},
      controller = new AbortController();
    const reads: number[] = [];
    let received = 0;
    const s = createSyncScheduler({
      signal: controller.signal,
      gate: () => 'ready',
      detach: () => repair.close(),
      receiveInterval: () => repair.interval(15000),
      send: async () => ({ kind: 'idle', acceptedThrough: 0 }),
      receive: async () => {
        reads.push(Date.now());
        const kind = reads.length === 2 ? 'received' : 'empty';
        if (hinted && kind === 'received') repair.contentHint();
        repair.completed(repair.capture(context, 'peer', true), kind);
        if (kind === 'received') received++;
        return { kind: kind === 'received' ? 'progress' : 'idle', receivedThrough: received };
      },
    });
    try {
      s.wake('start');
      await vi.advanceTimersByTimeAsync(18000);
      // The zero-delay lane handoff is clamped to a timer tick by fake timers.
      const elapsed = reads.map((at) => at - reads[0]!);
      expect(elapsed).toEqual(hinted ? [0, 15000, 15001] : [0, 15000, 15001, 16001, 17001]);
    } finally {
      await s.dispose();
    }
    expect(vi.getTimerCount()).toBe(0);
  }
});

it('repair polling cannot override failed-operation backoff or an integrity halt', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const repair = createReceiveRepairPolling(),
    context = {},
    controller = new AbortController();
  repair.completed(repair.capture(context, 'peer', true), 'empty');
  repair.completed(repair.capture(context, 'peer', true), 'received');
  const reads: number[] = [];
  const s = createSyncScheduler({
    signal: controller.signal,
    gate: () => 'ready',
    detach: () => repair.close(),
    receiveInterval: () => repair.interval(15000),
    send: async () => ({ kind: 'idle', acceptedThrough: 0 }),
    receive: async () => {
      reads.push(Date.now());
      if (reads.length >= 4) throw new InboundError('record');
      return { kind: 'unknown', receivedThrough: 0 };
    },
  });
  try {
    s.wake('start');
    await vi.advanceTimersByTimeAsync(30000);
    expect(reads.map((at) => at - reads[0]!)).toEqual([0, 1000, 3000, 7000]);
    expect(s.runtime.status.receive).toMatchObject({ phase: 'blocked', reason: 'integrity' });
  } finally {
    await s.dispose();
  }
});

it('keeps maintenance behind input quiet and active receive readiness during repair polling', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const repair = createReceiveRepairPolling(),
    context = {},
    controller = new AbortController();
  repair.completed(repair.capture(context, 'peer', true), 'empty');
  repair.completed(repair.capture(context, 'peer', true), 'received');
  let draining = true;
  const attempts: number[] = [],
    reads: number[] = [];
  const maintenance = createAutomaticLocalRetention({
    signal: controller.signal,
    observe: () => ({ ready: !draining, hint: { revision: 1, records: 2048 } }),
    remove: async () => {
      attempts.push(Date.now());
      return { kind: 'removed' };
    },
  });
  const s = createSyncScheduler({
    signal: controller.signal,
    gate: () => 'ready',
    detach: () => repair.close(),
    receiveInterval: () => repair.interval(15000),
    send: async () => ({ kind: 'idle', acceptedThrough: 0 }),
    receive: async () => {
      reads.push(Date.now());
      return { kind: 'idle', receivedThrough: 0 };
    },
  });
  try {
    s.wake('start');
    maintenance.wake();
    await vi.advanceTimersByTimeAsync(15000);
    expect(attempts).toEqual([]);
    draining = false;
    maintenance.refresh();
    maintenance.wake(); // Local input still imposes the original ten-second quiet period.
    await vi.advanceTimersByTimeAsync(9999);
    expect(attempts).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(attempts).toEqual([25000]);
    expect(reads.length).toBeGreaterThan(20);
  } finally {
    maintenance.dispose();
    await s.dispose();
  }
  expect(vi.getTimerCount()).toBe(0);
});
