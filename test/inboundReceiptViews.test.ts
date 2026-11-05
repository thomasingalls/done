// @vitest-environment node
import { expect, it } from 'vitest';
import * as core from '../src/crdt/inboundRecord';
import type { InboundRecord, InboundReceipt } from '../src/crdt/inboundRecord';
import { StorageCompatibilityError } from '../src/crdt/storageCompatibility';
import { A, B, packet, sources } from './account-inbound/fixtures';
import { context, eventWire, hex, json, reframe } from './account-inbound-codecs/oracle';
import { pageFixture, referenceBytes } from './inbound-page/fixtures';
type View = { entryIndex: number; event: InboundRecord };
function inspect(bytes: Uint8Array) {
  const read = (
    core as typeof core & {
      inspectInboundReceipt?: (bytes: Uint8Array) =>
        | {
            receipt: InboundReceipt;
            epoch: number;
            count: number;
            entries(): IterableIterator<View>;
          }
        | undefined;
    }
  ).inspectInboundReceipt;
  if (!read) throw Error('Missing shared logical receipt views');
  return read(bytes)!;
}
function memo(seq: number, index: number) {
  const key = (
    core as typeof core & { inboundEntryMemoSlot?: (seq: number, index: number) => string }
  ).inboundEntryMemoSlot;
  if (!key) throw Error('Missing physical-entry memo address');
  return key(seq, index);
}
it('future inbound JSON and binary versions refuse as update-required rather than another row kind', () => {
  for (const bytes of [
    json(['done/account-inbound/v3', 3]),
    json(['done/account-inbound/page/v9', 9]),
    new TextEncoder().encode('done/account-inbound/page/v2\0'),
  ])
    expect(() => core.decodeInboundReceipt(bytes)).toThrow(StorageCompatibilityError);
});
it('all72 admitted extents expose exact positions, predecessor links and original bytes for two publishers', () => {
  for (const publisher of [A, B]) {
    const f = pageFixture(publisher);
    for (let first = 0; first < 8; first++)
      for (let count = 1; first + count <= 8; count++) {
        const record = {
          ...f.record,
          firstEntry: first,
          entryCount: count,
          firstPosition: first + 1,
          previous: f.entries[first]!.previous,
          lastLink: f.entries[first + count - 1]!.link,
        };
        const source = inspect(referenceBytes(record)),
          entries = [...source.entries()];
        expect(source.count).toBe(count);
        expect(source.epoch).toBe(1);
        expect(entries).toHaveLength(count);
        for (const [offset, view] of entries.entries()) {
          const expected = f.entries[first + offset]!;
          expect(view.entryIndex).toBe(first + offset);
          expect(view.event).toMatchObject({
            baseline: record.baseline,
            lineage: record.lineage,
            head: record.head,
            reader: record.reader,
            publisher,
            kind: 'received',
            position: expected.position,
            previous: expected.previous,
            link: expected.link,
            entry: first + offset,
          });
          expect(view.event.request).toEqual(record.request);
          expect(view.event.page).toEqual(record.page);
          expect(view.event.request).toBe(source.receipt.record.request);
          expect(view.event.page).toBe(source.receipt.record.page);
        }
      }
  }
});
it('legacy v1 and v2 each expose one logical event, the true request epoch and the selected page index', () => {
  const first = sources().entries[0]!;
  const old = eventWire(first, context(), packet(first)),
    f = pageFixture(A, 2);
  const indexed = json([
    'done/account-inbound/v2',
    2,
    f.record.baseline,
    f.record.lineage,
    f.record.head,
    f.record.reader,
    A,
    'received',
    2,
    f.entries[1]!.previous,
    f.entries[1]!.link,
    hex(f.record.request),
    hex(f.record.page),
    1,
  ]);
  for (const [bytes, index] of [
    [old, 0],
    [indexed, 1],
  ] as const) {
    const parsed = inspect(bytes),
      entries = [...parsed.entries()];
    expect(parsed.count).toBe(1);
    expect(parsed.epoch).toBe(1);
    expect(entries).toEqual([{ entryIndex: index, event: core.decodeInboundRecord(bytes) }]);
    expect(core.encodeInboundRecord(entries[0]!.event)).toEqual(bytes);
  }
});
it('a single-entry binary page stays an admitted extent without a synthetic indexed legacy event', () => {
  const { record } = pageFixture(A, 1),
    parsed = inspect(referenceBytes(record));
  expect(parsed.count).toBe(1);
  const view = [...parsed.entries()][0]!;
  expect(view.entryIndex).toBe(0);
  expect(view.event.position).toBe(1);
  expect(Object.hasOwn(view.event, 'entry')).toBe(false);
});
it('interior cuts never consult a malformed unadmitted predecessor proof or expand the whole signed page', () => {
  const f = pageFixture(A, 8, 2, 2);
  const changed = reframe(f.record, {
    page: (p) => {
      (p[5] as string[][])[1]![1] = '00';
    },
  });
  const parsed = inspect(referenceBytes({ ...f.record, ...changed }));
  expect(parsed.count).toBe(2);
  expect(
    [...parsed.entries()].map((v) => [v.entryIndex, v.event.position, v.event.previous]),
  ).toEqual([
    [2, 3, f.entries[2]!.previous],
    [3, 4, f.entries[3]!.previous],
  ]);
});
it('physical-row and entry-index memo addresses are injective and bounded', () => {
  const keys = new Set<string>();
  for (const seq of [1, 2, Number.MAX_SAFE_INTEGER])
    for (let index = 0; index < 8; index++) keys.add(memo(seq, index));
  expect(keys.size).toBe(24);
  for (const [seq, index] of [
    [0, 0],
    [-0, 0],
    [1.5, 0],
    [Number.MAX_SAFE_INTEGER + 1, 0],
    [1, -0],
    [1, -1],
    [1, 8],
    [1, 0.5],
  ])
    expect(() => memo(seq!, index!)).toThrow();
});
it('logical originals are owned independently of a mutated backing buffer at a nonzero offset', () => {
  const { record } = pageFixture(A, 8, 2, 4),
    original = referenceBytes(record),
    padded = new Uint8Array(original.length + 19);
  padded.set(original, 7);
  const parsed = inspect(padded.subarray(7, 7 + original.length));
  padded.fill(0);
  expect([...parsed.entries()].map((v) => [v.event.request, v.event.page])).toEqual(
    Array.from({ length: 4 }, () => [record.request, record.page]),
  );
});
it('known malformed receipt framing refuses and unrelated canonical JSON remains unrelated', () => {
  expect(() => core.decodeInboundReceipt(json(['done/account-inbound/v1', 1]))).toThrow();
  expect(() =>
    core.decodeInboundReceipt(referenceBytes(pageFixture().record).subarray(0, 238)),
  ).toThrow();
  expect(core.decodeInboundReceipt(json(['other-row', 1]))).toBeUndefined();
});
