// @vitest-environment node
// Phase 544: no device publishes a history snapshot that devices running this build cannot install.
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import * as history from '../src/crdt/historyInstall';
import { admitHistoryCheckpoint, createHistoryCheckpoint } from '../src/crdt/historyCheckpoint';
import { HISTORY_INSTALL_LIMIT, historyInstallBytes } from '../account-protocol/historyCheckpoint';
import { historyMembership, verifyEarlyHistory } from '../account-protocol/admissionHistory';
import { membershipState } from '../account-protocol/membership';
import {
  MAX_BATCH_BYTES,
  copyBatch,
  counterPayload,
  emptySpoolWitness,
  recordStore,
} from '../src/crdt/contentRecord';
import { historySnapshotTooLarge } from '../src/account/historyMaintenance';
import { planLocalRetention } from '../src/crdt/localRetentionPlan';
import { inspectInbound } from '../src/crdt/inboundLedger';
import { extendSpoolWitness } from '../src/crdt/spoolRecord';
import { Y } from '../src/crdt/yjs';
import type { InboundContext } from '../src/crdt/accountInbound';
import type { SessionTask } from '../src/crdt/writeSession';
import type { OpenedRecord } from '../src/crdt/contentRecord';
import type { Bytes } from '../src/crdt/custodyCrypto';
import { cryptFor, keys } from './local-baseline/anchor-fixture';
// @ts-expect-error Shared real-protocol JavaScript fixtures.
import { fixture, signed } from './account-membership/fixtures.mjs';
// @ts-expect-error Shared real-protocol JavaScript fixture.
import { memberFixture } from './local-baseline/fixtures.mjs';

