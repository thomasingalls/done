// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { RECEIVE_GROUP_LIMIT } from '../src/crdt/receiveLimits';
import {
  receivePageWidths,
  receiveDownloadWidth,
  createReceiveSelection,
} from '../src/crdt/receiveSelection';
import {
  packReceivePages,
  unpackReceivePages,
  preparedInboundPageWrites,
} from '../src/crdt/receiveGroup';
import { prepareInboundPage } from '../src/crdt/accountInbound';
import { decodeInboundPageRecord } from '../src/crdt/inboundRecord';
import { pageFixture } from './inbound-page/fixtures';
import { live } from './account-inbound-codecs/oracle';
it('eight-position turns plan actual four-position requests without granting unseen or excess work', () => {
  expect(RECEIVE_GROUP_LIMIT).toBe(8);
  expect(receivePageWidths(true, 8, 100)).toEqual([4, 4]);
  expect(receivePageWidths(true, 7, 100)).toEqual([4, 3]);
  expect(receivePageWidths(true, 8, 5)).toEqual([4, 1]);
  expect(receivePageWidths(true, 8, 0)).toEqual([1]);
  expect(receivePageWidths(false, 8, 100)).toEqual(Array(8).fill(1));
  expect(receiveDownloadWidth(8, 100)).toBe(4);
  for (const args of [
    [0, 100],
    [9, 100],
    [8, -1],
    [8, NaN],
    [8, 1.5],
  ])
    expect(() => receivePageWidths(true, args[0]!, args[1]!)).toThrow();
});
it('eight independently verified positions share one physical extent while an interior cut stays exact', async () => {
  const f = pageFixture(),
    scope = { ...f.context, inboundReceiptVersion: 1 as const };
  const signatures = vi.spyOn(crypto.subtle, 'verify');
  const first = await prepareInboundPage(scope, f.record.request, f.record.page, live, 8);
  expect(signatures).toHaveBeenCalledTimes(18);
  const cut = await prepareInboundPage(
    { ...scope, prefix: { position: 3, link: f.entries[2]!.link, observedThrough: 8 } },
    f.record.request,
    f.record.page,
    live,
    5,
  );
  try {
    expect(signatures).toHaveBeenCalledTimes(30);
    expect(first.map((x) => x.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    if (first.some((x) => !('record' in x)) || cut.some((x) => !('record' in x)))
      throw Error('expected persisted results');
    const framed = preparedInboundPageWrites(first);
    expect(framed.writes.filter((x) => x.kind === 'heads')).toHaveLength(1);
    expect(framed.writes.at(-1)!.bytes).toBe(
      'record' in first[0]! ? first[0]!.record : new Uint8Array(),
    );
    expect(cut.map((x) => x.position)).toEqual([4, 5, 6, 7, 8]);
    const record = decodeInboundPageRecord('record' in cut[0]! ? cut[0]!.record : new Uint8Array());
    expect([record.firstEntry, record.entryCount, record.firstPosition, record.lastLink]).toEqual([
      3,
      5,
      4,
      f.entries[7]!.link,
    ]);
  } finally {
    signatures.mockRestore();
    for (const results of [first, cut])
      for (const x of results) {
        if ('record' in x) x.record.fill(0);
        if (x.kind === 'received') for (const u of x.updates) u.fill(0);
      }
  }
});
it('a preceding partial group consumes only its remaining native allowance before rotation', () => {
  const s = createReceiveSelection(),
    ids = ['a', 'b'];
  expect(s.next(ids)).toBe('a');
  s.completed(ids, 'a', true, false, 3);
  expect(s.capacity('a')).toBe(5);
  expect(s.next(ids)).toBe('a');
  s.completed(ids, 'a', true, false, 5);
  expect(s.next(ids)).toBe('b');
  expect(s.capacity('b')).toBe(8);
  expect(() => s.completed(ids, 'b', true, false, 9)).toThrow();
});
it('continuous mixed-size groups preserve ordered fairness over all publishers', () => {
  const s = createReceiveSelection(),
    ids = ['a', 'b', 'c'],
    turns: string[] = [];
  for (let i = 0; i < 30; i++) {
    const p = s.next(ids);
    turns.push(p);
    s.completed(ids, p, true, false, 3);
    expect(s.next(ids)).toBe(p);
    s.completed(ids, p, true, false, 5);
  }
  expect(turns).toEqual(Array.from({ length: 10 }, () => ids).flat());
});
it('queue framing accepts eight exact original boundaries and refuses the ninth', () => {
  const pages = Array.from({ length: 8 }, (_, i) => new Uint8Array([i + 1]));
  const packed = packReceivePages(pages);
  expect(unpackReceivePages(packed).map((x) => x[0])).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(() => packReceivePages([...pages, new Uint8Array([9])])).toThrow();
  expect(() => unpackReceivePages(new Uint8Array([...packed, 0, 0, 0, 1, 9]))).toThrow();
});
