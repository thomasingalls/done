// @vitest-environment node
import { expect, it } from 'vitest';
import { createVerificationMemo } from '../src/crdt/verificationMemo';
it('isolates input/result buffers, context, owner invalidation and retained slots', async () => {
  const memo = createVerificationMemo();
  let calls = 0;
  const input = new Uint8Array([1, 2]),
    current = () => {};
  const check = async () => {
    calls++;
    return { bytes: input.slice() };
  };
  const read = (context = 'scope') => memo.check('slot', context, [input], check, current);
  (await read()).bytes.fill(0);
  expect([...(await read()).bytes]).toEqual([1, 2]);
  expect(calls).toBe(1);
  input[0] = 3;
  await read();
  expect(calls).toBe(2);
  await read('new predecessor');
  expect(calls).toBe(3);
  memo.retain(new Set());
  await read();
  expect(calls).toBe(4);
  await expect(
    memo.check('slot', 'scope', [input], check, () => {
      throw Error('closed');
    }),
  ).rejects.toThrow('closed');
  let release!: () => void;
  const work = memo.check(
    'pending',
    'scope',
    [input],
    async () => {
      await new Promise<void>((r) => {
        release = r;
      });
      return input.slice();
    },
    current,
  );
  memo.clear();
  release();
  await expect(work).rejects.toThrow('owner changed');
  await read();
  expect(calls).toBe(5);
});
