// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
const opened = vi.hoisted(() => ({ updates: [] as Uint8Array[] }));
vi.mock('../src/crdt/yjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/crdt/yjs')>();
  return {
    ...actual,
    Y: {
      ...actual.Y,
      decodeUpdate: (u: Uint8Array) => {
        opened.updates.push(u);
        return actual.Y.decodeUpdate(u);
      },
    },
  };
});
import { turnFinalCurrentModule } from './inbound-page/turn-final-current-module';
vi.mock('../account-protocol/inboundTransport', async (importOriginal) => {
  const a = await importOriginal<typeof import('../account-protocol/inboundTransport')>();
  return {
    ...a,
    decodeInboundRequest: vi.fn(a.decodeInboundRequest),
    decodeInboundPage: vi.fn(a.decodeInboundPage),
  };
});
import * as inbound from '../src/crdt/accountInbound';
import { decodeInboundRequest, decodeInboundPage } from '../account-protocol/inboundTransport';
import { inspectInboundReceipt } from '../src/crdt/inboundRecord';
import type { InboundReceiptViews } from '../src/crdt/inboundRecord';
import type { OpenedRecord } from '../src/crdt/contentRecord';
import { createVerificationMemo } from '../src/crdt/verificationMemo';
import { eraseVerified } from '../src/crdt/verifiedRecords';
import { StorageCompatibilityError } from '../src/crdt/storageCompatibility';
import { pageFixture, referenceBytes } from './inbound-page/fixtures';
import { context, live, eventWire } from './account-inbound-codecs/oracle';
import { sources } from './account-inbound/fixtures';
type Turn = {
  inspect(row: OpenedRecord, scope: inbound.InboundContext): InboundReceiptViews | undefined;
  complete(value: unknown): void;
  dispose(): void;
};
const make = () => {
  const f = (inbound as typeof inbound & { createInboundReceiptTurn?: () => Turn })
    .createInboundReceiptTurn;
  if (!f) throw Error('Missing owned inbound receipt turn');
  return f();
};
const marked = () => ({ ...context(), inboundReceiptVersion: 1 as const });
const aged = { ...live, now: () => 90000 };
const row = (raw = referenceBytes(pageFixture().record), seq = 1): OpenedRecord => ({
  seq,
  gen: 1,
  kind: 'heads',
  bytes: raw,
});
const owned = (
  c: inbound.InboundContext,
  r: OpenedRecord,
  t: Turn,
  reuse?: Parameters<typeof inbound.verifyStoredInboundReceipt>[3],
  lifetime: inbound.InboundLifetime = aged,
) => {
  const verify = inbound.verifyStoredInboundReceipt as (
    c: inbound.InboundContext,
    b: OpenedRecord['bytes'],
    l: inbound.InboundLifetime,
    m: Parameters<typeof inbound.verifyStoredInboundReceipt>[3],
    o: { turn: Turn; record: OpenedRecord },
  ) => ReturnType<typeof inbound.verifyStoredInboundReceipt>;
  return verify(c, r.bytes, lifetime, reuse, { turn: t, record: r });
};
const turns: Turn[] = [];
const fresh = () => {
  const t = make();
  turns.push(t);
  return t;
};
afterEach(() => {
  for (const t of turns.splice(0)) t.dispose();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  opened.updates.length = 0;
});
it('inspection and stored verification decode one original page while retaining all18signature checks', async () => {
  const r = row(),
    c = marked();
  let t: Turn | undefined;
  const create = (inbound as typeof inbound & { createInboundReceiptTurn?: () => Turn })
    .createInboundReceiptTurn;
  if (create) {
    t = create();
    turns.push(t);
    t.inspect(r, c);
  } else inspectInboundReceipt(r.bytes);
  const spy = vi.spyOn(crypto.subtle, 'verify');
  const result = t
    ? await owned(c, r, t)
    : await inbound.verifyStoredInboundReceipt(c, r.bytes, aged);
  expect(result.entries).toHaveLength(8);
  expect(spy).toHaveBeenCalledTimes(18);
  expect(decodeInboundRequest).toHaveBeenCalledTimes(1);
  expect(decodeInboundPage).toHaveBeenCalledTimes(1);
  t?.complete(result);
  t?.dispose();
  eraseVerified(result);
});
it('two physical row objects sharing the caller buffer get independent owned syntax', () => {
  const t = fresh(),
    a = row(),
    b = { ...a, seq: 2 };
  const before = a.bytes.slice(),
    first = t.inspect(a, marked())!,
    second = t.inspect(b, marked())!;
  expect(first.receipt.record.page.buffer).not.toBe(second.receipt.record.page.buffer);
  expect(decodeInboundPage).toHaveBeenCalledTimes(2);
  t.dispose();
  expect(first.receipt.record.page.every((v) => v === 0)).toBe(true);
  expect(second.receipt.record.page.every((v) => v === 0)).toBe(true);
  expect(a.bytes).toEqual(before);
});
it('address or raw-input mutation closes the turn rather than borrowing earlier syntax', () => {
  for (const change of [
    (r: OpenedRecord) => {
      r.seq++;
    },
    (r: OpenedRecord) => {
      r.gen++;
    },
    (r: OpenedRecord) => {
      r.kind = 'outbound';
    },
    (r: OpenedRecord) => {
      r.bytes = r.bytes.slice();
    },
    (r: OpenedRecord) => {
      r.bytes[r.bytes.length - 1]! ^= 1;
    },
  ]) {
    const t = fresh(),
      r = row(),
      view = t.inspect(r, marked())!;
    change(r);
    const changed = r.bytes.slice();
    expect(() => t.inspect(r, marked())).toThrow();
    expect(() => t.inspect(row(), marked())).toThrow();
    expect(view.receipt.record.page.every((v) => v === 0)).toBe(true);
    expect(r.bytes).toEqual(changed);
  }
});
it('cached syntax still requires a fresh own supported encoding floor', () => {
  for (const c of [
    context(),
    { ...marked(), inboundReceiptVersion: 2 },
    Object.assign(Object.create({ inboundReceiptVersion: 1 }), context()),
  ]) {
    const t = fresh(),
      r = row();
    t.inspect(r, marked());
    expect(() => t.inspect(r, c as inbound.InboundContext)).toThrow(StorageCompatibilityError);
    expect(() => t.inspect(r, marked())).toThrow();
  }
});
it('completion transfers only the admitted originals and exact raw bytes; unused entry buffers erase', async () => {
  const f = pageFixture(undefined, 8, 2, 3),
    r = row(referenceBytes(f.record)),
    c = marked(),
    t = fresh();
  c.prefix = { position: 2, link: f.entries[1]!.link, observedThrough: 8 };
  t.inspect(r, c);
  const parsed = vi.mocked(decodeInboundPage).mock.results[0]!.value as ReturnType<
      typeof decodeInboundPage
    >,
    result = await owned(c, r, t);
  t.complete(result);
  t.dispose();
  expect(result.record).toEqual(r.bytes);
  expect(result.entries.map((e) => e.index)).toEqual([2, 3, 4]);
  for (const [i, e] of parsed.entries.entries())
    expect(e.envelope.some((v) => v !== 0)).toBe(i >= 2 && i <= 4);
  for (const e of result.entries) expect(e.original.envelope).toEqual(f.entries[e.index]!.envelope);
  expect(() => t.inspect(r, c)).toThrow();
  eraseVerified(result);
});
it('an inspected but unverified row cannot transfer its parser or buffers', () => {
  const t = fresh(),
    r = row(),
    before = r.bytes.slice(),
    view = t.inspect(r, marked())!;
  expect(() => t.complete({ event: [...view.entries()][0]!.event })).toThrow();
  t.dispose();
  expect(view.receipt.record.page.every((v) => v === 0)).toBe(true);
  expect(r.bytes).toEqual(before);
});
it('an owner interruption erases scope-owned syntax without clearing caller bytes or keys', async () => {
  const t = fresh(),
    r = row(),
    before = r.bytes.slice(),
    c = marked(),
    key = c.generationKey.slice(),
    view = t.inspect(r, c)!;
  let checks = 0;
  await expect(
    owned(c, r, t, undefined, {
      ...aged,
      assertCurrent() {
        if (++checks === 10) throw Error('owner changed');
      },
    }),
  ).rejects.toThrow('owner changed');
  expect(view.receipt.record.page.every((v) => v === 0)).toBe(true);
  expect(r.bytes).toEqual(before);
  expect(c.generationKey).toEqual(key);
  expect(() => t.inspect(r, c)).toThrow();
});
it('forged or copied scope objects cannot supply stored syntax or cross a structured clone', async () => {
  const real = fresh(),
    r = row();
  real.inspect(r, marked());
  expect(() => structuredClone(real)).toThrow();
  for (const fake of [
    { inspect: () => inspectInboundReceipt(r.bytes), complete() {}, dispose() {} },
    { ...real },
  ])
    await expect(owned(marked(), r, fake)).rejects.toThrow();
  const f = pageFixture();
  await expect(
    inbound.verifyInboundRange(
      Object.assign(marked(), { turn: real, stored: true }),
      f.record.request,
      f.record.page,
      aged,
    ),
  ).rejects.toMatchObject({ reason: 'expired' });
});
it('one physical record is verified once per turn and an abandoned prior result is erased', async () => {
  const t = fresh(),
    r = row(),
    before = r.bytes.slice();
  t.inspect(r, marked());
  const result = await owned(marked(), r, t);
  await expect(owned(marked(), r, t)).rejects.toThrow();
  expect(result.record.every((v) => v === 0)).toBe(true);
  for (const e of result.entries)
    if (e.result.kind === 'received')
      for (const u of e.result.updates) expect(u.every((v) => v === 0)).toBe(true);
  expect(r.bytes).toEqual(before);
});
it('exact memo reuse still runs inside a fresh syntax scope and current owner checks', async () => {
  const memo = createVerificationMemo(),
    r = row(),
    c = marked();
  try {
    const a = fresh();
    a.inspect(r, c);
    const first = await owned(c, r, a, { memo, sequence: r.seq });
    a.complete(first);
    a.dispose();
    vi.mocked(decodeInboundPage).mockClear();
    const spy = vi.spyOn(crypto.subtle, 'verify'),
      b = fresh();
    b.inspect(r, c);
    let checks = 0;
    const second = await owned(
      c,
      r,
      b,
      { memo, sequence: r.seq },
      {
        ...aged,
        assertCurrent() {
          checks++;
        },
      },
    );
    expect(spy).not.toHaveBeenCalled();
    expect(checks).toBeGreaterThan(1);
    expect(decodeInboundPage).toHaveBeenCalledTimes(1);
    b.complete(second);
    b.dispose();
    expect(second.record).toEqual(first.record);
    eraseVerified(first);
    eraseVerified(second);
  } finally {
    memo.clear();
  }
});
it('a caller-buffer change during crypto is refused before any result transfers', async () => {
  const t = fresh(),
    r = row(),
    view = t.inspect(r, marked())!,
    verify = crypto.subtle.verify.bind(crypto.subtle);
  let changed = false;
  vi.spyOn(crypto.subtle, 'verify').mockImplementation(async (...args) => {
    const result = await verify(...args);
    if (!changed) {
      r.bytes[r.bytes.length - 1]! ^= 1;
      changed = true;
    }
    return result;
  });
  opened.updates.length = 0;
  await expect(owned(marked(), r, t)).rejects.toThrow();
  expect(opened.updates.length).toBeGreaterThan(0);
  for (const update of opened.updates) expect(update.every((v) => v === 0)).toBe(true);
  expect(view.receipt.record.page.every((v) => v === 0)).toBe(true);
  expect(r.bytes.some((v) => v !== 0)).toBe(true);
  expect(() => t.inspect(r, marked())).toThrow();
});
it('syntax metadata is immutable and cannot escape in an accepted result graph', async () => {
  const t = fresh(),
    r = row(),
    view = t.inspect(r, marked())!;
  expect(() => {
    (view as { count: number }).count = 1;
  }).toThrow();
  expect(() => {
    view.receipt.record.publisher = 'ff'.repeat(16);
  }).toThrow();
  const result = await owned(marked(), r, t);
  expect(() => t.complete({ result, parser: view.receipt })).toThrow();
  expect(result.record.every((v) => v === 0)).toBe(true);
  const legacy = row(eventWire(sources().entries[0]!)),
    u = fresh();
  u.inspect(legacy, context());
  const saved = await owned(context(), legacy, u);
  u.complete(saved);
  u.dispose();
  expect(saved.record).toEqual(legacy.bytes);
  eraseVerified(saved);
});

it('omitting only the per-result final check exposes its result while the independent whole-turn check still refuses', async () => {
  const built = await turnFinalCurrentModule();
  try {
    const r = row(),
      c = marked(),
      t = built.api.createInboundReceiptTurn();
    try {
      t.inspect(r, c);
      const verify = crypto.subtle.verify.bind(crypto.subtle);
      let changed = false;
      vi.spyOn(crypto.subtle, 'verify').mockImplementation(async (...args) => {
        const value = await verify(...args);
        if (!changed) {
          r.bytes[r.bytes.length - 1]! ^= 1;
          changed = true;
        }
        return value;
      });
      const result = await built.api.verifyStoredInboundReceipt(c, r.bytes, aged, undefined, {
        turn: t,
        record: r,
      });
      expect(result.entries).toHaveLength(8);
      expect(() => t.complete(result)).toThrow();
      expect(result.record.every((v) => v === 0)).toBe(true);
      for (const entry of result.entries)
        if (entry.result.kind === 'received')
          for (const update of entry.result.updates)
            expect(update.every((v) => v === 0)).toBe(true);
    } finally {
      t.dispose();
    }
  } finally {
    await built.dispose();
  }
});
