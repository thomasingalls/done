// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../account-protocol/inboundTransport', async (original) => {
  const actual = await original<typeof import('../account-protocol/inboundTransport')>();
  return {
    ...actual,
    decodeInboundRequest: vi.fn(actual.decodeInboundRequest),
    decodeInboundPage: vi.fn(actual.decodeInboundPage),
  };
});
import { decodeInboundRequest, decodeInboundPage } from '../account-protocol/inboundTransport';
import * as inbound from '../src/crdt/accountInbound';
import { createVerificationMemo, type VerificationMemo } from '../src/crdt/verificationMemo';
import {
  createPreparationJournal,
  authenticatePreparationReceipts,
  disposePreparationReceipts,
} from '../src/crdt/retentionPreparation';
import { eraseVerified } from '../src/crdt/verifiedRecords';
import { StorageCompatibilityError } from '../src/crdt/storageCompatibility';
import { pageFixture, referenceBytes } from './inbound-page/fixtures';
import { context, eventWire, live } from './account-inbound-codecs/oracle';
import { sources } from './account-inbound/fixtures';
import type { Bytes } from '../src/crdt/custodyCrypto';
type Reuse = { memo: VerificationMemo; sequence: number };
const stored = inbound.verifyStoredInboundReceipt as (
  input: inbound.InboundContext,
  bytes: Bytes,
  lifetime: inbound.InboundLifetime,
  reuse?: Reuse,
) => ReturnType<typeof inbound.verifyStoredInboundReceipt>;
const c = () => ({ ...context(), inboundReceiptVersion: 1 as const });
const current = () => {},
  aged = { ...live, now: () => 90000 };
