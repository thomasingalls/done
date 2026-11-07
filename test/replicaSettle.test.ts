// @vitest-environment node
import { expect, it } from 'vitest';
import { settle } from './replicas';

const cascadeAtResume = async (advance: () => Promise<void>): Promise<number> => {
  let completed = 0;
  const repair = () => {
    completed++;
    if (completed < 64) queueMicrotask(repair);
  };
  queueMicrotask(repair);
  await advance();
  return completed;
};

it('replica settling drains the complete recursive repair cascade before the next operation', async () => {
  expect(await cascadeAtResume(settle)).toBe(64);
});

it('the one-microtask omission control cannot satisfy the replica settling boundary', async () => {
  expect(await cascadeAtResume(() => Promise.resolve())).toBeLessThan(64);
  await settle();
});
