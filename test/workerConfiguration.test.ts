// @vitest-environment node
import { expect, it, vi } from 'vitest';
import {
  createWorkerConfiguration,
  forwardWorkerConfiguration,
} from '../src/crdt/workerConfiguration';
const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
const tick = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
function source() {
  let value = false;
  const listeners = new Set<() => void>();
  return {
    listeners,
    read: () => value,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    set(v: boolean, notify = true) {
      value = v;
      if (notify) for (const fn of listeners) fn();
    },
  };
}
it('initializes once and updates only ordered bounded advisory booleans', () => {
  const root = new AbortController(),
    s = createWorkerConfiguration(root.signal);
  expect(() => s.value).toThrow();
  expect(() => s.update({ sequence: 1, membershipContinuation: true })).toThrow();
  s.initialize(false);
  s.update({ sequence: 1, membershipContinuation: true });
  expect(s.value).toBe(true);
  for (const input of [
    { sequence: 1, membershipContinuation: false },
    { sequence: 3, membershipContinuation: false },
    { sequence: 2, membershipContinuation: 'yes' },
    { sequence: 2, membershipContinuation: false, verified: true },
  ])
    expect(() => s.update(input)).toThrow();
  expect(s.value).toBe(true);
  expect(() => s.initialize(true)).toThrow();
  s.update({ sequence: 2, membershipContinuation: false });
  expect(s.value).toBe(false);
  root.abort();
  expect(() => s.value).toThrow();
});
it('does not invoke observation accessors or consume sequence after refusal', () => {
  const root = new AbortController(),
    s = createWorkerConfiguration(root.signal);
  s.initialize(false);
  let reads = 0;
  expect(() =>
    s.update({
      sequence: 1,
      get membershipContinuation() {
        reads++;
        return true;
      },
    }),
  ).toThrow();
  expect(reads).toBe(0);
  s.update({ sequence: 1, membershipContinuation: true });
  expect(s.value).toBe(true);
});
it('waits until the open was posted then resamples the latest source, including missed early changes', async () => {
  const root = new AbortController(),
    v = source(),
    sent: any[] = [],
    s = createWorkerConfiguration(root.signal);
  s.initialize(false);
  const p = forwardWorkerConfiguration({
    signal: root.signal,
    read: v.read,
    subscribe: v.subscribe,
    send: async (h) => {
      sent.push(h);
      s.update(h);
    },
    failed: vi.fn(),
  });
  v.set(true);
  await tick();
  expect(sent).toHaveLength(0);
  v.set(false, false);
  p.start();
  await p.ready;
  expect(sent).toEqual([{ sequence: 1, membershipContinuation: false }]);
  expect(s.value).toBe(false);
  expect(() => p.start()).toThrow();
  root.abort();
  expect(v.listeners.size).toBe(0);
});
it('coalesces ten thousand capability observations behind one outstanding request without polling', async () => {
  const root = new AbortController(),
    v = source(),
    held = gate(),
    sent: any[] = [],
    failed = vi.fn();
  const p = forwardWorkerConfiguration({
    signal: root.signal,
    read: v.read,
    subscribe: v.subscribe,
    send: async (h) => {
      sent.push(h);
      await held.promise;
    },
    failed,
  });
  p.start();
  await tick();
  for (let i = 0; i < 10000; i++) v.set(i % 2 === 1);
  await tick();
  expect(sent).toHaveLength(1);
  held.resolve();
  await p.ready;
  await tick();
  expect(sent).toEqual([
    { sequence: 1, membershipContinuation: false },
    { sequence: 2, membershipContinuation: true },
  ]);
  v.set(true);
  await tick();
  expect(sent).toHaveLength(2);
  expect(failed).not.toHaveBeenCalled();
  root.abort();
});
it('drops pending observations and unsubscribes immediately on root withdrawal', async () => {
  const root = new AbortController(),
    v = source(),
    held = gate(),
    sent: any[] = [],
    failed = vi.fn(),
    p = forwardWorkerConfiguration({
      signal: root.signal,
      read: v.read,
      subscribe: v.subscribe,
      send: async (h) => {
        sent.push(h);
        await held.promise;
      },
      failed,
    });
  p.start();
  await tick();
  v.set(true);
  root.abort();
  expect(v.listeners.size).toBe(0);
  await expect(p.ready).rejects.toThrow();
  held.resolve();
  await tick();
  v.set(false);
  await tick();
  expect(sent).toHaveLength(1);
  expect(failed).not.toHaveBeenCalled();
});
it('retires on delivery refusal without retrying or widening the capability payload', async () => {
  const root = new AbortController(),
    v = source(),
    failed = vi.fn(),
    send = vi.fn(async () => {
      throw Error('channel refused');
    }),
    p = forwardWorkerConfiguration({
      signal: root.signal,
      read: v.read,
      subscribe: v.subscribe,
      send,
      failed,
    });
  p.start();
  await expect(p.ready).rejects.toThrow();
  v.set(true);
  await tick();
  expect(send).toHaveBeenCalledOnce();
  expect(failed).toHaveBeenCalledOnce();
  expect(v.listeners.size).toBe(0);
});
it('does not leak a reentrantly withdrawn source subscription or let its cleanup affect native disposal', async () => {
  const root = new AbortController(),
    failed = vi.fn(),
    removed = vi.fn(() => {
      throw Error('observer only');
    });
  const p = forwardWorkerConfiguration({
    signal: root.signal,
    read: () => false,
    subscribe: () => {
      root.abort();
      return removed;
    },
    send: vi.fn(),
    failed,
  });
  await expect(p.ready).rejects.toThrow();
  expect(removed).toHaveBeenCalledOnce();
  expect(() => p.close()).not.toThrow();
  expect(failed).not.toHaveBeenCalled();
});
it('rejects invalid observation values before sending any data', async () => {
  const root = new AbortController(),
    send = vi.fn(),
    failed = vi.fn(),
    p = forwardWorkerConfiguration({
      signal: root.signal,
      read: (() => 'not-a-boolean') as any,
      send,
      failed,
    });
  p.start();
  await expect(p.ready).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
  expect(failed).toHaveBeenCalledOnce();
});
