// @vitest-environment node
import { expect, it } from 'vitest';
import fc from 'fast-check';
import { createVerifiedRecords, eraseVerified, copyRecords } from '../src/crdt/verifiedRecords';
import type { OpenedRecord } from '../src/crdt/contentRecord';
const current = () => {};
const rows = (): OpenedRecord[] => [
  { kind: 'update', gen: 1, seq: 1, bytes: new Uint8Array([1, 2, 3]) },
];
it('projects detached readback without copying unrelated retained history', async () => {
  const cache = createVerifiedRecords<{ status: { through: number }; history: Uint8Array }>();
  const input = rows();
  await cache.verify(
    input,
    {},
    async () => ({ status: { through: 7 }, history: new Uint8Array(65536) }),
    current,
  );
  const clone = globalThis.structuredClone;
  const seen: unknown[] = [];
  globalThis.structuredClone = ((v: unknown) => {
    seen.push(v);
    return clone(v);
  }) as typeof clone;
  try {
    const result = cache.read(input, (v) => v.status);
    result.through = 99;
    expect(cache.read(input, (v) => v.status)).toEqual({ through: 7 });
    expect(seen).toEqual([{ through: 7 }, { through: 7 }]);
    const hit = cache.readIfMatches(input, (v) => v.status)!;
    hit.value.through = 101;
    expect(cache.readIfMatches(input, (v) => v.status)).toEqual({ value: { through: 7 } });
    input[0]!.bytes[0]!++;
    expect(cache.readIfMatches(input, (v) => v.status)).toBeUndefined();
    expect(() => cache.read(input, (v) => v.status)).toThrow(/No verified/);
    cache.clear();
    expect(() => cache.read(rows(), (v) => v.status)).toThrow(/No verified/);
  } finally {
    globalThis.structuredClone = clone;
    cache.clear();
  }
});
it('owns input/results across caller erasure and refuses stale completion after close', async () => {
  const cache = createVerifiedRecords<{ bytes: Uint8Array }>();
  const input = rows();
  let calls = 0;
  const check = async (r: OpenedRecord[]) => {
    calls++;
    return { bytes: r[0]!.bytes };
  };
  await cache.verify(input, 'metadata', check, current);
  eraseVerified(cache.read(input));
  expect([...cache.read(input).bytes]).toEqual([1, 2, 3]);
  await cache.verify(input, 'metadata', check, current);
  expect(calls).toBe(1);
  const expected = copyRecords(input);
  eraseVerified(input);
  expect(() => cache.read(input)).toThrow();
  expect([...cache.read(expected).bytes]).toEqual([1, 2, 3]);
  let release!: () => void;
  const pending = cache.verify(
    expected,
    'new',
    async (r) => {
      await new Promise<void>((resolve) => (release = resolve));
      return { bytes: r[0]!.bytes };
    },
    current,
  );
  cache.clear();
  release();
  await expect(pending).rejects.toThrow(/invalidated/);
  expect(() => cache.read(expected)).toThrow();
  await cache.verify(expected, 'new', check, current);
  await expect(
    cache.verify(expected, 'new', check, () => {
      throw Error('closed');
    }),
  ).rejects.toThrow('closed');
  expect(() => cache.read(expected)).toThrow();
  cache.clear();
  cache.clear();
});
it('generated content/source/placement/metadata changes, rejection and rollback never reuse prior success', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.integer({ min: 0, max: 6 }), { minLength: 1, maxLength: 30 }),
      async (actions) => {
        const cache = createVerifiedRecords<number>();
        let calls = 0;
        const full = async (r: OpenedRecord[]) => {
          calls++;
          if (!r.length) throw Error('missing');
          return r.reduce((n, x) => n + x.bytes.reduce((a, b) => a + b, 0), 0);
        };
        for (const action of actions) {
          const original = rows();
          await cache.verify(original, 'base', full, current);
          const changed = rows();
          let token = 'base';
          if (action === 0) changed[0]!.bytes[0]!++;
          if (action === 1) changed[0]!.kind = 'outbound';
          if (action === 2) changed[0]!.gen++;
          if (action === 3) changed[0]!.seq++;
          if (action === 4) changed.push({ ...changed[0]!, seq: 2 });
          if (action === 5) token = 'changed counter/witness';
          if (action === 6) changed.length = 0;
          const before = calls;
          if (action === 6)
            await expect(cache.verify(changed, token, full, current)).rejects.toThrow('missing');
          else await cache.verify(changed, token, full, current);
          expect(calls).toBe(before + 1);
          const after = calls;
          await cache.verify(original, 'base', full, current);
          expect(calls).toBe(after + 1);
          const replacement = createVerifiedRecords<number>();
          expect(() => replacement.read(original)).toThrow();
        }
        cache.clear();
      },
    ),
    { seed: 120912, numRuns: 60 },
  );
});
