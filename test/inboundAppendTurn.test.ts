// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../account-protocol/inboundTransport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../account-protocol/inboundTransport')>();
  return {
    ...actual,
    decodeInboundPage: vi.fn(actual.decodeInboundPage),
    decodeInboundRequest: vi.fn(actual.decodeInboundRequest),
  };
});
import { decodeInboundPage, decodeInboundRequest } from '../account-protocol/inboundTransport';
import { createInboundReceiptTurn, type InboundReceiptTurn } from '../src/crdt/accountInbound';
import {
  extendAccountLedger,
  sameAccountLedger,
  accountLedgerIndexUsage,
  type AccountLedgerView,
} from '../src/crdt/incrementalAccountLedger';
import { verifyInboundLedger, createInboundCoverage } from '../src/crdt/inboundLedger';
import { appendPageFixture } from './inbound-page/append-fixtures';
import { decodeNetworkEnvelope } from '../account-protocol/envelope';
import { eraseUnretained } from '../src/crdt/verificationOwnership';
import { emptySpoolWitness } from '../src/crdt/contentRecord';
let f: Awaited<ReturnType<typeof appendPageFixture>> | undefined;
const turns: InboundReceiptTurn[] = [];
afterEach(() => {
  for (const t of turns.splice(0)) t.dispose();
  f?.cleanup();
  f = undefined;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
const turn = () => {
  const t = createInboundReceiptTurn();
  turns.push(t);
  return t;
};
async function append(
  t: InboundReceiptTurn,
  previous: AccountLedgerView,
  before: NonNullable<typeof f>['rows'],
  records: NonNullable<typeof f>['rows'],
  counter?: Awaited<ReturnType<NonNullable<typeof f>['counter']>>,
) {
  const x = f!,
    next = (await Reflect.apply(extendAccountLedger, undefined, [
      previous,
      before,
      records,
      x.route,
      counter ?? (await x.counter(records)),
      x.base,
      x.signer,
      crypto.subtle,
      { memo: x.memo, current() {} },
      undefined,
      t,
    ])) as Awaited<ReturnType<typeof extendAccountLedger>>;
  if (!next) return;
  const coverage = createInboundCoverage();
  try {
    const inbound = await verifyInboundLedger(
        next.census,
        records,
        x.base,
        x.lifetime,
        { memo: x.memo, coverage },
        { state: previous.inbound, after: before.at(-1)?.seq ?? 0 },
        t,
      ),
      result = { ...next, inbound };
    t.complete(result);
    return result;
  } finally {
    coverage.clear();
  }
}
it('an appended interior page shares one parse across classification, epoch and saved verification with exact full agreement', async () => {
  f = await appendPageFixture();
  const previous = await f.indexed(),
    records = f.add(f.rows, f.f.producer.raw),
    t = turn();
  vi.clearAllMocks();
  const next = await append(t, previous, f.rows, records);
  expect(next).toBeDefined();
  expect(decodeInboundPage).toHaveBeenCalledTimes(1);
  expect(decodeInboundRequest).toHaveBeenCalledTimes(1);
  t.dispose();
  expect(sameAccountLedger(next!, await f.full(records))).toBe(true);
  expect(accountLedgerIndexUsage(next!, records, f.memo.ownedBytes()).eligible).toBe(true);
  for (const [n, r] of next!.inbound.peers!.get(f.f.f.input.producer)!.retained)
    expect(decodeNetworkEnvelope(r.envelope).seq).toBe(n);
  eraseUnretained(next, records);
});
it('a later legacy continuation never borrows an earlier page and does not mutate the verified predecessor', async () => {
  f = await appendPageFixture();
  const previous = await f.indexed(),
    records = f.add(f.rows, f.f.producer.raw),
    one = turn(),
    first = await append(one, previous, f.rows, records);
  one.dispose();
  expect(first).toBeDefined();
  const old = structuredClone(first!),
    rows = f.add(records, f.f.producer.legacy),
    two = turn(),
    next = await append(two, first!, records, rows);
  two.dispose();
  expect(next).toBeDefined();
  expect(sameAccountLedger(first!, old)).toBe(true);
  expect(sameAccountLedger(next!, await f.full(rows))).toBe(true);
  const peer = next!.inbound.peers!.get(f.f.f.input.producer)!;
  expect(peer.prefix.position).toBe(9);
  expect(decodeNetworkEnvelope(peer.retained.get(9)!.envelope).seq).toBe(9);
  eraseUnretained([first, next], rows);
});
it('changed retained rows refuse before capturing any new page, and own publisher still falls back', async () => {
  f = await appendPageFixture();
  const previous = await f.indexed(),
    rows = f.add(f.rows, f.f.producer.raw).map((r) => ({ ...r, bytes: r.bytes.slice() }));
  rows[0]!.bytes[0]! ^= 1;
  vi.clearAllMocks();
  expect(await append(turn(), previous, f.rows, rows)).toBeUndefined();
  expect(decodeInboundPage).not.toHaveBeenCalled();
  expect(await append(turn(), previous, f.rows, f.add(f.rows, f.f.candidate.raw))).toBeUndefined();
});
it('a fresh physical witness mismatch keeps caller and predecessor bytes intact while abandoning the scope', async () => {
  f = await appendPageFixture();
  const previous = await f.indexed(),
    old = structuredClone(previous),
    rows = f.add(f.rows, f.f.producer.raw),
    before = rows.map((r) => r.bytes.slice()),
    counter = await f.counter(rows),
    t = turn();
  if (counter.v !== 2) throw Error('counter');
  await expect(
    append(t, previous, f.rows, rows, { ...counter, spool: emptySpoolWitness() }),
  ).rejects.toThrow('Spool ledger commitment changed');
  t.dispose();
  expect(sameAccountLedger(previous, old)).toBe(true);
  for (const [i, r] of rows.entries()) expect(r.bytes).toEqual(before[i]);
});
