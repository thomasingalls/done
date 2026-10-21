// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  createVerifiedRecords,
  eraseVerified,
  copyRecords,
  sameBytes,
  sameRecords,
  sameRecordsCooperatively,
} from '../src/crdt/verifiedRecords';
import type { OpenedRecord } from '../src/crdt/contentRecord';
const current = () => {};
const rows = (): OpenedRecord[] => [
  { kind: 'update', gen: 1, seq: 1, bytes: new Uint8Array([1, 2, 3]) },
];
describe.each([false, true])('verified records owned=%s', (owned) => {
  it('projects detached readback without copying unrelated retained history', async () => {
    const cache = createVerifiedRecords<{ status: { through: number }; history: Uint8Array }>(
      owned ? { ownResults: true } : {},
    );
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
    const cache = createVerifiedRecords<{ bytes: Uint8Array }>(owned ? { ownResults: true } : {});
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
          const cache = createVerifiedRecords<number>(owned ? { ownResults: true } : {});
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
            const replacement = createVerifiedRecords<number>(owned ? { ownResults: true } : {});
            expect(() => replacement.read(original)).toThrow();
          }
          cache.clear();
        },
      ),
      { seed: 120912, numRuns: 60 },
    );
  });

  it('refuses overlapping verification before it can borrow or erase an in-flight predecessor', async () => {
    const cache = createVerifiedRecords<{ bytes: Uint8Array }>(owned ? { ownResults: true } : {});
    const initial = rows();
    await cache.verify(initial, 1, async (r) => ({ bytes: r[0]!.bytes }), current);
    const next = [...rows(), { ...rows()[0]!, seq: 2 }];
    let release!: () => void;
    const first = cache.verify(
      next,
      2,
      async () => {
        throw Error('unexpected full verification');
      },
      current,
      async (previous) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        expect([...previous.bytes]).toEqual([1, 2, 3]);
        return { bytes: previous.bytes };
      },
    );
    let entered = false;
    try {
      await expect(
        cache.verify(
          [...next, { ...rows()[0]!, seq: 3 }],
          3,
          async () => {
            entered = true;
            return { bytes: new Uint8Array([9]) };
          },
          current,
          async (previous) => {
            entered = true;
            return { bytes: previous.bytes };
          },
        ),
      ).rejects.toThrow('Concurrent verification');
      expect(entered).toBe(false);
      expect([...cache.read(initial).bytes]).toEqual([1, 2, 3]);
    } finally {
      release();
      await first;
    }
    expect([...cache.read(next).bytes]).toEqual([1, 2, 3]);
    cache.clear();
  });
});

