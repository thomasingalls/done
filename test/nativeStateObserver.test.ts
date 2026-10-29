// @vitest-environment node
import { expect, it, vi } from 'vitest';
import type { Page } from '@playwright/test';
import { waitForState } from '../scripts/storage-conformance/observe.mjs';
const page = (evaluate: (predicate: (arg: unknown) => unknown, arg: unknown) => Promise<unknown>) =>
  ({ evaluate }) as unknown as Page;
it('awaits false async results and observes again rather than crediting a Promise object', async () => {
  let count = 0;
  const target = page(async (predicate) => await predicate(undefined));
  const result = await waitForState(target, async () => ++count === 3, undefined, 1000);
  expect(result).toBe(true);
  expect(count).toBe(3);
});
it('observes metadata without requesting an animation frame or page timer', async () => {
  const target = page(async (predicate) => await predicate(undefined));
  const frame = vi.fn(() => {
    throw Error('Rendering must not drive storage observation');
  });
  Object.assign(target, { waitForFunction: frame });
  expect(await waitForState(target, () => true, undefined, 500)).toBe(true);
  expect(frame).not.toHaveBeenCalled();
});
it('an unresolved evaluation still respects the existing observation deadline', async () => {
  let release!: (v: boolean) => void;
  const target = page(() => new Promise<boolean>((r) => (release = r)));
  await expect(waitForState(target, () => true, undefined, 25)).rejects.toMatchObject({
    name: 'TimeoutError',
  });
  release(true);
});
it('false state never turns a timeout into evidence', async () => {
  const target = page(async () => false);
  await expect(waitForState(target, () => false, undefined, 25)).rejects.toMatchObject({
    name: 'TimeoutError',
  });
});
it('predicate failures retain their actual exception and do not retry as false', async () => {
  const failure = new Error('Actual native failure'),
    evaluate = vi.fn(async () => {
      throw failure;
    });
  await expect(waitForState(page(evaluate), () => true, undefined, 500)).rejects.toBe(failure);
  expect(evaluate).toHaveBeenCalledOnce();
});
it('invalid deadlines refuse before any page access', async () => {
  const evaluate = vi.fn(async () => true);
  for (const timeout of [0, -1, Infinity, NaN])
    await expect(waitForState(page(evaluate), () => true, undefined, timeout)).rejects.toThrow(
      'positive finite deadline',
    );
  expect(evaluate).not.toHaveBeenCalled();
});
