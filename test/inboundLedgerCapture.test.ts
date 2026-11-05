// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import * as receipt from '../src/crdt/inboundRecord';
import * as ledger from '../src/crdt/inboundLedger';
import { StorageCompatibilityError } from '../src/crdt/storageCompatibility';
import { pageFixture, referenceBytes } from './inbound-page/fixtures';
import { A, B, sources } from './account-inbound/fixtures';
import { context, eventWire, hex } from './account-inbound-codecs/oracle';
import type { OpenedRecord } from '../src/crdt/contentRecord';
import type { InboundContext } from '../src/crdt/accountInbound';
const scope = { inboundReceiptVersion: 1 as const };
const c = () => ({ ...context(), ...scope });
const route = {
  workspace: context().authority.workspace,
  credential: A,
  principal: A,
  epoch: 1,
  generation: 1,
};
const row = (
  bytes: Uint8Array<ArrayBuffer>,
  kind: OpenedRecord['kind'] = 'heads',
): OpenedRecord => ({ seq: 1, gen: 1, kind, bytes });
const capture = (r: OpenedRecord, ctx: InboundContext = c()) => {
  const fn = (
    ledger as typeof ledger & {
      captureInboundLedgerRecord?: (
        r: OpenedRecord,
        c: InboundContext,
      ) => ledger.InboundLedgerEntry | undefined;
    }
  ).captureInboundLedgerRecord;
  return fn ? fn(r, ctx) : ledger.inspectInbound([r], route, ctx).entries[0];
};
const work = (bytes: Uint8Array<ArrayBuffer>, floor: unknown = scope) =>
  (
    receipt as typeof receipt & {
      inboundReceiptByteWork?: (b: Uint8Array<ArrayBuffer>, floor: unknown) => number;
    }
  ).inboundReceiptByteWork?.(bytes, floor) ?? 1;
