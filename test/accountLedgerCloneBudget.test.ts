// @vitest-environment node
import { expect, it, vi } from 'vitest';
import {
  accountLedgerIndexUsage,
  indexVerifiedLedger,
  type AccountLedgerView,
} from '../src/crdt/incrementalAccountLedger';
import { createVerifiedRecords } from '../src/crdt/verifiedRecords';
import { ownedByteCapacity } from '../src/crdt/verificationOwnership';
import { inspectInbound, emptyInbound } from '../src/crdt/inboundLedger';
import { emptyDelivery } from '../src/crdt/deliveryRecord';
import {
  emptySpoolWitness,
  type OpenedRecord,
  type ContentCounter,
} from '../src/crdt/contentRecord';
import { context } from './account-inbound-codecs/oracle';
import { sources, A } from './account-inbound/fixtures';
const MAX_BYTES = 32 * 1024 * 1024;
const base = context();
const route = {
  workspace: base.authority.workspace,
  credential: A,
  principal: A,
  epoch: 1,
  generation: 1,
};
const rows = (bytes = sources().baseline): OpenedRecord[] => [
  { seq: 1, gen: 1, kind: 'state', bytes },
];
const view = (records: OpenedRecord[]): AccountLedgerView => ({
  census: inspectInbound(records, route, base),
  delivery: emptyDelivery(),
  inbound: emptyInbound(),
});
const usage = (v: AccountLedgerView, r: OpenedRecord[], proofBytes: number, mode: unknown) =>
  Reflect.apply(accountLedgerIndexUsage, undefined, [v, r, proofBytes, mode]) as ReturnType<
    typeof accountLedgerIndexUsage
  >;
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
it('shared ownership charges one graph, while clone mode charges the separately cloned view and copied records', () => {
  const r = rows(),
    v = view(r),
    proof = new Uint8Array(17);
  expect(usage(v, r, proof.length, 'shared').ownedBytes).toBe(ownedByteCapacity([v, r, proof]));
  const clonedView = structuredClone(v),
    copied = r.map((e) => ({ ...e, bytes: e.bytes.slice() }));
  expect(usage(v, r, proof.length, 'cloned').ownedBytes).toBe(
    ownedByteCapacity([clonedView, copied, proof]),
  );
  expect(usage(v, r, 0, 'cloned').ownedBytes).toBeGreaterThan(usage(v, r, 0, 'shared').ownedBytes!);
});
it('clone mode counts each record copy even when the input aliases one buffer', () => {
  const r = rows();
  r.push({ ...r[0]!, seq: 2 });
  const v = view(r);
  const expected =
    ownedByteCapacity(structuredClone(v)) + r.reduce((n, e) => n + e.bytes.length, 0);
  expect(usage(v, r, 0, 'cloned').ownedBytes).toBe(expected);
});
it('record slices copy visible bytes while a structured-cloned view preserves whole subview backing capacity', () => {
  const raw = sources().baseline,
    backing = new Uint8Array(4096);
  backing.set(raw);
  const r = rows(backing.subarray(0, raw.length)),
    v = view(r);
  expect(usage(v, r, 0, 'shared').ownedBytes).toBe(4096);
  expect(usage(v, r, 0, 'cloned').ownedBytes).toBe(4096 + raw.length);
  expect(backing.subarray(0, raw.length)).toEqual(raw);
});
it('the real cache installed graphs match the prospective charge in both ownership modes', async () => {
  for (const mode of ['shared', 'cloned'] as const) {
    const input = rows(),
      cache = createVerifiedRecords<AccountLedgerView>(
        mode === 'shared' ? { ownResults: true } : {},
      );
    const original = Uint8Array.prototype.slice,
      copies: Uint8Array[] = [];
    const observer = vi
      .spyOn(Uint8Array.prototype, 'slice')
      .mockImplementation(function (this: Uint8Array, start, end) {
        const out = original.call(this, start, end);
        copies.push(out);
        return out;
      });
    let predicted = 0;
    try {
      await cache.verify(
        input,
        mode,
        async (candidate) => {
          const result = view(candidate);
          predicted = usage(result, candidate, 0, mode).ownedBytes!;
          return result;
        },
        () => {},
      );
      const liveCopies = copies.filter((b) => b.some((byte) => byte !== 0));
      const observed = cache.readIfMatches(input, (installed) =>
        ownedByteCapacity([installed, liveCopies]),
      );
      expect(observed?.value).toBe(predicted);
      expect(liveCopies).toHaveLength(1);
    } finally {
      observer.mockRestore();
      cache.clear();
    }
  }
});
it('the real index refuses the clone-only excess at32MiB but keeps shared and normal clone eligibility', async () => {
  const r = rows(),
    v = view(r),
    proof = MAX_BYTES - ownedByteCapacity([r, v]);
  expect(await indexVerifiedLedger(v, r, route, counter, crypto.subtle, proof)).toBeDefined();
  const cloned = await Reflect.apply(indexVerifiedLedger, undefined, [
    v,
    r,
    route,
    counter,
    crypto.subtle,
    proof,
    'cloned',
  ]);
  expect(cloned).toBeUndefined();
  expect(
    await Reflect.apply(indexVerifiedLedger, undefined, [
      v,
      r,
      route,
      counter,
      crypto.subtle,
      0,
      'cloned',
    ]),
  ).toBeDefined();
});
it('rejects an unknown ownership observation without invoking accessors or changing supplied data', () => {
  const r = rows(),
    v = view(r),
    before = r[0]!.bytes.slice();
  let calls = 0;
  const object = Object.defineProperty({}, 'mode', {
    get() {
      calls++;
      return 'shared';
    },
  });
  for (const bad of ['other', '', null, object])
    expect(() => usage(v, r, 0, bad)).toThrow('ownership');
  expect(calls).toBe(0);
  expect(r[0]!.bytes).toEqual(before);
});
it('the default remains the shared-record calculation and the same logical ceiling applies to either mode', () => {
  const r = rows(),
    v = view(r);
  expect(accountLedgerIndexUsage(v, r)).toEqual(usage(v, r, 0, 'shared'));
  const record = r[0]!;
  v.census.entries = Array(4097).fill({
    record,
    event: { entry: 0 },
    extent: { firstEntry: 0, entryCount: 8 },
  });
  const physical = Array(4097).fill(record) as OpenedRecord[];
  for (const mode of ['shared', 'cloned'] as const)
    expect(usage(v, physical, 0, mode).eligible).toBe(false);
});
