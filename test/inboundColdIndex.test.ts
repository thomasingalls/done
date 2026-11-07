// @vitest-environment node
import { expect, it } from 'vitest';
import { inspectInbound, verifyInboundLedger } from '../src/crdt/inboundLedger';
import { indexVerifiedLedger, accountLedgerIndexUsage } from '../src/crdt/incrementalAccountLedger';
import { emptyDelivery } from '../src/crdt/deliveryRecord';
import {
  emptySpoolWitness,
  type ContentCounter,
  type OpenedRecord,
} from '../src/crdt/contentRecord';
import { extendSpoolWitness } from '../src/crdt/spoolRecord';
import { pageFixture, referenceBytes } from './inbound-page/fixtures';
import { context, eventWire, live } from './account-inbound-codecs/oracle';
import { sources, A } from './account-inbound/fixtures';
import { membershipPageFixture } from './inbound-page/membership-fixtures';
import { eraseMembershipReading, membershipReadingPrefix } from '../src/crdt/membershipReading';
const c = () => ({ ...context(), inboundReceiptVersion: 1 as const });
const route = {
  workspace: context().authority.workspace,
  credential: A,
  principal: A,
  epoch: 1,
  generation: 1,
};
const row = (
  bytes: Uint8Array<ArrayBuffer>,
  seq: number,
  kind: OpenedRecord['kind'],
): OpenedRecord => ({ seq, gen: 1, kind, bytes });
async function fixture(first = 0, count = 8 - first) {
  const f = pageFixture(A, 8, first, count);
  const records = [
    row(sources().baseline, 1, 'state'),
    row(f.entries[0]!.updates[0]!, 2, 'update'),
  ];
  for (const e of f.entries.slice(0, first))
    records.push(row(eventWire(e), records.length + 1, 'heads'));
  records.push(row(referenceBytes(f.record), records.length + 1, 'heads'));
  const census = inspectInbound(records, route, c());
  const inbound = await verifyInboundLedger(census, records, c(), { ...live, now: () => 90000 });
  let spool = emptySpoolWitness();
  for (const event of census.delivery.spool.events)
    spool = await extendSpoolWitness(spool, event, crypto.subtle);
  const counter: ContentCounter = {
    v: 2,
    store_id: 'ef'.repeat(32),
    intent: '04'.repeat(16),
    active_gen: 1,
    next_seq: records.length + 1,
    reserved: { 1: records.length },
    spool,
    mac: new Uint8Array(32),
  };
  return { f, records, counter, view: { census, inbound, delivery: emptyDelivery() } };
}
it('a fully verified binary page indexes all logical work only with an explicit proof-byte observation', async () => {
  const f = await fixture();
  expect(
    await indexVerifiedLedger(f.view, f.records, route, f.counter, crypto.subtle),
  ).toBeUndefined();
  const index = await indexVerifiedLedger(f.view, f.records, route, f.counter, crypto.subtle, 0);
  expect(index).toBeDefined();
  expect(index!.epoch).toBe(1);
  expect(index!.witness).toEqual(f.counter.spool);
  expect(index!.witness.events).toBe(1);
  expect(f.view.inbound.retained.size).toBe(8);
  expect(accountLedgerIndexUsage(f.view, f.records).logicalRows).toBe(10);
});
it('cold indexing preserves the original epoch for an interior extent after its legacy prefix', async () => {
  const f = await fixture(2, 3);
  const index = await indexVerifiedLedger(f.view, f.records, route, f.counter, crypto.subtle, 0);
  expect(index).toBeDefined();
  expect(index!.epoch).toBe(1);
  expect(index!.witness.events).toBe(3);
  expect(f.view.inbound.prefix.position).toBe(5);
  expect(accountLedgerIndexUsage(f.view, f.records).logicalRows).toBe(7);
  expect(index!.envelopes.size).toBe(0);
  expect(index!.sources.size).toBe(0);
});
it('two genuinely certified publisher pages retain a physical two-event witness and separate logical prefixes', async () => {
  const f = await membershipPageFixture();
  let replay;
  try {
    replay = await f.replay();
    const own = replay.contexts.find((ctx) => ctx.publisher.id === f.who.id)!;
    const base = { ...own, prefix: membershipReadingPrefix(f.reading, f.who.id) };
    const route = {
      workspace: f.history.current.workspace,
      credential: f.who.id,
      principal: f.history.principal,
      epoch: f.history.current.tip,
      generation: 2,
      history: base.history!,
    };
    const records: OpenedRecord[] = [{ seq: 1, gen: 2, kind: 'state', bytes: replay.initial }];
    for (const event of replay.records.filter((e) => e.record[0] !== 91)) {
      for (const bytes of event.updates)
        records.push({ seq: records.length + 1, gen: 2, kind: 'update', bytes });
      records.push({ seq: records.length + 1, gen: 2, kind: 'heads', bytes: event.record });
    }
    const census = inspectInbound(records, route, base);
    const inbound = await verifyInboundLedger(census, records, base, { ...live, now: () => 90000 });
    let spool = emptySpoolWitness();
    for (const bytes of census.delivery.spool.events)
      spool = await extendSpoolWitness(spool, bytes, crypto.subtle);
    const counter: ContentCounter = {
      v: 2,
      store_id: 'ef'.repeat(32),
      intent: '04'.repeat(16),
      active_gen: 2,
      next_seq: records.length + 1,
      reserved: { 2: records.length },
      spool,
      mac: new Uint8Array(32),
    };
    const view = { census, inbound, delivery: emptyDelivery() };
    const index = await indexVerifiedLedger(view, records, route, counter, crypto.subtle, 0);
    expect(index).toBeDefined();
    expect(index!.witness.events).toBe(2);
    expect(index!.epoch).toBe(f.history.current.tip);
    expect(inbound.prefix.position).toBe(8);
    expect(inbound.peers!.get(f.f.input.producer)!.prefix.position).toBe(8);
    expect(accountLedgerIndexUsage(view, records).logicalRows).toBe(31);
  } finally {
    if (replay) eraseMembershipReading(replay);
    f.cleanup();
  }
});
it('binary eligibility keeps exact actual-byte and clone limits and the old counter-version guard', async () => {
  const f = await fixture();
  const bytes = accountLedgerIndexUsage(f.view, f.records).ownedBytes!;
  const proofBytes = 32 * 1024 * 1024 - bytes;
  expect(
    await indexVerifiedLedger(f.view, f.records, route, f.counter, crypto.subtle, proofBytes),
  ).toBeDefined();
  expect(
    await indexVerifiedLedger(f.view, f.records, route, f.counter, crypto.subtle, proofBytes + 1),
  ).toBeUndefined();
  expect(
    await indexVerifiedLedger(
      f.view,
      f.records,
      route,
      f.counter,
      crypto.subtle,
      proofBytes,
      'cloned',
    ),
  ).toBeUndefined();
  const old: ContentCounter = {
    v: 1,
    store_id: f.counter.store_id,
    intent: f.counter.intent,
    active_gen: 1,
    next_seq: f.counter.next_seq,
    reserved: f.counter.reserved,
    mac: f.counter.mac,
  };
  expect(
    await indexVerifiedLedger(f.view, f.records, route, old, crypto.subtle, 0),
  ).toBeUndefined();
});
