// @vitest-environment node
import { expect, it } from 'vitest';
import {
  inspectInbound,
  verifyInboundLedger,
  createInboundCoverage,
  inboundMemoSlots,
} from '../src/crdt/inboundLedger';
import { createVerificationMemo } from '../src/crdt/verificationMemo';
import { indexVerifiedLedger } from '../src/crdt/incrementalAccountLedger';
import { emptyDelivery } from '../src/crdt/deliveryRecord';
import { emptySpoolWitness } from '../src/crdt/contentRecord';
import { extendSpoolWitness } from '../src/crdt/spoolRecord';
import { membershipEventEpoch } from '../src/crdt/accountMembership';
import { decodeNetworkEnvelope } from '../account-protocol/envelope';
import { decodeInboundPageRecord } from '../src/crdt/inboundRecord';
import { StorageCompatibilityError } from '../src/crdt/storageCompatibility';
import { pageFixture, referenceBytes } from './inbound-page/fixtures';
import { context, eventWire, live, reframe, json, hex } from './account-inbound-codecs/oracle';
import { A, entry, sources } from './account-inbound/fixtures';
import type { OpenedRecord, ContentCounter } from '../src/crdt/contentRecord';
const row = (
  bytes: Uint8Array<ArrayBuffer>,
  seq: number,
  kind: OpenedRecord['kind'],
): OpenedRecord => ({ bytes, seq, kind, gen: 1 });
const c = () => ({ ...context(), inboundReceiptVersion: 1 as const });
const route = {
  workspace: context().authority.workspace,
  credential: A,
  principal: A,
  epoch: 1,
  generation: 1,
};
const aged = { ...live, now: () => 90000 };
function fixture(first = 0, count = 8 - first) {
  const f = pageFixture(undefined, 8, first, count),
    prefix = f.entries.slice(0, first).map((e, i) => row(eventWire(e), 3 + i, 'heads'));
  return {
    f,
    rows: [
      row(sources().baseline, 1, 'state'),
      row(f.entries[0]!.updates[0]!, 2, 'update'),
      ...prefix,
      row(referenceBytes(f.record), 3 + first, 'heads'),
    ],
  };
}
const retained = (s: Awaited<ReturnType<typeof verifyInboundLedger>>) =>
  [...s.retained].map(([n, r]) => [
    n,
    r.previous,
    Buffer.from(r.envelope).toString('hex'),
    Buffer.from(r.proof).toString('hex'),
  ]);
