// @vitest-environment node
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import {
  authenticatePreparationReceipts,
  createPreparationJournal,
  disposePreparationReceipts,
  PreparationCapacity,
  PreparationPause,
} from '../src/crdt/retentionPreparation';
import {
  decodePreparationValue as decode,
  encodePreparationValue as encode,
  PREPARATION_VALUE_BYTES,
} from '../src/crdt/preparationValue';
import { verifyStoredInboundReceipt } from '../src/crdt/accountInbound';
import { inboundEntryMemoSlot } from '../src/crdt/inboundRecord';
import { eraseVerified } from '../src/crdt/verifiedRecords';
import { pageFixture, referenceBytes } from './inbound-page/fixtures';
import { context as inboundContext, live } from './account-inbound-codecs/oracle';
import { eventWire } from './account-inbound-codecs/oracle';
import { B, sources } from './account-inbound/fixtures';
import type { Bytes } from '../src/crdt/custodyCrypto';
import type { ReceiptVerificationMemo } from '../src/crdt/verificationMemo';

const context = '01'.repeat(32),
  current = () => {};
type Journal = ReturnType<typeof createPreparationJournal>;
type Compact = {
  record: Bytes;
  entries: {
    index: number;
    original: { envelope: Bytes; proof: Bytes };
    result: {
      kind: 'received';
      updates: readonly Uint8Array[];
      actor: { id: string; kind: 'human' | 'system' };
      position: number;
      link: string;
      through: number;
    };
  }[];
};
let whole: Compact, interior: Compact;
beforeAll(async () => {
  for (const first of [0, 2]) {
    const f = pageFixture(undefined, 8, first, first ? 3 : 8),
      c = {
        ...f.context,
        inboundReceiptVersion: 1 as const,
        prefix: first
          ? { position: first, link: f.entries[first - 1]!.link, observedThrough: 8 }
          : f.context.prefix,
      },
      v = await verifyStoredInboundReceipt(c, referenceBytes(f.record), {
        ...live,
        now: () => 90000,
      });
    const compact: Compact = {
      record: v.record,
      entries: v.entries.map((e) => {
        if (e.result.kind !== 'received') throw Error('received expected');
        const { record: _record, ...result } = e.result;
        return { index: e.index, original: e.original, result };
      }),
    };
    if (first) interior = compact;
    else whole = compact;
  }
});
afterAll(() => {
  eraseVerified(whole);
  eraseVerified(interior);
});
const slots = (v: Compact, seq = 1) => v.entries.map((e) => inboundEntryMemoSlot(seq, e.index));
// Before the adapter exists, use the old journal on the exact new bounded role.
function check<T>(
  j: Journal,
  addresses: readonly string[],
  input: readonly Uint8Array[],
  verify: () => Promise<T>,
) {
  const memo = j.memo as Partial<ReceiptVerificationMemo> & Journal['memo'];
  if (memo.checkReceipt) return memo.checkReceipt(addresses, 'owner', input, verify, current);
  const first = addresses[0]?.split(':');
  return memo.check(
    `inbound-page:${first?.[1]}:${first?.[2]}:${addresses.length}`,
    'owner',
    input,
    verify,
    current,
  );
}
async function auth() {
  const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
  return {
    sign: async (b: Bytes) => new Uint8Array(await crypto.subtle.sign('HMAC', key, b)),
    verify: (b: Bytes, m: Bytes) => crypto.subtle.verify('HMAC', key, m, b),
  };
}
const verify =
  (v = whole) =>
  async () =>
    structuredClone(v);
