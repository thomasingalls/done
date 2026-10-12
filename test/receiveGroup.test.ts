import { expect, it } from 'vitest';
import { packReceivePages, unpackReceivePages, receiveGroupFits } from '../src/crdt/receiveGroup';
import { MAX_BATCH_BYTES, MAX_BATCH_RECORDS } from '../src/crdt/contentRecord';

it('captures queue bytes and preserves the separate original page boundaries', () => {
  const a = new Uint8Array([1, 0, 9]),
    b = new Uint8Array([4]);
  const packed = packReceivePages([a, b]);
  a.fill(0);
  expect(unpackReceivePages(packed).map((p) => [...p])).toEqual([[1, 0, 9], [4]]);
});
it('refuses truncation, excess pages, zero lengths and oversized queue inputs', () => {
  const packed = packReceivePages([new Uint8Array([7]), new Uint8Array([8])]);
  for (const n of [0, 1, 3, 4, 6, 7, 8, 9])
    expect(() => unpackReceivePages(packed.slice(0, n))).toThrow();
  expect(() => unpackReceivePages(new Uint8Array(4))).toThrow();
  expect(() => packReceivePages(Array.from({ length: 5 }, () => new Uint8Array([1])))).toThrow();
  expect(() => packReceivePages([new Uint8Array(MAX_BATCH_BYTES)])).toThrow();
  expect(() => unpackReceivePages(new Uint8Array(MAX_BATCH_BYTES + 1))).toThrow();
});
it('cuts on either native commit bound without reducing the supported single-record limit', () => {
  expect(receiveGroupFits(MAX_BATCH_BYTES, MAX_BATCH_RECORDS)).toBe(true);
  expect(receiveGroupFits(MAX_BATCH_BYTES + 1, 1)).toBe(false);
  expect(receiveGroupFits(1, MAX_BATCH_RECORDS + 1)).toBe(false);
});
