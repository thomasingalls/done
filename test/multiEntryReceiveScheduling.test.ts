// @vitest-environment node
import { expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { createReceiveSelection, receiveReadWidths } from '../src/crdt/receiveSelection';
import { createReceivePageTransport } from '../src/crdt/receivePageTransport';
import { READ_COUNT_LIMIT } from '../account-protocol/deliveryTransport';
import { encodeInboundBatchPages } from '../account-protocol/inboundBatch';
import { encodeInboundRequest, decodeInboundRequest } from '../account-protocol/inboundTransport';
const pub = (n: number) => n.toString(16).padStart(32, '0');
it('request widths consume the existing position allowance and split only at the selected width', () => {
  expect(receiveReadWidths(4, 8)).toEqual([4]);
  expect(receiveReadWidths(3, 4)).toEqual([3]);
  expect(receiveReadWidths(4, 1)).toEqual([1, 1, 1, 1]);
  expect(receiveReadWidths(4, 2)).toEqual([2, 2]);
  for (const [count, width] of [
    [0, 4],
    [9, 4],
    [1.5, 4],
    [4, 0],
    [4, 9],
    [4, NaN],
  ])
    expect(() => receiveReadWidths(count!, width!)).toThrow();
});
it('eight verified positions rotate even when they arrive in one page', () => {
  const s = createReceiveSelection(),
    ps = [pub(1), pub(2), pub(3)];
  expect(s.next(ps)).toBe(ps[0]);
  s.completed(ps, ps[0]!, true, false, 8);
  expect(s.next(ps)).toBe(ps[1]);
});
it('a short range consumes only its actual verified positions', () => {
  const s = createReceiveSelection(),
    ps = [pub(1), pub(2)];
  s.next(ps);
  s.completed(ps, ps[0]!, true, false, 2);
  expect(s.capacity(ps[0]!)).toBe(6);
  expect(s.next(ps)).toBe(ps[0]);
  s.completed(ps, ps[0]!, true, false, 6);
  expect(s.next(ps)).toBe(ps[1]);
});
it('bad or excessive position credit refuses before changing the publisher turn', () => {
  const s = createReceiveSelection(),
    ps = [pub(1), pub(2)];
  s.next(ps);
  s.completed(ps, ps[0]!, true, false, 7);
  expect(s.capacity(ps[0]!)).toBe(1);
  for (const count of [0, 2, 8, 9, -1, 1.5, NaN])
    expect(() => s.completed(ps, ps[0]!, true, false, count)).toThrow();
  expect(s.capacity(ps[0]!)).toBe(1);
  expect(s.next(ps)).toBe(ps[0]);
});
it('weighted mixed range sizes cannot extend a turn beyond eight positions', () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 1, max: 8 }), { minLength: 1, maxLength: 120 }),
      (sizes) => {
        const ps = [pub(1), pub(2), pub(3)],
          s = createReceiveSelection();
        let previous: string | undefined,
          total = 0;
        for (const requested of sizes) {
          const p = s.next(ps),
            count = Math.min(requested, s.capacity(p));
          total = p === previous ? total + count : count;
          expect(total).toBeLessThanOrEqual(8);
          s.completed(ps, p, true, false, count);
          previous = p;
        }
      },
    ),
    { numRuns: 100, seed: 2852026 },
  );
});
it('range-size hints narrow only their publisher and bounded eviction permits safe reprobes', () => {
  const p = createReceivePageTransport();
  expect(p.entryLimit(pub(1))).toBe(READ_COUNT_LIMIT);
  p.narrow(pub(1));
  expect(p.entryLimit(pub(1))).toBe(1);
  expect(p.entryLimit(pub(2))).toBe(READ_COUNT_LIMIT);
  for (let i = 2; i <= 129; i++) p.narrow(pub(i));
  expect(p.entryLimit(pub(1))).toBe(READ_COUNT_LIMIT);
  expect(p.entryLimit(pub(129))).toBe(1);
  for (const bad of ['', '__proto__', 'ff', 'Z'.repeat(32)]) expect(() => p.narrow(bad)).toThrow();
});
it('narrowing does not rewrite a captured signature or disable optional batching', async () => {
  const p = createReceivePageTransport(),
    publisher = pub(1);
  p.narrow(publisher);
  const request = (after: number) =>
    encodeInboundRequest({
      serviceId: pub(3),
      origin: 'https://fixture.invalid',
      workspace: pub(4),
      reader: pub(2),
      publisher,
      lineage: 'aa'.repeat(32),
      head: 'bb'.repeat(32),
      epoch: 1,
      after,
      limit: 1,
      nonce: 'cc'.repeat(32),
      expires: 30000,
      signature: 'dd'.repeat(64),
    });
  const requests = [request(0), request(1)],
    saved = requests.map((b) => b.slice()),
    read = vi.fn(async () => null),
    batch = vi.fn(async () => encodeInboundBatchPages([new Uint8Array([7])]));
  const result = await p(
    requests,
    new AbortController().signal,
    { read, batch },
    () => false,
    publisher,
  );
  expect(batch).toHaveBeenCalledOnce();
  expect(read).not.toHaveBeenCalled();
  expect(result.pages).toHaveLength(1);
  expect(requests).toEqual(saved);
  expect(decodeInboundRequest(requests[0]!).signature).toBe('dd'.repeat(64));
});
