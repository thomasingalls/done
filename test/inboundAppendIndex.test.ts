// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { appendPageFixture } from './inbound-page/append-fixtures';
import {
  extendAccountLedger,
  sameAccountLedger,
  accountLedgerIndexUsage,
} from '../src/crdt/incrementalAccountLedger';
import {
  inspectInbound,
  verifyInboundLedger,
  createInboundCoverage,
} from '../src/crdt/inboundLedger';
import { decodeNetworkEnvelope } from '../account-protocol/envelope';
import type { AccountLedgerView } from '../src/crdt/incrementalAccountLedger';
import type { OpenedRecord } from '../src/crdt/contentRecord';
import { emptySpoolWitness } from '../src/crdt/contentRecord';
import * as inbound from '../src/crdt/inboundLedger';
let fixture: Awaited<ReturnType<typeof appendPageFixture>> | undefined;
afterEach(() => {
  vi.restoreAllMocks();
  fixture?.cleanup();
  fixture = undefined;
});
const setup = async () => (fixture = await appendPageFixture());
async function extend(
  f: Awaited<ReturnType<typeof setup>>,
  previous: AccountLedgerView,
  before: OpenedRecord[],
  records: OpenedRecord[],
) {
  const next = await extendAccountLedger(
    previous,
    before,
    records,
    f.route,
    await f.counter(records),
    f.base,
    f.signer,
    crypto.subtle,
    { memo: f.memo, current() {} },
  );
  if (!next) return;
  const coverage = createInboundCoverage();
  try {
    const inbound = await verifyInboundLedger(
      next.census,
      records,
      f.base,
      f.lifetime,
      { memo: f.memo, coverage },
      { state: previous.inbound, after: before.at(-1)?.seq ?? 0 },
    );
    return { ...next, inbound };
  } finally {
    coverage.clear();
  }
}
it('binary then legacy append agrees with independent full replay and retains the actual signed original for every position', async () => {
  const f = await setup();
  let before = f.rows,
    previous: AccountLedgerView = await f.indexed();
  for (const raw of [f.f.producer.raw, f.f.producer.legacy]) {
    const records = f.add(before, raw),
      next = await extend(f, previous, before, records);
    expect(next).toBeDefined();
    const full = await f.full(records);
    expect(sameAccountLedger(next!, full)).toBe(true);
    const peer = next!.inbound.peers!.get(f.f.f.input.producer)!;
    for (const [position, kept] of peer.retained) {
      expect(decodeNetworkEnvelope(kept.envelope).seq).toBe(position);
      expect(kept.envelope).toEqual(new Uint8Array(f.f.producer.entries[position - 1]!.envelope));
    }
    expect(next!.indexes!.witness.events).toBe(raw === f.f.producer.raw ? 1 : 2);
    previous = next!;
    before = records;
  }
  expect(previous.inbound.peers!.get(f.f.f.input.producer)!.prefix.position).toBe(9);
});
it('own-publisher pages keep reference fallback and changed retained bytes cannot borrow the old prefix', async () => {
  const f = await setup(),
    previous = await f.indexed();
  expect(await extend(f, previous, f.rows, f.add(f.rows, f.f.candidate.raw))).toBeUndefined();
  const records = f.add(f.rows, f.f.producer.raw).map((r) => ({ ...r, bytes: r.bytes.slice() }));
  records[0]!.bytes[0]! ^= 1;
  expect(await extend(f, previous, f.rows, records)).toBeUndefined();
  expect(f.rows[0]!.bytes).not.toEqual(records[0]!.bytes);
});
it('a port without an actual proof-byte observation keeps binary reference fallback', async () => {
  const f = await setup(),
    previous = await f.indexed(),
    records = f.add(f.rows, f.f.producer.raw);
  const port = { check: f.memo.check, clear: f.memo.clear, retain: f.memo.retain };
  expect(
    await extendAccountLedger(
      previous,
      f.rows,
      records,
      f.route,
      await f.counter(records),
      f.base,
      f.signer,
      crypto.subtle,
      { memo: port, current() {} },
    ),
  ).toBeUndefined();
});
it('an append stays incremental when retained proof bytes pass the old32MiB ceiling', async () => {
  // Regression for the 2026-11-08 release. An owned-byte refusal here dropped the index, and
  // every later ledger change on that device then ran the full reference check.
  const f = await setup(),
    previous = await f.indexed(),
    records = f.add(f.rows, f.f.producer.raw);
  const memo = { ...f.memo, ownedBytes: () => 64 * 1024 * 1024 };
  expect(accountLedgerIndexUsage(previous, records, memo.ownedBytes()).ownedBytes).toBeGreaterThan(
    32 * 1024 * 1024,
  );
  const next = await extendAccountLedger(
    previous,
    f.rows,
    records,
    f.route,
    await f.counter(records),
    f.base,
    f.signer,
    crypto.subtle,
    { memo, current() {} },
  );
  expect(next).toBeDefined();
  expect(next!.indexes).toBeDefined();
});
it('expanded work exceeding32768 falls back before any full signed-frame decode even below the physical row limit', async () => {
  const f = await setup();
  const before: OpenedRecord[] = Array.from({ length: 32755 }, (_, i) => ({
    ...f.rows[0]!,
    seq: i + 1,
  }));
  // Repeated identical authenticated-baseline states add no writing. This is a work-bound
  // fixture, not a native MAC/lease or real-account claim.
  const previous = await f.indexed(before),
    records = f.add(before, f.f.producer.raw);
  expect(records.length).toBeLessThan(32768);
  const expectedCounter = await f.counter(records);
  const observe = vi.spyOn(TextDecoder.prototype, 'decode');
  const next = await extendAccountLedger(
    previous,
    before,
    records,
    f.route,
    expectedCounter,
    f.base,
    f.signer,
    crypto.subtle,
    { memo: f.memo, current() {} },
  );
  expect(next).toBeUndefined();
  expect(observe).not.toHaveBeenCalled();
});
it('successful append keeps logical work, actual ownership bounds and the predecessor unmodified', async () => {
  const f = await setup(),
    previous = await f.indexed(),
    records = f.add(f.rows, f.f.producer.raw);
  const original = structuredClone(previous),
    next = await extend(f, previous, f.rows, records);
  expect(next).toBeDefined();
  expect(sameAccountLedger(previous, original)).toBe(true);
  expect(next!.census.entries).toHaveLength(1);
  expect(next!.census.entries[0]!.extent).toEqual({ firstEntry: 1, entryCount: 7 });
  expect(accountLedgerIndexUsage(next!, records, f.memo.ownedBytes()).eligible).toBe(true);
  expect(next!.indexes!.epoch).toBe(f.route.epoch);
  expect(inspectInbound(records, f.route, f.base).delivery.spool.events).toHaveLength(1);
});

