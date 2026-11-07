// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import * as framing from '../src/crdt/receiveGroup';
import { prepareInboundPage, type InboundResult } from '../src/crdt/accountInbound';
import { pageFixture } from './inbound-page/fixtures';
import { live } from './account-inbound-codecs/oracle';
import { MAX_BATCH_BYTES, MAX_BATCH_RECORDS, type ContentInput } from '../src/crdt/contentRecord';
import { RECEIVE_GROUP_LIMIT } from '../src/crdt/receiveLimits';
const all: (readonly InboundResult[])[] = [];
afterEach(() => {
  for (const group of all.splice(0))
    for (const r of group) {
      if ('record' in r) r.record.fill(0);
      if (r.kind === 'received') for (const b of r.updates) b.fill(0);
    }
});
const collect = (x: readonly InboundResult[]) =>
  Reflect.get(framing, 'preparedInboundPageWrites')(x) as {
    writes: ContentInput[];
    updates: Uint8Array[];
    bytes: number;
  };
async function real() {
  const f = pageFixture(),
    results = await prepareInboundPage(
      { ...f.context, inboundReceiptVersion: 1 },
      f.record.request,
      f.record.page,
      live,
      4,
    );
  all.push(results);
  return results;
}
it('framing writes all covered updates followed by exactly one physical receipt', async () => {
  const results = await real(),
    out = collect(results),
    first = results[0]!;
  if (first.kind !== 'received') throw Error('first');
  expect(out.writes.filter((w) => w.kind === 'heads')).toHaveLength(1);
  expect(out.writes.at(-1)!.bytes).toBe(first.record);
  expect(out.updates).toEqual(
    results.flatMap((r) => (r.kind === 'received' ? [...r.updates] : [])),
  );
  expect(out.writes.length).toBe(out.updates.length + 1);
  expect(out.bytes).toBe(first.record.length + out.updates.reduce((n, b) => n + b.length, 0));
});
it('equivalent copied receipts cannot silently multiply or alias physical ownership inside one page', async () => {
  const results = await real(),
    changed = results.map((r, i) =>
      i === 1 && r.kind === 'received' ? { ...r, record: r.record.slice() } : r,
    );
  expect(() => collect(changed)).toThrow();
  expect(() => collect([...results].reverse())).toThrow();
});
it('non-received, discontinuous and excessive logical results refuse physical framing', async () => {
  const results = await real(),
    first = results[0]!;
  expect(() => collect([])).toThrow();
  expect(() => collect([{ kind: 'empty', position: 0, through: 8 }])).toThrow();
  expect(() =>
    collect([{ ...first, position: Number.MAX_SAFE_INTEGER }, ...results.slice(1)]),
  ).toThrow();
  expect(() => collect(Array(RECEIVE_GROUP_LIMIT + 1).fill(first))).toThrow();
});
it('physical bytes and rows retain their exact ceilings while logical positions stay separate', () => {
  const raw = new Uint8Array(1),
    result = {
      kind: 'received' as const,
      record: raw,
      position: 1,
      link: '00'.repeat(32),
      through: 1,
      actor: { id: 'system', kind: 'system' as const },
      updates: [new Uint8Array(MAX_BATCH_BYTES - 1)],
    };
  expect(collect([result]).bytes).toBe(MAX_BATCH_BYTES);
  expect(() => collect([{ ...result, updates: [new Uint8Array(MAX_BATCH_BYTES)] }])).toThrow();
  expect(
    collect([{ ...result, updates: Array(MAX_BATCH_RECORDS - 1).fill(new Uint8Array()) }]).writes,
  ).toHaveLength(MAX_BATCH_RECORDS);
  expect(() =>
    collect([{ ...result, updates: Array(MAX_BATCH_RECORDS).fill(new Uint8Array()) }]),
  ).toThrow();
});
it('framing borrows existing verified buffers and never rewrites or erases its producer', async () => {
  const results = await real(),
    before = structuredClone(results),
    out = collect(results);
  expect(results).toEqual(before);
  for (let i = 0; i < out.updates.length; i++) expect(out.writes[i]!.bytes).toBe(out.updates[i]);
});