afterEach(() => vi.restoreAllMocks());
it('counts all72 original extents without decoding signed request/page bodies', () => {
  const cases = [];
  for (const publisher of [A, B])
    for (let first = 0; first < 8; first++)
      for (let count = 1; first + count <= 8; count++)
        cases.push({ raw: referenceBytes(pageFixture(publisher, 8, first, count).record), count });
  const observer = vi.spyOn(TextDecoder.prototype, 'decode');
  for (const { raw, count } of cases) expect(work(raw)).toBe(count);
  expect(cases).toHaveLength(72);
  expect(observer).not.toHaveBeenCalled();
});
it('work uses the same closed floor/header bounds and grants no body validity', () => {
  const raw = referenceBytes(pageFixture().record);
  expect(() => work(raw, {})).toThrow(StorageCompatibilityError);
  const unknown = raw.slice();
  unknown[27] = 50;
  expect(() => work(unknown)).toThrow(StorageCompatibilityError);
  const bad = raw.slice();
  bad[230] = 9;
  expect(() => work(bad)).toThrow();
  const corrupt = raw.slice();
  corrupt[corrupt.length - 1]! ^= 1;
  expect(work(corrupt)).toBe(8);
  expect(() => receipt.decodeInboundPageRecord(corrupt)).toThrow();
  expect(work(new Uint8Array([255]), {})).toBe(1);
});
it('captures exact metadata with one retained binary backing and erases decoded entry copies', () => {
  const raw = referenceBytes(pageFixture().record),
    before = raw.slice();
  const original = receipt.captureScopedInboundReceiptSyntax;
  const observed: NonNullable<ReturnType<typeof original>>[] = [];
  vi.spyOn(receipt, 'captureScopedInboundReceiptSyntax').mockImplementation((bytes, ctx) => {
    const value = original(bytes, ctx);
    if (value) observed.push(value);
    return value;
  });
  const entry = capture(row(raw))!;
  expect(entry.extent).toEqual({ firstEntry: 0, entryCount: 8 });
  expect(entry.event.entry).toBe(0);
  expect(entry.event.position).toBe(1);
  expect(raw).toEqual(before);
  expect(entry.record.bytes).toBe(raw);
  expect(observed).toHaveLength(1);
  expect(observed[0]!.bytes).toEqual(before);
  expect(entry.event.request.buffer).toBe(observed[0]!.bytes.buffer);
  expect(entry.event.page.buffer).toBe(observed[0]!.bytes.buffer);
  for (const e of observed[0]!.originals.page.entries) {
    expect(e.envelope.every((b) => b === 0)).toBe(true);
    expect(e.proof.every((b) => b === 0)).toBe(true);
  }
  const expected = pageFixture().record;
  expect(entry.event.request).toEqual(expected.request);
  expect(entry.event.page).toEqual(expected.page);
});
it('a misplaced receipt erases every captured buffer and preserves caller bytes on refusal', () => {
  const raw = referenceBytes(pageFixture().record),
    before = raw.slice();
  const original = receipt.captureScopedInboundReceiptSyntax;
  let observed: ReturnType<typeof original>;
  vi.spyOn(receipt, 'captureScopedInboundReceiptSyntax').mockImplementation(
    (bytes, ctx) => (observed = original(bytes, ctx)),
  );
  expect(() => capture(row(raw, 'outbound'))).toThrow('misplaced');
  expect(observed).toBeDefined();
  expect(observed!.bytes.every((b) => b === 0)).toBe(true);
  expect(observed!.receipt.record.request.every((b) => b === 0)).toBe(true);
  expect(observed!.receipt.record.page.every((b) => b === 0)).toBe(true);
  expect(raw).toEqual(before);
});
it('legacy v1 and indexed v2 retain their actual original address and exact frames', () => {
  const f = pageFixture();
  const v1 = eventWire(sources().entries[0]!);
  const v2 = JSON.parse(Buffer.from(eventWire(f.entries[1]!, undefined, f.record)).toString());
  v2[0] = 'done/account-inbound/v2';
  v2[1] = 2;
  v2.push(1);
  const e1 = capture(row(v1), context())!,
    e2 = capture(row(new Uint8Array(Buffer.from(JSON.stringify(v2)))), context())!;
  expect(e1.extent).toBeUndefined();
  expect(e1.event.entry).toBeUndefined();
  expect(e2.extent).toBeUndefined();
  expect(e2.event.entry).toBe(1);
  expect(e2.event.position).toBe(2);
  expect(e2.event.request).toEqual(f.record.request);
  expect(e2.event.page).toEqual(f.record.page);
});
it('raw capture preserves its own floor and future-version refusal', () => {
  const raw = referenceBytes(pageFixture().record);
  expect(() => capture(row(raw), context())).toThrow(StorageCompatibilityError);
  raw[27] = 50;
  expect(() => capture(row(raw))).toThrow(StorageCompatibilityError);
});
it('unrelated canonical rows confer no inbound metadata and noncanonical rows still refuse at this boundary', () => {
  const fn = (
    ledger as typeof ledger & {
      captureInboundLedgerRecord?: (
        r: OpenedRecord,
        c: InboundContext,
      ) => ledger.InboundLedgerEntry | undefined;
    }
  ).captureInboundLedgerRecord;
  const unrelated = new Uint8Array(Buffer.from('["unrelated",1]'));
  const result = fn
    ? fn(row(unrelated), c())
    : receipt.captureScopedInboundReceiptSyntax(unrelated, c());
  expect(result).toBeUndefined();
  const noncanonical = new Uint8Array(Buffer.from('[ "unrelated",1]'));
  expect(() =>
    fn ? fn(row(noncanonical), c()) : receipt.captureScopedInboundReceiptSyntax(noncanonical, c()),
  ).toThrow();
  expect(receipt.inboundReceiptEventWork(hex(unrelated), {})).toBe(1);
});

it('erases the unused legacy raw copy while preserving independently owned returned frames', () => {
  const raw = eventWire(sources().entries[0]!),
    before = raw.slice();
  const original = receipt.captureScopedInboundReceiptSyntax;
  let observed: ReturnType<typeof original>;
  vi.spyOn(receipt, 'captureScopedInboundReceiptSyntax').mockImplementation(
    (bytes, ctx) => (observed = original(bytes, ctx)),
  );
  const entry = capture(row(raw), context())!;
  expect(observed!.bytes.every((b) => b === 0)).toBe(true);
  expect(entry.event.request.buffer).not.toBe(observed!.bytes.buffer);
  expect(entry.event.page.buffer).not.toBe(observed!.bytes.buffer);
  expect(entry.event.request.some((b) => b !== 0)).toBe(true);
  expect(entry.event.page.some((b) => b !== 0)).toBe(true);
  expect(raw).toEqual(before);
});
