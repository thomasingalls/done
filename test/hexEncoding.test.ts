// @vitest-environment node
/**
 * Phase 559: both bytes-to-hex routines, `hex` in src/crdt/custodyCrypto.ts and in
 * account-protocol/recovery.ts, built a JavaScript array with one string per input byte and joined
 * it. Local baselines, checkpoint ciphertexts, promotion payloads and submissions reach them at
 * megabytes, where that array cost about twelve times the time and five times the peak memory of
 * the replacement (the record has the numbers). From SLOTS_FROM bytes they now write one 16-bit
 * slot of two ASCII digits per byte and decode it once with a TextDecoder; below it they keep the
 * base code exactly, because one TextDecoder call costs more than a short join in WebKit. Nothing
 * is chunked and nothing is passed as call arguments, so phase 558's argument limit does not apply.
 *
 * The base text of both routines is kept below as the reference. Every equivalence and refusal
 * case is a control: it compares the current routines with the reference (and with Node's own
 * encoder) on both paths and passes on the base source as well, as does the check that the join
 * counter sees the base routines. The cost cases fail on the base source: they count joins of an
 * array with one element per input byte, at 8 MiB + 1 and from SLOTS_FROM bytes, and require the
 * join below SLOTS_FROM.
 *
 * src/crdt/legacySource.ts had its own helper (`toString(16)` per byte, through `Array.from`), at
 * about fifty times the time and sixteen times the peak memory over its 16 MiB of legacy rows; it
 * now uses the shared `hex`. The last two cases drive the real observation over more than 8 MiB of
 * legacy rows: its digest matches one computed with Node's encoder (a control), and no per-byte
 * array is joined while it runs (fails on the base source).
 */
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hex as custodyHex } from '../src/crdt/custodyCrypto';
import { hex as protocolHex } from '../account-protocol/recovery';
import { inspectLegacySource } from '../src/crdt/legacySource';
import type { SessionTask } from '../src/crdt/writeSession';
import { Y } from '../src/crdt/yjs';
import { database, reset, transaction } from './legacy-source/fixture';

// Base text of src/crdt/custodyCrypto.ts `hex` (tree 4ef09a61), renamed only.
const referenceByte = Array.from({ length: 256 }, (_, n) => n.toString(16).padStart(2, '0'));
const referenceCustodyHex = (b: Uint8Array): string => {
  if (!b.length) {
    b.subarray(0, 0);
    return '';
  }
  // oxlint-disable-next-line unicorn/no-new-array -- The base text, kept as the reference.
  const parts = new Array<string>(b.length);
  for (let i = 0; i < b.length; i++) parts[i] = referenceByte[b[i]!]!;
  return parts.join('');
};
// Base text of account-protocol/recovery.ts `hex` (tree 4ef09a61), renamed only.
const referenceProtocolHex = (value: Uint8Array): string => {
  if (!value.length) value.subarray(0, 0);
  // oxlint-disable-next-line unicorn/no-new-array -- The base text, kept as the reference.
  const parts = new Array<string>(value.length);
  for (let i = 0; i < value.length; i++) parts[i] = referenceByte[value[i]!]!;
  return parts.join('');
};

const routines = {
  custodyCrypto: { hex: custodyHex, reference: referenceCustodyHex },
  recovery: { hex: protocolHex, reference: referenceProtocolHex },
} as const;
const names = ['custodyCrypto', 'recovery'] as const;

/** Reproducible bytes: xorshift32 from a seed, so a failing length can be replayed. */
const bytes = (length: number, seed = length + 1): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(length);
  let x = seed | 0 || 1;
  for (let i = 0; i < length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out[i] = x & 255;
  }
  return out;
};
const node = (b: Uint8Array) => Buffer.from(b.buffer, b.byteOffset, b.length).toString('hex');
type Outcome = { value: string } | { error: string; message: string };
const outcome = (f: () => string): Outcome => {
  try {
    return { value: f() };
  } catch (error) {
    return { error: (error as Error).constructor.name, message: (error as Error).message };
  }
};

/** 8 MiB + 1: past the baseline write ceiling, and odd, so no slot or page boundary lines up. */
const LARGE = 8_388_609;
/** HEX_SLOTS_FROM in both sources: shorter inputs take the base join, longer the 16-bit slots. */
const SLOTS_FROM = 64;
let largeInput: Uint8Array<ArrayBuffer> | undefined, largeReference: string | undefined;
const large = () => {
  largeInput ??= bytes(LARGE);
  largeReference ??= referenceCustodyHex(largeInput);
  return { input: largeInput, expected: largeReference };
};

