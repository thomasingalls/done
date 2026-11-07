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
import * as ledger from '../src/crdt/inboundLedger';
import {
  createInboundReceiptTurn,
  type InboundReceiptTurn,
  type InboundContext,
} from '../src/crdt/accountInbound';
import { membershipEventEpoch } from '../src/crdt/accountMembership';
import { verifyInstalledSuccessor } from '../src/crdt/accountSuccessor';
import { verifySpoolWitness, verifySpool } from '../src/crdt/spoolRecord';
import { verifyDelivery, emptyDelivery } from '../src/crdt/deliveryRecord';
import { sameAccountLedger } from '../src/crdt/incrementalAccountLedger';
import { decodeInboundPage, decodeInboundRequest } from '../account-protocol/inboundTransport';
import { decodeNetworkEnvelope } from '../account-protocol/envelope';
import { StorageCompatibilityError } from '../src/crdt/storageCompatibility';
import { eraseUnretained } from '../src/crdt/verificationOwnership';
import { pageFixture, referenceBytes } from './inbound-page/fixtures';
import { fullHistoryPageFixture } from './inbound-page/full-history-fixtures';
import { context, eventWire, live } from './account-inbound-codecs/oracle';
import { entry, A, sources } from './account-inbound/fixtures';
import type { OpenedRecord } from '../src/crdt/contentRecord';
const turns: InboundReceiptTurn[] = [];
let real: Awaited<ReturnType<typeof fullHistoryPageFixture>> | undefined;
afterEach(() => {
  for (const t of turns.splice(0)) t.dispose();
  real?.cleanup();
  real = undefined;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
const turn = () => {
  const t = createInboundReceiptTurn();
  turns.push(t);
  return t;
};
const c = () => ({ ...context(), inboundReceiptVersion: 1 as const });
const life = { ...live, now: () => 90000 };
const route = {
  workspace: context().authority.workspace,
  credential: A,
  principal: A,
  epoch: 1,
  generation: 1,
};
function f() {
  const page = pageFixture(),
    raw = referenceBytes(page.record);
  const rows: OpenedRecord[] = [
    { seq: 1, gen: 1, kind: 'state', bytes: sources().baseline },
    { seq: 2, gen: 1, kind: 'update', bytes: page.entries[0]!.updates[0]! },
    { seq: 3, gen: 1, kind: 'heads', bytes: raw },
  ];
  return { page, rows };
}
const inspect = (rows: OpenedRecord[], scope: InboundContext, t: InboundReceiptTurn, r = route) =>
  Reflect.apply(ledger.inspectInbound, undefined, [rows, r, scope, undefined, t]) as ReturnType<
    typeof ledger.inspectInbound
  >;
const verify = (
  census: ReturnType<typeof ledger.inspectInbound>,
  rows: OpenedRecord[],
  scope: InboundContext,
  t: InboundReceiptTurn,
  continuation?: Parameters<typeof ledger.verifyInboundLedger>[5],
) =>
  Reflect.apply(ledger.verifyInboundLedger, undefined, [
    census,
    rows,
    scope,
    life,
    undefined,
    continuation,
    t,
  ]) as ReturnType<typeof ledger.verifyInboundLedger>;
const epoch = (bytes: OpenedRecord['bytes'], t: InboundReceiptTurn) =>
  Reflect.apply(membershipEventEpoch, undefined, [bytes, t]) as number;
it('full census, epoch selection and stored ledger share one binary decode with every signature check', async () => {
  const x = f(),
    t = turn(),
    scope = c();
  const census = inspect(x.rows, scope, t);
  expect(epoch(x.rows[2]!.bytes, t)).toBe(1);
  const spy = vi.spyOn(crypto.subtle, 'verify'),
    state = await verify(census, x.rows, scope, t);
  expect(decodeInboundRequest).toHaveBeenCalledTimes(1);
  expect(decodeInboundPage).toHaveBeenCalledTimes(1);
  expect(spy).toHaveBeenCalledTimes(18);
  expect(state.prefix.position).toBe(8);
  const result = { census, inbound: state, delivery: emptyDelivery() };
  t.complete(result);
  t.dispose();
  expect(state.retained.get(8)!.envelope).toEqual(x.page.entries[7]!.envelope);
  eraseUnretained(result, x.rows);
});
it('cooperative census keeps checkpoints and agrees with an independently decoded full reference', async () => {
  const x = f(),
    t = turn(),
    scope = c();
  let pauses = 0;
  const census = (await Reflect.apply(ledger.inspectInboundCooperatively, undefined, [
    x.rows,
    route,
    scope,
    async () => {
      pauses++;
    },
    undefined,
    t,
  ])) as ReturnType<typeof ledger.inspectInbound>;
  const state = await verify(census, x.rows, scope, t),
    actual = { census, inbound: state, delivery: emptyDelivery() };
  t.complete(actual);
  t.dispose();
  expect(pauses).toBeGreaterThan(x.rows.length);
  expect(decodeInboundPage).toHaveBeenCalledTimes(1);
  const other = ledger.inspectInbound(x.rows, route, scope),
    expected = {
      census: other,
      inbound: await ledger.verifyInboundLedger(other, x.rows, scope, life),
      delivery: emptyDelivery(),
    };
  expect(sameAccountLedger(actual, expected)).toBe(true);
  eraseUnretained([actual, expected], x.rows);
});
it('genuine successor/publication/witness boundaries use the same captured page without gaining trust', async () => {
  real = await fullHistoryPageFixture(Array(8).fill(21));
  const x = real,
    t = turn(),
    counter = await x.counter(),
    census = inspect(x.records, x.context.inbound, t, x.context.route);
  await verifySpoolWitness(census.delivery.spool, counter, crypto.subtle);
  await Reflect.apply(verifyInstalledSuccessor, undefined, [
    census.delivery.spool,
    x.context.route,
    x.context.installation.kind === 'original' ? x.context.installation.successor : undefined,
    crypto.subtle,
    undefined,
    undefined,
    t,
  ]);
  await verifySpool(
    census.delivery.spool,
    x.context.route,
    new Map([[1, x.context.inbound.generationKey]]),
    x.context.signer,
    crypto.subtle,
  );
  const delivery = await verifyDelivery(
      census.delivery,
      x.context.route,
      x.context.inbound.authority,
      x.context.signer,
      crypto.subtle,
    ),
    state = await verify(census, x.records, x.context.inbound, t);
  const result = { census, delivery, inbound: state };
  t.complete(result);
  t.dispose();
  expect(state.peers!.get(x.publisher)!.prefix.position).toBe(8);
  expect(decodeInboundPage).toHaveBeenCalledTimes(1);
  eraseUnretained(result, x.records);
});
it('a later legacy row has its own original while the binary page is decoded only once', async () => {
  const x = f(),
    next = entry({ publisher: A, updates: x.page.entries[0]!.updates }, 9, x.page.record.lastLink),
    raw = eventWire(next),
    rows = [...x.rows, { seq: 4, gen: 1, kind: 'heads' as const, bytes: raw }],
    t = turn(),
    scope = c(),
    census = inspect(rows, scope, t),
    state = await verify(census, rows, scope, t),
    result = { census, inbound: state, delivery: emptyDelivery() };
  t.complete(result);
  t.dispose();
  for (const [n, r] of state.retained) expect(decodeNetworkEnvelope(r.envelope).seq).toBe(n);
  expect(state.retained.get(9)!.envelope).toEqual(next.envelope);
  const wide = Buffer.from(x.page.record.page).toString('hex');
  expect(
    vi
      .mocked(decodeInboundPage)
      .mock.calls.filter(([b]) => Buffer.from(b).toString('hex') === wide),
  ).toHaveLength(1);
  eraseUnretained(result, rows);
});
it('floor and content coverage refusals keep caller originals intact and abandoned scope buffers erase', async () => {
  const x = f(),
    before = x.rows.map((r) => r.bytes.slice()),
    t = turn(),
    census = inspect(x.rows, c(), t);
  await expect(verify(census, x.rows, context(), t)).rejects.toThrow(StorageCompatibilityError);
  t.dispose();
  for (const [i, r] of x.rows.entries()) expect(r.bytes).toEqual(before[i]);
  const u = turn(),
    missing = x.rows.filter((r) => r.kind === 'heads'),
    empty = inspect(missing, c(), u);
  await expect(verify(empty, missing, c(), u)).rejects.toThrow('coverage');
  u.dispose();
  expect(empty.entries[0]!.event.page.every((v) => v === 0)).toBe(true);
  expect(x.rows[2]!.bytes).toEqual(before[2]);
});
it('forged scope methods cannot replace canonical census or epoch inspection', async () => {
  const x = f(),
    realTurn = turn(),
    called = vi.fn(),
    fake = { ...realTurn, inspect: called } as InboundReceiptTurn;
  expect(() => inspect(x.rows, c(), fake)).toThrow();
  expect(() => epoch(x.rows[2]!.bytes, fake)).toThrow();
  expect(called).not.toHaveBeenCalled();
  const normal = ledger.inspectInbound(x.rows, route, c());
  await expect(verify(normal, x.rows, c(), fake)).rejects.toThrow();
});
it('continuation scopes only new physical rows and retains exact predecessor state', async () => {
  const x = f(),
    scope = c(),
    before = ledger.inspectInbound(x.rows, route, scope),
    previous = await ledger.verifyInboundLedger(before, x.rows, scope, life),
    old = structuredClone(previous),
    last = entry({ publisher: A, updates: x.page.entries[0]!.updates }, 9, x.page.record.lastLink),
    row = { seq: 4, gen: 1, kind: 'heads' as const, bytes: eventWire(last) },
    t = turn();
  const added = Reflect.apply(ledger.captureInboundLedgerRecord, undefined, [
    row,
    scope,
    t,
  ]) as NonNullable<ReturnType<typeof ledger.captureInboundLedgerRecord>>;
  const census = {
    ...before,
    entries: [...before.entries, added],
    delivery: {
      ...before.delivery,
      spool: { ...before.delivery.spool, events: [...before.delivery.spool.events, row.bytes] },
    },
  };
  const rows = [...x.rows, row],
    state = await verify(census, rows, scope, t, { state: previous, after: 3 }),
    actual = { census, inbound: state, delivery: emptyDelivery() };
  t.complete(actual);
  t.dispose();
  expect(previous).toEqual(old);
  expect(state.retained.get(9)!.envelope).toEqual(last.envelope);
  const full = ledger.inspectInbound(rows, route, scope),
    expected = {
      census: full,
      inbound: await ledger.verifyInboundLedger(full, rows, scope, life),
      delivery: emptyDelivery(),
    };
  expect(sameAccountLedger(actual, expected)).toBe(true);
  eraseUnretained([actual, expected], x.rows);
});
