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
import * as records from '../src/crdt/inboundRecord';
import { decodeInboundRequest, decodeInboundPage } from '../account-protocol/inboundTransport';
import { verifyInboundRange, verifyInboundPage } from '../src/crdt/accountInbound';
import { pageFixture, referenceBytes } from './inbound-page/fixtures';
import { live } from './account-inbound-codecs/oracle';
import type { InboundRecord } from '../src/crdt/inboundRecord';
type Turn = {
  syntax: records.InboundOriginalSyntax;
  assertCurrent(): void;
  encodeLegacy(e: InboundRecord): Uint8Array;
  encodePage(e: records.InboundPageRecord): Uint8Array;
  dispose(): void;
};
const held: Turn[] = [];
const own = (f: ReturnType<typeof pageFixture>) => {
  const t = Reflect.get(records, 'createOwnedInboundOriginals')(
    f.record.request,
    f.record.page,
  ) as Turn;
  held.push(t);
  return t;
};
const event = (f: ReturnType<typeof pageFixture>, t: Turn, i = 0): InboundRecord => ({
  baseline: f.record.baseline,
  lineage: f.record.lineage,
  head: f.record.head,
  reader: f.record.reader,
  publisher: f.record.publisher,
  kind: 'received',
  position: i + 1,
  previous: f.entries[i]!.previous,
  link: f.entries[i]!.link,
  request: t.syntax.requestBytes,
  page: t.syntax.pageBytes,
  entry: i,
});
afterEach(() => {
  for (const t of held.splice(0)) t.dispose();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it('live range parses each original once while retaining all eighteen signature checks and caller ownership', async () => {
  const f = pageFixture(),
    r = f.record.request.slice(),
    p = f.record.page.slice(),
    spy = vi.spyOn(crypto.subtle, 'verify');
  vi.mocked(decodeInboundRequest).mockClear();
  vi.mocked(decodeInboundPage).mockClear();
  const result = await verifyInboundRange(f.context, r, p, live);
  expect(result).toHaveLength(8);
  expect(decodeInboundRequest).toHaveBeenCalledTimes(1);
  expect(decodeInboundPage).toHaveBeenCalledTimes(1);
  expect(spy).toHaveBeenCalledTimes(18);
  expect(r).toEqual(f.record.request);
  expect(p).toEqual(f.record.page);
  for (const x of result) {
    expect(x.kind).toBe('received');
    if ('record' in x) {
      expect(records.decodeInboundRecord(x.record).position).toBe(x.position);
      x.record.fill(0);
    }
    if (x.kind === 'received') for (const u of x.updates) u.fill(0);
  }
});
it('bound legacy encoding uses its private canonical syntax once and matches the unchanged default codec', () => {
  const f = pageFixture(),
    t = own(f),
    out = [];
  vi.clearAllMocks();
  for (let i = 0; i < 8; i++) out.push(t.encodeLegacy(event(f, t, i)));
  expect(decodeInboundRequest).not.toHaveBeenCalled();
  expect(decodeInboundPage).not.toHaveBeenCalled();
  for (let i = 0; i < 8; i++) expect(out[i]).toEqual(records.encodeInboundRecord(event(f, t, i)));
  t.dispose();
  for (const b of out) expect(b.some((x) => x !== 0)).toBe(true);
});
it('bound dense encoding retains original signed frames and accepts interior extents without another page parse', () => {
  const f = pageFixture(),
    t = own(f),
    e = {
      ...f.record,
      firstEntry: 2,
      entryCount: 3,
      firstPosition: 3,
      previous: f.entries[2]!.previous,
      lastLink: f.entries[4]!.link,
      request: t.syntax.requestBytes,
      page: t.syntax.pageBytes,
    };
  vi.clearAllMocks();
  const actual = t.encodePage(e);
  expect(decodeInboundPage).not.toHaveBeenCalled();
  expect(actual).toEqual(referenceBytes(e));
  expect(records.encodeInboundPageRecord(e)).toEqual(actual);
  t.dispose();
  expect(actual.some((x) => x !== 0)).toBe(true);
});
it('metadata is immutable and the lifetime cannot cross structured clone', () => {
  const f = pageFixture(),
    t = own(f);
  expect(Object.isFrozen(t.syntax.request)).toBe(true);
  expect(Object.isFrozen(t.syntax.page.entries)).toBe(true);
  expect(Reflect.set(t.syntax.request, 'after', 9)).toBe(false);
  expect(() => structuredClone(t)).toThrow();
  t.assertCurrent();
  t.dispose();
  expect(() => t.assertCurrent()).toThrow();
});
it('raw mutation refuses and erases owned syntax without erasing caller bytes', () => {
  const f = pageFixture(),
    r = f.record.request.slice(),
    p = f.record.page.slice(),
    t = own(f);
  t.syntax.pageBytes[0]! ^= 1;
  expect(() => t.encodeLegacy(event(f, t))).toThrow();
  expect(t.syntax.requestBytes.every((x) => x === 0)).toBe(true);
  expect(t.syntax.pageBytes.every((x) => x === 0)).toBe(true);
  expect(f.record.request).toEqual(r);
  expect(f.record.page).toEqual(p);
});
it('decoded envelope or proof mutation cannot diverge from its original page', () => {
  for (const field of ['envelope', 'proof'] as const) {
    const f = pageFixture(),
      t = own(f);
    t.syntax.page.entries[0]![field][0]! ^= 1;
    expect(() => t.assertCurrent()).toThrow();
    expect(t.syntax.page.entries[0]![field].every((x) => x === 0)).toBe(true);
    expect(f.record.page.some((x) => x !== 0)).toBe(true);
  }
});
it('encoders refuse foreign originals, altered tuples and invalid extents without weakening default validation', () => {
  for (const change of ['foreign', 'tuple', 'extent']) {
    const f = pageFixture(),
      t = own(f);
    if (change === 'extent')
      expect(() =>
        t.encodePage({
          ...f.record,
          request: t.syntax.requestBytes,
          page: t.syntax.pageBytes,
          entryCount: 9,
        }),
      ).toThrow();
    else {
      const e = event(f, t);
      if (change === 'foreign') e.request = e.request.slice();
      else e.publisher = 'ff'.repeat(16);
      expect(() => t.encodeLegacy(e)).toThrow();
    }
    expect(() => t.assertCurrent()).toThrow();
    t.dispose();
  }
});
it('live expiry and interruption still refuse without changing caller request, page or keys', async () => {
  const f = pageFixture(),
    r = f.record.request.slice(),
    p = f.record.page.slice(),
    key = f.context.generationKey.slice();
  await expect(verifyInboundRange(f.context, r, p, { ...live, now: () => 90000 })).rejects.toThrow(
    'expired',
  );
  await expect(
    verifyInboundRange(f.context, r, p, {
      ...live,
      assertCurrent() {
        throw Error('owner stopped');
      },
    }),
  ).rejects.toThrow('owner stopped');
  expect(f.context.generationKey).toEqual(key);
  expect(r).toEqual(f.record.request);
  expect(p).toEqual(f.record.page);
  await expect(verifyInboundPage(f.context, r, p, live)).rejects.toThrow('unsupported');
});

it('a changed owned page during the final crypto check cannot escape as verified live writing', async () => {
  const f = pageFixture(),
    before = f.record.page.slice(),
    verify = crypto.subtle.verify.bind(crypto.subtle);
  let count = 0;
  vi.spyOn(crypto.subtle, 'verify').mockImplementation(async (...args) => {
    const result = await verify(...args);
    if (++count === 18) {
      const bytes = vi.mocked(decodeInboundPage).mock.calls[0]![0];
      bytes[bytes.length - 1]! ^= 1;
    }
    return result;
  });
  await expect(
    verifyInboundRange(f.context, f.record.request, f.record.page, live),
  ).rejects.toThrow();
  expect(count).toBe(18);
  expect(f.record.page).toEqual(before);
});
