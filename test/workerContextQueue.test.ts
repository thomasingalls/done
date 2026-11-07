// @vitest-environment node
/** Scheduling/cancellation evidence only. Native authority and commit checks belong to the operation. */
import { expect, it, vi } from 'vitest';
import { createWorkerContextQueue } from '../src/crdt/workerContextQueue';
import type { OwnedReceiveQueue } from '../src/crdt/admissionQueue';
const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
it('cannot run a context change before the actual final queue is bound', () => {
  const root = new AbortController(),
    queue = createWorkerContextQueue(root.signal),
    operation = vi.fn();
  expect(() => queue.run(operation)).toThrow('not ready');
  expect(operation).not.toHaveBeenCalled();
  root.abort();
});
it('cannot replace the final queue after binding', async () => {
  const root = new AbortController(),
    queue = createWorkerContextQueue(root.signal),
    first: OwnedReceiveQueue = async (bytes, commit) => commit(bytes, () => {}),
    second = vi.fn();
  queue.bind(first);
  expect(() => queue.bind(second as OwnedReceiveQueue)).toThrow('already bound');
  expect(second).not.toHaveBeenCalled();
  expect(await queue.run(async () => 4)).toBe(4);
  root.abort();
});
it('keeps verification inside the actual reserved callback and publishes once after it completes', async () => {
  const root = new AbortController(),
    queue = createWorkerContextQueue(root.signal),
    entered = gate(),
    release = gate(),
    events: string[] = [];
  queue.bind(async (bytes, commit) => {
    expect([...bytes]).toEqual([1]);
    events.push('reserved');
    entered.resolve();
    await release.promise;
    const result = await commit(bytes, (updates) => {
      expect(updates).toEqual([]);
      events.push('publish');
    });
    events.push('acknowledged');
    return result;
  });
  const result = queue.run(async () => {
    events.push('original-check-and-commit');
    return 7;
  });
  await entered.promise;
  expect(events).toEqual(['reserved']);
  release.resolve();
  expect(await result).toBe(7);
  expect(events).toEqual(['reserved', 'original-check-and-commit', 'publish', 'acknowledged']);
  root.abort();
});
it('an interrupted queue cannot begin a stale original operation', async () => {
  const root = new AbortController(),
    queue = createWorkerContextQueue(root.signal),
    release = gate(),
    operation = vi.fn(async () => 7);
  queue.bind(async (bytes, commit) => {
    await release.promise;
    return commit(bytes, () => {});
  });
  const result = queue.run(operation);
  root.abort();
  release.resolve();
  await expect(result).rejects.toThrow('unavailable');
  expect(operation).not.toHaveBeenCalled();
});
it('interruption after original work cannot report success or publish a context', async () => {
  const root = new AbortController(),
    queue = createWorkerContextQueue(root.signal),
    publish = vi.fn();
  queue.bind(async (bytes, commit) => commit(bytes, publish));
  await expect(
    queue.run(async () => {
      root.abort();
      return 7;
    }),
  ).rejects.toThrow('unavailable');
  expect(publish).not.toHaveBeenCalled();
});
it('native refusals retain their identity and cannot acquire publication credit', async () => {
  const root = new AbortController(),
    queue = createWorkerContextQueue(root.signal),
    publish = vi.fn(),
    failure = Error('fresh authority changed');
  queue.bind(async (bytes, commit) => commit(bytes, publish));
  await expect(
    queue.run(async () => {
      throw failure;
    }),
  ).rejects.toBe(failure);
  expect(publish).not.toHaveBeenCalled();
  root.abort();
});
it('private original results stay inside the Worker without serialization or proof conversion', async () => {
  const root = new AbortController(),
    queue = createWorkerContextQueue(root.signal),
    brand = new WeakMap<object, number>(),
    result = { nativeCallback: () => 7 };
  brand.set(result, 3);
  queue.bind(async (bytes, commit) => commit(bytes, () => {}));
  const actual = await queue.run(async () => result);
  expect(actual).toBe(result);
  expect(brand.get(actual)).toBe(3);
  root.abort();
});
it('closed roots retain no usable queue and cannot be rebound', () => {
  const root = new AbortController();
  root.abort();
  const queue = createWorkerContextQueue(root.signal),
    actual = vi.fn();
  expect(() => queue.bind(actual as OwnedReceiveQueue)).toThrow('unavailable');
  expect(() => queue.run(async () => 3)).toThrow('unavailable');
  expect(actual).not.toHaveBeenCalled();
});