it('one physical page contributes one witness event while all eight logical entries are verified and retained', async () => {
  const { f, rows } = fixture(),
    census = inspectInbound(rows, route, c()),
    state = await verifyInboundLedger(census, rows, c(), aged);
  expect(census.entries).toHaveLength(1);
  expect(inboundMemoSlots(census.entries[0]!)).toEqual(
    Array.from({ length: 8 }, (_, index) => `inbound:3:${index}`),
  );
  expect(() =>
    inboundMemoSlots({ ...census.entries[0]!, extent: { firstEntry: 0, entryCount: 1000000 } }),
  ).toThrow('extent');
  expect(census.delivery.ledger).toHaveLength(0);
  expect(census.delivery.spool.events).toEqual([rows.at(-1)!.bytes]);
  expect(state.prefix).toEqual({ position: 8, link: f.record.lastLink, observedThrough: 8 });
  expect(state.retained.size).toBe(8);
  for (const [position, r] of state.retained) {
    expect(decodeNetworkEnvelope(r.envelope).seq).toBe(position);
    expect(r.envelope).toEqual(f.entries[position - 1]!.envelope);
  }
});
it('a page extent beginning at original index2 continues the independently verified legacy prefix', async () => {
  const { f, rows } = fixture(2, 3),
    state = await verifyInboundLedger(inspectInbound(rows, route, c()), rows, c(), aged);
  expect(state.prefix.position).toBe(5);
  expect(state.prefix.link).toBe(f.entries[4]!.link);
  expect([...state.retained.keys()]).toEqual([1, 2, 3, 4, 5]);
  expect(state.retained.get(3)!.envelope).toEqual(f.entries[2]!.envelope);
  const missing = rows.filter((r) => r.seq !== 4);
  await expect(
    verifyInboundLedger(inspectInbound(missing, route, c()), missing, c(), aged),
  ).rejects.toThrow();
});
it('dense then legacy full replay equals continuation and never retains a stale page entry', async () => {
  const { f, rows } = fixture(),
    next = entry({ publisher: A, updates: f.entries[0]!.updates }, 9, f.record.lastLink),
    added = [...rows, row(eventWire(next), 4, 'heads')];
  const first = await verifyInboundLedger(inspectInbound(rows, route, c()), rows, c(), aged),
    full = await verifyInboundLedger(inspectInbound(added, route, c()), added, c(), aged);
  const continuation = await verifyInboundLedger(
    inspectInbound(added, route, c()),
    added,
    c(),
    aged,
    undefined,
    { state: first, after: 3 },
  );
  expect(continuation.prefix).toEqual(full.prefix);
  expect(retained(continuation)).toEqual(retained(full));
  for (const state of [full, continuation])
    for (const [position, r] of state.retained)
      expect(decodeNetworkEnvelope(r.envelope).seq).toBe(position);
  expect(first.prefix.position).toBe(8);
  expect(first.retained.get(8)!.envelope).toEqual(f.entries[7]!.envelope);
});
it('warm native proof reuse still checks content coverage and its own encoding floor', async () => {
  const { rows } = fixture(),
    memo = createVerificationMemo(),
    coverage = createInboundCoverage(),
    reuse = { memo, coverage };
  await verifyInboundLedger(inspectInbound(rows, route, c()), rows, c(), aged, reuse);
  const missing = rows.filter((r) => r.kind !== 'update' && r.kind !== 'state');
  await expect(
    verifyInboundLedger(inspectInbound(missing, route, c()), missing, c(), aged, reuse),
  ).rejects.toThrow('coverage');
  expect(() => inspectInbound(rows, route, context())).toThrow(StorageCompatibilityError);
  coverage.clear();
  memo.clear();
});
it('a bad admitted signature refuses rather than advancing a later entry', async () => {
  const { f, rows } = fixture(),
    proof = JSON.parse(Buffer.from(f.entries[3]!.proof).toString());
  proof[11] = '00'.repeat(64);
  const wire = reframe(f.record, {
    page: (p) => {
      (p[5] as string[][])[3]![1] = hex(json(proof));
    },
  });
  rows[2] = row(referenceBytes({ ...f.record, ...wire }), 3, 'heads');
  await expect(
    verifyInboundLedger(inspectInbound(rows, route, c()), rows, c(), aged),
  ).rejects.toThrow();
});
it('epoch classification uses the original request and refuses unknown inbound versions before JSON fallthrough', () => {
  const raw = referenceBytes(pageFixture().record);
  expect(membershipEventEpoch(raw)).toBe(1);
  const unknown = raw.slice();
  unknown[27] = 50;
  expect(() => membershipEventEpoch(unknown)).toThrow(StorageCompatibilityError);
  expect(() => inspectInbound([row(unknown, 1, 'heads')], route, c())).toThrow(
    StorageCompatibilityError,
  );
  expect(decodeInboundPageRecord(raw).reader).not.toBe('1');
});
it('a binary record in outbound storage is refused as misplaced', () => {
  const rows = [row(referenceBytes(pageFixture().record), 1, 'outbound')];
  expect(() => inspectInbound(rows, route, c())).toThrow('misplaced');
});
it('binary views use the full reference until their logical-work and owned-byte index bounds are hardened', async () => {
  const { rows } = fixture(),
    census = inspectInbound(rows, route, c()),
    inbound = await verifyInboundLedger(census, rows, c(), aged);
  const counter: ContentCounter = {
    v: 2,
    store_id: 'ef'.repeat(32),
    intent: '04'.repeat(16),
    active_gen: 1,
    next_seq: 4,
    reserved: { 1: 3 },
    spool: await extendSpoolWitness(emptySpoolWitness(), rows.at(-1)!.bytes, crypto.subtle),
    mac: new Uint8Array(32),
  };
  expect(counter.spool.events).toBe(1);
  const indexes = await indexVerifiedLedger(
    { census, inbound, delivery: emptyDelivery() },
    rows,
    route,
    counter,
    crypto.subtle,
  );
  expect(indexes).toBeUndefined();
});