describe('exact comparison span boundaries', () => {
  const view = (length: number, offset: number) => {
    const buffer = new Uint8Array(length + offset + 9).fill(211);
    const bytes = buffer.subarray(offset, offset + length);
    for (let i = 0; i < length; i++) bytes[i] = (i * 131 + 197) % 256;
    return { buffer, bytes };
  };
  it('compares every byte and excludes surrounding bytes for aligned and unaligned subranges', () => {
    for (const length of [0, 1, 3, 4, 7, 31, 255, 256, 257, 259, 511]) {
      for (let a = 0; a < 4; a++)
        for (let b = 0; b < 4; b++) {
          const left = view(length, a),
            right = view(length, b);
          right.buffer[right.buffer.length - 1] = 99;
          expect(sameBytes(left.bytes, right.bytes)).toBe(true);
          for (let i = 0; i < length; i++) {
            right.bytes[i]! ^= 128;
            expect(
              sameBytes(left.bytes, right.bytes),
              `length=${length}, offsets=${a}/${b}, byte=${i}`,
            ).toBe(false);
            right.bytes[i]! ^= 128;
          }
        }
    }
  });
  it('agrees with the independent native Buffer oracle on generated slices and changed bytes', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ maxLength: 8192 }),
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 0, max: 3 }),
        fc.nat(),
        fc.boolean(),
        (bytes, a, b, index, change) => {
          const left = view(bytes.length, a).bytes,
            right = view(bytes.length, b).bytes;
          left.set(bytes);
          right.set(bytes);
          if (change && bytes.length) right[index % bytes.length]! ^= 1;
          expect(sameBytes(left, right)).toBe(
            Buffer.compare(Buffer.from(left), Buffer.from(right)) === 0,
          );
        },
      ),
      { seed: 211121, numRuns: 250 },
    );
  });
  it('retains exact metadata, final-word, byte-tail and cooperative chunk comparisons', async () => {
    for (const length of [65535, 65536, 65537, 131075]) {
      const input = [{ kind: 'update' as const, gen: 1, seq: 1, bytes: view(length, 0).bytes }];
      const other = [{ ...input[0]!, bytes: view(length, 0).bytes }];
      let checkpoints = 0;
      expect(
        await sameRecordsCooperatively(input, other, () => {
          checkpoints++;
          return undefined;
        }),
      ).toBe(true);
      expect(checkpoints).toBe(Math.ceil(length / 65536) + 1);
      for (const at of [
        0,
        255,
        256,
        65534,
        65535,
        length - 4,
        length - 3,
        length - 2,
        length - 1,
      ].filter((i) => i < length)) {
        other[0]!.bytes[at]! ^= 1;
        expect(sameRecords(input, other)).toBe(false);
        expect(await sameRecordsCooperatively(input, other, () => undefined)).toBe(false);
        other[0]!.bytes[at]! ^= 1;
      }
      for (const changed of [
        { ...other[0]!, kind: 'outbound' as const },
        { ...other[0]!, gen: 2 },
        { ...other[0]!, seq: 2 },
        { ...other[0]!, bytes: other[0]!.bytes.subarray(1) },
      ])
        expect(await sameRecordsCooperatively(input, [changed], () => undefined)).toBe(false);
    }
  });
  it('preserves empty, self and detached-left behavior', async () => {
    const bytes = view(259, 0).bytes;
    expect(sameBytes(bytes, bytes)).toBe(true);
    expect(sameBytes(bytes, new Uint8Array(0))).toBe(false);
    expect(sameBytes(new Uint8Array(0), new Uint8Array(0))).toBe(true);
    const detached = new Uint8Array(4);
    structuredClone(detached.buffer, { transfer: [detached.buffer] });
    expect(() => sameBytes(detached, new Uint8Array(0))).toThrow();
    expect(sameBytes(new Uint8Array(0), detached)).toBe(true);
    expect(sameBytes(detached, bytes)).toBe(false);
    await expect(
      sameRecordsCooperatively(
        [{ kind: 'update', gen: 1, seq: 1, bytes: detached }],
        [{ kind: 'update', gen: 1, seq: 1, bytes: new Uint8Array(0) }],
        () => undefined,
      ),
    ).rejects.toThrow();
  });
  it('still yields before later chunks and rejects a view invalidated during comparison', async () => {
    const cache = createVerifiedRecords<{ records: OpenedRecord[] }>({ ownResults: true });
    const input = [{ kind: 'update' as const, gen: 1, seq: 1, bytes: view(131077, 0).bytes }];
    let retained!: OpenedRecord[];
    await cache.verify(input, 'same', async (r) => ({ records: (retained = r) }), current);
    let checkpoints = 0,
      full = 0;
    await expect(
      cache.verify(
        input,
        'same',
        async (r) => {
          full++;
          return { records: r };
        },
        current,
        undefined,
        () => {
          checkpoints++;
          if (checkpoints === 1) {
            cache.clear();
            return Promise.resolve();
          }
          return undefined;
        },
      ),
    ).rejects.toThrow(/invalidated/);
    expect(checkpoints).toBeGreaterThan(0);
    expect(full).toBe(0);
    expect(retained[0]!.bytes.every((b) => b === 0)).toBe(true);
    expect(input[0]!.bytes[0]).toBe(197);
    expect(() => cache.read(input)).toThrow();
  });
  it('keeps caller slices and detached projections outside verifier ownership', async () => {
    const cache = createVerifiedRecords<{ bytes: Uint8Array }>({ ownResults: true });
    const caller = view(515, 1),
      input = [{ kind: 'update' as const, gen: 1, seq: 1, bytes: caller.bytes }];
    let calls = 0;
    const check = async (r: OpenedRecord[]) => {
      calls++;
      return { bytes: r[0]!.bytes };
    };
    await cache.verify(input, 1, check, current, undefined, () => undefined);
    cache.read(input).bytes.fill(0);
    caller.buffer[0] = 0;
    await cache.verify(input, 1, check, current, undefined, () => undefined);
    expect(calls).toBe(1);
    caller.bytes[514]! ^= 1;
    await cache.verify(input, 1, check, current, undefined, () => undefined);
    expect(calls).toBe(2);
    expect(cache.read(input).bytes[514]).toBe(caller.bytes[514]);
    cache.clear();
  });
});
