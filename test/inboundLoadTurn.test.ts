// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../account-protocol/inboundTransport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../account-protocol/inboundTransport')>();
  return {
    ...actual,
    decodeInboundRequest: vi.fn(actual.decodeInboundRequest),
    decodeInboundPage: vi.fn(actual.decodeInboundPage),
  };
});
import { decodeInboundPage, decodeInboundRequest } from '../account-protocol/inboundTransport';
import { emptySpoolWitness } from '../src/crdt/contentRecord';
import { extendSpoolWitness } from '../src/crdt/spoolRecord';
import type { Bytes } from '../src/crdt/custodyCrypto';
import {
  replayFullLocalHistory,
  prepareLocalBaseline,
  replayLocalBaseline,
} from '../src/crdt/localBaselineReplay';
import { fullHistoryPageFixture } from './inbound-page/full-history-fixtures';
import { createInboundReceiptTurn } from '../src/crdt/accountInbound';
import { inspectInbound, verifyInboundLedger } from '../src/crdt/inboundLedger';
import { indexVerifiedLedger, sameAccountLedger } from '../src/crdt/incrementalAccountLedger';
import { emptyDelivery } from '../src/crdt/deliveryRecord';
import { eraseVerified } from '../src/crdt/verifiedRecords';
import { decodeNetworkEnvelope } from '../account-protocol/envelope';
let f: Awaited<ReturnType<typeof fullHistoryPageFixture>> | undefined;
afterEach(() => {
  f?.cleanup();
  f = undefined;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it('full recovery owns one binary parse through genuine witness, authority, coverage and final snapshot checks', async () => {
  f = await fullHistoryPageFixture(Array(8).fill(21));
  const before = f.records.map((r) => r.bytes.slice()),
    input = { records: f.records, counter: await f.counter() };
  vi.clearAllMocks();
  const replay = await replayFullLocalHistory(input, f.context);
  try {
    expect(decodeInboundPage).toHaveBeenCalledTimes(1);
    expect(decodeInboundRequest).toHaveBeenCalledTimes(1);
    const state = replay.inbound.peers!.get(f.publisher)!;
    expect(state.prefix.position).toBe(8);
    for (const [n, r] of state.retained) {
      expect(decodeNetworkEnvelope(r.envelope).seq).toBe(n);
      expect(r.envelope).toEqual(f.received[n - 1]!.envelope);
    }
    for (const [i, r] of f.records.entries()) expect(r.bytes).toEqual(before[i]);
  } finally {
    eraseVerified(replay);
  }
});
it('independent full recoveries each verify their own page rather than retaining cross-load syntax', async () => {
  f = await fullHistoryPageFixture(Array(8).fill(21));
  const input = { records: f.records, counter: await f.counter() };
  vi.clearAllMocks();
  const first = await replayFullLocalHistory(input, f.context),
    second = await replayFullLocalHistory(input, f.context);
  try {
    expect(decodeInboundPage).toHaveBeenCalledTimes(2);
    expect(sameAccountLedger(first, second)).toBe(true);
  } finally {
    eraseVerified(first);
    eraseVerified(second);
  }
});
it('a failed full load erases parsed bytes and leaves caller records usable for an independent retry', async () => {
  f = await fullHistoryPageFixture(Array(8).fill(21));
  const input = { records: f.records, counter: await f.counter() },
    before = f.records.map((r) => r.bytes.slice());
  let failed = false;
  const verify = crypto.subtle.verify.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'verify').mockImplementation(async (...args) => {
    if (vi.mocked(decodeInboundPage).mock.calls.length) {
      failed = true;
      throw Error('fixture crypto interruption');
    }
    return verify(...args);
  });
  await expect(replayFullLocalHistory(input, f.context)).rejects.toThrow();
  expect(failed).toBe(true);
  for (const [i, r] of f.records.entries()) expect(r.bytes).toEqual(before[i]);
  vi.restoreAllMocks();
  vi.clearAllMocks();
  const replay = await replayFullLocalHistory(input, f.context);
  expect(replay.inbound.peers!.get(f.publisher)!.prefix.position).toBe(8);
  eraseVerified(replay);
});
it('cold index reuses only the same load syntax while retaining explicit proof-byte bounds', async () => {
  f = await fullHistoryPageFixture(Array(8).fill(21));
  const t = createInboundReceiptTurn(),
    census = inspectInbound(f.records, f.context.route, f.context.inbound, undefined, t);
  try {
    const inbound = await verifyInboundLedger(
      census,
      f.records,
      f.context.inbound,
      f.context,
      undefined,
      undefined,
      t,
    );
    const view = { census, inbound, delivery: emptyDelivery() },
      counter = await f.counter();
    const before = vi.mocked(decodeInboundPage).mock.calls.length;
    const index = await Reflect.apply(indexVerifiedLedger, undefined, [
      view,
      f.records,
      f.context.route,
      counter,
      crypto.subtle,
      0,
      'shared',
      t,
    ]);
    expect(index).toBeDefined();
    expect(vi.mocked(decodeInboundPage).mock.calls.length).toBe(before);
    expect(
      await indexVerifiedLedger(view, f.records, f.context.route, counter, crypto.subtle),
    ).toBeUndefined();
    t.complete(view);
    t.dispose();
    expect(inbound.peers!.get(f.publisher)!.retained.get(8)!.envelope).toEqual(
      f.received[7]!.envelope,
    );
    eraseVerified(view);
  } finally {
    t.dispose();
  }
});
it('reduced recovery owns one suffix page across baseline authority and an interior-page frontier', async () => {
  f = await fullHistoryPageFixture(Array(8).fill(9));
  const tail = f.records.at(-1)!,
    prefix = f.records.slice(0, -1),
    counter = await f.counter();
  if (counter.v !== 2) throw Error('Expected full history');
  let witness = emptySpoolWitness();
  for (const r of prefix)
    if (
      r.kind === 'heads' ||
      (r.kind === 'outbound' &&
        !Buffer.from(r.bytes).toString().startsWith('["done/source-capture/v1"'))
    )
      witness = await extendSpoolWitness(witness, r.bytes, crypto.subtle);
  const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
      'verify',
    ]),
    auth = {
      sign: async (p: Bytes) => new Uint8Array(await crypto.subtle.sign('HMAC', key, p)),
      verify: (p: Bytes, m: Bytes) => crypto.subtle.verify('HMAC', key, m, p),
    };
  const saved = await prepareLocalBaseline(
    {
      records: prefix,
      counter: { ...counter, next_seq: tail.seq, reserved: { 1: tail.seq - 1 }, spool: witness },
    },
    f.context,
    auth,
  );
  try {
    vi.clearAllMocks();
    const replay = await replayLocalBaseline(
      saved.baseline,
      saved.anchor,
      { records: [tail], counter },
      f.context,
      auth,
    );
    try {
      expect(decodeInboundPage).toHaveBeenCalledTimes(1);
      expect(replay.inbound.peers!.get(f.publisher)!.prefix.position).toBe(8);
      expect(replay.inbound.peers!.get(f.publisher)!.retained.get(8)!.envelope).toEqual(
        f.received[7]!.envelope,
      );
    } finally {
      eraseVerified(replay);
    }
  } finally {
    eraseVerified(saved);
  }
});
