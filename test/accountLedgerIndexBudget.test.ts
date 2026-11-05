// @vitest-environment node
import { expect, it } from 'vitest';
import * as ownership from '../src/crdt/verificationOwnership';
import * as ledger from '../src/crdt/incrementalAccountLedger';
import { inspectInbound, emptyInbound } from '../src/crdt/inboundLedger';
import { emptyDelivery } from '../src/crdt/deliveryRecord';
import {
  emptySpoolWitness,
  type ContentCounter,
  type OpenedRecord,
} from '../src/crdt/contentRecord';
import { context } from './account-inbound-codecs/oracle';
import { sources, A } from './account-inbound/fixtures';
const MAX_BYTES = 32 * 1024 * 1024;
const capacity = (value: unknown) =>
  (
    ownership as typeof ownership & {
      ownedByteCapacity?: (value: unknown) => number;
    }
  ).ownedByteCapacity?.(value) ?? 0;
type View = ledger.AccountLedgerView;
const usage = (view: View, records: readonly OpenedRecord[], proofBytes = 0) => {
  const fn = (
    ledger as typeof ledger & {
      accountLedgerIndexUsage?: (
        view: View,
        records: readonly OpenedRecord[],
        proofBytes?: number,
      ) => { logicalRows: number; ownedBytes?: number; eligible: boolean };
    }
  ).accountLedgerIndexUsage;
  const bytes = records.reduce((n, r) => n + r.bytes.length, 0);
  return fn
    ? fn(view, records, proofBytes)
    : {
        logicalRows: records.length,
        ownedBytes: bytes,
        eligible: records.length <= 32768 && bytes <= MAX_BYTES,
      };
};
const route = {
  workspace: context().authority.workspace,
  credential: A,
  principal: A,
  epoch: 1,
  generation: 1,
};
function fixture(bytes = sources().baseline) {
  const rows: OpenedRecord[] = [{ seq: 1, gen: 1, kind: 'state', bytes }];
  const census = inspectInbound(rows, route, context());
  const view: View = { census, delivery: emptyDelivery(), inbound: emptyInbound() };
  const counter: ContentCounter = {
    v: 2,
    store_id: 'ee'.repeat(32),
    intent: '04'.repeat(16),
    active_gen: 1,
    next_seq: 2,
    reserved: { 1: 1 },
    spool: emptySpoolWitness(),
    mac: new Uint8Array(32),
  };
  return { rows, view, counter };
}
it('counts backing capacity once across aliases, subviews, raw buffers, Maps, Sets and cycles', () => {
  const a = new ArrayBuffer(1024),
    b = new ArrayBuffer(31);
  const graph: { self?: unknown; all: unknown[] } = {
    all: [
      a,
      new Uint8Array(a, 500, 2),
      new DataView(a, 10, 3),
      new Map([[new Uint8Array(b), new Set([a, b])]]),
    ],
  };
  graph.self = graph;
  expect(capacity(graph)).toBe(1055);
});
it('charges independent copies even with byte-identical content and never mutates them', () => {
  const a = new Uint8Array([7, 8]),
    b = a.slice();
  expect(capacity([a, a, b])).toBe(4);
  expect(a).toEqual(new Uint8Array([7, 8]));
  expect(b).toEqual(a);
  const shared = new SharedArrayBuffer(17);
  expect(capacity([shared, new Uint8Array(shared)])).toBe(17);
});
it('the verified view includes separately owned receipt frames and retained originals in its byte charge', () => {
  const { rows, view } = fixture();
  const expected = rows[0]!.bytes.buffer.byteLength;
  view.inbound.retained.set(1, {
    previous: '00'.repeat(32),
    envelope: new Uint8Array(19),
    proof: new Uint8Array(23),
  });
  const result = usage(view, rows, 29);
  expect(result.ownedBytes).toBe(expected + 19 + 23 + 29);
  expect(result.eligible).toBe(true);
});
it('logical work counts each admitted position without expanding it into physical witness rows', () => {
  const { rows, view } = fixture();
  const e = {
    record: { ...rows[0]!, kind: 'heads' as const },
    event: { entry: 2 } as View['census']['entries'][number]['event'],
    extent: { firstEntry: 2, entryCount: 6 },
  };
  view.census.entries.push(e);
  expect(usage(view, rows).logicalRows).toBe(6);
  view.census.entries[0] = { ...e, extent: { firstEntry: 7, entryCount: 2 } };
  expect(() => usage(view, rows)).toThrow('extent');
});
it('expanded logical rows hit32768 even when physical rows are far below the ceiling', () => {
  const { rows, view } = fixture();
  const item = {
    record: rows[0]!,
    event: { entry: 0 } as View['census']['entries'][number]['event'],
    extent: { firstEntry: 0, entryCount: 8 },
  };
  view.census.entries = Array(4096).fill(item);
  const physical = Array(4096).fill(rows[0]!) as OpenedRecord[];
  expect(usage(view, physical).logicalRows).toBe(32768);
  expect(usage(view, physical).eligible).toBe(true);
  view.census.entries.push(item);
  physical.push(rows[0]!);
  expect(usage(view, physical).eligible).toBe(false);
});
it('owned bytes preserve the exact32MiB boundary and reject invalid proof-byte observations', () => {
  const { rows, view } = fixture();
  const bytes = capacity([rows, view]);
  expect(usage(view, rows, MAX_BYTES - bytes).eligible).toBe(true);
  expect(usage(view, rows, MAX_BYTES - bytes + 1).eligible).toBe(false);
  for (const value of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])
    expect(() => usage(view, rows, value)).toThrow();
});
it('the real legacy index falls back before parsing when a small visible subview owns an over-cap backing buffer', async () => {
  const raw = sources().baseline,
    backing = new Uint8Array(MAX_BYTES + 1);
  backing.set(raw);
  const f = fixture(backing.subarray(0, raw.length));
  expect(f.rows[0]!.bytes.length).toBeLessThan(MAX_BYTES);
  expect(
    await ledger.indexVerifiedLedger(f.view, f.rows, route, f.counter, crypto.subtle),
  ).toBeUndefined();
});
it('a normal bounded legacy index remains available and its completeness witness stays physical', async () => {
  const f = fixture();
  const index = await ledger.indexVerifiedLedger(f.view, f.rows, route, f.counter, crypto.subtle);
  expect(index).toBeDefined();
  expect(index!.witness.events).toBe(0);
});
