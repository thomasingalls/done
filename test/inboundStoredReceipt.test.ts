// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
const observed = vi.hoisted(() => ({ updates: [] as Uint8Array[] }));
vi.mock('../account-protocol/inboundTransport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../account-protocol/inboundTransport')>();
  return {
    ...actual,
    decodeInboundRequest: vi.fn(actual.decodeInboundRequest),
    decodeInboundPage: vi.fn(actual.decodeInboundPage),
  };
});
vi.mock('../src/crdt/yjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/crdt/yjs')>();
  return {
    ...actual,
    Y: {
      ...actual.Y,
      decodeUpdate: (u: Uint8Array) => {
        observed.updates.push(u);
        return actual.Y.decodeUpdate(u);
      },
    },
  };
});
import * as inbound from '../src/crdt/accountInbound';
import { decodeInboundPage, decodeInboundRequest } from '../account-protocol/inboundTransport';
import { decodeInboundRecord } from '../src/crdt/inboundRecord';
import { eraseVerified } from '../src/crdt/verifiedRecords';
import { StorageCompatibilityError } from '../src/crdt/storageCompatibility';
import { A, B, packet, sources } from './account-inbound/fixtures';
import { context, eventWire, hex, json, live, reframe } from './account-inbound-codecs/oracle';
import { pageFixture, referenceBytes } from './inbound-page/fixtures';
type Receipt = {
  readonly record: Uint8Array;
  readonly entries: readonly {
    readonly index: number;
    readonly event: ReturnType<typeof decodeInboundRecord>;
    readonly original: { readonly envelope: Uint8Array; readonly proof: Uint8Array };
    readonly result: inbound.InboundResult;
  }[];
};
// Before the new API exists, exercise the old real stored verifier on these bytes.
const stored = async (
  ...args: Parameters<typeof inbound.verifyStoredInbound>
): Promise<Receipt> => {
  const bulk = (
    inbound as typeof inbound & {
      verifyStoredInboundReceipt?: (
        ...args: Parameters<typeof inbound.verifyStoredInbound>
      ) => Promise<Receipt>;
    }
  ).verifyStoredInboundReceipt;
  if (bulk) return bulk(...args);
  const result = await inbound.verifyStoredInbound(...args),
    event = decodeInboundRecord(args[1]),
    index = event.entry ?? 0;
  if (!('record' in result)) throw Error('No stored receipt');
  return {
    record: result.record,
    entries: [{ index, event, original: decodeInboundPage(event.page).entries[index]!, result }],
  };
};
const marked = (publisher = A) => ({ ...context(publisher), inboundReceiptVersion: 1 as const });
const aged = { ...live, now: () => 90000 };
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  observed.updates.length = 0;
});
it('opens every admitted position of an aged binary page for both publishers without synthetic v2 records', async () => {
  for (const publisher of [A, B]) {
    const f = pageFixture(publisher),
      raw = referenceBytes(f.record),
      copy = raw.slice(),
      result = await stored(marked(publisher), raw, aged);
    expect(result.record).toEqual(raw);
    expect(result.entries).toHaveLength(8);
    result.entries.forEach((e, index) => {
      expect(e.index).toBe(index);
      expect(e.event.kind).toBe('received');
      expect(e.event.position).toBe(index + 1);
      expect(e.result.kind).toBe('received');
      if (e.result.kind !== 'received') throw Error('expected received');
      expect(e.result.record).toBe(result.record);
      expect(e.result.link).toBe(f.entries[index]!.link);
      expect(e.result.updates).toEqual(f.entries[index]!.updates);
      expect(e.original.envelope).toEqual(f.entries[index]!.envelope);
      expect(e.event.page.buffer).toBe(result.record.buffer);
    });
    eraseVerified(result);
    expect(raw).toEqual(copy);
  }
});
it('an interior admitted extent starts at its independently retained prefix and preserves original indices', async () => {
  const f = pageFixture(A, 8, 2, 3),
    c = marked();
  c.prefix = { position: 2, link: f.entries[1]!.link, observedThrough: 8 };
  const result = await stored(c, referenceBytes(f.record), aged);
  expect(result.entries.map((e) => e.index)).toEqual([2, 3, 4]);
  expect(result.entries.map((e) => e.result.position)).toEqual([3, 4, 5]);
  expect(result.entries[0]!.event.previous).toBe(c.prefix.link);
  expect(result.entries.at(-1)!.event.link).toBe(f.record.lastLink);
  eraseVerified(result);
});
it('binary replay requires its own captured encoding floor and refuses unknown floors', async () => {
  const raw = referenceBytes(pageFixture().record);
  for (const c of [
    context(),
    { ...context(), inboundReceiptVersion: 0 },
    { ...context(), inboundReceiptVersion: 2 },
  ])
    await expect(stored(c as never, raw, aged)).rejects.toBeInstanceOf(StorageCompatibilityError);
});
it('the binary header cannot replace the authenticated baseline or retained predecessor', async () => {
  const f = pageFixture(),
    badBaseline = { ...f.record, baseline: 'ab'.repeat(32) },
    badPrevious = { ...f.record, previous: 'ab'.repeat(32) };
  await expect(stored(marked(), referenceBytes(badBaseline), aged)).rejects.toThrow('record');
  await expect(stored(marked(), referenceBytes(badPrevious), aged)).rejects.toThrow();
});
it('stored page expiry cannot be selected by network input or lifetime fields on the live API', async () => {
  const f = pageFixture(),
    c = Object.assign(marked(), { stored: true, mode: 'storedPhysical' });
  const saved = await stored(c, referenceBytes(f.record), aged);
  eraseVerified(saved);
  await expect(
    inbound.verifyInboundRange(c, f.record.request, f.record.page, {
      ...aged,
      stored: true,
    } as never),
  ).rejects.toMatchObject({ reason: 'expired' });
});
it('legacy stored receipts keep exact bytes, plaintext and selected metadata', async () => {
  const e = sources().entries[0]!,
    raw = eventWire(e),
    old = await inbound.verifyStoredInbound(context(), raw, aged),
    result = await stored(context(), raw, aged);
  expect(result.entries).toHaveLength(1);
  expect(result.entries[0]!.result).toEqual(old);
  expect(result.record).toEqual(raw);
  expect(result.entries[0]!.original).toEqual({ envelope: e.envelope, proof: e.proof });
  eraseVerified(result);
  eraseVerified(old);
});
it('one page turn parses each original and checks each wire signature once while checking both entry signatures eight times', async () => {
  const f = pageFixture(),
    verify = vi.spyOn(crypto.subtle, 'verify');
  vi.mocked(decodeInboundRequest).mockClear();
  vi.mocked(decodeInboundPage).mockClear();
  const result = await stored(marked(), referenceBytes(f.record), aged);
  expect(decodeInboundRequest).toHaveBeenCalledTimes(1);
  expect(decodeInboundPage).toHaveBeenCalledTimes(1);
  expect(verify).toHaveBeenCalledTimes(18);
  const tags = verify.mock.calls.map((c) => {
    try {
      return JSON.parse(new TextDecoder().decode(c[3]))[0];
    } catch {
      return undefined;
    }
  });
  expect(tags.filter((x) => x === 'done/private-read/v2')).toHaveLength(1);
  expect(tags.filter((x) => x === 'done/private-read-page/v2')).toHaveLength(1);
  eraseVerified(result);
});
it('a bad fourth entry signature refuses the entire extent and erases earlier opened plaintext', async () => {
  const f = pageFixture(),
    proof = JSON.parse(Buffer.from(f.entries[3]!.proof).toString());
  proof[11] = '00'.repeat(64);
  const wire = reframe(f.record, {
    page: (p) => {
      const entries = p[5] as string[][];
      entries[3]![1] = hex(json(proof));
    },
  });
  observed.updates.length = 0;
  await expect(stored(marked(), referenceBytes({ ...f.record, ...wire }), aged)).rejects.toThrow();
  expect(observed.updates).toHaveLength(3);
  for (const update of observed.updates) expect(update.every((x) => x === 0)).toBe(true);
});
it('caller bytes and keys may change during awaits without changing the captured saved page', async () => {
  const f = pageFixture(),
    raw = referenceBytes(f.record),
    expected = raw.slice(),
    c = marked();
  const pending = stored(c, raw, aged);
  raw.fill(0);
  c.generationKey.fill(0);
  const result = await pending;
  expect(result.record).toEqual(expected);
  expect(result.entries).toHaveLength(8);
  eraseVerified(result);
});
it('owner invalidation during a later entry wins and erases earlier plaintext', async () => {
  const f = pageFixture();
  let invalid = false,
    calls = 0;
  const original = crypto.subtle.verify.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'verify').mockImplementation(async (...args) => {
    const v = await original(...args);
    if (++calls === 8) invalid = true;
    return v;
  });
  observed.updates.length = 0;
  await expect(
    stored(marked(), referenceBytes(f.record), {
      now: () => 90000,
      assertCurrent() {
        if (invalid) throw Error('declared owner invalidation');
      },
    }),
  ).rejects.toThrow('declared owner invalidation');
  expect(observed.updates.length).toBeGreaterThan(0);
  for (const update of observed.updates) expect(update.every((x) => x === 0)).toBe(true);
});
it('independent physical turns share no buffers, and erasing one leaves the other exact', async () => {
  const raw = referenceBytes(pageFixture().record),
    first = await stored(marked(), raw, aged),
    second = await stored(marked(), raw, aged);
  expect(first.record.buffer).not.toBe(second.record.buffer);
  eraseVerified(first);
  expect(second.record).toEqual(raw);
  expect(second.entries[7]!.original.envelope.some((x) => x !== 0)).toBe(true);
  eraseVerified(second);
});
it('the legacy single-result API never silently truncates a binary multi-entry receipt', async () => {
  await expect(
    inbound.verifyStoredInbound(marked(), referenceBytes(pageFixture().record), aged),
  ).rejects.toThrow();
  const e = sources().entries[0]!,
    p = packet(e);
  const received = await inbound.verifyInboundPage(context(), p.request, p.page, live);
  eraseVerified(received);
});
