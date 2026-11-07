// @vitest-environment node
import { expect, it } from 'vitest';
import { createVerificationMemo } from '../src/crdt/verificationMemo';
import { inboundEntryMemoSlot } from '../src/crdt/inboundRecord';
const current = () => {};
type Memo = ReturnType<typeof createVerificationMemo>;
function check<T>(
  memo: Memo,
  slots: readonly string[],
  context: string,
  inputs: readonly Uint8Array[],
  verify: () => Promise<T>,
  guard = current,
): Promise<T> {
  const m = memo as Memo & {
    checkReceipt?: <V>(
      slots: readonly string[],
      context: string,
      inputs: readonly Uint8Array[],
      verify: () => Promise<V>,
      guard: () => void,
    ) => Promise<V>;
  };
  return m.checkReceipt
    ? m.checkReceipt(slots, context, inputs, verify, guard)
    : m.check(slots[0]!, context, inputs, verify, guard);
}
const size = (memo: Memo) => (memo as Memo & { ownedBytes?: () => number }).ownedBytes?.() ?? NaN;
const addresses = (first = 0, count = 2, seq = 1) =>
  Array.from({ length: count }, (_, i) => inboundEntryMemoSlot(seq, first + i));
it('all72contiguous extents address their complete ordered entries and reuse only that exact proof', async () => {
  const memo = createVerificationMemo(),
    input = new Uint8Array([1, 2]);
  let calls = 0;
  for (const seq of [1, 999])
    for (let first = 0; first < 8; first++)
      for (let count = 1; first + count <= 8; count++) {
        const slots = addresses(first, count, seq),
          verify = async () => {
            calls++;
            return { slots: [...slots] };
          };
        expect((await check(memo, slots, 'scope', [input], verify)).slots).toEqual(slots);
        expect((await check(memo, slots, 'scope', [input], verify)).slots).toEqual(slots);
      }
  expect(calls).toBe(72);
  memo.clear();
});
it('a different later entry is a miss even when the first address, exact bytes and context match', async () => {
  const memo = createVerificationMemo(),
    input = new Uint8Array([1]);
  let calls = 0;
  const verify = async () => ++calls;
  expect(await check(memo, addresses(), 'scope', [input], verify)).toBe(1);
  expect(
    await check(memo, [addresses()[0]!, inboundEntryMemoSlot(1, 7)], 'scope', [input], verify),
  ).toBe(2);
  memo.clear();
});
it('partial retention drops the whole owned receipt instead of leaving a first-entry alias', async () => {
  const memo = createVerificationMemo(),
    slots = addresses(),
    input = new Uint8Array([1]);
  let calls = 0;
  const verify = async () => ++calls;
  await check(memo, slots, 'scope', [input], verify);
  memo.retain(new Set([slots[0]!]));
  expect(await check(memo, slots, 'scope', [input], verify)).toBe(2);
  memo.retain(new Set(slots));
  expect(await check(memo, slots, 'scope', [input], verify)).toBe(2);
  memo.clear();
});
it('receipt and ordinary single-slot proofs have disjoint namespaces', async () => {
  const memo = createVerificationMemo(),
    slots = addresses(),
    input = new Uint8Array([1]);
  expect(await memo.check(slots[0]!, 'scope', [input], async () => 'single', current)).toBe(
    'single',
  );
  expect(await check(memo, slots, 'scope', [input], async () => 'receipt')).toBe('receipt');
  expect(await memo.check(slots[0]!, 'scope', [input], async () => 'wrong', current)).toBe(
    'single',
  );
  memo.clear();
});
it('captures the complete address before awaits and never adopts later caller mutation', async () => {
  const memo = createVerificationMemo(),
    slots = addresses(),
    input = new Uint8Array([1]);
  let release!: () => void,
    calls = 0;
  const pending = check(memo, slots, 'scope', [input], async () => {
    calls++;
    await new Promise<void>((r) => {
      release = r;
    });
    return 'first';
  });
  slots[1] = inboundEntryMemoSlot(1, 7);
  release();
  await pending;
  expect(
    await check(memo, slots, 'scope', [input], async () => {
      calls++;
      return 'second';
    }),
  ).toBe('second');
  expect(calls).toBe(2);
  memo.clear();
});
it('context and every original input byte remain part of receipt reuse', async () => {
  const memo = createVerificationMemo(),
    slots = addresses(),
    input = new Uint8Array([1, 2]);
  let calls = 0;
  const verify = async () => ++calls;
  await check(memo, slots, 'unmarked', [input], verify);
  expect(await check(memo, slots, 'floor1', [input], verify)).toBe(2);
  input[1] = 3;
  expect(await check(memo, slots, 'floor1', [input], verify)).toBe(3);
  memo.clear();
});
it('copies one physical value with internal shared buffers and keeps returned projections independent', async () => {
  const memo = createVerificationMemo(),
    slots = addresses(),
    input = new Uint8Array([1]);
  let calls = 0;
  const verify = async () => {
    calls++;
    const record = new Uint8Array([4, 5, 6]);
    return { record, views: [record.subarray(1), record.subarray(2)] };
  };
  const first = await check(memo, slots, 'scope', [input], verify);
  expect(first.views[0]!.buffer).toBe(first.record.buffer);
  first.record.fill(0);
  const second = await check(memo, slots, 'scope', [input], verify);
  expect([...second.record]).toEqual([4, 5, 6]);
  expect(second.views[0]!.buffer).toBe(second.record.buffer);
  expect(second.record.buffer).not.toBe(first.record.buffer);
  expect(calls).toBe(1);
  memo.clear();
});
it('reports each owned backing-buffer capacity once, including input copies, not view lengths', async () => {
  const memo = createVerificationMemo(),
    input = new Uint8Array(4),
    slots = addresses();
  await check(memo, slots, 'scope', [input], async () => {
    const record = new Uint8Array(128);
    return {
      record,
      views: [record.subarray(3, 4), record.subarray(8, 9)],
      other: new Uint8Array(7),
    };
  });
  expect(size(memo)).toBe(139);
  memo.retain(new Set(slots));
  expect(size(memo)).toBe(139);
  memo.retain(new Set([slots[0]!]));
  expect(size(memo)).toBe(0);
});
it('owner clear invalidates a pending receipt and erases returned verification plaintext', async () => {
  const memo = createVerificationMemo(),
    input = new Uint8Array([1]),
    plaintext = new Uint8Array([7, 8]);
  let release!: () => void;
  const pending = check(memo, addresses(), 'scope', [input], async () => {
    await new Promise<void>((r) => {
      release = r;
    });
    return { plaintext };
  });
  memo.clear();
  release();
  await expect(pending).rejects.toThrow('owner changed');
  expect([...plaintext]).toEqual([0, 0]);
  expect(size(memo)).toBe(0);
});
it('a current-owner refusal after verification wins and erases the uncached result', async () => {
  const memo = createVerificationMemo(),
    plaintext = new Uint8Array([7, 8]);
  let ready = false;
  await expect(
    check(
      memo,
      addresses(),
      'scope',
      [new Uint8Array([1])],
      async () => {
        ready = true;
        return { plaintext };
      },
      () => {
        if (ready) throw Error('closed');
      },
    ),
  ).rejects.toThrow('closed');
  expect([...plaintext]).toEqual([0, 0]);
  expect(size(memo)).toBe(0);
});
it('refuses empty, duplicate, non-string and over-eight addresses before verification', async () => {
  const memo = createVerificationMemo();
  let calls = 0;
  const verify = async () => ++calls;
  const sparse: string[] = [];
  sparse.length = 1;
  const mixed = ['a'];
  mixed.length = 2;
  for (const slots of [
    sparse,
    mixed,
    [],
    ['a', 'a'],
    [1],
    Array.from({ length: 9 }, (_, i) => String(i)),
  ])
    await expect(check(memo, slots as string[], 'scope', [], verify)).rejects.toThrow(
      'receipt memo',
    );
  expect(calls).toBe(0);
  memo.clear();
});
it('ordinary single-slot proofs are included in capacity and are disposed without changing retention', async () => {
  const memo = createVerificationMemo(),
    input = new Uint8Array(3);
  await memo.check('slot', 'scope', [input], async () => new Uint8Array(5), current);
  expect(size(memo)).toBe(8);
  memo.retain(new Set(['slot']));
  expect(size(memo)).toBe(8);
  memo.clear();
  expect(size(memo)).toBe(0);
});
