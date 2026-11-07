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
import { decodeInboundRequest, decodeInboundPage } from '../account-protocol/inboundTransport';
import * as codec from '../src/crdt/inboundRecord';
import { verifyStoredInbound } from '../src/crdt/accountInbound';
import { A, packet, sources } from './account-inbound/fixtures';
import { context, eventWire, json, live } from './account-inbound-codecs/oracle';
import { pageFixture, referenceBytes } from './inbound-page/fixtures';
afterEach(() => vi.clearAllMocks());
const clear = () => {
  vi.mocked(decodeInboundRequest).mockClear();
  vi.mocked(decodeInboundPage).mockClear();
};
const once = () => {
  expect(decodeInboundRequest).toHaveBeenCalledTimes(1);
  expect(decodeInboundPage).toHaveBeenCalledTimes(1);
};
it('binary decoder parses each original exactly once while checking all eight admitted entries', () => {
  const { record } = pageFixture(A, 8),
    bytes = referenceBytes(record);
  clear();
  expect(codec.decodeInboundPageRecord(bytes)).toEqual(record);
  once();
});
it('binary encoder parses each original exactly once and retains exact independent bytes', () => {
  const { record } = pageFixture(A, 8),
    expected = referenceBytes(record);
  clear();
  expect(codec.encodeInboundPageRecord(record)).toEqual(expected);
  once();
});
it('receipt inspection and repeated logical iteration reuse one captured original syntax for that extent', () => {
  const { record } = pageFixture(A, 8),
    bytes = referenceBytes(record);
  clear();
  const parsed = codec.inspectInboundReceipt(bytes)!;
  expect([...parsed.entries()]).toHaveLength(8);
  expect([...parsed.entries()]).toHaveLength(8);
  once();
});
it('legacy inspection shares its one parse without changing exact v1 bytes', () => {
  const e = sources().entries[0]!,
    bytes = eventWire(e, context(), packet(e));
  clear();
  const parsed = codec.inspectInboundReceipt(bytes)!;
  expect([...parsed.entries()][0]!.event.position).toBe(1);
  once();
});
it('syntax reuse supplies no signature trust and separate physical decodes retain separate owned buffers', async () => {
  const { record } = pageFixture(A, 8),
    bytes = referenceBytes(record);
  const first = codec.inspectInboundReceipt(bytes)!,
    second = codec.inspectInboundReceipt(bytes)!;
  expect(first.receipt.record.page.buffer).not.toBe(second.receipt.record.page.buffer);
  bytes.fill(0);
  expect(first.receipt.record.page).toEqual(record.page);
  const e = sources().entries[0]!,
    p = packet(e),
    badPage = JSON.parse(Buffer.from(p.page).toString());
  badPage[6] = '00'.repeat(64);
  const raw = eventWire(e, context(), { ...p, page: json(badPage) });
  expect(codec.inspectInboundReceipt(raw)!.count).toBe(1);
  await expect(
    verifyStoredInbound(context(), raw, { ...live, now: () => 90000 }),
  ).rejects.toMatchObject({ reason: 'unverified' });
});
