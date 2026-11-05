// @vitest-environment node
import { expect, it } from 'vitest';
import { createReceiveSelection } from '../src/crdt/receiveSelection';
import { createReceiveSweep } from '../src/crdt/accountSyncDriver';
import { createReceiveQuietPages } from '../src/crdt/receiveQuietPages';
import { createReceivePageTransport, type ReceivePageIO } from '../src/crdt/receivePageTransport';
import { MAX_PENDING_BYTES } from '../src/crdt/admissionQueue';
import { decodeInboundBatch, encodeInboundBatchPages } from '../account-protocol/inboundBatch';
import { decodeInboundRequest } from '../account-protocol/inboundTransport';
import { verifyInboundPage } from '../src/crdt/accountInbound';
import type { InboundReadCursor } from '../src/crdt/inboundLedger';
import { A, B, READER, packet, sources } from './account-inbound/fixtures';
import { context, live } from './account-inbound-codecs/oracle';

const cursor = (position = 0, through = position): InboundReadCursor => ({
  conflict: false,
  prefix: { position, observedThrough: through, link: '00'.repeat(32) },
});

it('uses only spare wire slots in native publisher order, excluding the own and selected streams', () => {
  const s = createReceiveSelection(() => 1000, true),
    authority = {};
  const publishers = ['own', 'a', 'b', 'c', 'd', 'e'];
  const view = { context: authority, cursor: () => cursor() };
  for (let slots = 0; slots <= 3; slots++) {
    expect(
      s.quietCandidates(publishers, 'own', 'b', slots, view, () => true).map((p) => p.publisher),
    ).toEqual(['c', 'd', 'e'].slice(0, slots));
  }
  expect(
    s.quietCandidates(publishers, 'own', 'e', 3, view, () => true).map((p) => p.publisher),
  ).toEqual(['a', 'b', 'c']);
  expect(s.next(publishers)).toBe('own');
});

it('starts due-soon speculation 250ms before request-start expiry, without refreshing evidence', () => {
  let now = 1000;
  const s = createReceiveSelection(() => now, true),
    authority = {},
    quiet = cursor();
  const token = s.captureQuiet(authority, 'a', quiet);
  now = 1300;
  s.completedQuiet(token, 'empty');
  const plan = () =>
    s.quietCandidates(
      ['own', 'a'],
      'own',
      'own',
      1,
      { context: authority, cursor: () => quiet },
      () => true,
    );
  now = 1499;
  expect(plan()).toEqual([]);
  now = 1500;
  expect(plan().map((p) => p.publisher)).toEqual(['a']);
  now = 1750;
  expect(
    s.next(
      ['a', 'busy'],
      { publisher: 'own', pending: false, peerBacklog: true },
      { context: authority, peers: new Map([['a', quiet]]) },
    ),
  ).toBe('a');
});

it('never speculates on conflicted or positive-backlog peers, and respects an owned raw-cache hit', () => {
  const s = createReceiveSelection(() => 1000, true),
    authority = {};
  const peers = new Map([
    ['conflict', { ...cursor(), conflict: true }],
    ['busy', cursor(0, 100)],
    ['cached', cursor()],
    ['new', cursor()],
  ]);
  const result = s.quietCandidates(
    ['own', ...peers.keys()],
    'own',
    'own',
    3,
    { context: authority, cursor: (id) => peers.get(id)! },
    (id) => id !== 'cached',
  );
  expect(result.map((p) => p.publisher)).toEqual(['new']);
});

it('disabled, full and invalid plans cannot manufacture extra reads', () => {
  const view = {
    context: {},
    cursor: () => {
      throw Error('must not read');
    },
  };
  expect(
    createReceiveSelection(() => 1000).quietCandidates(
      ['own', 'a'],
      'own',
      'own',
      3,
      view,
      () => true,
    ),
  ).toEqual([]);
  const s = createReceiveSelection(() => 1000, true);
  expect(s.quietCandidates(['own', 'a'], 'own', 'own', 0, view, () => true)).toEqual([]);
  expect(s.quietCandidates(['own', 'a'], 'own', 'missing', 1, view, () => true)).toEqual([]);
  for (const slots of [-1, 5, NaN])
    expect(() => s.quietCandidates(['own', 'a'], 'own', 'own', slots, view, () => true)).toThrow();
});

