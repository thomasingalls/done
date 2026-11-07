// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createReceiveQuietPages } from '../src/crdt/receiveQuietPages';
import { RECEIVE_SINGLE_PAGE_BYTES } from '../src/crdt/receivePrefetch';
import { MAX_PENDING_BYTES } from '../src/crdt/admissionQueue';
import type { InboundReadCursor } from '../src/crdt/inboundLedger';
import { verifyInboundPage } from '../src/crdt/accountInbound';
import { decodeInboundRequest, encodeInboundRequest } from '../account-protocol/inboundTransport';
import { A, B, packet, sources } from './account-inbound/fixtures';
import { context, live, reframe } from './account-inbound-codecs/oracle';
import type { Bytes } from '../src/crdt/custodyCrypto';
import { createReceiveSelection } from '../src/crdt/receiveSelection';

afterEach(() => vi.restoreAllMocks());

it('a reply arriving after the request-start quiet budget cannot refresh selector evidence', () => {
  let now = 1000;
  const selection = createReceiveSelection(() => now, true),
    authority = {};
  const cursor: InboundReadCursor = {
    conflict: false,
    prefix: { position: 0, link: '00'.repeat(32), observedThrough: 0 },
  };
  const token = selection.captureQuiet(authority, A, cursor);
  now = 1750;
  expect(selection.completedQuiet(token, 'empty')).toBe(false);
  expect(
    selection.next(
      [A, B],
      { publisher: 'self', pending: false, peerBacklog: true },
      { context: authority, peers: new Map([[A, cursor]]) },
    ),
  ).toBe(A);
});
function setup() {
  let now = 1000;
  const owner = new AbortController(),
    revision = new AbortController(),
    authority = {};
  const cache = createReceiveQuietPages(owner.signal, () => now),
    scheduling = {};
  const wire = packet(sources().entries[0]!);
  const cursor: InboundReadCursor = { conflict: false, prefix: { ...context(A).prefix } };
  const capture = (publisher = A, c = cursor) =>
    cache.capture({
      context: authority,
      publisher,
      cursor: c,
      scheduling,
      startedAt: now,
      signal: revision.signal,
    });
  return {
    owner,
    revision,
    authority,
    cache,
    scheduling,
    cursor,
    wire,
    capture,
    time: (at: number) => {
      now = at;
    },
  };
}

it('transfers independent exact originals once, with no decoded proof or progress', async () => {
  const x = setup(),
    request = x.wire.request.slice(),
    page = x.wire.page.slice();
  expect(x.cache.remember(request, page, x.capture())).toBe(true);
  request.fill(0);
  page.fill(0);
  const taken = x.cache.take(x.authority, A, x.cursor)!;
  expect(Object.keys(taken)).toEqual(['request', 'page', 'scheduling']);
  expect(taken.request).toEqual(x.wire.request);
  expect(taken.page).toEqual(x.wire.page);
  expect(taken.scheduling).toBe(x.scheduling);
  expect(x.cache.take(x.authority, A, x.cursor)).toBeUndefined();
  expect(x.cache.bytes).toBe(0);
  const verified = await verifyInboundPage(context(A), taken.request, taken.page, live);
  expect(verified.kind).toBe('received');
  if (verified.kind === 'received') expect(verified.updates).toEqual(sources().entries[0]!.updates);
  x.cache.close();
  expect(taken.page).toEqual(x.wire.page); // Consumer now owns erasure.
});

it('cached originals still undergo signature, request binding and page framing checks', async () => {
  for (const bad of ['signature', 'request', 'framing']) {
    const x = setup();
    const p =
      bad === 'request'
        ? packet(sources().entries[0]!, 1, 2).page
        : bad === 'framing'
          ? x.wire.page.slice(0, -1)
          : (() => {
              const p = x.wire.page.slice();
              p[p.length - 3] = p[p.length - 3] === 48 ? 49 : 48;
              return p;
            })();
    expect(x.cache.remember(x.wire.request, p, x.capture())).toBe(true);
    const taken = x.cache.take(x.authority, A, x.cursor)!;
    await expect(verifyInboundPage(context(A), taken.request, taken.page, live)).rejects.toThrow();
    expect(context(A).prefix.position).toBe(0);
    x.cache.close();
  }
});