it('refused append erases only new metadata while preserving caller and predecessor buffers', async () => {
  const f = await setup(),
    previous = await f.indexed(),
    records = f.add(f.rows, f.f.producer.raw);
  const before = records.map((r) => r.bytes.slice()),
    old = structuredClone(previous);
  const capture = inbound.captureInboundLedgerRecord;
  const observed: NonNullable<ReturnType<typeof capture>>[] = [];
  vi.spyOn(inbound, 'captureInboundLedgerRecord').mockImplementation((row, context) => {
    const entry = capture(row, context);
    if (entry) observed.push(entry);
    return entry;
  });
  const counter = await f.counter(records);
  if (counter.v !== 2) throw Error('Fixture needs v2 counter');
  await expect(
    extendAccountLedger(
      previous,
      f.rows,
      records,
      f.route,
      { ...counter, spool: emptySpoolWitness() },
      f.base,
      f.signer,
      crypto.subtle,
      { memo: f.memo, current() {} },
    ),
  ).rejects.toThrow('Spool ledger commitment changed');
  expect(observed).toHaveLength(1);
  expect(new Uint8Array(observed[0]!.event.request.buffer).every((b) => b === 0)).toBe(true);
  expect(new Uint8Array(observed[0]!.event.page.buffer).every((b) => b === 0)).toBe(true);
  for (const [i, row] of records.entries()) expect(row.bytes).toEqual(before[i]);
  expect(sameAccountLedger(previous, old)).toBe(true);
});
