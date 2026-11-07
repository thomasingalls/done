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
import * as inbound from '../src/crdt/accountInbound';
import { decodeInboundPage, decodeInboundRequest } from '../account-protocol/inboundTransport';
import { pageFixture, referenceBytes } from './inbound-page/fixtures';
import { decodeInboundPageRecord } from '../src/crdt/inboundRecord';
import { live } from './account-inbound-codecs/oracle';
import { RECEIVE_GROUP_LIMIT } from '../src/crdt/receiveLimits';
import { MAX_BATCH_BYTES, MAX_BATCH_RECORDS } from '../src/crdt/contentRecord';
import type { Bytes } from '../src/crdt/custodyCrypto';
import type { InboundResult, InboundContext, InboundLifetime } from '../src/crdt/accountInbound';
const outputs: (readonly InboundResult[])[] = [];
afterEach(() => {
  for (const results of outputs.splice(0))
    for (const result of results) {
      if ('record' in result) result.record.fill(0);
      if (result.kind === 'received') for (const u of result.updates) u.fill(0);
    }
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
const c = (f: ReturnType<typeof pageFixture>): InboundContext => ({
  ...f.context,
  inboundReceiptVersion: 1,
});
async function prepare(
  f: ReturnType<typeof pageFixture>,
  context = c(f),
  positions = 4,
  budget?: { bytes: number; records: number },
  lifetime: InboundLifetime = live,
) {
  const value = (await Reflect.get(inbound, 'prepareInboundPage')(
    context,
    f.record.request,
    f.record.page,
    lifetime,
    positions,
    budget,
  )) as readonly InboundResult[];
  outputs.push(value);
  return value;
}
function record(results: readonly InboundResult[]): Bytes {
  const first = results[0];
  if (!first || !('record' in first)) throw Error('expected receipt');
  for (const result of results) {
    expect(result.kind).toBe('received');
    if ('record' in result) expect(result.record).toBe(first.record);
  }
  return first.record;
}
it('one physical extent covers four independently verified positions with exact original frames and one parse', async () => {
  const f = pageFixture(),
    spy = vi.spyOn(crypto.subtle, 'verify');
  vi.clearAllMocks();
  const results = await prepare(f),
    raw = record(results);
  expect(results).toHaveLength(4);
  expect(decodeInboundPage).toHaveBeenCalledTimes(1);
  expect(decodeInboundRequest).toHaveBeenCalledTimes(1);
  expect(spy).toHaveBeenCalledTimes(10);
  expect(raw).toEqual(referenceBytes({ ...f.record, entryCount: 4, lastLink: f.entries[3]!.link }));
  expect(f.record.page.some((x) => x !== 0)).toBe(true);
});
it('a resumed raw page admits an exact interior extent and verifies only that prefix', async () => {
  const f = pageFixture(),
    scope = c(f);
  scope.prefix = { position: 2, link: f.entries[1]!.link, observedThrough: 8 };
  const results = await prepare(f, scope, 3),
    raw = record(results);
  expect(results.map((r) => r.position)).toEqual([3, 4, 5]);
  expect(raw).toEqual(
    referenceBytes({
      ...f.record,
      firstPosition: 3,
      firstEntry: 2,
      entryCount: 3,
      previous: f.entries[1]!.link,
      lastLink: f.entries[4]!.link,
    }),
  );
  expect(scope.prefix.position).toBe(2);
});
it('two native extents remain independently self-contained and deliberately repeat the original signed page', async () => {
  const f = pageFixture(),
    first = await prepare(f),
    scope = c(f);
  scope.prefix = { position: 4, link: f.entries[3]!.link, observedThrough: 8 };
  const second = await prepare(f, scope);
  expect(record(first)).not.toBe(record(second));
  const a = decodeInboundPageRecord(record(first)),
    b = decodeInboundPageRecord(record(second));
  expect(a.firstEntry).toBe(0);
  expect(b.firstEntry).toBe(4);
  expect(a.entryCount + b.entryCount).toBe(8);
  expect(a.page).toEqual(f.record.page);
  expect(b.page).toEqual(f.record.page);
});
it('aggregate bytes count a physical receipt once and narrow an interior extent before returning', async () => {
  const f = pageFixture(),
    one = await prepare(f, c(f), 1),
    raw = record(one),
    update = one[0]!;
  if (update.kind !== 'received') throw Error('result');
  const size = update.updates.reduce((n, b) => n + b.length, 0),
    count = update.updates.length;
  const two = await prepare(f, c(f), 4, { bytes: raw.length + 2 * size, records: 1 + 2 * count });
  expect(two).toHaveLength(2);
  const selected = decodeInboundPageRecord(record(two));
  expect(selected.entryCount).toBe(2);
  expect(selected.lastLink).toBe(f.entries[1]!.link);
  expect(
    await prepare(f, c(f), 4, { bytes: raw.length - 1, records: MAX_BATCH_RECORDS }),
  ).toHaveLength(0);
  expect(await prepare(f, c(f), 4, { bytes: MAX_BATCH_BYTES, records: count })).toHaveLength(0);
});
it('dense saved replay after original request expiry retains every admitted entry and live expiry still refuses', async () => {
  const f = pageFixture(),
    results = await prepare(f),
    raw = record(results),
    saved = await inbound.verifyStoredInboundReceipt(c(f), raw, { ...live, now: () => 90000 });
  try {
    expect(saved.entries).toHaveLength(4);
    expect(saved.entries.map((e) => e.result.position)).toEqual([1, 2, 3, 4]);
    for (const e of saved.entries) {
      expect(e.result.kind).toBe('received');
      if (e.result.kind === 'received') for (const u of e.result.updates) u.fill(0);
    }
  } finally {
    saved.record.fill(0);
  }
  await expect(prepare(f, c(f), 4, undefined, { ...live, now: () => 90000 })).rejects.toThrow(
    'expired',
  );
});
it('missing or future floors and raised budgets or turn allowances cannot select dense writing', async () => {
  const f = pageFixture();
  await expect(prepare(f, f.context)).rejects.toThrow();
  await expect(
    prepare(f, { ...c(f), inboundReceiptVersion: 2 } as unknown as InboundContext),
  ).rejects.toThrow();
  for (const budget of [
    { bytes: MAX_BATCH_BYTES + 1, records: MAX_BATCH_RECORDS },
    { bytes: MAX_BATCH_BYTES, records: MAX_BATCH_RECORDS + 1 },
    { bytes: -1, records: 1 },
  ])
    await expect(prepare(f, c(f), 4, budget)).rejects.toThrow();
  await expect(prepare(f, c(f), RECEIVE_GROUP_LIMIT + 1)).rejects.toThrow('size');
});
it('a failed final lifetime check returns no receipt and preserves caller bytes and keys', async () => {
  const f = pageFixture(),
    before = f.record.page.slice(),
    key = f.context.generationKey.slice();
  let signatures = 0;
  const verify = crypto.subtle.verify.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'verify').mockImplementation(async (...args) => {
    const answer = await verify(...args);
    signatures++;
    return answer;
  });
  await expect(
    prepare(f, c(f), 4, undefined, {
      ...live,
      assertCurrent() {
        if (signatures === 10) throw Error('closing owner');
      },
    }),
  ).rejects.toThrow('closing owner');
  expect(f.record.page).toEqual(before);
  expect(f.context.generationKey).toEqual(key);
});

it('a cryptographic refusal after a valid entry refuses the whole turn rather than returning its prefix', async () => {
  const f = pageFixture(),
    before = f.record.page.slice(),
    verify = crypto.subtle.verify.bind(crypto.subtle);
  let calls = 0;
  vi.spyOn(crypto.subtle, 'verify').mockImplementation(async (...args) =>
    ++calls === 6 ? false : verify(...args),
  );
  await expect(prepare(f)).rejects.toThrow();
  expect(calls).toBe(6);
  expect(outputs).toHaveLength(0);
  expect(f.record.page).toEqual(before);
});

it('expiry after the last verified entry still erases the dense turn before transfer', async () => {
  const f = pageFixture();
  let reads = 0;
  await expect(
    prepare(f, c(f), 4, undefined, { ...live, now: () => (++reads <= 8 ? live.now() : 90000) }),
  ).rejects.toThrow('expired');
  expect(reads).toBe(9);
  expect(outputs).toHaveLength(0);
});
