// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { fullHistoryPageFixture } from './inbound-page/full-history-fixtures';
import {
  replayFullLocalHistory,
  prepareLocalBaseline,
  replayLocalBaseline,
  type BaselineAuthentication,
} from '../src/crdt/localBaselineReplay';
import { decodeLocalBaseline, LOCAL_BASELINE_TAG } from '../src/crdt/localBaselineRecord';
import { decodeNetworkEnvelope } from '../account-protocol/envelope';
import { createContentOwner } from '../src/crdt/contentStore';
import { extendSpoolWitness } from '../src/crdt/spoolRecord';
import { StorageCompatibilityError } from '../src/crdt/storageCompatibility';
import { cryptFor, keys } from './local-baseline/anchor-fixture';
import { Y, sameDocState } from '../src/crdt/yjs';
import { eraseVerified } from '../src/crdt/verifiedRecords';
import type { SessionTask } from '../src/crdt/writeSession';
let f: Awaited<ReturnType<typeof fullHistoryPageFixture>> | undefined;
const owners: ReturnType<typeof createContentOwner>[] = [];
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose();
  f?.cleanup();
  f = undefined;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const task: SessionTask = {
  signal: new AbortController().signal,
  step: (f) => f(),
  wait: async (f) => f(),
};
function expectSnapshot(snapshot: Uint8Array, source: NonNullable<typeof f>) {
  const actual = new Y.Doc({ gc: false }),
    expected = new Y.Doc({ gc: false });
  try {
    Y.applyUpdate(actual, snapshot);
    Y.applyUpdate(expected, source.own.update);
    for (const entry of source.received) Y.applyUpdate(expected, entry.update);
    expect(sameDocState(actual, expected)).toBe(true);
  } finally {
    actual.destroy();
    expected.destroy();
  }
}
it('whole-history recovery checks real successor/membership, publication, physical witness and every selected received original', async () => {
  f = await fullHistoryPageFixture();
  const counter = await f.counter();
  if (counter.v !== 2) throw Error('Fixture needs full-history counter');
  const replay = await replayFullLocalHistory({ records: f.records, counter }, f.context);
  try {
    expectSnapshot(replay.snapshot, f);
    const peer = replay.inbound.peers!.get(f.publisher)!;
    expect(peer.prefix.position).toBe(8);
    expect(peer.retained.size).toBe(8);
    for (const [position, r] of peer.retained) {
      expect(decodeNetworkEnvelope(r.envelope).seq).toBe(position);
      expect(r.envelope).toEqual(f.received[position - 1]!.envelope);
      expect(r.proof).toEqual(f.received[position - 1]!.proof);
    }
    expect(replay.census.entries.length).toBe(f.chunks.length);
    expect(replay.census.delivery.spool.events.length).toBe(counter.spool.events);
  } finally {
    eraseVerified(replay);
  }
});
it('baseline reduction keeps the exact final accepted original and replays the complete human writing without old page rows', async () => {
  f = await fullHistoryPageFixture([0, 3, 1, 2, 6, 1, 2, 0]);
  const counter = await f.counter(),
    key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
      'verify',
    ]);
  const auth: BaselineAuthentication = {
    sign: async (p) => new Uint8Array(await crypto.subtle.sign('HMAC', key, p)),
    verify: (p, m) => crypto.subtle.verify('HMAC', key, m, p),
  };
  const saved = await prepareLocalBaseline({ records: f.records, counter }, f.context, auth),
    decoded = decodeLocalBaseline(saved.baseline.payload);
  try {
    expect(JSON.parse(new TextDecoder().decode(saved.baseline.payload))[0]).toBe(
      LOCAL_BASELINE_TAG,
    );
    const frontier = decoded.streams.find((s) => s.publisher === f!.publisher)!;
    expect(frontier.position).toBe(8);
    expect(frontier.receipt!.envelope).toEqual(f.received[7]!.envelope);
    const replay = await replayLocalBaseline(
      saved.baseline,
      saved.anchor,
      { records: [], counter },
      f.context,
      auth,
    );
    try {
      expectSnapshot(replay.snapshot, f);
      expect(replay.inbound.peers!.get(f.publisher)!.prefix.position).toBe(8);
    } finally {
      eraseVerified(replay);
    }
  } finally {
    eraseVerified(decoded);
    eraseVerified(saved);
  }
});
it('encrypted carrier history reduction classifies binary frontiers and a fresh owner reopens the exact reduced state', async () => {
  f = await fullHistoryPageFixture([1, 2, 9, 1, 2, 9, 1, 2]);
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const name of [
    'VITE_ACCOUNT_BASELINE_INSTALL',
    'VITE_ACCOUNT_BASELINE_READ',
    'VITE_ACCOUNT_RETENTION',
  ])
    vi.stubEnv(name, '1');
  const crypt = {
    ...cryptFor(f.context.identity, await keys()),
    reuseOpened: true as const,
    warmLoads: true as const,
    readBaseline: true as const,
    baseline: async (current: SessionTask) => ({
      ...f!.context,
      assertCurrent: () => current.step(() => {}),
    }),
  };
  const owner = createContentOwner(f.context.identity, 1, crypt);
  owners.push(owner);
  await owner.initialize(task, { intent: '04'.repeat(16), checkCreation() {} });
  await owner.enableSpool(task);
  for (const row of f.records) {
    if (
      row.kind === 'heads' ||
      (row.kind === 'outbound' &&
        !Buffer.from(row.bytes).toString().startsWith('["done/source-capture/v1"'))
    ) {
      const before = await owner.spoolWitness(task),
        after = await extendSpoolWitness(before, row.bytes, crypto.subtle);
      await owner.appendSpool(task, row, { before, after });
    } else await owner.append(task, [row]);
  }
  expect(
    (
      await owner.removeHistory(
        task,
        async () => {},
        () => {},
        0,
      )
    ).kind,
  ).toBe('removed');
  expect(owner.hasReducedHistory()).toBe(true);
  const current = await owner.loadAccount(task);
  expect(current.kind).toBe('baseline-plus-suffix');
  const fresh = createContentOwner(f.context.identity, 1, crypt);
  owners.push(fresh);
  await fresh.initialize(task);
  const reopened = await fresh.loadAccount(task);
  expect(reopened).toEqual(current);
  if (reopened.kind !== 'baseline-plus-suffix') throw Error('Expected reduced reader');
  expect(reopened.ledger.inbound.peers!.get(f.publisher)!.prefix.position).toBe(8);
});
it('indirect replay refuses absent and unknown receipt floors without mutating caller originals', async () => {
  f = await fullHistoryPageFixture([0, 0, 0, 0, 0, 0, 0, 0]);
  const input = { records: f.records, counter: await f.counter() },
    before = f.records.map((r) => r.bytes.slice());
  const without = { ...f.context.inbound };
  delete without.inboundReceiptVersion;
  await expect(replayFullLocalHistory(input, { ...f.context, inbound: without })).rejects.toThrow(
    StorageCompatibilityError,
  );
  const unknown = { ...f.context.inbound, inboundReceiptVersion: 2 };
  await expect(
    replayFullLocalHistory(input, { ...f.context, inbound: unknown as typeof f.context.inbound }),
  ).rejects.toThrow(StorageCompatibilityError);
  for (const [i, row] of f.records.entries()) expect(row.bytes).toEqual(before[i]);
});