describe.each(names)('%s hex returns what the base routine returned (control)', (name) => {
  const r = routines[name];
  it('every byte value, alone (the join path) and together and reversed (the slot path)', () => {
    for (let n = 0; n < 256; n++) {
      const one = new Uint8Array([n]);
      expect(r.hex(one)).toBe(r.reference(one));
      expect(r.hex(one)).toBe(n.toString(16).padStart(2, '0'));
    }
    const all = Uint8Array.from({ length: 256 }, (_, n) => n);
    expect(r.hex(all)).toBe(r.reference(all));
    expect(r.hex(all)).toBe(node(all));
    const reversed = all.slice().reverse();
    expect(r.hex(reversed)).toBe(r.reference(reversed));
  });

  it('lengths from 0 to 1 MiB, either side of every power of two used', () => {
    const lengths = [0, 1, 2, 3];
    for (const p of [4, 5, 6, 8, 12, 16, 20]) lengths.push((1 << p) - 1, 1 << p, (1 << p) + 1);
    for (const length of lengths) {
      const input = bytes(length);
      const expected = r.reference(input);
      expect(r.hex(input), `length ${length}`).toBe(expected);
      expect(expected).toBe(node(input));
      expect(r.hex(input)).toHaveLength(2 * length);
    }
  });

  it('views with a byte offset, at odd offsets, over a larger buffer, and Node Buffers', () => {
    const backing = bytes(4099);
    for (const [offset, length] of [
      [1, 0],
      [1, 1],
      [3, 16],
      [7, 4091],
      [4098, 1],
      [0, 4099],
    ] as const) {
      const view = new Uint8Array(backing.buffer, offset, length);
      expect(r.hex(view), `${offset}+${length}`).toBe(r.reference(view));
      expect(r.hex(view)).toBe(node(view));
      expect(r.hex(backing.subarray(offset, offset + length))).toBe(r.reference(view));
    }
    // A pooled Buffer sits at a non-zero offset in a shared slab.
    const pooled = Buffer.from(bytes(33));
    expect(r.hex(pooled)).toBe(r.reference(pooled));
    expect(r.hex(pooled)).toBe(pooled.toString('hex'));
    expect(r.hex(Buffer.alloc(0))).toBe('');
  });

  it('either side of the threshold, with every byte value at every position', () => {
    for (const length of [SLOTS_FROM - 1, SLOTS_FROM, SLOTS_FROM + 1])
      for (let shift = 0; shift < 256; shift += 7) {
        const input = Uint8Array.from({ length }, (_, i) => (i * 37 + shift) & 255);
        expect(r.hex(input), `length ${length}, shift ${shift}`).toBe(r.reference(input));
        expect(r.hex(input)).toBe(node(input));
      }
  });

  it(`an input of ${LARGE} bytes`, () => {
    const { input, expected } = large();
    expect(expected).toBe(node(input));
    const actual = r.hex(input);
    expect(actual.length).toBe(2 * LARGE);
    expect(actual === expected).toBe(true);
  });
});

describe.each(names)('%s hex keeps every refusal of the base routine (control)', (name) => {
  const r = routines[name];
  // A view over a detached buffer, or a fixed view left out of bounds, has length 0, and a missing
  // input fails reading its length: these refusals happen at the empty-input guard, before either
  // path. Non-empty views reach the join path below SLOTS_FROM bytes and the slot path from it.
  it('views over a detached buffer, of every length, refuse with the same error', () => {
    for (const [offset, length] of [
      [0, 0],
      [0, 1],
      [0, 16],
      [5, 11],
      [0, 4096],
    ] as const) {
      const buffer = new ArrayBuffer(4096);
      const view = new Uint8Array(buffer, offset, length);
      const sameBuffer = new Uint8Array(buffer, offset, length);
      structuredClone(buffer, { transfer: [buffer] });
      expect(view.length).toBe(0);
      const expected = outcome(() => r.reference(sameBuffer));
      expect(expected).toMatchObject({ error: 'TypeError' });
      expect(
        outcome(() => r.hex(view)),
        `${offset}+${length}`,
      ).toEqual(expected);
    }
  });

  it('zero-length views of live buffers return the empty string', () => {
    for (const view of [
      new Uint8Array(0),
      bytes(64).subarray(9, 9),
      new Uint8Array(new ArrayBuffer(8), 8),
    ]) {
      expect(r.reference(view)).toBe('');
      expect(r.hex(view)).toBe('');
    }
  });

  it('views over a resizable buffer: out of bounds after a shrink, and length-tracking', () => {
    // Out of bounds: the guard. In bounds: the join path for the 16-byte view and short tracked
    // lengths, the slot path for the 100-byte view and long tracked lengths.
    const make = () => {
      const buffer = new (ArrayBuffer as unknown as new (
        length: number,
        options: { maxByteLength: number },
      ) => ArrayBuffer & { resize(length: number): void })(160, { maxByteLength: 320 });
      new Uint8Array(buffer).set(bytes(160));
      return buffer;
    };
    const cases: [string, (buffer: ReturnType<typeof make>) => Uint8Array][] = [
      ['fixed 16-byte view', (b) => new Uint8Array(b, 8, 16)],
      ['fixed 100-byte view', (b) => new Uint8Array(b, 8, 100)],
      ['fixed zero-length view', (b) => new Uint8Array(b, 20, 0)],
      ['length-tracking view', (b) => new Uint8Array(b, 4)],
    ];
    for (const [label, view] of cases)
      for (const size of [0, 6, 24, 48, 120, 300]) {
        const expectedBuffer = make(),
          actualBuffer = make();
        const expectedView = view(expectedBuffer),
          actualView = view(actualBuffer);
        expectedBuffer.resize(size);
        actualBuffer.resize(size);
        expect(
          outcome(() => r.hex(actualView)),
          `${label} at ${size}`,
        ).toEqual(outcome(() => r.reference(expectedView)));
      }
  });

  it('a missing input refuses with the same error', () => {
    for (const input of [undefined, null])
      expect(outcome(() => r.hex(input as never))).toEqual(
        outcome(() => r.reference(input as never)),
      );
  });
});