async function proof(j: Journal, a: Awaited<ReturnType<typeof auth>>) {
  const d = await j.delta(a);
  try {
    return await authenticatePreparationReceipts(context, d.payload, d.mac, a, current);
  } finally {
    eraseVerified(d);
  }
}
it('authenticates and resumes one whole page under every actual entry address without repeating verification', async () => {
  const a = await auth(),
    old = createPreparationJournal({ context, current }),
    fresh = createPreparationJournal({ context, current });
  const run = vi.fn(verify()),
    value = await check(old, slots(whole), [whole.record], run);
  eraseVerified(value);
  const p = await proof(old, a);
  old.dispose();
  fresh.import(p);
  disposePreparationReceipts(p);
  const resumed = await check(fresh, slots(whole), [whole.record], run);
  expect(resumed).toEqual(whole);
  expect(run).toHaveBeenCalledTimes(1);
  expect(fresh.statistics).toMatchObject({ entries: 1, pending: 0, hits: 1, misses: 0 });
  eraseVerified(resumed);
  fresh.dispose();
});
it('interior extents retain original indices and reject a changed later address', async () => {
  const j = createPreparationJournal({ context, current }),
    addresses = slots(interior),
    run = vi.fn(verify(interior));
  expect((await check(j, addresses, [interior.record], run)).entries.map((e) => e.index)).toEqual([
    2, 3, 4,
  ]);
  await expect(
    check(j, ['inbound:1:2', 'inbound:1:3', 'inbound:1:5'], [interior.record], run),
  ).rejects.toThrow();
  await expect(
    check(j, ['inbound:1:0', 'inbound:1:1', 'inbound:1:2'], [interior.record], run),
  ).rejects.toThrow();
  expect(j.statistics.pending).toBe(1);
  j.dispose();
});
it('serializes one raw page only and reports the actual independently owned result-buffer capacity', async () => {
  const j = createPreparationJournal({ context, current }),
    a = await auth();
  await check(j, slots(whole), [whole.record], verify());
  const d = await j.delta(a),
    rows = decode(d.payload) as [string, string, Bytes][];
  expect(rows).toHaveLength(1);
  expect(rows[0]![0]).toBe('inbound-page:1:0:8');
  const bytes = rows[0]![2],
    raw = Buffer.from(bytes),
    magic = Buffer.from('done/account-inbound/page/v1\0');
  expect(raw.indexOf(magic)).toBeGreaterThanOrEqual(0);
  expect(raw.indexOf(magic, raw.indexOf(magic) + 1)).toBe(-1);
  expect((j.memo as Partial<ReceiptVerificationMemo>).ownedBytes?.()).toBe(bytes.length);
  expect(decode(bytes)).toEqual(whole);
  j.memo.clear();
  expect((j.memo as Partial<ReceiptVerificationMemo>).ownedBytes?.()).toBe(0);
  eraseVerified(d);
  eraseVerified(rows);
  j.dispose();
});
it('every physical sequence, context and exact input remains a boundary after authenticated import', async () => {
  const j = createPreparationJournal({ context, current }),
    a = await auth(),
    run = vi.fn(verify());
  await check(j, slots(whole), [whole.record], run);
  const p = await proof(j, a);
  const next = createPreparationJournal({ context, current });
  next.import(p);
  await check(next, slots(whole, 2), [whole.record], run);
  const extra = new Uint8Array([1]);
  await check(next, slots(whole), [whole.record, extra], run);
  extra[0] = 2;
  await check(next, slots(whole), [whole.record, extra], run);
  expect(run).toHaveBeenCalledTimes(4);
  await expect(check(next, slots(whole), [new Uint8Array([9])], verify())).rejects.toThrow();
  expect(() => createPreparationJournal({ context: '02'.repeat(32), current }).import(p)).toThrow();
  disposePreparationReceipts(p);
  j.dispose();
  next.dispose();
});
it('new indexed legacy slots retain the unchanged received result and remain disjoint from a page role', async () => {
  const j = createPreparationJournal({ context, current }),
    raw = eventWire(sources().entries[0]!),
    v = await verifyStoredInboundReceipt(inboundContext(), raw, live);
  const r = v.entries[0]!.result;
  expect(
    await j.memo.check('inbound:1:0', 'owner', [raw], async () => structuredClone(r), current),
  ).toEqual(r);
  await check(j, slots(whole), [whole.record], verify());
  expect(j.statistics.entries).toBe(2);
  eraseVerified(v);
  j.dispose();
});
it('rejects malformed closed page result shapes before saving anything', async () => {
  const mutate: ((v: Compact) => void)[] = [
    (v) => {
      (v as unknown as { trust: boolean }).trust = true;
    },
    (v) => {
      (v.entries[0]!.result as unknown as { record: Uint8Array }).record = v.record;
    },
    (v) => {
      v.entries[0]!.index = 1;
    },
    (v) => {
      v.entries.pop();
    },
    (v) => {
      v.entries[0]!.result.position = 2;
    },
    (v) => {
      v.entries[0]!.result.link = 'ab'.repeat(32);
    },
    (v) => {
      v.entries[0]!.result.through = 9;
    },
    (v) => {
      v.entries[0]!.original.envelope[0]! ^= 1;
    },
    (v) => {
      v.entries[0]!.original.proof[0]! ^= 1;
    },
    (v) => {
      (v.entries[0]!.result as unknown as { kind: string }).kind = 'conflict';
    },
    (v) => {
      (v.entries[0]!.result.actor as unknown as { kind: string }).kind = 'robot';
    },
  ];
  for (const change of mutate) {
    const j = createPreparationJournal({ context, current }),
      value = structuredClone(whole);
    change(value);
    await expect(check(j, slots(whole), [whole.record], async () => value)).rejects.toThrow();
    expect(j.statistics.pending).toBe(0);
    expect(value.record.every((x) => x === 0)).toBe(true);
    j.dispose();
  }
});
it('even a valid MAC cannot import a malformed new result or invalid original-index role', async () => {
  const a = await auth(),
    j = createPreparationJournal({ context, current });
  await check(j, slots(whole), [whole.record], verify());
  const d = await j.delta(a);
  const rows = decode(d.payload) as [string, string, Bytes][];
  for (const role of [
    'inbound-page:1:0:9',
    'inbound-page:0:0:8',
    'inbound-page:1:7:2',
    'inbound:1:8',
    'inbound:01:0',
  ]) {
    const payload = encode([[role, rows[0]![1], rows[0]![2]]]),
      m = await a.sign(encode(['done/local-preparation/draft-1', 'receipts', context, payload]));
    await expect(
      authenticatePreparationReceipts(context, payload, m, a, current),
    ).rejects.toThrow();
    eraseVerified([payload, m]);
  }
  const value = structuredClone(whole);
  value.entries[2]!.index = 7;
  const payload = encode([[rows[0]![0], rows[0]![1], encode(value)]]),
    mac = await a.sign(encode(['done/local-preparation/draft-1', 'receipts', context, payload]));
  await expect(
    authenticatePreparationReceipts(context, payload, mac, a, current),
  ).rejects.toThrow();
  eraseVerified([d, rows, value, payload, mac]);
  j.dispose();
});
it('bad MAC, altered payload and wrong authentication key refuse the saved page', async () => {
  const j = createPreparationJournal({ context, current }),
    a = await auth(),
    other = await auth();
  await check(j, slots(whole), [whole.record], verify());
  const d = await j.delta(a);
  const bad = d.mac.slice();
  bad[0]! ^= 1;
  const changed = d.payload.slice();
  changed[changed.length - 1]! ^= 1;
  for (const [payload, mac, key] of [
    [d.payload, bad, a],
    [changed, d.mac, a],
    [d.payload, d.mac, other],
  ] as const)
    await expect(
      authenticatePreparationReceipts(context, payload, mac, key, current),
    ).rejects.toThrow();
  eraseVerified([d, bad, changed]);
  j.dispose();
});
it('a fresh page miss obeys the slice while an authenticated hit does not spend it', async () => {
  let now = 0;
  const j = createPreparationJournal({ context, current, now: () => now });
  await check(j, slots(whole), [whole.record], async () => {
    now = 2001;
    return structuredClone(whole);
  });
  await check(j, slots(whole), [whole.record], async () => {
    throw Error('hit');
  });
  await expect(check(j, slots(whole, 2), [whole.record], verify())).rejects.toBeInstanceOf(
    PreparationPause,
  );
  expect(j.statistics).toMatchObject({ hits: 1, misses: 1 });
  j.dispose();
});
it('clear, owner invalidation and caller mutation during a pending check erase fresh work', async () => {
  for (const fault of ['clear', 'owner', 'input']) {
    let invalid = false,
      release!: (v: Compact) => void;
    const j = createPreparationJournal({
        context,
        current: () => {
          if (invalid) throw Error('owner');
        },
      }),
      raw = whole.record.slice();
    const p = check(
      j,
      slots(whole),
      [raw],
      () =>
        new Promise<Compact>((r) => {
          release = r;
        }),
    );
    void p.catch(() => {}); // Keep a synchronous old-role refusal observed before the wait.
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    if (fault === 'clear') j.memo.clear();
    else if (fault === 'owner') invalid = true;
    else raw[0]! ^= 1;
    const v = structuredClone(whole);
    release(v);
    await expect(p).rejects.toThrow();
    expect(v.record.every((x) => x === 0)).toBe(true);
    expect(j.statistics.pending).toBe(0);
    j.dispose();
  }
});
it('capacity refusal keeps the prior saved journal, and a reopened owner hits the same unchanged ceiling', async () => {
  const j = createPreparationJournal({ context, current }),
    a = await auth();
  await j.memo.check(
    'opened:1',
    'owner',
    [],
    async () => new Uint8Array(PREPARATION_VALUE_BYTES - 1024),
    current,
  );
  const p = await proof(j, a),
    next = createPreparationJournal({ context, current });
  next.import(p);
  disposePreparationReceipts(p);
  for (const owner of [j, next]) {
    await expect(check(owner, slots(whole), [whole.record], verify())).rejects.toBeInstanceOf(
      PreparationCapacity,
    );
    expect(owner.statistics.entries).toBe(1);
  }
  j.dispose();
  next.dispose();
});
it('sparse, duplicate, noncontiguous and mixed physical addresses refuse before the verifier runs', async () => {
  const j = createPreparationJournal({ context, current }),
    run = vi.fn(verify());
  for (const addresses of [
    [],
    Array(1),
    Object.assign(Array(2), { 0: 'inbound:1:0' }),
    ['inbound:1:0', 'inbound:1:0'],
    ['inbound:1:0', 'inbound:1:2'],
    ['inbound:1:0', 'inbound:2:1'],
    ['inbound:1:8'],
    ['inbound:9007199254740992:0'],
  ])
    await expect(check(j, addresses as string[], [whole.record], run)).rejects.toThrow();
  expect(run).not.toHaveBeenCalled();
  j.dispose();
});

