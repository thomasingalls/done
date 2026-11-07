// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createReceiveRangeTail } from '../src/crdt/receiveRangeTail';
import { RECEIVE_SINGLE_PAGE_BYTES } from '../src/crdt/receivePrefetch';
import { MAX_PENDING_BYTES } from '../src/crdt/admissionQueue';
import { A, B, packet, sources } from './account-inbound/fixtures';
import { hex, reframe } from './account-inbound-codecs/oracle';
import type { Bytes } from '../src/crdt/custodyCrypto';
afterEach(() => vi.restoreAllMocks());
function setup() {
  const e = sources().entries.slice(0, 2),
    p = reframe(packet(e[0]!), {
      request: (r) => {
        r[11] = 8;
      },
      page: (p) => {
        p[3] = 2;
        p[4] = 2;
        p[5] = e.map((e) => [hex(e.envelope), hex(e.proof)]);
      },
    }),
    owner = new AbortController(),
    revision = new AbortController(),
    context = {},
    tail = createReceiveRangeTail(owner.signal, () => 1000);
  return {
    ...p,
    tail,
    owner,
    revision,
    context,
    basis: { context, signal: revision.signal, after: 1 },
  };
}
it('a raw tail transfers exact original bytes once, after the native cursor advances', () => {
  const x = setup();
  expect(x.tail.remember(x.request, x.page, x.basis)).toBe(true);
  const taken = x.tail.take(x.context, A, 1)!;
  expect(taken.request).toEqual(x.request);
  expect(taken.page).toEqual(x.page);
  expect(Object.keys(taken)).toEqual(['request', 'page']);
  expect(x.tail.bytes).toBe(0);
  expect(x.tail.take(x.context, A, 1)).toBeUndefined();
  x.tail.close();
  expect(taken.page).toEqual(x.page);
});
it('caller mutation cannot rewrite a retained original', () => {
  const x = setup(),
    request = x.request.slice(),
    page = x.page.slice();
  expect(x.tail.remember(x.request, x.page, x.basis)).toBe(true);
  x.request.fill(0);
  x.page.fill(0);
  const taken = x.tail.take(x.context, A, 1)!;
  expect(taken.request).toEqual(request);
  expect(taken.page).toEqual(page);
});
it('another publisher single-page probe preserves the bounded raw tail', () => {
  const x = setup();
  expect(x.tail.remember(x.request, x.page, x.basis)).toBe(true);
  x.tail.beforeFetch(1);
  expect(x.tail.take(x.context, B, 1)).toBeUndefined();
  expect(x.tail.bytes + RECEIVE_SINGLE_PAGE_BYTES + 4).toBeLessThanOrEqual(MAX_PENDING_BYTES);
  expect(x.tail.take(x.context, A, 1)).toBeDefined();
});
it('a changed native cursor or authority identity discards the old raw tail', () => {
  const x = setup();
  expect(x.tail.remember(x.request, x.page, x.basis)).toBe(true);
  expect(x.tail.take({}, A, 1)).toBeUndefined();
  expect(x.tail.bytes).toBe(0);
  expect(x.tail.remember(x.request, x.page, x.basis)).toBe(true);
  expect(x.tail.take(x.context, A, 0)).toBeUndefined();
  expect(x.tail.bytes).toBe(0);
});
it('revision and owner retirement erase retained buffers and cannot transfer trust', () => {
  const x = setup(),
    copies: Bytes[] = [],
    slice = Uint8Array.prototype.slice;
  vi.spyOn(Uint8Array.prototype, 'slice').mockImplementation(function (
    this: Bytes,
    ...args: Parameters<Bytes['slice']>
  ) {
    const b = slice.apply(this, args);
    if (this === x.request || this === x.page) copies.push(b);
    return b;
  });
  expect(x.tail.remember(x.request, x.page, x.basis)).toBe(true);
  expect(copies).toHaveLength(2);
  x.revision.abort();
  expect(copies.every((b) => b.every((v) => v === 0))).toBe(true);
  expect(x.tail.bytes).toBe(0);
  expect(
    x.tail.remember(x.request, x.page, { ...x.basis, signal: new AbortController().signal }),
  ).toBe(true);
  x.owner.abort();
  expect(copies.every((b) => b.every((v) => v === 0))).toBe(true);
  expect(x.tail.take(x.context, A, 1)).toBeUndefined();
  expect(x.tail.remember(x.request, x.page, x.basis)).toBe(false);
});
it('expiration and a backward or invalid clock discard cached originals', () => {
  for (const next of [40000, 999, NaN]) {
    const x = setup();
    let at = 1000;
    const tail = createReceiveRangeTail(x.owner.signal, () => at);
    expect(tail.remember(x.request, x.page, x.basis)).toBe(true);
    at = next;
    expect(tail.take(x.context, A, 1)).toBeUndefined();
    expect(tail.bytes).toBe(0);
  }
});
it('a legacy multi-request reservation evicts the tail before launching I/O', () => {
  const x = setup();
  expect(x.tail.remember(x.request, x.page, x.basis)).toBe(true);
  x.tail.beforeFetch(4);
  expect(x.tail.bytes).toBe(0);
  expect(x.tail.take(x.context, A, 1)).toBeUndefined();
});
it('unconsumed, exhausted, malformed and oversized originals cannot enter the tail slot', () => {
  const x = setup();
  for (const after of [0, 2, 3, NaN])
    expect(x.tail.remember(x.request, x.page, { ...x.basis, after })).toBe(false);
  expect(x.tail.remember(x.request, new Uint8Array(RECEIVE_SINGLE_PAGE_BYTES), x.basis)).toBe(
    false,
  );
  expect(x.tail.remember(new Uint8Array([1]), x.page, x.basis)).toBe(false);
  expect(x.tail.bytes).toBe(0);
});
it('publisher-specific removal preserves a different publisher tail', () => {
  const x = setup();
  expect(x.tail.remember(x.request, x.page, x.basis)).toBe(true);
  x.tail.drop(B);
  expect(x.tail.bytes).toBeGreaterThan(0);
  x.tail.drop(A);
  expect(x.tail.bytes).toBe(0);
});
