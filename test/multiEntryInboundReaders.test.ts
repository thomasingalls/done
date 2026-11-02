import { replayHandoffStream, mergeHandoffHistory } from '../src/crdt/handoffHistory';
import { decodeHistoryInstall } from '../src/crdt/historyInstall';
import { publisherContext } from '../src/crdt/inboundLedger';
import { Y } from '../src/crdt/yjs';
// @vitest-environment node
import { sign } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { membershipEventEpoch } from '../src/crdt/accountMembership';
import {
  inspectInbound,
  verifyInboundLedger,
  createInboundCoverage,
} from '../src/crdt/inboundLedger';
import { advanceSelfReceive } from '../src/crdt/accountSyncState';
import { replayFullLocalHistory, type LocalBaselineContext } from '../src/crdt/localBaselineReplay';
import {
  indexVerifiedLedger,
  extendAccountLedger,
  sameAccountLedger,
} from '../src/crdt/incrementalAccountLedger';
import { createVerificationMemo } from '../src/crdt/verificationMemo';
import {
  emptySpoolWitness,
  type ContentCounter,
  type OpenedRecord,
} from '../src/crdt/contentRecord';
import { extendSpoolWitness } from '../src/crdt/spoolRecord';
import { createContentOwner } from '../src/crdt/contentStore';
import { keys, cryptFor } from './local-baseline/anchor-fixture';
import { hash } from './account-inbound/fixtures';
import type { SessionTask } from '../src/crdt/writeSession';
// @ts-expect-error Shared independent real membership, adoption and crypto fixture.
import { memberFixture } from './local-baseline/fixtures.mjs';
const clean: (() => void)[] = [];
afterEach(() => {
  clean.splice(0).forEach((f) => f());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const task: SessionTask = {
  signal: new AbortController().signal,
  step: (f) => f(),
  wait: async (f) => f(),
};
const json = (v: unknown) => new Uint8Array(Buffer.from(JSON.stringify(v))),
  hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
async function fixture(peer = true, own = true) {
  const f = await memberFixture();
  clean.push(f.clear);
  if (own) await f.appendOwn();
  const append = async () => {
    await f.appendPeer();
    const row = (f.rows as OpenedRecord[]).at(-1)!;
    const v = JSON.parse(new TextDecoder().decode(row.bytes)),
      r = JSON.parse(Buffer.from(v[11], 'hex').toString()),
      p = JSON.parse(Buffer.from(v[12], 'hex').toString());
    r.pop();
    r[11] = 4;
    const request = json([...r, sign(null, json(r), f.f.keys.existing).toString('hex')]);
    p.pop();
    p[2] = hash(request);
    const page = json([...p, sign(null, json(p), f.f.f.keys.acceptance).toString('hex')]);
    // Independent new plaintext framing; partial one-entry page under a genuine wider signature.
    v[0] = 'done/account-inbound/v2';
    v[1] = 2;
    v[11] = hex(request);
    v[12] = hex(page);
    v.push(0);
    row.bytes = json(v);
    return row;
  };
  if (peer) await append();
  const context: LocalBaselineContext = f.ctx;
  const counter = async (): Promise<ContentCounter> => {
    let spool = emptySpoolWitness();
    for (const row of f.rows as OpenedRecord[]) {
      if (
        row.kind === 'heads' ||
        (row.kind === 'outbound' &&
          !new TextDecoder().decode(row.bytes).startsWith('["done/source-capture/v1"'))
      )
        spool = await extendSpoolWitness(spool, row.bytes, crypto.subtle);
    }
    const next = (f.rows as OpenedRecord[]).at(-1)!.seq + 4;
    return {
      v: 2,
      store_id: context.identity.storeId,
      intent: '04'.repeat(16),
      active_gen: 1,
      next_seq: next,
      reserved: { 1: next - 1 },
      spool,
      mac: new Uint8Array(32),
    };
  };
  const combine = () => {
    const rows = (f.rows as OpenedRecord[]).filter(
      (row) =>
        row.kind === 'heads' &&
        JSON.parse(new TextDecoder().decode(row.bytes))[0] === 'done/account-inbound/v2',
    );
    const events = rows.map((row) => JSON.parse(new TextDecoder().decode(row.bytes)));
    const r = JSON.parse(Buffer.from(events[0][11], 'hex').toString());
    r.pop();
    r[11] = 4;
    const request = json([...r, sign(null, json(r), f.f.keys.existing).toString('hex')]);
    const p = JSON.parse(Buffer.from(events[0][12], 'hex').toString());
    p.pop();
    p[2] = hash(request);
    p[3] = events.at(-1)[8];
    p[4] = p[3];
    p[5] = events.map((v) => JSON.parse(Buffer.from(v[12], 'hex').toString())[5][0]);
    const page = json([...p, sign(null, json(p), f.f.f.keys.acceptance).toString('hex')]);
    for (const [index, row] of rows.entries()) {
      const v = events[index];
      v[11] = hex(request);
      v[12] = hex(page);
      v[13] = index;
      row.bytes = json(v);
    }
    return rows;
  };
  return { f, context, append, counter, combine, rows: f.rows as OpenedRecord[] };
}
it('membership boundary reads a v2 receipt epoch instead of returning the reader identifier', async () => {
  const x = await fixture();
  expect(membershipEventEpoch(x.rows.at(-1)!.bytes)).toBe(x.context.route.epoch);
});
it('full census keeps v2 receipts out of delivery inspection and preserves their witness event', async () => {
  const x = await fixture(),
    c = inspectInbound(x.rows, x.context.route, x.context.inbound);
  expect(c.entries).toHaveLength(1);
  expect(c.entries[0]!.record.bytes).toEqual(x.rows.at(-1)!.bytes);
  expect(c.delivery.ledger.some((r) => r === x.rows.at(-1))).toBe(false);
  expect(c.delivery.spool.events.at(-1)).toEqual(x.rows.at(-1)!.bytes);
});
it('successor and membership replay boundaries retain real authority history around v2 receipts', async () => {
  const x = await fixture();
  await x.append();
  const combined = x.combine();
  const full = await replayFullLocalHistory(
    { records: x.rows, counter: await x.counter() },
    x.context,
  );
  const peer = [...full.inbound.peers!.values()].find((s) => s.prefix.position === 2);
  expect(peer?.prefix.position).toBe(2);
  expect(peer?.retained.size).toBe(2);
  const page = JSON.parse(
    Buffer.from(JSON.parse(new TextDecoder().decode(combined[1]!.bytes))[12], 'hex').toString(),
  );
  expect(hex(peer!.retained.get(2)!.envelope)).toBe(page[5][1][0]);
  expect(hex(peer!.retained.get(2)!.proof)).toBe(page[5][1][1]);
});
it('cold incremental indexing derives the epoch from v2 request evidence', async () => {
  // No current-epoch own event may accidentally supply the correct epoch for a skipped receipt.
  const x = await fixture(true, false),
    counter = await x.counter(),
    full = await replayFullLocalHistory({ records: x.rows, counter }, x.context);
  const indexes = await indexVerifiedLedger(full, x.rows, x.context.route, counter, crypto.subtle);
  expect(indexes).toBeDefined();
  expect(indexes!.epoch).toBe(x.context.route.epoch);
});
it('incremental v2 admission takes the checked extension path and agrees with full reference', async () => {
  const x = await fixture(false),
    before = x.rows.map((r) => ({ ...r, bytes: r.bytes.slice() })),
    counter = await x.counter();
  const previous = await replayFullLocalHistory({ records: before, counter }, x.context);
  const indexes = await indexVerifiedLedger(
    previous,
    before,
    x.context.route,
    counter,
    crypto.subtle,
  );
  expect(indexes).toBeDefined();
  await x.append();
  const nextCounter = await x.counter(),
    memo = createVerificationMemo();
  clean.push(() => memo.clear());
  const extended = await extendAccountLedger(
    { ...previous, indexes: indexes! },
    before,
    x.rows,
    x.context.route,
    nextCounter,
    x.context.inbound,
    x.context.signer,
    crypto.subtle,
    { memo, current() {} },
  );
  expect(extended).toBeDefined();
  const inbound = await verifyInboundLedger(extended!.census, x.rows, x.context.inbound, {
    assertCurrent() {},
  });
  const coverage = createInboundCoverage();
  try {
    advanceSelfReceive(
      extended!.census.delivery,
      extended!.delivery,
      inbound,
      x.context.route,
      (updates) => coverage.check(x.rows, updates),
    );
  } finally {
    coverage.clear();
  }
  const full = await replayFullLocalHistory({ records: x.rows, counter: nextCounter }, x.context);
  expect(sameAccountLedger({ ...extended!, inbound }, full)).toBe(true);
});
it('native local retention classifies v2 receive frontiers and cold replays the reduced result', async () => {
  const x = await fixture();
  await x.append();
  x.combine();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const name of [
    'VITE_ACCOUNT_BASELINE_INSTALL',
    'VITE_ACCOUNT_BASELINE_READ',
    'VITE_ACCOUNT_RETENTION',
  ])
    vi.stubEnv(name, '1');
  const crypt = {
    ...cryptFor(x.context.identity, await keys()),
    reuseOpened: true as const,
    warmLoads: true as const,
    readBaseline: true as const,
    baseline: async (current: SessionTask) => ({
      ...x.context,
      assertCurrent: () => current.step(() => {}),
    }),
  };
  const owner = createContentOwner(x.context.identity, 1, crypt);
  clean.push(() => owner.dispose());
  await owner.initialize(task, { intent: '04'.repeat(16), checkCreation() {} });
  await owner.enableSpool(task);
  for (const row of x.rows) {
    if (
      row.kind === 'heads' ||
      (row.kind === 'outbound' &&
        !new TextDecoder().decode(row.bytes).startsWith('["done/source-capture/v1"'))
    ) {
      const before = await owner.spoolWitness(task),
        after = await extendSpoolWitness(before, row.bytes, crypto.subtle);
      await owner.appendSpool(task, row, { before, after });
    } else await owner.append(task, [row]);
  }
  const removed = await owner.removeHistory(
    task,
    async () => {},
    () => {},
    0,
  );
  expect(removed.kind).toBe('removed');
  expect(owner.hasReducedHistory()).toBe(true);
  const current = await owner.loadAccount(task);
  expect(current.kind).toBe('baseline-plus-suffix');
  const fresh = createContentOwner(x.context.identity, 1, crypt);
  clean.push(() => fresh.dispose());
  await fresh.initialize(task);
  const reopened = await fresh.loadAccount(task);
  expect(reopened).toEqual(current);
});

it('a real admitted handoff cut inside a wider page keeps only its verified per-position suffix', async () => {
  const x = await fixture(),
    first = JSON.parse(new TextDecoder().decode(x.rows.at(-1)!.bytes));
  const installed = decodeHistoryInstall(await x.f.appendHistory());
  await x.append();
  const second = JSON.parse(new TextDecoder().decode(x.rows.at(-1)!.bytes));
  const r = JSON.parse(Buffer.from(first[11], 'hex').toString());
  r.pop();
  r[11] = 2;
  const request = json([...r, sign(null, json(r), x.f.f.keys.existing).toString('hex')]);
  const p = JSON.parse(Buffer.from(first[12], 'hex').toString()),
    tail = JSON.parse(Buffer.from(second[12], 'hex').toString());
  p.pop();
  p[2] = hash(request);
  p[3] = 2;
  p[4] = 2;
  p[5] = [...p[5], ...tail[5]];
  const page = json([...p, sign(null, json(p), x.f.f.f.keys.acceptance).toString('hex')]);
  const events = [first, second].map((v, index) => {
    v[11] = hex(request);
    v[12] = hex(page);
    v[13] = index;
    return json(v);
  });
  const proof = { checkpoint: installed.checkpoint, admission: installed.admission };
  const base = publisherContext(x.context.inbound, first[6]),
    doc = new Y.Doc({ gc: false });
  try {
    await mergeHandoffHistory(doc, proof, base.history!, base.generationKey);
    const replayed = await replayHandoffStream(doc, base, events.map(hex), proof, {
      assertCurrent() {},
    });
    expect(replayed.records).toHaveLength(1);
    expect(replayed.records[0]!.record).toEqual(events[1]);
    expect(replayed.context.prefix.position).toBe(2);
    expect(replayed.context.prefix.link).toBe(second[10]);
    for (const entry of replayed.records) {
      entry.record.fill(0);
      for (const update of entry.updates) update.fill(0);
    }
  } finally {
    doc.destroy();
  }
});