afterEach(() => vi.restoreAllMocks());
it('reuses the exact native proof across all actual entry addresses while returning independent whole-page projections', async () => {
  const raw = referenceBytes(pageFixture().record),
    memo = createVerificationMemo(),
    verify = vi.spyOn(crypto.subtle, 'verify');
  vi.mocked(decodeInboundRequest).mockClear();
  vi.mocked(decodeInboundPage).mockClear();
  const a = await stored(c(), raw, aged, { memo, sequence: 9 });
  expect(decodeInboundRequest).toHaveBeenCalledTimes(1);
  expect(decodeInboundPage).toHaveBeenCalledTimes(1);
  expect(verify).toHaveBeenCalledTimes(18);
  const b = await stored(c(), raw, aged, { memo, sequence: 9 });
  expect(verify).toHaveBeenCalledTimes(18);
  expect(decodeInboundRequest).toHaveBeenCalledTimes(2);
  expect(decodeInboundPage).toHaveBeenCalledTimes(2);
  expect(a).toEqual(b);
  expect(a.record.buffer).not.toBe(b.record.buffer);
  for (const e of b.entries) {
    expect(e.event.page.buffer).toBe(b.record.buffer);
    if (e.result.kind === 'received') expect(e.result.record).toBe(b.record);
  }
  eraseVerified(a);
  memo.clear();
  expect(b.record).toEqual(raw);
  expect(b.entries[7]!.original.envelope.some((x) => x !== 0)).toBe(true);
  eraseVerified(b);
});
it('a different physical sequence and a later interior index cannot reuse the wrong page proof', async () => {
  const f = pageFixture(),
    raw = referenceBytes(f.record),
    memo = createVerificationMemo(),
    verify = vi.spyOn(crypto.subtle, 'verify');
  eraseVerified(await stored(c(), raw, aged, { memo, sequence: 1 }));
  eraseVerified(await stored(c(), raw, aged, { memo, sequence: 2 }));
  expect(verify).toHaveBeenCalledTimes(36);
  const cut = pageFixture(undefined, 8, 2, 3),
    cc = c();
  cc.prefix = { position: 2, link: f.entries[1]!.link, observedThrough: 8 };
  const out = await stored(cc, referenceBytes(cut.record), aged, { memo, sequence: 2 });
  expect(out.entries.map((x) => x.index)).toEqual([2, 3, 4]);
  expect(verify).toHaveBeenCalledTimes(44);
  eraseVerified(out);
  memo.clear();
});
it('different key bytes cannot inherit an exact raw-page cache hit', async () => {
  const raw = referenceBytes(pageFixture().record),
    memo = createVerificationMemo();
  eraseVerified(await stored(c(), raw, aged, { memo, sequence: 1 }));
  const changed = c();
  changed.generationKey[0]! ^= 1;
  await expect(stored(changed, raw, aged, { memo, sequence: 1 })).rejects.toThrow();
  memo.clear();
});
it('the authenticated encoding floor and current-owner guard run before a cached proof can be selected', async () => {
  const raw = referenceBytes(pageFixture().record),
    memo = createVerificationMemo();
  eraseVerified(await stored(c(), raw, aged, { memo, sequence: 1 }));
  await expect(stored(context(), raw, aged, { memo, sequence: 1 })).rejects.toBeInstanceOf(
    StorageCompatibilityError,
  );
  await expect(
    stored(
      c(),
      raw,
      {
        ...aged,
        assertCurrent() {
          throw Error('closed owner');
        },
      },
      { memo, sequence: 1 },
    ),
  ).rejects.toThrow('closed owner');
  expect(memo.ownedBytes()).toBeGreaterThan(0);
  memo.clear();
});
it('authenticates a compact journal delta and resumes the saved crypto proof with exact originals', async () => {
  const raw = referenceBytes(pageFixture().record),
    ctx = '11'.repeat(32),
    key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
      'verify',
    ]),
    auth = {
      sign: async (b: Bytes) => new Uint8Array(await crypto.subtle.sign('HMAC', key, b)),
      verify: (b: Bytes, m: Bytes) => crypto.subtle.verify('HMAC', key, m, b),
    },
    j = createPreparationJournal({ context: ctx, current }),
    next = createPreparationJournal({ context: ctx, current });
  const a = await stored(c(), raw, aged, { memo: j.memo, sequence: 7 });
  expect(j.statistics).toMatchObject({ entries: 1, misses: 1 });
  const d = await j.delta(auth),
    p = await authenticatePreparationReceipts(ctx, d.payload, d.mac, auth, current);
  next.import(p);
  disposePreparationReceipts(p);
  j.dispose();
  eraseVerified(d);
  const verify = vi.spyOn(crypto.subtle, 'verify'),
    b = await stored(c(), raw, aged, { memo: next.memo, sequence: 7 });
  expect(verify).not.toHaveBeenCalled();
  expect(b).toEqual(a);
  expect(next.statistics).toMatchObject({ hits: 1, misses: 0 });
  eraseVerified(a);
  next.dispose();
  expect(b.record).toEqual(raw);
  eraseVerified(b);
});
it('legacy cached results retain their exact original bytes and actual selected entry key', async () => {
  const raw = eventWire(sources().entries[0]!),
    memo = createVerificationMemo(),
    verify = vi.spyOn(crypto.subtle, 'verify');
  const a = await stored(context(), raw, aged, { memo, sequence: 3 }),
    calls = verify.mock.calls.length;
  const b = await stored(context(), raw, aged, { memo, sequence: 3 });
  expect(verify).toHaveBeenCalledTimes(calls);
  expect(b).toEqual(a);
  expect(b.record).toEqual(raw);
  eraseVerified(a);
  eraseVerified(b);
  memo.clear();
});
it('a portable old memo without the receipt extension verifies a binary page normally on every call', async () => {
  const native = createVerificationMemo(),
    portable: VerificationMemo = {
      check: native.check,
      retain: native.retain,
      clear: native.clear,
    },
    raw = referenceBytes(pageFixture().record),
    verify = vi.spyOn(crypto.subtle, 'verify');
  eraseVerified(await stored(c(), raw, aged, { memo: portable, sequence: 1 }));
  eraseVerified(await stored(c(), raw, aged, { memo: portable, sequence: 1 }));
  expect(verify).toHaveBeenCalledTimes(36);
  expect(native.ownedBytes()).toBe(0);
  native.clear();
});
it('clear during a fresh proof refuses and wipes earlier opened plaintext rather than reviving its cache', async () => {
  const raw = referenceBytes(pageFixture().record),
    memo = createVerificationMemo(),
    original = crypto.subtle.verify.bind(crypto.subtle);
  let calls = 0;
  vi.spyOn(crypto.subtle, 'verify').mockImplementation(async (...args) => {
    const value = await original(...args);
    if (++calls === 8) memo.clear();
    return value;
  });
  await expect(stored(c(), raw, aged, { memo, sequence: 1 })).rejects.toThrow('changed');
  expect(memo.ownedBytes()).toBe(0);
  memo.clear();
});
