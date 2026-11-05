// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { membershipPageFixture } from './inbound-page/membership-fixtures';
import { eraseMembershipReading } from '../src/crdt/membershipReading';
import { decodeInboundPageRecord } from '../src/crdt/inboundRecord';
import { verifyInboundPage } from '../src/crdt/accountInbound';
import { StorageCompatibilityError } from '../src/crdt/storageCompatibility';
import { Y } from '../src/crdt/yjs';
import { referenceBytes } from './inbound-page/fixtures';
let fixture: Awaited<ReturnType<typeof membershipPageFixture>> | undefined;
afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
});
const aged = { assertCurrent() {}, now: () => 60000 };
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const setup = async () => (fixture = await membershipPageFixture());
it('replays both genuinely certified current-key publishers, aged pages and following legacy rows', async () => {
  const f = await setup();
  const replay = await f.replay(f.reading, aged);
  try {
    const expected = new Y.Doc({ gc: false });
    try {
      Y.applyUpdate(expected, f.initial);
      for (const p of [f.producer, f.candidate])
        for (const update of p.updates) Y.applyUpdate(expected, update);
      expect(replay.doc.getText('master').toString()).toBe(expected.getText('master').toString());
      expect(Y.encodeStateVector(replay.doc)).toEqual(Y.encodeStateVector(expected));
    } finally {
      expected.destroy();
    }
    expect(replay.records.map((r) => r.updates.length)).toEqual([7, 1, 8, 1]);
    expect(replay.contexts.map((c) => c.prefix.position)).toEqual([9, 9]);
    expect(replay.pending).toBe(false);
    expect(replay.records[0]!.record).toEqual(f.producer.raw);
    expect(replay.records[1]!.record).toEqual(f.producer.legacy);
    const c = replay.contexts.find((c) => c.publisher.id === f.who.id)!;
    const p = decodeInboundPageRecord(f.candidate.raw);
    await expect(
      verifyInboundPage(
        { ...c, prefix: { position: 0, link: '00'.repeat(32), observedThrough: 0 } },
        p.request,
        p.page,
        aged,
      ),
    ).rejects.toThrow();
  } finally {
    eraseMembershipReading(replay);
  }
});
it('reopens separate interior extents of the same original signed page without skipping or duplicating an entry', async () => {
  const f = await setup(),
    r = structuredClone(f.reading),
    p = decodeInboundPageRecord(f.producer.raw);
  const first = referenceBytes({ ...p, entryCount: 3, lastLink: f.producer.entries[3]!.link });
  const next = referenceBytes({
    ...p,
    firstEntry: 4,
    entryCount: 4,
    firstPosition: 5,
    previous: f.producer.entries[3]!.link,
    lastLink: f.producer.entries[7]!.link,
  });
  r.streams.find((s) => s.publisher === f.f.input.producer)!.events = [
    hex(first),
    hex(next),
    hex(f.producer.legacy),
  ];
  const replay = await f.replay(r, aged);
  try {
    expect(replay.records.map((e) => e.updates.length)).toEqual([3, 4, 1, 8, 1]);
    expect(replay.contexts.map((c) => c.prefix.position)).toEqual([9, 9]);
    expect(replay.doc.getText('master').toString()).toContain(
      `${f.f.input.producer.slice(0, 2)}:9`,
    );
    const second = await f.replay(structuredClone(r), { ...aged, now: () => 120000 });
    try {
      expect(Y.encodeStateAsUpdate(second.doc)).toEqual(Y.encodeStateAsUpdate(replay.doc));
    } finally {
      eraseMembershipReading(second);
    }
  } finally {
    eraseMembershipReading(replay);
  }
});
it('a page needs the retained reading encoding floor even with valid certification', async () => {
  const f = await setup(),
    r = structuredClone(f.reading);
  delete r.inboundReceiptVersion;
  await expect(f.replay(r, aged)).rejects.toThrow(StorageCompatibilityError);
});
it('refuses a service signature mutation inside otherwise valid saved page syntax', async () => {
  const f = await setup(),
    r = structuredClone(f.reading),
    p = decodeInboundPageRecord(f.producer.raw);
  const page = JSON.parse(Buffer.from(p.page).toString());
  page[6] = 'ff'.repeat(64);
  const raw = referenceBytes({ ...p, page: new Uint8Array(Buffer.from(JSON.stringify(page))) });
  r.streams.find((s) => s.publisher === f.f.input.producer)!.events[0] = hex(raw);
  await expect(f.replay(r, aged)).rejects.toThrow();
});
it('keeps candidate admission, snapshot, binding, final prefix and publisher-set checks', async () => {
  const f = await setup();
  for (const mutate of [
    (r: typeof f.reading) => {
      r.admission!.signature = 'ff'.repeat(64);
    },
    (r: typeof f.reading) => {
      r.checkpoint.nonce = 'ff'.repeat(12);
    },
    (r: typeof f.reading) => {
      if (r.v === 3) r.binding.stored.binding.accountId = 'unrelated';
    },
    (r: typeof f.reading) => {
      r.streams[0]!.prefix.position = 8;
    },
    (r: typeof f.reading) => {
      r.streams.reverse();
    },
  ]) {
    const r = structuredClone(f.reading);
    mutate(r);
    await expect(f.replay(r, aged)).rejects.toThrow();
  }
});
it('missing, overlapping or reordered admitted positions cannot jump an authenticated prefix', async () => {
  const f = await setup();
  for (const events of [
    [hex(f.producer.legacy)],
    [hex(f.producer.raw), hex(f.producer.raw), hex(f.producer.legacy)],
    [hex(f.producer.legacy), hex(f.producer.raw)],
  ]) {
    const r = structuredClone(f.reading);
    r.streams.find((s) => s.publisher === f.f.input.producer)!.events = events;
    await expect(f.replay(r, aged)).rejects.toThrow();
  }
});
it('preserves current-owner interruption and caller-owned keys on the page path', async () => {
  const f = await setup(),
    key = f.f.key2.slice();
  let calls = 0;
  await expect(
    f.replay(f.reading, {
      now: () => 60000,
      assertCurrent() {
        if (++calls >= 20) throw Error('owner changed');
      },
    }),
  ).rejects.toThrow();
  expect(calls).toBeGreaterThanOrEqual(20);
  expect(f.f.key2).toEqual(key);
});