it('does not extend a page age by storing or consuming it later', () => {
  for (const age of [749, 750]) {
    const x = setup(),
      token = x.capture();
    x.time(1400);
    expect(x.cache.remember(x.wire.request, x.wire.page, token)).toBe(true);
    x.time(1000 + age);
    expect(!!x.cache.take(x.authority, A, x.cursor)).toBe(age === 749);
    x.cache.close();
  }
});

it('rejects an expired response, a late capture and request-scope substitutions', () => {
  const x = setup();
  const original = decodeInboundRequest(x.wire.request);
  for (const changed of [{ publisher: B }, { after: 1 }, { limit: 2 }, { expires: 1000 }]) {
    const request = encodeInboundRequest({ ...original, ...changed });
    expect(x.cache.remember(request, x.wire.page, x.capture())).toBe(false);
  }
  const token = x.capture();
  x.time(1750);
  expect(x.cache.remember(x.wire.request, x.wire.page, token)).toBe(false);
  expect(x.cache.entries).toBe(0);
  x.cache.close();
});

it('limits expanded quiet work to one position per original and eight retained originals', () => {
  const x = setup(),
    original = decodeInboundRequest(x.wire.request);
  for (let i = 1; i <= 9; i++) {
    const id = i.toString(16).padStart(32, '0');
    const request = encodeInboundRequest({ ...original, publisher: id });
    expect(x.cache.remember(request, x.wire.page, x.capture(id))).toBe(true);
  }
  expect(x.cache.entries).toBe(8);
  expect(x.cache.take(x.authority, '1'.padStart(32, '0'), x.cursor)).toBeUndefined();
  expect(x.cache.bytes).toBeLessThanOrEqual(MAX_PENDING_BYTES);
  x.cache.close();
});

it('reserves the next response against retained original bytes before any I/O', () => {
  const x = setup(),
    original = decodeInboundRequest(x.wire.request);
  for (let i = 1; i <= 8; i++) {
    const id = i.toString(16).padStart(32, '0');
    x.cache.remember(
      encodeInboundRequest({ ...original, publisher: id }),
      new Uint8Array(RECEIVE_SINGLE_PAGE_BYTES).fill(i),
      x.capture(id),
    );
    expect(x.cache.bytes).toBeLessThanOrEqual(MAX_PENDING_BYTES);
  }
  const reservation = 2 * (RECEIVE_SINGLE_PAGE_BYTES + 4);
  const available = x.cache.reserve(reservation);
  expect(available).toBeGreaterThanOrEqual(reservation);
  expect(available + x.cache.bytes).toBe(MAX_PENDING_BYTES);
  for (const n of [-1, NaN, MAX_PENDING_BYTES + 1]) expect(() => x.cache.reserve(n)).toThrow();
  expect(
    x.cache.remember(x.wire.request, new Uint8Array(RECEIVE_SINGLE_PAGE_BYTES + 1), x.capture()),
  ).toBe(false);
  x.cache.close();
});

it('checks exact native cursor, link, through, conflict and starting-point ownership', () => {
  const variants: ((c: InboundReadCursor) => void)[] = [
    (c) => {
      c.prefix.position++;
    },
    (c) => {
      c.prefix.link = 'ff'.repeat(32);
    },
    (c) => {
      c.prefix.observedThrough++;
    },
    (c) => {
      c.conflict = true;
    },
    (c) => {
      c.startingPoint = { position: 0, link: '00'.repeat(32) };
    },
  ];
  for (const change of variants) {
    const x = setup();
    expect(x.cache.remember(x.wire.request, x.wire.page, x.capture())).toBe(true);
    const cursor = structuredClone(x.cursor);
    change(cursor);
    expect(x.cache.take(x.authority, A, cursor)).toBeUndefined();
    expect(x.cache.entries).toBe(0);
    x.cache.close();
  }
});

