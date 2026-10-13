// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { afterReceivedHandoffs, HistoryReceivePending } from '../src/crdt/historyReceiveFence';
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
it('does not enter history while a previously started handoff is draining', async () => {
  const held = deferred(),
    operation = vi.fn(async () => 'history');
  const work = afterReceivedHandoffs(() => held.promise, operation);
  await Promise.resolve();
  expect(operation).not.toHaveBeenCalled();
  held.resolve();
  expect(await work).toBe('history');
  expect(operation).toHaveBeenCalledTimes(1);
});
it('drains again if a receive wins the gap before the serialized pre-effect check', async () => {
  const held = deferred();
  let checks = 0;
  const drain = vi.fn(() => (++checks === 1 ? Promise.resolve() : held.promise));
  const operation = vi.fn(async () => {
    if (checks === 1) throw new HistoryReceivePending();
    return 'after receive';
  });
  const work = afterReceivedHandoffs(drain, operation);
  await vi.waitFor(() => expect(drain).toHaveBeenCalledTimes(2));
  expect(operation).toHaveBeenCalledTimes(1);
  held.resolve();
  expect(await work).toBe('after receive');
});
it('bounds pre-effect retries without treating starvation as success', async () => {
  const failure = new HistoryReceivePending();
  const drain = vi.fn(async () => {}),
    operation = vi.fn(async () => {
      throw failure;
    });
  await expect(afterReceivedHandoffs(drain, operation)).rejects.toBe(failure);
  expect(operation).toHaveBeenCalledTimes(3);
  expect(drain).toHaveBeenCalledTimes(3);
});
for (const boundary of ['drain', 'operation'] as const)
  it(`does not retry or swallow an authority/storage failure at ${boundary}`, async () => {
    const failure = Error('fresh check refused');
    const drain = vi.fn(async () => {
      if (boundary === 'drain') throw failure;
    });
    const operation = vi.fn(async () => {
      throw failure;
    });
    await expect(afterReceivedHandoffs(drain, operation)).rejects.toBe(failure);
    expect(drain).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledTimes(boundary === 'drain' ? 0 : 1);
  });
