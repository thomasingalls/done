// @vitest-environment node
import { expect, it } from 'vitest';
import { createCpuBudget } from '../src/crdt/cpuBudget';
import { createVerifiedRecords, sameRecordsCooperatively } from '../src/crdt/verifiedRecords';
import type { OpenedRecord } from '../src/crdt/contentRecord';
const row = (size = 200000): OpenedRecord => ({
  kind: 'update',
  seq: 1,
  gen: 1,
  bytes: new Uint8Array(size).fill(7),
});
it('yields at the budget and rechecks cancellation after the task boundary', async () => {
  let now = 0,
    live = true,
    yields = 0;
  const budget = createCpuBudget(
    () => {
      if (!live) throw Error('closed');
    },
    () => now,
    async () => {
      yields++;
      live = false;
    },
  );
  expect(budget()).toBeUndefined();
  now = 9;
  await expect(budget()).rejects.toThrow('closed');
  expect(yields).toBe(1);
});
it('compares every byte including differences across chunk boundaries', async () => {
  for (const index of [0, 65535, 65536, 199999]) {
    const a = row(),
      b = row();
    let checkpoints = 0;
    expect(
      await sameRecordsCooperatively([a], [b], () => {
        checkpoints++;
        return Promise.resolve();
      }),
    ).toBe(true);
    expect(checkpoints).toBeGreaterThan(3);
    b.bytes[index] = b.bytes[index]! ^ 1;
    expect(await sameRecordsCooperatively([a], [b], () => Promise.resolve())).toBe(false);
  }
});
it('invalidation during a yielded exact match cannot install or return a stale view', async () => {
  const view = createVerifiedRecords<number>({ ownResults: true }),
    records = [row()],
    token = {};
  await view.verify(
    records,
    token,
    async () => 1,
    () => {},
  );
  let cut = false;
  await expect(
    view.verify(
      records,
      token,
      async () => 1,
      () => {},
      undefined,
      () => {
        if (!cut) {
          cut = true;
          view.clear();
        }
        return Promise.resolve();
      },
    ),
  ).rejects.toThrow('invalidated');
  expect(view.matches(records)).toBe(false);
  expect(records[0]!.bytes[0]).toBe(7);
});