const clean: (() => void)[] = [];
afterEach(() => {
  clean.splice(0).forEach((f) => f());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const lifetime = { assertCurrent() {} };
const task: SessionTask = {
  signal: new AbortController().signal,
  step: (f) => f(),
  wait: async (f) => f(),
};

/** A real single-writer membership; snapshots hold one text of `chars` characters. */
async function writer() {
  const f = fixture(),
    h = await verifyEarlyHistory(f.f.base),
    authority = historyMembership(h),
    p = membershipState(authority),
    key = new Uint8Array(32).fill(47),
    producer: string = f.context.existing.id,
    sign = async (bytes: Uint8Array) => signed(f.keys.existing, bytes) as string;
  clean.push(() => key.fill(0));
  const base = {
    baseline: { kind: 'promotion-genesis', id: 'ab'.repeat(32) },
    authority: h.current,
    checkpointAnchor: authority,
    reader: { id: producer, publicKey: h.signingKey, active: true },
    publisher: { id: producer },
    generation: 1,
    generationKey: key,
  } as unknown as InboundContext;
  const snapshot = async (chars: number) => {
    const doc = new Y.Doc({ gc: false });
    // One writer identity, so sizes differ only by the characters added.
    doc.clientID = 1_000_000_000;
    try {
      doc.getMap('meta').set('schemaVersion', 4);
      doc
        .getMap('meta')
        .set('actor:' + p.principalId, { kind: 'human', name: 'Writer', color: 'blue' });
      doc.getText('master').insert(0, 'x'.repeat(chars));
      const checkpoint = await createHistoryCheckpoint(
        doc,
        doc,
        key,
        authority,
        producer,
        p.heads,
        null,
        sign,
      );
      const admission = await admitHistoryCheckpoint(
        checkpoint,
        key,
        authority,
        producer,
        doc,
        sign,
      );
      const event: history.HistoryInstall = {
        version: 2,
        baseline: 'ab'.repeat(32),
        workspace: p.workspaceId,
        lineage: p.lineageId,
        epoch: p.epoch,
        head: p.head,
        reader: producer,
        checkpoint,
        admission,
      };
      return { checkpoint, event, plaintext: checkpoint.ct.length / 2 - 16 };
    } finally {
      doc.destroy();
    }
  };
  // Within one varint width each character adds one plaintext byte and two hex characters.
  const first = await snapshot(1_000_000),
    second = await snapshot(1_000_001);
  const slope = historyInstallBytes(second.checkpoint) - historyInstallBytes(first.checkpoint);
  const largest = Math.floor(
    (HISTORY_INSTALL_LIMIT - (historyInstallBytes(first.checkpoint) - slope * 1_000_000)) / slope,
  );
  return { base, p, snapshot, slope, largest };
}

it('the install bound is the storage batch bound, and its event size is the encoder’s for the widest reader', async () => {
  expect(HISTORY_INSTALL_LIMIT).toBe(MAX_BATCH_BYTES);
  const w = await writer();
  const s = await w.snapshot(5000);
  const need = historyInstallBytes(s.checkpoint);
  for (const version of [1, 2] as const) {
    const event = { ...s.event, version };
    // The widest epoch any reader can hold makes the event exactly what the bound counts.
    expect(
      history.encodeHistoryInstall({ ...event, epoch: Number.MAX_SAFE_INTEGER }).length +
        s.plaintext,
    ).toBe(need);
    // A real reader's narrower epoch only shortens it.
    expect(history.encodeHistoryInstall(event).length + s.plaintext).toBe(
      need - (String(Number.MAX_SAFE_INTEGER).length - String(w.p.epoch).length),
    );
  }
  const installed = await history.verifyHistoryInstall(
    w.base,
    history.encodeHistoryInstall(s.event),
    undefined,
    lifetime,
  );
  // The installer re-derives exactly the sealed plaintext, which the bound reads from the ciphertext.
  expect(installed.update.length).toBe(s.plaintext);
  installed.update.fill(0);
  expect(historySnapshotTooLarge('new', s.checkpoint)).toBeNull();
}, 60000);

it('the largest snapshot the guard accepts installs as one storage batch, and one more character is refused', async () => {
  const w = await writer();
  expect(w.slope).toBe(3);
  const largest = await w.snapshot(w.largest);
  const need = historyInstallBytes(largest.checkpoint);
  expect(need).toBeLessThanOrEqual(HISTORY_INSTALL_LIMIT);
  expect(need).toBeGreaterThan(HISTORY_INSTALL_LIMIT - w.slope);
  expect(historySnapshotTooLarge('new', largest.checkpoint)).toBeNull();
  const bytes = history.encodeHistoryInstall(largest.event);
  const installed = await history.verifyHistoryInstall(w.base, bytes, undefined, lifetime);
  try {
    // What the installer stores at the widest reader epoch is exactly the guard's figure.
    const widest = history.encodeHistoryInstall({
      ...largest.event,
      epoch: Number.MAX_SAFE_INTEGER,
    });
    expect(installed.update.length + widest.length).toBe(need);
    // The receive commit's storage batch: the derived update with its install event.
    const batch = copyBatch([
      { kind: 'update', bytes: installed.update },
      { kind: 'heads', bytes: widest },
    ]);
    expect(batch.reduce((n, r) => n + r.bytes.length, 0)).toBe(need);
  } finally {
    installed.update.fill(0);
  }
  const over = await w.snapshot(w.largest + 1);
  expect(historySnapshotTooLarge('new', over.checkpoint)).toEqual({
    snapshot: 'new',
    needed: need + w.slope,
    allowed: HISTORY_INSTALL_LIMIT,
  });
  // Past the at most 15 bytes a narrower reader epoch saves, the installer itself refuses.
  const beyond = await w.snapshot(w.largest + 6);
  const refused = history.verifyHistoryInstall(
    w.base,
    history.encodeHistoryInstall(beyond.event),
    undefined,
    lifetime,
  );
  await expect(refused).rejects.toBeInstanceOf(history.HistoryInstallSizeError);
  await expect(refused).rejects.toMatchObject({
    needed: historyInstallBytes(beyond.checkpoint) - 15,
    allowed: HISTORY_INSTALL_LIMIT,
  });
  // A snapshot whose install event alone is past the bound is refused while encoding, sized the same.
  const huge = await w.snapshot(2_200_000);
  expect(() => history.encodeHistoryInstall(huge.event)).toThrow(history.HistoryInstallSizeError);
  try {
    history.encodeHistoryInstall(huge.event);
  } catch (cause) {
    expect(cause).toMatchObject({
      needed: historyInstallBytes(huge.checkpoint) - 15,
      allowed: HISTORY_INSTALL_LIMIT,
    });
  }
}, 120000);

it('an installed snapshot that no longer fits on re-check parks reduction as capacity with sizes', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  const f = await memberFixture();
  clean.push(f.clear);
  await f.appendOwn();
  await f.appendPeer();
  await f.appendHistory();
  const ctx = f.ctx,
    rows = f.rows as OpenedRecord[];
  const census = inspectInbound(rows, ctx.route, ctx.inbound);
  let spool = emptySpoolWitness();
  for (const e of census.delivery.spool.events)
    spool = await extendSpoolWitness(spool, e, crypto.subtle);
  const next = rows.at(-1)!.seq + 4;
  const counter = {
    v: 2 as const,
    store_id: ctx.identity.storeId,
    intent: '04'.repeat(16),
    active_gen: 1,
    next_seq: next,
    reserved: { 1: next - 1 },
    spool,
    mac: new Uint8Array(32),
  };
  const crypt = cryptFor(ctx.identity, await keys());
  counter.mac = await crypt.sign(task, counterPayload(ctx.identity, counter));
  const inventory = {
    rows: [] as { store: string; key: number; value: unknown }[],
    metadata: [{ key: 'counter', value: counter }],
  };
  for (const r of rows)
    inventory.rows.push({
      store: recordStore(r.kind),
      key: r.seq,
      value: await crypt.seal(task, { v: 1, seq: r.seq, gen: r.gen, kind: r.kind }, r.bytes),
    });
  const auth = {
    sign: (b: Bytes) => crypt.sign(task, b),
    verify: (b: Bytes, m: Bytes) => crypt.verify(task, b, m),
  };
  const plan = () =>
    planLocalRetention(
      task,
      inventory as never,
      ctx,
      { open: (r) => crypt.open(task, r), verify: auth.verify, auth },
      { lifetime: {}, intent: counter.intent, allowReduced: true },
    );
  expect((await plan()).kind).toBe('local-retention-dry-run');
  const size = vi
    .spyOn(history, 'verifyHistoryInstall')
    .mockRejectedValue(new history.HistoryInstallSizeError(4_300_000));
  expect(await plan()).toEqual({
    kind: 'skipped',
    reason: 'capacity',
    detail: { cause: 'installed-snapshot', needed: 4_300_000, allowed: HISTORY_INSTALL_LIMIT },
  });
  expect(size).toHaveBeenCalled();
  // Any other failure of the same check is still a failure, never a park.
  size.mockRejectedValue(Error('History checkpoint coverage differs'));
  await expect(plan()).rejects.toThrow('History checkpoint coverage differs');
}, 120000);