it('captures cursor values rather than borrowing a caller-mutable projection', () => {
  const x = setup(),
    token = x.capture();
  x.cursor.prefix.position = 2;
  expect(x.cache.remember(x.wire.request, x.wire.page, token)).toBe(true);
  expect(x.cache.take(x.authority, A, x.cursor)).toBeUndefined();
  x.cache.close();
});

it('hint invalidation and context replacement fence outstanding network completions', () => {
  const x = setup();
  const hinted = x.capture();
  x.cache.drop();
  const afterHint = x.capture();
  expect(x.cache.remember(x.wire.request, x.wire.page, hinted)).toBe(false);
  expect(x.cache.remember(x.wire.request, x.wire.page, afterHint)).toBe(true);
  x.cache.drop();
  const old = x.capture();
  x.cache.capture({
    context: {},
    publisher: A,
    cursor: x.cursor,
    scheduling: {},
    startedAt: 1000,
    signal: x.revision.signal,
  });
  expect(x.cache.remember(x.wire.request, x.wire.page, old)).toBe(false);
  expect(x.cache.entries).toBe(0);
  x.cache.close();
});

it('cancellation, hint drop and close erase owned copies, leaving caller bytes intact', () => {
  for (const action of ['cancel', 'hint', 'close']) {
    const x = setup(),
      copies: Bytes[] = [],
      slice = Uint8Array.prototype.slice;
    vi.spyOn(Uint8Array.prototype, 'slice').mockImplementation(function (
      this: Bytes,
      ...args: Parameters<Bytes['slice']>
    ) {
      const b = slice.apply(this, args);
      if (this === x.wire.request || this === x.wire.page) copies.push(b);
      return b;
    });
    expect(x.cache.remember(x.wire.request, x.wire.page, x.capture())).toBe(true);
    expect(copies).toHaveLength(2);
    if (action === 'cancel') x.revision.abort();
    else if (action === 'hint') x.cache.drop();
    else x.owner.abort();
    expect(copies.every((b) => b.every((n) => n === 0))).toBe(true);
    expect(x.wire.page.some((n) => n !== 0)).toBe(true);
    expect(x.cache.entries).toBe(0);
    x.cache.close();
    vi.restoreAllMocks();
  }
});

it('drops on rollback and nonfinite clocks without resurrecting old captures', () => {
  for (const bad of [999, NaN, Infinity]) {
    const x = setup(),
      late = x.capture();
    x.cache.remember(x.wire.request, x.wire.page, x.capture());
    x.time(bad);
    expect(x.cache.take(x.authority, A, x.cursor)).toBeUndefined();
    x.time(1000);
    expect(x.cache.remember(x.wire.request, x.wire.page, late)).toBe(false);
    x.cache.close();
  }
});

it('throttles only speculative repeats and never suppresses a native cache miss', () => {
  const x = setup();
  expect(x.cache.wanted(x.authority, A, x.cursor)).toBe(true);
  expect(x.cache.wanted(x.authority, A, x.cursor)).toBe(false);
  expect(x.cache.take(x.authority, A, x.cursor)).toBeUndefined();
  x.time(1750);
  expect(x.cache.wanted(x.authority, A, x.cursor)).toBe(true);
  x.owner.abort();
  expect(x.cache.wanted(x.authority, A, x.cursor)).toBe(false);
  expect(x.capture()).toBeUndefined();
});

it('expiry is still checked by the native verifier after an exact raw transfer', async () => {
  const x = setup();
  const wire = reframe(x.wire, {
    request: (r) => {
      r[13] = 1100;
    },
  });
  x.cache.remember(wire.request, wire.page, x.capture());
  const taken = x.cache.take(x.authority, A, x.cursor)!;
  await expect(
    verifyInboundPage(context(A), taken.request, taken.page, { ...live, now: () => 1100 }),
  ).rejects.toThrow();
  x.cache.close();
});
