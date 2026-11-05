// @vitest-environment node
import { expect, it } from 'vitest';
import { receiveOriginalsFit as fit } from '../src/crdt/receiveOriginalsBudget';
import { MAX_PENDING_BYTES } from '../src/crdt/admissionQueue';
import { createReceiveQuietPages } from '../src/crdt/receiveQuietPages';
import { createReceiveRangeTail } from '../src/crdt/receiveRangeTail';
import { A, packet, sources } from './account-inbound/fixtures';
import { context, reframe, hex } from './account-inbound-codecs/oracle';
import { decodeInboundRequest, encodeInboundRequest } from '../account-protocol/inboundTransport';
import type { InboundReadCursor } from '../src/crdt/inboundLedger';
function setup() {
  const owner = new AbortController(),
    revision = new AbortController(),
    authority = {},
    scheduling = {},
    now = 1000,
    cache = createReceiveQuietPages(owner.signal, () => now),
    wire = packet(sources().entries[0]!),
    original = decodeInboundRequest(wire.request),
    cursor: InboundReadCursor = { conflict: false, prefix: { ...context(A).prefix } };
  for (let i = 1; i <= 8; i++) {
    const publisher = i.toString(16).padStart(32, '0'),
      capture = cache.capture({
        context: authority,
        publisher,
        cursor,
        scheduling,
        startedAt: now,
        signal: revision.signal,
      });
    expect(
      cache.remember(encodeInboundRequest({ ...original, publisher }), wire.page, capture),
    ).toBe(true);
  }
  return { owner, revision, authority, cache, wire };
}
it('combined originals honor all three independent existing ceilings', () => {
  expect(fit({ bytes: MAX_PENDING_BYTES, entries: 8, positions: 32 })).toBe(true);
  for (const extra of [
    { bytes: 1, entries: 0, positions: 0 },
    { bytes: 0, entries: 1, positions: 0 },
    { bytes: 0, entries: 0, positions: 1 },
  ])
    expect(fit({ bytes: MAX_PENDING_BYTES, entries: 8, positions: 32 }, extra)).toBe(false);
  for (const bad of [-1, NaN, Infinity, 1.5])
    expect(fit({ bytes: 0, entries: bad, positions: 0 })).toBe(false);
});
it('a four-request flight leaves at most four quiet originals before launch', () => {
  const x = setup();
  try {
    const reserve = x.cache.reserve as (
      minimum: number,
      other: { entries: number; positions: number },
    ) => number;
    reserve(100, { entries: 4, positions: 8 });
    expect(x.cache.entries).toBe(4);
    expect(
      fit(
        { bytes: 100, entries: 4, positions: 8 },
        { bytes: x.cache.bytes, entries: x.cache.entries, positions: x.cache.entries },
      ),
    ).toBe(true);
  } finally {
    x.owner.abort();
  }
});
it('a full32-position reservation evicts every quiet original and never raises the cap', () => {
  const x = setup();
  try {
    const reserve = x.cache.reserve as (
      minimum: number,
      other: { entries: number; positions: number },
    ) => number;
    reserve(100, { entries: 4, positions: 32 });
    expect(x.cache.entries).toBe(0);
    for (const other of [
      { entries: 9, positions: 1 },
      { entries: 1, positions: 33 },
      { entries: -1, positions: 1 },
    ])
      expect(() => reserve(100, other)).toThrow();
  } finally {
    x.owner.abort();
  }
});
it('a range tail counts its whole original allowance and erases that pressure on retirement', () => {
  const owner = new AbortController(),
    revision = new AbortController(),
    scope = {},
    entries = sources().entries.slice(0, 2),
    wire = reframe(packet(entries[0]!), {
      request: (r) => {
        r[11] = 8;
      },
      page: (p) => {
        p[3] = 2;
        p[4] = 2;
        p[5] = entries.map((e) => [hex(e.envelope), hex(e.proof)]);
      },
    }),
    tail = createReceiveRangeTail(owner.signal, () => 1000);
  expect(
    tail.remember(wire.request, wire.page, { context: scope, signal: revision.signal, after: 1 }),
  ).toBe(true);
  const usage = Reflect.get(tail, 'reservation');
  expect(usage).toEqual({ bytes: tail.bytes, entries: 1, positions: 8 });
  revision.abort();
  expect(Reflect.get(tail, 'reservation')).toEqual({ bytes: 0, entries: 0, positions: 0 });
  owner.abort();
});
it('cache plus a tail plus a three-request flight share logical space before copy', () => {
  const x = setup();
  try {
    const reserve = x.cache.reserve as (
      minimum: number,
      other: { entries: number; positions: number },
    ) => number;
    reserve(200, { entries: 4, positions: 32 });
    expect(x.cache.entries).toBe(0);
    expect(
      fit({ bytes: 100, entries: 1, positions: 8 }, { bytes: 100, entries: 3, positions: 24 }),
    ).toBe(true);
    expect(
      fit(
        { bytes: 100, entries: 1, positions: 8 },
        { bytes: 100, entries: 3, positions: 24 },
        { bytes: x.wire.page.length, entries: 1, positions: 1 },
      ),
    ).toBe(false);
  } finally {
    x.owner.abort();
  }
});

it('reservation metadata cannot replace the required byte amount', () => {
  const x = setup();
  try {
    const other = { entries: 0, positions: 0, bytes: 0 };
    x.cache.reserve(MAX_PENDING_BYTES, other);
    expect(x.cache.entries).toBe(0);
  } finally {
    x.owner.abort();
  }
});
