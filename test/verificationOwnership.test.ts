// @vitest-environment node
import { expect, it } from 'vitest';
import fc from 'fast-check';
import { createVerifiedRecords } from '../src/crdt/verifiedRecords';
import type { OpenedRecord } from '../src/crdt/contentRecord';
const row = (seq: number, bytes = new Uint8Array([seq])): OpenedRecord => ({
  kind: 'outbound',
  gen: 1,
  seq,
  bytes,
});
const current = () => {};

it('retains only exact internal prefixes; caller erasure and detached projections cannot alter them', async () => {
  const cache = createVerifiedRecords<{ records: OpenedRecord[] }>({ ownResults: true });
  const initial = [row(1)],
    next = [row(1), row(2)];
  let first!: OpenedRecord[], second!: OpenedRecord[];
  await cache.verify(initial, 1, async (r) => ({ records: (first = r) }), current);
  await cache.verify(
    next,
    2,
    async () => {
      throw Error('unexpected full');
    },
    current,
    async (previous, before, candidate) => {
      expect(candidate[0]).toBe(before[0]);
      expect(candidate[0]!.bytes).toBe(previous.records[0]!.bytes);
      expect(candidate[1]!.bytes).not.toBe(next[1]!.bytes);
      return { records: (second = candidate) };
    },
  );
  initial[0]!.bytes.fill(0);
  next.forEach((r) => r.bytes.fill(0));
  cache.read([row(1), row(2)]).records.forEach((r) => r.bytes.fill(0));
  expect([...second[0]!.bytes, ...second[1]!.bytes]).toEqual([1, 2]);
  const changed = [row(1, new Uint8Array([9])), row(2)];
  await cache.verify(changed, 3, async (r) => ({ records: r }), current);
  expect([...first[0]!.bytes]).toEqual([0]);
  expect([...second[1]!.bytes]).toEqual([0]);
  expect([...cache.read(changed).records[0]!.bytes]).toEqual([9]);
  cache.clear();
});

it('preserves shared subarray backing buffers and erases retired buffers once ownership ends', async () => {
  const cache = createVerifiedRecords<{ keep: Uint8Array; drop?: Uint8Array }>({
    ownResults: true,
  });
  const shared = new Uint8Array([7, 8, 9]),
    dropped = new Uint8Array([4, 5]);
  await cache.verify([row(1)], 1, async () => ({ keep: shared, drop: dropped }), current);
  await cache.verify(
    [row(1), row(2)],
    2,
    async () => {
      throw Error('unexpected full');
    },
    current,
    async (previous) => ({ keep: previous.keep.subarray(1) }),
  );
  expect([...shared]).toEqual([7, 8, 9]);
  expect([...dropped]).toEqual([0, 0]);
  cache.clear();
  expect([...shared]).toEqual([0, 0, 0]);
});

it('failure and invalidation erase candidates without touching caller buffers or reinstalling a view', async () => {
  const cache = createVerifiedRecords<{ rows: OpenedRecord[] }>({ ownResults: true });
  const input = [row(1)],
    next = [row(1), row(2)];
  let prior!: OpenedRecord[], candidate!: OpenedRecord[];
  await cache.verify(input, 1, async (r) => ({ rows: (prior = r) }), current);
  await expect(
    cache.verify(
      next,
      2,
      async () => ({ rows: [] }),
      current,
      async (_p, _b, c) => {
        candidate = c;
        throw Error('failed proof');
      },
    ),
  ).rejects.toThrow('failed proof');
  expect([...prior[0]!.bytes, ...candidate[1]!.bytes]).toEqual([0, 0]);
  expect([...input[0]!.bytes, ...next[1]!.bytes]).toEqual([1, 2]);
  expect(() => cache.read(next)).toThrow();
  await cache.verify(input, 3, async (r) => ({ rows: r }), current);
  let release!: () => void;
  const pending = cache.verify(
    next,
    4,
    async () => ({ rows: [] }),
    current,
    async (_p, _b, c) => {
      candidate = c;
      await new Promise<void>((r) => {
        release = r;
      });
      return { rows: c };
    },
  );
  cache.clear();
  release();
  await expect(pending).rejects.toThrow('invalidated');
  expect(candidate.every((r) => r.bytes.every((b) => b === 0))).toBe(true);
  expect(() => cache.read(next)).toThrow();
});

it('generated replacement, append and borrowed-prefix results agree with the detached reference', async () => {
  await fc.assert(
    fc.asyncProperty(fc.array(fc.nat(5), { minLength: 2, maxLength: 20 }), async (ops) => {
      const owned = createVerifiedRecords<{ rows: OpenedRecord[] }>({ ownResults: true });
      const reference = createVerifiedRecords<{ rows: OpenedRecord[] }>();
      let records = [row(1)],
        seq = 1;
      try {
        for (const [token, op] of ops.entries()) {
          if (op === 0) records = [row(++seq)];
          else if (op === 1)
            records = records.map((r, i) => (i ? r : row(r.seq, new Uint8Array([7]))));
          else records = [...records, row(++seq)];
          for (const cache of [owned, reference])
            await cache.verify(
              records,
              token,
              async (r) => ({ rows: r }),
              current,
              async (previous, before, candidate) => {
                // Only extend an exact prefix; changed/deleted records take the full checker.
                if (
                  candidate.length < before.length ||
                  before.some(
                    (r, i) => r.seq !== candidate[i]!.seq || r.bytes[0] !== candidate[i]!.bytes[0],
                  )
                )
                  return;
                return { rows: [...previous.rows, ...candidate.slice(before.length)] };
              },
            );
          expect(owned.read(records)).toEqual(reference.read(records));
        }
      } finally {
        owned.clear();
        reference.clear();
      }
    }),
    { seed: 121026, numRuns: 40 },
  );
});