it('accepts all72 bounded extents for two publishers without any relative-index rebasing', async () => {
  const f = pageFixture(B),
    v = await verifyStoredInboundReceipt(
      { ...f.context, inboundReceiptVersion: 1 },
      referenceBytes(f.record),
      live,
    );
  const other: Compact = {
    record: v.record,
    entries: v.entries.map((e) => {
      if (e.result.kind !== 'received') throw Error('received');
      const { record: _record, ...result } = e.result;
      return { index: e.index, original: e.original, result };
    }),
  };
  let cases = 0;
  try {
    for (const source of [whole, other])
      for (let first = 0; first < 8; first++)
        for (let count = 1; first + count <= 8; count++) {
          const page = pageFixture(source === whole ? undefined : B, 8, first, count),
            compact = structuredClone({
              record: referenceBytes(page.record),
              entries: source.entries.slice(first, first + count),
            }),
            j = createPreparationJournal({ context, current });
          const result = await check(j, slots(compact, cases + 1), [compact.record], async () =>
            structuredClone(compact),
          );
          expect(result.entries.map((e) => e.index)).toEqual(
            Array.from({ length: count }, (_, n) => first + n),
          );
          expect(result.record).toEqual(compact.record);
          eraseVerified(result);
          eraseVerified(compact);
          j.dispose();
          cases++;
        }
    expect(cases).toBe(72);
  } finally {
    eraseVerified(v);
  }
});