/** Joins of an array at least `minimum` long, counted while `f` runs (and settles). */
const largeJoins = async (minimum: number, f: () => unknown): Promise<number> => {
  const join = Array.prototype.join;
  let count = 0;
  Array.prototype.join = function (this: unknown[], separator?: string) {
    if (this.length >= minimum) count++;
    return join.call(this, separator);
  };
  try {
    await f();
  } finally {
    Array.prototype.join = join;
  }
  return count;
};

describe('hex builds no array with one element per input byte', () => {
  it('the counter sees the base routines join one element per byte (control)', async () => {
    const input = bytes(4096);
    for (const name of names) {
      expect(await largeJoins(4096, () => routines[name].reference(input)), name).toBe(1);
      expect(await largeJoins(4097, () => routines[name].reference(input)), name).toBe(0);
    }
  });

  it.each(names)(`%s at ${LARGE} bytes (fails on the base source)`, async (name) => {
    const { input, expected } = large();
    let actual = '';
    expect(await largeJoins(LARGE, () => (actual = routines[name].hex(input)))).toBe(0);
    expect(actual === expected).toBe(true);
  });

  it.each(names)(
    `%s joins below ${SLOTS_FROM} bytes and not from ${SLOTS_FROM} (fails on the base source)`,
    async (name) => {
      const below = bytes(SLOTS_FROM - 1),
        at = bytes(SLOTS_FROM);
      // The base code is kept below the threshold, where it is the faster path in WebKit.
      expect(await largeJoins(SLOTS_FROM - 1, () => routines[name].hex(below))).toBe(1);
      expect(await largeJoins(SLOTS_FROM, () => routines[name].hex(at))).toBe(0);
    },
  );
});

describe('the legacy source observation over more than 8 MiB of legacy rows', () => {
  // The real observation over fake IndexedDB and a stubbed localStorage, as in
  // test/legacySource.test.ts.
  const task: SessionTask = {
    signal: new AbortController().signal,
    step: (f) => f(),
    wait: async (f) => f(),
  };
  beforeEach(() => {
    const entries = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      get length() {
        return entries.size;
      },
      key: (i: number) => [...entries.keys()][i] ?? null,
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      clear: () => entries.clear(),
    });
  });
  afterEach(async () => {
    await reset();
    vi.unstubAllGlobals();
  });
  /** Two real Yjs updates of 4,250,000 characters each: 8.5 MB together, under the reader's
   * 16 MiB bound, stored under keys 1 and 3. Built once. */
  let rows: Uint8Array<ArrayBuffer>[] | undefined;
  const seedLegacy = async () => {
    if (!rows) {
      const doc = new Y.Doc({ gc: false }),
        built: Uint8Array<ArrayBuffer>[] = [];
      doc.on('update', (u: Uint8Array) => built.push(new Uint8Array(u)));
      doc.getText('t').insert(0, 'x'.repeat(4_250_000));
      doc.getText('t').insert(0, 'y'.repeat(4_250_000));
      doc.destroy();
      rows = built;
    }
    expect(rows.reduce((n, r) => n + r.length, 0)).toBeGreaterThan(LARGE);
    await reset(); // which also clears localStorage
    localStorage.setItem('done.actor', 'legacy-human');
    const db = await database();
    try {
      await transaction(db, (tx) =>
        rows!.forEach((r, i) => tx.objectStore('updates').add(r, 1 + 2 * i)),
      );
    } finally {
      db.close();
    }
    return rows;
  };
  const expectedDigest = (stored: Uint8Array[]) =>
    createHash('sha256')
      .update(
        JSON.stringify([
          'done/legacy-source-observation/v1',
          true,
          stored.map((r, i) => [1 + 2 * i, node(r)]),
          [['done.actor', 'legacy-human']],
        ]),
      )
      .digest('hex');

  it("hashes to the digest computed with Node's encoder (control)", async () => {
    const stored = await seedLegacy();
    const result = await inspectLegacySource(task);
    expect(result.updates.map((u) => u.key)).toEqual([1, 3]);
    expect(result.dependencies).toBe('complete');
    expect(result.digest).toBe(expectedDigest(stored));
  });

  it('joins no array with one element per row byte (fails on the base source)', async () => {
    const stored = await seedLegacy();
    const shortest = Math.min(...stored.map((r) => r.length));
    let digest = '';
    expect(
      await largeJoins(shortest, async () => (digest = (await inspectLegacySource(task)).digest)),
    ).toBe(0);
    expect(digest).toBe(expectedDigest(stored));
  });
});