it('keeps continuous round robin and position allowance identical with and without a known backlog', () => {
  for (const backlog of [false, true]) {
    let now = 1000;
    const s = createReceiveSelection(() => now, true),
      control = createReceiveSelection(() => now, true);
    const publishers = ['quiet-a', 'own', 'busy', 'quiet-b', 'quiet-c'],
      authority = {};
    const peers = new Map(
      publishers.map((id) => [id, cursor(0, id === 'busy' && backlog ? 1000 : 0)]),
    );
    const own = { publisher: 'own', pending: false, peerBacklog: backlog };
    const view = { context: authority, peers };
    const seen: string[] = [];
    for (let i = 0; i < 160; i++) {
      const selected = s.next(publishers, own, view);
      expect(selected).toBe(control.next(publishers, own, view));
      seen.push(selected);
      const planned = s.quietCandidates(
        publishers,
        'own',
        selected,
        3,
        { context: authority, cursor: (id) => peers.get(id)! },
        () => true,
      );
      expect(planned.length).toBeLessThanOrEqual(3);
      expect(
        planned.some(
          (p) =>
            p.publisher === 'own' ||
            p.publisher === selected ||
            (backlog && p.publisher === 'busy'),
        ),
      ).toBe(false);
      const productive = backlog && selected === 'busy';
      const a = s.captureQuiet(authority, selected, peers.get(selected)!);
      const b = control.captureQuiet(authority, selected, peers.get(selected)!);
      s.completed(publishers, selected, productive, selected === 'own');
      control.completed(publishers, selected, productive, selected === 'own');
      s.completedQuiet(a, productive ? 'received' : 'empty');
      control.completedQuiet(b, productive ? 'received' : 'empty');
      expect(s.capacity(selected)).toBe(control.capacity(selected));
      now += 100;
    }
    for (const id of publishers) expect(seen).toContain(id);
  }
});

it('planning quiet requests does not prevent the sweep yielding when publication becomes due', async () => {
  const s = createReceiveSelection(() => 1000, true),
    sweep = createReceiveSweep(),
    authority = {};
  const publishers = ['own', 'a', 'b'];
  let due = false;
  const seen: string[] = [];
  const result = await sweep.run(
    authority,
    publishers.length,
    async () => {
      const selected = s.next(publishers);
      seen.push(selected);
      s.quietCandidates(
        publishers,
        'own',
        selected,
        3,
        { context: authority, cursor: () => cursor() },
        () => true,
      );
      s.completed(publishers, selected, false);
      due = true;
      return { kind: 'idle', receivedThrough: 0 };
    },
    () => due,
  );
  expect(result.kind).toBe('yielded');
  expect(seen).toEqual(['own']);
});

it('clock rollback and new contexts do not hide any native publisher or a due quiet probe', () => {
  let now = 1000;
  const s = createReceiveSelection(() => now, true),
    authority = {},
    c = cursor();
  s.completedQuiet(s.captureQuiet(authority, 'a', c), 'empty');
  now = NaN;
  expect(
    s.quietCandidates(
      ['own', 'a'],
      'own',
      'own',
      1,
      { context: authority, cursor: () => c },
      () => true,
    ),
  ).toEqual([]);
  now = 999;
  expect(
    s.quietCandidates(['own', 'a'], 'own', 'own', 1, { context: {}, cursor: () => c }, () => true),
  ).toHaveLength(1);
  expect(s.next(['a', 'own'])).toBe('a');
});

it('a mixed signed batch hands a peer to the ordinary verifier only at its later native turn', async () => {
  const entries = sources().entries;
  const a = packet(entries.find((e) => e.publisher === A && e.position === 1)!);
  const b = packet(entries.find((e) => e.publisher === B && e.position === 1)!);
  const owner = new AbortController(),
    authority = {},
    cache = createReceiveQuietPages(owner.signal, () => 1000);
  const c = cursor(),
    scheduling = {};
  const token = cache.capture({
    context: authority,
    publisher: B,
    cursor: c,
    scheduling,
    startedAt: 1000,
    signal: owner.signal,
  });
  const io: ReceivePageIO = {
    read: async () => {
      throw Error('must batch');
    },
    batch: async (body) => {
      const requests = decodeInboundBatch(body);
      expect(requests.map((r) => decodeInboundRequest(r).publisher)).toEqual([A, B]);
      expect(requests.some((r) => decodeInboundRequest(r).publisher === READER)).toBe(false);
      return encodeInboundBatchPages([a.page, b.page]);
    },
  };
  const maxBytes = cache.reserve(MAX_PENDING_BYTES);
  const result = await createReceivePageTransport()(
    [a.request, b.request],
    owner.signal,
    io,
    () => true,
    A,
    { primaryCount: 1, maxBytes },
  );
  expect(result.pages).toEqual([a.page]);
  expect(result.attempted).toBe(1);
  expect(await verifyInboundPage(context(A), a.request, result.pages[0]!, live)).toMatchObject({
    kind: 'received',
    position: 1,
  });
  expect(cache.remember(b.request, result.quietPages![0]!, token)).toBe(true);
  const selected = cache.take(authority, B, c)!;
  expect(await verifyInboundPage(context(B), selected.request, selected.page, live)).toMatchObject({
    kind: 'received',
    position: 1,
  });
  owner.abort();
});
