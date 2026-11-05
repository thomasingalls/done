// @vitest-environment node
import { expect, it } from 'vitest';
import fc from 'fast-check';
import {
  decodeInboundPageRecord,
  decodeInboundReceipt,
  decodeInboundRecord,
  encodeInboundPageRecord,
  encodeInboundRecord,
  INBOUND_RECORD_LIMIT,
} from '../src/crdt/inboundRecord';
import { A, B, packet, sources, ZERO } from './account-inbound/fixtures';
import { context, eventWire, hex, json, reframe } from './account-inbound-codecs/oracle';
import { pageFixture, referenceBytes } from './inbound-page/fixtures';

it('matches the independent approved binary offsets and exact original signed bytes', () => {
  const { record } = pageFixture(A, 8, 2, 4),
    bytes = referenceBytes(record);
  expect(new TextDecoder().decode(bytes.subarray(0, 29))).toBe('done/account-inbound/page/v1\0');
  expect(encodeInboundPageRecord(record)).toEqual(bytes);
  expect(decodeInboundPageRecord(bytes)).toEqual(record);
  expect(decodeInboundReceipt(bytes)).toEqual({ kind: 'page', record });
  expect(bytes.length).toBe(239 + record.request.length + record.page.length);
  expect(bytes.subarray(239, 239 + record.request.length)).toEqual(record.request);
  expect(bytes.subarray(239 + record.request.length)).toEqual(record.page);
});
it('round trips every contiguous admitted extent for two publishers, including interior cuts', () => {
  const fixtures = [pageFixture(A), pageFixture(B)];
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 1 }),
      fc.integer({ min: 0, max: 7 }),
      fc.integer({ min: 1, max: 8 }),
      (publisher, first, width) => {
        const f = fixtures[publisher]!,
          count = Math.min(width, 8 - first),
          record = {
            ...f.record,
            firstEntry: first,
            entryCount: count,
            firstPosition: first + 1,
            previous: f.entries[first]!.previous,
            lastLink: f.entries[first + count - 1]!.link,
          },
          bytes = referenceBytes(record);
        expect(encodeInboundPageRecord(record)).toEqual(bytes);
        expect(decodeInboundPageRecord(bytes)).toEqual(record);
      },
    ),
    { seed: 375, numRuns: 160 },
  );
});
it('allows a complete single-entry original request without relabelling it as legacy v2', () => {
  const { record } = pageFixture(A, 1);
  expect(decodeInboundPageRecord(referenceBytes(record))).toEqual(record);
});
it('owns decoded originals even for an input with a nonzero backing-buffer offset', () => {
  const { record } = pageFixture(),
    original = referenceBytes(record),
    padded = new Uint8Array(original.length + 19);
  padded.set(original, 7);
  const view = padded.subarray(7, 7 + original.length),
    decoded = decodeInboundPageRecord(view);
  padded.fill(0);
  expect(decoded).toEqual(record);
  decoded.request.fill(0);
  decoded.page.fill(0);
  expect(encodeInboundPageRecord(record)).toEqual(original);
});
it('rejects magic mutations, unknown binary versions, truncation, trailing bytes and oversized rows', () => {
  const bytes = referenceBytes(pageFixture().record);
  for (let n = 0; n < 29; n++) {
    const bad = bytes.slice();
    bad[n] = bad[n]! ^ 1;
    expect(() => decodeInboundReceipt(bad)).toThrow();
  }
  for (const bad of [
    new Uint8Array(),
    bytes.subarray(0, 238),
    bytes.subarray(0, bytes.length - 1),
    new Uint8Array([...bytes, 0]),
    new Uint8Array(INBOUND_RECORD_LIMIT + 1),
    new TextEncoder().encode('done/account-inbound/page/v2\0'),
  ])
    expect(() => decodeInboundReceipt(bad)).toThrow();
});
it('checks declared lengths before slicing and refuses unsigned u64 values outside positive safe integers', () => {
  const original = referenceBytes(pageFixture().record);
  for (const [offset, values] of [
    [231, [0, 4097, 0xffffffff]],
    [235, [0, INBOUND_RECORD_LIMIT, 0xffffffff]],
  ] as const)
    for (const value of values) {
      const bad = original.slice();
      new DataView(bad.buffer).setUint32(offset, value);
      expect(() => decodeInboundPageRecord(bad)).toThrow();
    }
  for (const value of [0n, BigInt(Number.MAX_SAFE_INTEGER) + 1n, (1n << 64n) - 1n]) {
    const bad = original.slice();
    new DataView(bad.buffer).setBigUint64(157, value);
    expect(() => decodeInboundPageRecord(bad)).toThrow();
  }
});
it('rejects empty, out-of-range and inconsistent admitted extents', () => {
  const original = referenceBytes(pageFixture(A, 8, 2, 4).record);
  for (const [offset, value] of [
    [229, 8],
    [229, 255],
    [230, 0],
    [230, 7],
    [230, 9],
  ] as const) {
    const bad = original.slice();
    bad[offset] = value;
    expect(() => decodeInboundPageRecord(bad)).toThrow();
  }
  const wrongPosition = original.slice();
  new DataView(wrongPosition.buffer).setBigUint64(157, 2n);
  expect(() => decodeInboundPageRecord(wrongPosition)).toThrow();
});
it('rejects metadata substitutions, wrong last links and malformed encoder integers and IDs', () => {
  const { record } = pageFixture();
  for (const changes of [
    { lineage: ZERO },
    { head: ZERO },
    { reader: A },
    { publisher: B },
    { lastLink: ZERO },
    { firstPosition: -0 },
    { firstPosition: Number.MAX_SAFE_INTEGER + 1 },
    { firstEntry: -0 },
    { firstEntry: 0.5 },
    { entryCount: -0 },
    { entryCount: 9 },
    { baseline: 'aa' },
    { previous: 'AA'.repeat(32) },
  ])
    expect(() => encodeInboundPageRecord({ ...record, ...changes })).toThrow();
});
it('checks every admitted entry rather than just the first and last', () => {
  const { record } = pageFixture(),
    changed = reframe(record, {
      page: (p) => {
        const entries = p[5] as string[][];
        entries[3]![0] = entries[4]![0]!;
      },
    });
  expect(() => decodeInboundPageRecord(referenceBytes({ ...record, ...changed }))).toThrow();
});
it('refuses a non-accepted proof and an authenticated empty-page frame as dense receipts', () => {
  const { record } = pageFixture(A, 1);
  const conflict = reframe(record, {
    page: (p) => {
      const entries = p[5] as string[][],
        proof = JSON.parse(Buffer.from(entries[0]![1]!, 'hex').toString());
      proof[2] = 'conflict';
      entries[0]![1] = hex(json(proof));
    },
  });
  expect(() => decodeInboundPageRecord(referenceBytes({ ...record, ...conflict }))).toThrow();
  const empty = reframe(record, {
    page: (p) => {
      p[3] = 0;
      p[4] = 0;
      p[5] = [];
    },
  });
  expect(() => decodeInboundPageRecord(referenceBytes({ ...record, ...empty }))).toThrow();
});
it('keeps original bytes for unadmitted entries without granting them admitted status', () => {
  const { record } = pageFixture(A, 8, 2, 2),
    changed = reframe(record, {
      page: (p) => {
        (p[5] as string[][])[0]![0] = '00';
      },
    }),
    selected = { ...record, ...changed };
  expect(decodeInboundPageRecord(referenceBytes(selected))).toEqual(selected);
  // Baseline and predecessor syntax alone is not independent chain authentication.
  expect(() =>
    encodeInboundPageRecord({ ...record, baseline: ZERO, previous: ZERO }),
  ).not.toThrow();
});
it('legacy v1 and v2 retain their exact independent bytes and unknown JSON versions refuse', () => {
  const first = sources().entries[0]!,
    old = eventWire(first, context(), packet(first)),
    f = pageFixture(A, 2),
    indexed = json([
      'done/account-inbound/v2',
      2,
      f.record.baseline,
      f.record.lineage,
      f.record.head,
      f.record.reader,
      A,
      'received',
      1,
      ZERO,
      f.entries[0]!.link,
      hex(f.record.request),
      hex(f.record.page),
      0,
    ]);
  for (const bytes of [old, indexed]) {
    expect(encodeInboundRecord(decodeInboundRecord(bytes))).toEqual(bytes);
    expect(decodeInboundReceipt(bytes)).toEqual({
      kind: 'legacy',
      record: decodeInboundRecord(bytes),
    });
  }
  for (const tag of [
    'done/account-inbound/v3',
    'done/account-inbound/page/v1',
    'done/account-inbound/page/v9',
  ])
    expect(() => decodeInboundReceipt(json([tag, 1]))).toThrow();
  expect(decodeInboundReceipt(json(['other-row', 1]))).toBeUndefined();
  expect(() => decodeInboundReceipt(json(['done/account-inbound/v1', 1]))).toThrow();
});
