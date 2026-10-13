// @vitest-environment node
import { verifyMembershipChain } from '../account-protocol/membershipLocator';
import { verifyInstalledSuccessor } from '../src/crdt/accountSuccessor';
import { verifyInstalledMembership } from '../src/crdt/accountMembership';
import { verifyDetachedPrefix } from '../src/crdt/rotationObservation';
import { verifySpoolWitness } from '../src/crdt/spoolRecord';
import { verifyHistoryInstall } from '../src/crdt/historyInstall';
import { applyHistoryReceiveCuts } from '../src/crdt/inboundLedger';
import { expect, it } from 'vitest';
import type { SessionTask } from '../src/crdt/writeSession';
import { cryptFor } from './local-baseline/anchor-fixture';
import { counterPayload, recordStore, type StoredRecord } from '../src/crdt/contentRecord';
import {
  planLocalRetention,
  inspectRetentionPlan,
  retentionPlanReport,
  verifyRetentionPlan,
  disposeRetentionPlan,
  type RetentionInventory,
} from '../src/crdt/localRetentionPlan';

import fc from 'fast-check';
import { createHash } from 'node:crypto';
import { Y, sameDocState } from '../src/crdt/yjs';
import {
  prepareLocalBaseline,
  rebaseLocalBaseline,
  replayLocalBaseline,
  replayFullLocalHistory,
  type BaselineAuthentication,
  type LocalBaselineContext,
} from '../src/crdt/localBaselineReplay';
import {
  decodeLocalBaseline,
  encodeLocalBaseline,
  LOCAL_BASELINE_LIMIT,
  baselineAuthenticationPayload,
} from '../src/crdt/localBaselineRecord';
import { verifyInboundPage } from '../src/crdt/accountInbound';
import { decodeInboundRecord } from '../src/crdt/inboundRecord';
import { decodeInboundRequest } from '../account-protocol/inboundTransport';
import {
  publisherContext,
  publisherState,
  contextAt,
  inspectInbound,
} from '../src/crdt/inboundLedger';
import {
  encodeSpoolEntry,
  extendSpoolWitness,
  nextSpoolPosition,
  type SpoolEntry,
} from '../src/crdt/spoolRecord';
import { encodeDeliveryEntry } from '../src/crdt/deliveryRecord';
import { capturedRecovery, encodeSourceCapsule } from '../src/crdt/sourceCapture';
import {
  emptySpoolWitness,
  type ContentCounter,
  type OpenedRecord,
} from '../src/crdt/contentRecord';
import { type Bytes } from '../src/crdt/custodyCrypto';
import { entry, A, ZERO, type FixtureEntry } from './account-inbound/fixtures';
import { context, eventWire } from './account-inbound-codecs/oracle';
import { indexVerifiedLedger, extendAccountLedger } from '../src/crdt/incrementalAccountLedger';
import { createVerificationMemo } from '../src/crdt/verificationMemo';
import {
  createLocalBaselineShadow,
  verifyCompleteLocalBaseline,
} from '../src/crdt/localBaselineShadow';
import { selectEnvelopeSources } from '../src/crdt/accountEnvelopePreparation';
// @ts-expect-error Existing independent Node fixtures are JavaScript.
import { memberFixture, retriedFixture } from './local-baseline/fixtures.mjs';

const digest = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, [
  'sign',
  'verify',
]);
const auth: BaselineAuthentication = {
  sign: async (p) => new Uint8Array(await crypto.subtle.sign('HMAC', key, p)),
  verify: (p, mac) => crypto.subtle.verify('HMAC', key, mac, p),
};
async function fixture(actions = [false, true, false, false], receipts = false) {
  const base = context(),
    route = {
      workspace: base.authority.workspace,
      credential: A,
      principal: A,
      epoch: 1,
      generation: 1,
    };
  const signer = await crypto.subtle.importKey(
    'raw',
    Buffer.from(base.publisher.publicKey, 'hex'),
    'Ed25519',
    false,
    ['verify'],
  );
  const ctx: LocalBaselineContext = {
    identity: {
      slotId: '01'.repeat(16),
      principalId: A,
      workspaceId: route.workspace,
      storeId: '02'.repeat(16),
      rootId: '03'.repeat(16),
    },
    route,
    inbound: base,
    signer,
    installation: { kind: 'original' },
    assertCurrent() {},
  };
  const rows: OpenedRecord[] = [],
    positions: FixtureEntry[] = [],
    cuts: number[] = [];
  let seq = 0,
    attempts = 0,
    previous = ZERO;
  const add = (kind: OpenedRecord['kind'], bytes: Bytes) =>
    rows.push({ seq: ++seq, gen: 1, kind, bytes });
  const spool = (e: SpoolEntry) =>
    add(e.type === 'envelope' ? 'outbound' : 'heads', encodeSpoolEntry(e, route));
  const doc = new Y.Doc({ gc: false });
  // Two originals per capsule: the first cut deliberately leaves one unallocated index.
  try {
    for (let i = 0; i < actions.length; i += 2) {
      const updates: Bytes[] = [];
      for (const remove of actions.slice(i, i + 2)) {
        const capture = (u: Uint8Array) => updates.push(new Uint8Array(u));
        doc.on('update', capture);
        const text = doc.getText('t');
        if (remove && text.length) text.delete(0, 1);
        else text.insert(text.length, 'é🙂x');
        doc.off('update', capture);
      }
      const id = (i + 1).toString(16).padStart(32, '0');
      const capsule = encodeSourceCapsule({
        ...route,
        v: 1,
        id,
        sources: updates.map((bytes) => ({ actor: A, kind: 'human', bytes })),
      });
      for (const u of updates) add('update', u);
      add('outbound', capsule);
      for (const [index, update] of updates.entries()) {
        const position = positions.length + 1;
        const e = entry({ publisher: A, updates: [update] }, position, previous);
        spool({ type: 'position', position, source: { id, index, hash: digest(capsule) } });
        // Preserve a burned encryption attempt, not merely the number of envelopes.
        spool({ type: 'attempt', position, attempt: ++attempts });
        spool({ type: 'attempt', position, attempt: ++attempts });
        spool({ type: 'envelope', position, attempt: attempts, wire: e.envelope });
        add(
          'heads',
          encodeDeliveryEntry({ type: 'response', position, wire: e.proof }, route, base.authority),
        );
        if (receipts) add('heads', eventWire(e));
        cuts.push(rows.length);
        positions.push(e);
        previous = e.link;
      }
    }
  } finally {
    doc.destroy();
  }
  const input = async (records = rows, next = (records.at(-1)?.seq ?? 0) + 1) => {
    const census = inspectInbound(records, route, base);
    let witness = emptySpoolWitness();
    for (const b of census.delivery.spool.events)
      witness = await extendSpoolWitness(witness, b, crypto.subtle);
    const counter: ContentCounter = {
      v: 2,
      spool: witness,
      store_id: ctx.identity.storeId,
      intent: '04'.repeat(16),
      active_gen: 1,
      next_seq: next,
      reserved: { 1: next - 1 },
      mac: new Uint8Array(32),
    };
    return { records, counter };
  };
  return { ctx, rows, positions, cuts, input };
}
const stateEqual = (a: Bytes, b: Bytes) => {
  const x = new Y.Doc({ gc: false }),
    y = new Y.Doc({ gc: false });
  try {
    Y.applyUpdate(x, a);
    Y.applyUpdate(y, b);
    expect(sameDocState(x, y)).toBe(true);
  } finally {
    x.destroy();
    y.destroy();
  }
};
function observation(r: Awaited<ReturnType<typeof replayFullLocalHistory>>) {
  return {
    accepted: r.delivery.acceptedThrough,
    final: r.delivery.finalThrough,
    conflict: r.delivery.conflict,
    refusals: r.delivery.refusals,
    attempts: r.census.delivery.spool.attempts,
    own: r.inbound.prefix,
    inboundConflict: r.inbound.conflict,
    peers: [...(r.inbound.peers ?? [])].map(([id, s]) => [id, s.prefix, s.conflict]),
    installedHistory: r.inbound.installedHistory,
  };
}
async function memberInput(records: readonly OpenedRecord[], c: LocalBaselineContext) {
  const census = inspectInbound(records, c.route, c.inbound);
  let spool = emptySpoolWitness();
  for (const e of census.delivery.spool.events)
    spool = await extendSpoolWitness(spool, e, crypto.subtle);
  const next = (records.at(-1)?.seq ?? 0) + 1;
  const counter: ContentCounter = {
    v: 2,
    spool,
    store_id: c.identity.storeId,
    intent: '04'.repeat(16),
    active_gen: 1,
    next_seq: next,
    reserved: { 1: next - 1 },
    mac: new Uint8Array(32),
  };
  return { records, counter };
}
it('generated cuts preserve exact document/deletions, partial capsules, burned invocations and subsequent accepted positions', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.boolean(), { minLength: 2, maxLength: 8 }),
      fc.nat(),
      async (actions, pick) => {
        const f = await fixture(actions, true),
          all = await f.input();
        const cut = f.cuts[pick % f.cuts.length]!,
          prefix = await f.input(f.rows.slice(0, cut));
        const original = structuredClone(all);
        const prepared = await prepareLocalBaseline(prefix, f.ctx, auth);
        const b = decodeLocalBaseline(prepared.baseline.payload);
        const ref = await replayFullLocalHistory(all, f.ctx);
        const actual = await replayLocalBaseline(
          prepared.baseline,
          prepared.anchor,
          { ...all, records: f.rows.slice(cut) },
          f.ctx,
          auth,
        );
        stateEqual(actual.snapshot, ref.snapshot);
        expect(observation(actual)).toEqual(observation(ref));
        expect(actual.census.delivery.spool.positions.map((p) => p.position)).toEqual(
          ref.census.delivery.spool.positions
            .filter((p) => p.position > b.own.position)
            .map((p) => p.position),
        );
        const used = new Set(
          ref.census.delivery.spool.positions.flatMap((p) => [
            p.source.id + ':' + p.source.index,
            ...(p.additional ?? []).map((r) => r.id + ':' + r.index),
          ]),
        );
        for (const s of b.sources) {
          const v = JSON.parse(new TextDecoder().decode(s.record.bytes));
          for (const i of s.consumed) expect(used.has(v[2] + ':' + i)).toBe(true);
        }
        expect(all).toEqual(original);
      },
    ),
    { seed: 13102026, numRuns: 30 },
  );
}, 30000);

it('replays an unfinished tail without treating an invocation grant as an acceptance', async () => {
  const f = await fixture(),
    cut = f.cuts[0]!,
    prefix = await f.input(f.rows.slice(0, cut));
  const prepared = await prepareLocalBaseline(prefix, f.ctx, auth);
  // Position two has an allocation and one burned grant; no envelope yet.
  const all = await f.input(f.rows.slice(0, cut + 2));
  const actual = await replayLocalBaseline(
    prepared.baseline,
    prepared.anchor,
    { ...all, records: all.records.slice(cut) },
    f.ctx,
    auth,
  );
  const expected = await replayFullLocalHistory(all, f.ctx);
  expect(observation(actual)).toEqual(observation(expected));
  expect(actual.census.delivery.spool.positions[0]?.wire).toBeUndefined();
  expect(actual.census.delivery.spool.positions[0]?.attempts).toEqual([3]);
  await expect(prepareLocalBaseline(all, f.ctx, auth)).rejects.toThrow('ineligible');
});

it('replays from an empty cut and preserves unresolved Yjs dependencies in the later suffix', async () => {
  const f = await fixture(),
    empty = await f.input([]),
    p = await prepareLocalBaseline(empty, f.ctx, auth),
    all = await f.input();
  expect(decodeLocalBaseline(p.baseline.payload).own).toMatchObject({ position: 0, attempts: 0 });
  const replayed = await replayLocalBaseline(p.baseline, p.anchor, all, f.ctx, auth);
  expect(observation(replayed)).toEqual(observation(await replayFullLocalHistory(all, f.ctx)));
  const d = new Y.Doc({ gc: false }),
    updates: Bytes[] = [];
  d.on('update', (u) => updates.push(new Uint8Array(u)));
  d.getText('pending').insert(0, 'parent');
  d.getText('pending').insert(6, 'child');
  d.destroy();
  const complete = await prepareLocalBaseline(all, f.ctx, auth),
    row: OpenedRecord = {
      seq: all.counter.next_seq,
      gen: 1,
      kind: 'update',
      bytes: updates[1]!,
    },
    pending = await f.input([...f.rows, row]);
  const reduced = await replayLocalBaseline(
    complete.baseline,
    complete.anchor,
    { ...pending, records: [row] },
    f.ctx,
    auth,
  );
  const reference = await replayFullLocalHistory(pending, f.ctx);
  stateEqual(reduced.snapshot, reference.snapshot);
  for (const state of [reduced.snapshot, reference.snapshot]) {
    const reopened = new Y.Doc({ gc: false });
    try {
      Y.applyUpdate(reopened, state);
      expect(reopened.getText('pending').toString()).toBe('');
      Y.applyUpdate(reopened, updates[0]!);
      expect(reopened.getText('pending').toString()).toBe('parentchild');
    } finally {
      reopened.destroy();
    }
  }
});

it('refuses tampering, wrong binding/anchor, missing suffix events, replayed prefix rows and caller mutation', async () => {
  const f = await fixture(),
    cut = f.cuts[0]!,
    prefix = await f.input(f.rows.slice(0, cut)),
    all = await f.input();
  const p = await prepareLocalBaseline(prefix, f.ctx, auth),
    suffix = { ...all, records: f.rows.slice(cut) };
  const run = (b = p.baseline, anchor = p.anchor, s = suffix, c = f.ctx) =>
    replayLocalBaseline(b, anchor, s, c, auth);
  const changed = structuredClone(p.baseline);
  changed.mac[0]! ^= 1;
  await expect(run(changed)).rejects.toThrow('integrity');
  await expect(run(p.baseline, { ...p.anchor, revision: 2 })).rejects.toThrow('integrity');
  await expect(run(p.baseline, { ...p.anchor, hash: ZERO })).rejects.toThrow('integrity');
  await expect(
    run(p.baseline, p.anchor, suffix, {
      ...f.ctx,
      identity: { ...f.ctx.identity, slotId: 'ef'.repeat(16) },
    }),
  ).rejects.toThrow('scope');
  await expect(
    run(p.baseline, p.anchor, { ...suffix, records: suffix.records.slice(1) }),
  ).rejects.toThrow();
  await expect(run(p.baseline, p.anchor, all)).rejects.toThrow('integrity');
  const b = decodeLocalBaseline(p.baseline.payload);
  b.cut.witness.hash = 'ff'.repeat(32);
  await expect(run({ ...p.baseline, payload: encodeLocalBaseline(b) })).rejects.toThrow(
    'integrity',
  );
  const detached = structuredClone(p),
    mutable = structuredClone(suffix);
  const pending = replayLocalBaseline(detached.baseline, detached.anchor, mutable, f.ctx, auth);
  detached.baseline.payload.fill(0);
  detached.baseline.mac.fill(0);
  mutable.records.forEach((r) => r.bytes.fill(0));
  mutable.counter.next_seq++;
  expect(observation(await pending)).toEqual(observation(await run()));
  let current = true;
  const late = replayLocalBaseline(
    p.baseline,
    p.anchor,
    suffix,
    {
      ...f.ctx,
      assertCurrent() {
        if (!current) throw Error('closed');
      },
    },
    auth,
  );
  current = false;
  await expect(late).rejects.toThrow('closed');
});

it('has closed canonical framing, explicit limits, predecessor binding and detached decoded buffers', async () => {
  const f = await fixture(),
    p = await prepareLocalBaseline(await f.input(), f.ctx, auth);
  const b = decodeLocalBaseline(p.baseline.payload),
    wire = JSON.parse(new TextDecoder().decode(p.baseline.payload));
  expect(encodeLocalBaseline(b)).toEqual(p.baseline.payload);
  const encoded = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
  expect(() => decodeLocalBaseline(encoded([...wire, null]))).toThrow();
  expect(() => decodeLocalBaseline(encoded(['other', ...wire.slice(1)]))).toThrow();
  expect(() =>
    decodeLocalBaseline(
      new TextEncoder().encode(' ' + new TextDecoder().decode(p.baseline.payload)),
    ),
  ).toThrow();
  expect(() => decodeLocalBaseline(new Uint8Array(LOCAL_BASELINE_LIMIT + 1))).toThrow();
  expect(() => encodeLocalBaseline({ ...b, revision: 0 })).toThrow();
  expect(() =>
    encodeLocalBaseline({ ...b, own: { ...b.own, position: Number.MAX_SAFE_INTEGER + 1 } }),
  ).toThrow();
  b.snapshot.fill(0);
  expect(decodeLocalBaseline(p.baseline.payload).snapshot).not.toEqual(b.snapshot);
  const next = await prepareLocalBaseline(await f.input(), f.ctx, auth, p.anchor);
  expect(decodeLocalBaseline(next.baseline.payload)).toMatchObject({
    revision: 2,
    predecessor: p.anchor.hash,
  });
  await expect(
    replayLocalBaseline(
      p.baseline,
      next.anchor,
      { ...(await f.input()), records: [] },
      f.ctx,
      auth,
    ),
  ).rejects.toThrow('integrity');
});

it('retains partial-capsule consumption and refuses allocating its accepted index twice, even with a fresh witness', async () => {
  const f = await fixture(),
    cut = f.cuts[0]!,
    p = await prepareLocalBaseline(await f.input(f.rows.slice(0, cut)), f.ctx, auth);
  expect(decodeLocalBaseline(p.baseline.payload).sources[0]?.consumed).toEqual([0]);
  const all = await f.input(f.rows.slice(0, cut + 1));
  const changed = structuredClone(all.records.at(-1)!);
  const v = JSON.parse(new TextDecoder().decode(changed.bytes));
  v[9][1] = 0;
  changed.bytes = new TextEncoder().encode(JSON.stringify(v));
  await expect(
    replayLocalBaseline(p.baseline, p.anchor, { ...all, records: [changed] }, f.ctx, auth),
  ).rejects.toThrow('repeated');
});

it('the next source selection excludes accepted indexes of a retained partial capsule', async () => {
  const f = await fixture(),
    prefix = await f.input(f.rows.slice(0, f.cuts[0]!));
  const p = await prepareLocalBaseline(prefix, f.ctx, auth);
  const actual = await replayLocalBaseline(
    p.baseline,
    p.anchor,
    { ...prefix, records: [] },
    f.ctx,
    auth,
  );
  const reference = await replayFullLocalHistory(prefix, f.ctx);
  const select = (r: typeof actual) =>
    selectEnvelopeSources(r.census.delivery.spool, f.ctx.route, true, crypto.subtle);
  expect(await select(actual)).toEqual(await select(reference));
  expect((await select(actual)).map((r) => r.index)).toEqual([1]);
  expect(nextSpoolPosition(actual.census.delivery.spool)).toBe(
    nextSpoolPosition(reference.census.delivery.spool),
  );
  expect(nextSpoolPosition(actual.census.delivery.spool)).toBe(2);
});

it('rejects pending snapshot dependencies and missing content before signing a baseline', async () => {
  const f = await fixture(),
    all = await f.input();
  await expect(
    prepareLocalBaseline(
      { ...all, records: all.records.filter((r) => r.kind !== 'update') },
      f.ctx,
      auth,
    ),
  ).rejects.toThrow('coverage');
  const d = new Y.Doc({ gc: false }),
    updates: Bytes[] = [];
  d.on('update', (u) => updates.push(new Uint8Array(u)));
  d.getText('pending').insert(0, 'parent');
  d.getText('pending').insert(6, 'child');
  d.destroy();
  const records = [
    ...f.rows,
    { seq: f.rows.at(-1)!.seq + 1, gen: 1, kind: 'update' as const, bytes: updates[1]! },
  ];
  await expect(prepareLocalBaseline(await f.input(records), f.ctx, auth)).rejects.toThrow(
    'ineligible',
  );
});

it('independently rejects a false frontier even when its draft payload is locally authenticated', async () => {
  const f = await fixture(),
    all = await f.input(),
    p = await prepareLocalBaseline(all, f.ctx, auth);
  const b = decodeLocalBaseline(p.baseline.payload);
  b.own.link = 'a0'.repeat(32);
  const payload = encodeLocalBaseline(b),
    mac = await auth.sign(baselineAuthenticationPayload(payload));
  await expect(
    replayLocalBaseline(
      { payload, mac },
      { revision: 1, hash: digest(payload) },
      { ...all, records: [] },
      f.ctx,
      auth,
    ),
  ).rejects.toThrow('integrity');
});

it('continues a certified peer after its retained frontier and preserves a signed outbound refusal', async () => {
  const f = await memberFixture();
  const c: LocalBaselineContext = f.ctx;
  try {
    await f.appendPeer();
    await f.appendPeer(true);
    const cut = f.rows.length,
      prefix = await memberInput(f.rows, c);
    const p = await prepareLocalBaseline(prefix, c, auth);
    const b = decodeLocalBaseline(p.baseline.payload);
    expect(b.streams.filter((s) => s.position === 2)).toHaveLength(1);
    await f.appendPeer();
    await f.appendOwn('refused');
    const all = await memberInput(f.rows, c);
    const ref = await replayFullLocalHistory(all, c);
    const actual = await replayLocalBaseline(
      p.baseline,
      p.anchor,
      { ...all, records: f.rows.slice(cut) },
      c,
      auth,
    );
    stateEqual(actual.snapshot, ref.snapshot);
    expect(observation(actual)).toEqual(observation(ref));
    expect(actual.delivery.refusals.size).toBe(1);
    await expect(prepareLocalBaseline(all, c, auth)).rejects.toThrow('ineligible');
    // A locally valid older receive answer needs its original retained evidence, not a cursor reset.
    const old = structuredClone(f.rows[1]) as OpenedRecord;
    old.seq = f.rows.at(-1).seq + 1;
    await expect(
      replayLocalBaseline(
        p.baseline,
        p.anchor,
        {
          records: [...f.rows.slice(cut), old],
          counter: {
            ...all.counter,
            next_seq: old.seq + 1,
            reserved: { 1: old.seq },
            spool: await extendSpoolWitness(all.counter.spool, old.bytes, crypto.subtle),
          },
        },
        c,
        auth,
      ),
    ).rejects.toThrow('history-required');
    const changed = {
      ...c,
      inbound: { ...c.inbound, baseline: { ...c.inbound.baseline, id: 'ef'.repeat(32) } },
    };
    await expect(
      replayLocalBaseline(
        p.baseline,
        p.anchor,
        { ...all, records: f.rows.slice(cut) },
        changed,
        auth,
      ),
    ).rejects.toThrow('scope');
    // Installation cuts are part of the authority fingerprint, not an install-time boolean.
    const altered = { ...c, installation: structuredClone(c.installation) };
    if (altered.installation.kind === 'original')
      altered.installation.successor!.before.hash = 'ef'.repeat(32);
    await expect(prepareLocalBaseline(prefix, altered, auth)).rejects.toThrow();
    await expect(
      replayLocalBaseline(
        p.baseline,
        p.anchor,
        { ...all, records: f.rows.slice(cut) },
        altered,
        auth,
      ),
    ).rejects.toThrow('boundary changed');
  } finally {
    f.clear();
  }
});

it('retained replay agrees after exact content compaction and subsequent actor-scoped undo/redo', async () => {
  const f = await fixture(),
    cut = f.cuts[1]!,
    p = await prepareLocalBaseline(await f.input(f.rows.slice(0, cut)), f.ctx, auth);
  const all = await f.input(),
    expected = await replayFullLocalHistory(all, f.ctx);
  const state: OpenedRecord = {
    kind: 'state',
    gen: 1,
    seq: all.counter.next_seq,
    bytes: expected.snapshot,
  };
  const compacted = {
    records: [...f.rows.filter((r) => r.kind !== 'update'), state],
    counter: { ...all.counter, next_seq: state.seq + 1, reserved: { 1: state.seq } },
  };
  const actual = await replayLocalBaseline(
    p.baseline,
    p.anchor,
    { ...compacted, records: compacted.records.filter((r) => r.seq > f.rows[cut - 1]!.seq) },
    f.ctx,
    auth,
  );
  expect(observation(actual)).toEqual(observation(await replayFullLocalHistory(compacted, f.ctx)));
  stateEqual(actual.snapshot, expected.snapshot);
  const a = new Y.Doc({ gc: false }),
    b = new Y.Doc({ gc: false }),
    peer = new Y.Doc({ gc: false }),
    human = {};
  Y.applyUpdate(a, actual.snapshot);
  Y.applyUpdate(b, expected.snapshot);
  a.clientID = b.clientID = 910;
  const ua = new Y.UndoManager(a.getText('t'), { trackedOrigins: new Set([human]) }),
    ub = new Y.UndoManager(b.getText('t'), { trackedOrigins: new Set([human]) });
  try {
    for (const d of [a, b]) d.transact(() => d.getText('t').insert(0, 'local'), human);
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(a));
    let remote!: Bytes;
    peer.on('update', (u) => (remote = new Uint8Array(u)));
    peer.getText('t').insert(peer.getText('t').length, 'remote');
    Y.applyUpdate(a, remote);
    Y.applyUpdate(b, remote);
    expect(sameDocState(a, b)).toBe(true);
    ua.undo();
    ub.undo();
    expect(sameDocState(a, b)).toBe(true);
    expect(a.getText('t').toString()).toContain('remote');
    ua.redo();
    ub.redo();
    expect(sameDocState(a, b)).toBe(true);
  } finally {
    ua.destroy();
    ub.destroy();
    a.destroy();
    b.destroy();
    peer.destroy();
  }
});

it('rechecks checkpoint authority and receive cuts both before and after a retained baseline', async () => {
  const f = await memberFixture(),
    c: LocalBaselineContext = f.ctx;
  try {
    await f.appendPeer();
    await f.appendPeer();
    const beforeHistory = f.rows.length,
      before = await memberInput(f.rows, c);
    const old = await prepareLocalBaseline(before, c, auth);
    await f.appendHistory();
    const cut = f.rows.length,
      prefix = await memberInput(f.rows, c);
    const transitioned = await replayLocalBaseline(
      old.baseline,
      old.anchor,
      { ...prefix, records: f.rows.slice(beforeHistory) },
      c,
      auth,
    );
    expect(observation(transitioned)).toEqual(observation(await replayFullLocalHistory(prefix, c)));
    const p = await prepareLocalBaseline(prefix, c, auth);
    expect(decodeLocalBaseline(p.baseline.payload).history).not.toBeNull();
    await f.appendPeer(true);
    const all = await memberInput(f.rows, c);
    const actual = await replayLocalBaseline(
      p.baseline,
      p.anchor,
      { ...all, records: f.rows.slice(cut) },
      c,
      auth,
    );
    const reference = await replayFullLocalHistory(all, c);
    expect(observation(actual)).toEqual(observation(reference));
    stateEqual(actual.snapshot, reference.snapshot);
    const b = decodeLocalBaseline(p.baseline.payload);
    const installation = JSON.parse(new TextDecoder().decode(b.history!.bytes));
    installation[9].signature = '00'.repeat(64);
    b.history!.bytes = new TextEncoder().encode(JSON.stringify(installation));
    const payload = encodeLocalBaseline(b),
      mac = await auth.sign(baselineAuthenticationPayload(payload));
    await expect(
      replayLocalBaseline(
        { payload, mac },
        { revision: b.revision, hash: digest(payload) },
        { ...all, records: f.rows.slice(cut) },
        c,
        auth,
      ),
    ).rejects.toThrow();
  } finally {
    f.clear();
  }
});

it('preserves reservation holes and refuses an old reserved sequence arriving after a supposedly settled cut', async () => {
  const f = await fixture(),
    input = await f.input();
  const burned = {
    ...input,
    counter: {
      ...input.counter,
      next_seq: input.counter.next_seq + 3,
      reserved: { 1: input.counter.next_seq + 2 },
    },
  };
  const p = await prepareLocalBaseline(burned, f.ctx, auth);
  const decoded = decodeLocalBaseline(p.baseline.payload);
  expect(decoded.cut.nextSequence).toBe(burned.counter.next_seq);
  await replayLocalBaseline(p.baseline, p.anchor, { ...burned, records: [] }, f.ctx, auth);
  const late: OpenedRecord = {
    kind: 'update',
    gen: 1,
    seq: input.counter.next_seq + 1,
    bytes: new Uint8Array([0, 0]),
  };
  await expect(
    replayLocalBaseline(p.baseline, p.anchor, { ...burned, records: [late] }, f.ctx, auth),
  ).rejects.toThrow('integrity');
  await expect(
    replayLocalBaseline(p.baseline, p.anchor, { records: [], counter: input.counter }, f.ctx, auth),
  ).rejects.toThrow('scope');
});

it('summarizes an accepted current-key retry only after full historical refusal and membership verification', async () => {
  const f = await retriedFixture(),
    c: LocalBaselineContext = f.ctx;
  try {
    const all = await memberInput(f.rows, c);
    const full = await replayFullLocalHistory(all, c);
    expect(full.census.delivery.spool.positions[0]!.retries).toHaveLength(1);
    const p = await prepareLocalBaseline(all, c, auth),
      b = decodeLocalBaseline(p.baseline.payload);
    expect(b.own.attempts).toBe(3);
    expect(b.sources).toHaveLength(0);
    const replayed = await replayLocalBaseline(
      p.baseline,
      p.anchor,
      { ...all, records: [] },
      c,
      auth,
    );
    expect(observation(replayed)).toEqual(observation(full));
    stateEqual(replayed.snapshot, full.snapshot);
    const unresolved = await memberInput(f.rows.slice(0, -1), c);
    await expect(prepareLocalBaseline(unresolved, c, auth)).rejects.toThrow('ineligible');
    const changed = structuredClone(f.rows) as OpenedRecord[];
    const retry = changed.find(
      (r) => r.kind === 'heads' && JSON.parse(new TextDecoder().decode(r.bytes))[7] === 'retry',
    )!;
    const fields = JSON.parse(new TextDecoder().decode(retry.bytes));
    const refusal = JSON.parse(Buffer.from(fields[9], 'hex').toString());
    refusal[refusal.length - 1] = '00'.repeat(64);
    fields[9] = Buffer.from(JSON.stringify(refusal)).toString('hex');
    retry.bytes = new TextEncoder().encode(JSON.stringify(fields));
    await expect(prepareLocalBaseline(await memberInput(changed, c), c, auth)).rejects.toThrow();
  } finally {
    f.clear();
  }
});

it('extends original and joined authority cuts across a settled baseline and verifies accepted suffix boundaries', async () => {
  for (const joined of [false, true]) {
    const f = await memberFixture();
    const c: LocalBaselineContext = f.ctx;
    if (joined) {
      c.installation = { kind: 'joined', initialEpoch: 3 };
      c.identity = {
        ...c.identity,
        principalId: 'joining-local-principal',
        workspaceId: 'joining-local-workspace',
      };
    }
    try {
      await f.appendOwn();
      await f.appendPeer();
      const prefix = await memberInput(f.rows, c),
        cut = f.rows.length;
      const p = await prepareLocalBaseline(prefix, c, auth);
      const shadow = createLocalBaselineShadow();
      expect((await shadow.run(prefix, c, auth, async () => {})).kind).toBe('matched');
      // A second accepted position arrives after the cut but before membership installs.
      await f.appendOwn();
      await f.adopt();
      shadow.authorityChanged();
      await f.appendOwn();
      await f.appendPeer();
      const all = await memberInput(f.rows, c);
      const reduced = await replayLocalBaseline(
        p.baseline,
        p.anchor,
        { ...all, records: f.rows.slice(cut) },
        c,
        auth,
      );
      const full = await replayFullLocalHistory(all, c);
      expect(observation(reduced)).toEqual(observation(full));
      stateEqual(reduced.snapshot, full.snapshot);
      expect(await shadow.run(all, c, auth, async () => {})).toMatchObject({
        kind: 'matched',
        mode: 'continued',
      });
      // Changing an already authenticated cut, lying about its offset, and issuing under the
      // predecessor after installation must each fail without consulting retired rows.
      const bad = { ...c, installation: structuredClone(c.installation) };
      bad.installation.membership!.cuts[0]!.before.hash = 'ef'.repeat(32);
      await expect(
        replayLocalBaseline(
          p.baseline,
          p.anchor,
          { ...all, records: f.rows.slice(cut) },
          bad,
          auth,
        ),
      ).rejects.toThrow();
      bad.installation.membership!.cuts[0]!.before =
        prefix.counter.v === 2 ? prefix.counter.spool : emptySpoolWitness();
      await expect(
        replayLocalBaseline(
          p.baseline,
          p.anchor,
          { ...all, records: f.rows.slice(cut) },
          bad,
          auth,
        ),
      ).rejects.toThrow();
      shadow.invalidate();
    } finally {
      f.clear();
    }
  }
});

it('continues repeated checkpoints and exact own cuts at and after the retained frontier', async () => {
  const f = await memberFixture(),
    c: LocalBaselineContext = f.ctx;
  try {
    await f.appendPeer();
    await f.appendOwn();
    const prefix = await memberInput(f.rows, c),
      cut = f.rows.length;
    const p = await prepareLocalBaseline(prefix, c, auth);
    await f.appendHistory();
    await f.appendOwn();
    await f.appendPeer();
    await f.appendHistory();
    const all = await memberInput(f.rows, c);
    const reduced = await replayLocalBaseline(
      p.baseline,
      p.anchor,
      { ...all, records: f.rows.slice(cut) },
      c,
      auth,
    );
    const full = await replayFullLocalHistory(all, c);
    expect(observation(reduced)).toEqual(observation(full));
    stateEqual(reduced.snapshot, full.snapshot);
  } finally {
    f.clear();
  }
});

it('verifies a late terminal duplicate from retained evidence and fences older missing receipts', async () => {
  const f = await memberFixture(),
    c: LocalBaselineContext = f.ctx;
  try {
    await f.appendPeer();
    const first = structuredClone(f.rows.at(-1));
    await f.appendPeer();
    const terminal = structuredClone(f.rows.at(-1));
    const prefix = await memberInput(f.rows, c);
    const p = await prepareLocalBaseline(prefix, c, auth);
    const reduced = await replayLocalBaseline(
      p.baseline,
      p.anchor,
      { ...prefix, records: [] },
      c,
      auth,
    );
    for (const [row, permitted] of [
      [terminal, true],
      [first, false],
    ] as const) {
      const e = decodeInboundRecord(row.bytes),
        q = decodeInboundRequest(e.request);
      const resolve = () =>
        contextAt(
          publisherContext(c.inbound, q.publisher),
          publisherState(reduced.inbound, c.inbound, q.publisher),
          q.after,
        );
      if (!permitted) expect(resolve).toThrow('retired history');
      else
        expect(
          await verifyInboundPage(resolve(), e.request, e.page, {
            assertCurrent() {},
            now: () => 1,
          }),
        ).toMatchObject({ kind: 'duplicate' });
      // Duplicates are never persisted, even if their signed bytes are correct.
      row.seq = prefix.counter.next_seq;
      const all = await memberInput([...f.rows, row], c);
      await expect(
        replayLocalBaseline(p.baseline, p.anchor, { ...all, records: [row] }, c, auth),
      ).rejects.toThrow();
    }
  } finally {
    f.clear();
  }
});

it('characterizes why a restored legacy journal cannot use a retired source catalogue', async () => {
  const f = await fixture([false, false]),
    input = await f.input(),
    full = await replayFullLocalHistory(input, f.ctx),
    p = await prepareLocalBaseline(input, f.ctx, auth),
    reduced = await replayLocalBaseline(
      p.baseline,
      p.anchor,
      { ...input, records: [] },
      f.ctx,
      auth,
    );
  const original = [...full.census.delivery.spool.sources.values()][0]!;
  const journal = [{ key: 'restored-exact-capsule', generation: 1, bytes: original.slice() }];
  const recover = (records: OpenedRecord[]) => capturedRecovery({ records, journal }, f.ctx.route);
  const intact = recover([...full.census.delivery.spool.sourceRecords]),
    retired = recover([...reduced.census.delivery.spool.sourceRecords]);
  const doc = new Y.Doc({ gc: false });
  try {
    expect(full.delivery.acceptedThrough).toBe(2);
    expect(reduced.delivery.acceptedThrough).toBe(2);
    expect(intact.journal).toHaveLength(0);
    // This is an unsupported composition, not a newly supported recovery path. The private owner
    // still passes the complete catalogue. Keep the counterexample until a pairing fence exists.
    expect(reduced.census.delivery.spool.sources.size).toBe(0);
    expect(retired.journal).toHaveLength(2);
    Y.applyUpdate(doc, reduced.snapshot);
    const before = new Uint8Array(Y.encodeStateAsUpdate(doc));
    for (const row of retired.journal) Y.applyUpdate(doc, row.bytes);
    stateEqual(before, new Uint8Array(Y.encodeStateAsUpdate(doc)));
    // Unchanged Yjs state does not establish exact source identity or permission to publish again.
  } finally {
    doc.destroy();
    journal[0]!.bytes.fill(0);
    for (const row of [...intact.journal, ...retired.journal]) row.bytes.fill(0);
  }
});

it('warm indexes extend a retained origin without reusing consumed sources or resetting links and positions', async () => {
  const f = await fixture(),
    cut = f.cuts[0]!,
    prefix = await f.input(f.rows.slice(0, cut));
  const p = await prepareLocalBaseline(prefix, f.ctx, auth);
  const view = await replayLocalBaseline(
    p.baseline,
    p.anchor,
    { ...prefix, records: [] },
    f.ctx,
    auth,
  );
  const all = await f.input(),
    suffix = f.rows.slice(cut);
  const before = view.census.delivery.spool.sourceRecords;
  const records = [...before, ...suffix];
  const indexes = await indexVerifiedLedger(
    view,
    before,
    f.ctx.route,
    prefix.counter,
    crypto.subtle,
  );
  expect(indexes).toBeDefined();
  const next = await extendAccountLedger(
    { ...view, indexes: indexes! },
    before,
    records,
    f.ctx.route,
    all.counter,
    f.ctx.inbound,
    f.ctx.signer,
    crypto.subtle,
    { memo: createVerificationMemo(), current() {} },
  );
  expect(next).toBeDefined();
  const reference = await replayLocalBaseline(
    p.baseline,
    p.anchor,
    { ...all, records: suffix },
    f.ctx,
    auth,
  );
  expect(next!.delivery.acceptedThrough).toBe(reference.delivery.acceptedThrough);
  expect(next!.census.delivery.spool.positions).toEqual(reference.census.delivery.spool.positions);
  expect(
    await selectEnvelopeSources(next!.census.delivery.spool, f.ctx.route, true, crypto.subtle),
  ).toEqual(
    await selectEnvelopeSources(reference.census.delivery.spool, f.ctx.route, true, crypto.subtle),
  );
});

it('extends an earlier baseline through rotation, a burned retry and current-key acceptance without losing offline originals', async () => {
  const f = await retriedFixture(),
    c: LocalBaselineContext = f.ctx;
  try {
    const initial = (await verifyMembershipChain(f.proofs, f.f.f.base)).history;
    const old: LocalBaselineContext = {
      ...c,
      route: { ...c.route, epoch: 3, generation: 1, history: initial },
      inbound: {
        ...c.inbound,
        authority: initial.current,
        history: initial,
        generation: 1,
        generationKey: c.inbound.retainedGenerationKeys!.get(1)!,
      },
      installation: {
        kind: 'original',
        ...(c.installation.kind === 'original' && c.installation.successor
          ? { successor: c.installation.successor }
          : {}),
      },
    };
    const prefix = await memberInput([], old);
    const p = await prepareLocalBaseline(prefix, old, auth);
    const all = await memberInput(f.rows, c);
    // Native rotation keeps the baseline encrypted under generation one and re-encrypts
    // the physical suffix at the same sequences, reserving fresh generation-two invocations.
    all.counter = {
      ...all.counter,
      active_gen: 2,
      next_seq: all.counter.next_seq + all.records.length,
      reserved: { ...all.counter.reserved, 2: all.records.length },
    };
    all.records = all.records.map((r) => ({ ...r, gen: 2 }));
    const replayed = await replayLocalBaseline(p.baseline, p.anchor, all, c, auth);
    expect(observation(replayed)).toEqual(observation(await replayFullLocalHistory(all, c)));
    expect(replayed.census.delivery.spool.positions[0]!.retries).toHaveLength(1);
    expect(replayed.census.delivery.spool.attempts).toBe(3);
    const rebased = await rebaseLocalBaseline(p.baseline, p.anchor, all, c, auth);
    const empty = await rebaseLocalBaseline(
      rebased.baseline,
      rebased.anchor,
      { ...all, records: [] },
      c,
      auth,
    );
    expect(decodeLocalBaseline(empty.baseline.payload).generation).toBe(2);
    expect(
      observation(
        await replayLocalBaseline(empty.baseline, empty.anchor, { ...all, records: [] }, c, auth),
      ),
    ).toEqual(observation(replayed));
    await expect(
      replayLocalBaseline(
        p.baseline,
        p.anchor,
        {
          ...all,
          counter: {
            ...all.counter,
            active_gen: 3,
            next_seq: all.counter.next_seq + 1,
            reserved: { ...all.counter.reserved, 3: 1 },
          },
        },
        c,
        auth,
      ),
    ).rejects.toThrow('scope');
    const wrongKey = { ...c, inbound: { ...c.inbound, generationKey: new Uint8Array(32) } };
    await expect(replayLocalBaseline(p.baseline, p.anchor, all, wrongKey, auth)).rejects.toThrow();
  } finally {
    f.clear();
  }
});

it('never trusts a checkpoint cut at a retired unknown link, for either self or peer', async () => {
  const f = await memberFixture(),
    c: LocalBaselineContext = f.ctx;
  try {
    await f.appendOwn();
    await f.appendPeer();
    const historical = await f.appendHistory();
    const oldInstall = await verifyHistoryInstall(c.inbound, historical, undefined, c);
    oldInstall.update.fill(0);
    // Online duplicate is authenticated and returns no new installation; cold ledger replay
    // still refuses a second durable event for the same checkpoint.
    const duplicate = await verifyHistoryInstall(
      c.inbound,
      historical,
      oldInstall.installed,
      c,
      true,
    );
    expect(duplicate.duplicate).toBe(true);
    duplicate.update.fill(0);
    await expect(
      verifyHistoryInstall(c.inbound, historical, oldInstall.installed, c),
    ).rejects.toThrow('regressed or forked');
    await f.appendOwn();
    await f.appendPeer();
    const prefix = await memberInput(f.rows, c),
      p = await prepareLocalBaseline(prefix, c, auth);
    const replay = await replayLocalBaseline(
      p.baseline,
      p.anchor,
      { ...prefix, records: [] },
      c,
      auth,
    );
    // A starting point retained from a verified checkpoint still proves its exact old peer link.
    const heads = oldInstall.heads!;
    await applyHistoryReceiveCuts(replay.inbound, c.inbound, replay.census, heads);
    delete replay.inbound.checkpointCuts;
    await expect(
      applyHistoryReceiveCuts(
        replay.inbound,
        c.inbound,
        replay.census,
        heads.filter((h) => h.credentialId === c.route.credential),
      ),
    ).rejects.toThrow('retired history');
    // No starting point or receipt for a different old peer position: require retained evidence.
    for (const s of replay.inbound.peers!.values()) delete s.startingPoint;
    await expect(
      applyHistoryReceiveCuts(
        replay.inbound,
        c.inbound,
        replay.census,
        heads.filter((h) => h.credentialId !== c.route.credential),
      ),
    ).rejects.toThrow('retired history');
  } finally {
    f.clear();
  }
});

it('rejects a service-signed new boundary that forks or extends beyond the available retained acceptance', async () => {
  for (const missing of [false, true]) {
    const f = await memberFixture(),
      c: LocalBaselineContext = f.ctx;
    try {
      await f.appendOwn();
      const prefix = await memberInput(f.rows, c),
        cut = f.rows.length;
      const p = await prepareLocalBaseline(prefix, c, auth);
      await f.adopt(
        (state: { heads: { credentialId: string; position: number; link: string }[] }) => {
          const own = state.heads.find((h) => h.credentialId === c.route.credential)!;
          if (missing) own.position++;
          own.link = 'ef'.repeat(32);
        },
      );
      const all = await memberInput(f.rows, c);
      await expect(replayFullLocalHistory(all, c)).rejects.toThrow();
      await expect(
        replayLocalBaseline(p.baseline, p.anchor, { ...all, records: f.rows.slice(cut) }, c, auth),
      ).rejects.toThrow();
    } finally {
      f.clear();
    }
  }
});

it('full-history consumers explicitly refuse a reduced spool instead of interpreting suffix offsets as absolute history', async () => {
  const f = await memberFixture(),
    c: LocalBaselineContext = f.ctx;
  try {
    const input = await memberInput(f.rows, c),
      p = await prepareLocalBaseline(input, c, auth);
    const r = await replayLocalBaseline(p.baseline, p.anchor, input, c, auth),
      spool = r.census.delivery.spool;
    await expect(verifySpoolWitness(spool, input.counter, crypto.subtle)).rejects.toThrow(
      'retired history',
    );
    await expect(
      verifyInstalledSuccessor(spool, c.route, undefined, crypto.subtle),
    ).rejects.toThrow('retired history');
    await expect(
      verifyInstalledMembership(
        spool,
        c.route.history!,
        { v: 1, proofs: f.proofs, cuts: [] },
        3,
        crypto.subtle,
      ),
    ).rejects.toThrow('retired history');
    await expect(verifyDetachedPrefix(c.route.history!, spool, crypto.subtle)).rejects.toThrow(
      'retired history',
    );
  } finally {
    f.clear();
  }
});

it('logical reads require an era, carry exact partial originals and isolate every returned buffer', async () => {
  const f = await fixture(),
    cut = f.cuts[0]!,
    prefix = await f.input(f.rows.slice(0, cut));
  const before = structuredClone(prefix);
  const ordinary = await prepareLocalBaseline(prefix, f.ctx, auth);
  expect(await verifyCompleteLocalBaseline(prefix, f.ctx, auth, ordinary, true)).toBeUndefined();
  const retained = await prepareLocalBaseline(prefix, f.ctx, auth, null, {
    current: 'ab'.repeat(32),
    previous: null,
    revision: 1,
  });
  expect(await verifyCompleteLocalBaseline(prefix, f.ctx, auth, retained)).toBeUndefined();
  const read = await verifyCompleteLocalBaseline(prefix, f.ctx, auth, retained, true);
  expect(read?.kind).toBe('baseline-plus-suffix');
  expect(read!.records.length).toBeLessThan(prefix.records.length);
  expect(read!.records[0]!.seq).toBe(0);
  expect(read!.ledger.census.delivery.spool.origin?.position).toBe(1);
  expect(read!.ledger.census.delivery.spool.origin?.consumed).toEqual([
    { id: '1'.padStart(32, '0'), index: 0 },
  ]);
  expect(read!.ledger.census.delivery.spool.positions).toEqual([]);
  const selected = await selectEnvelopeSources(
    read!.ledger.census.delivery.spool,
    f.ctx.route,
    true,
    crypto.subtle,
  );
  expect(selected.map(({ id, index }) => ({ id, index }))).toEqual([
    { id: '1'.padStart(32, '0'), index: 1 },
  ]);
  for (const r of read!.records) r.bytes.fill(0);
  for (const b of read!.ledger.census.delivery.spool.sources.values()) b.fill(0);
  read!.ledger.delivery.acceptedThrough = 999;
  expect(prefix).toEqual(before);
  const reread = await verifyCompleteLocalBaseline(await f.input(), f.ctx, auth, retained, true);
  expect(reread!.ledger.delivery.acceptedThrough).toBe(4);
  expect(reread!.ledger.census.delivery.spool.positions.map((p) => p.position)).toEqual([2, 3, 4]);
  expect(nextSpoolPosition(reread!.ledger.census.delivery.spool)).toBe(5);
});
it('non-deleting logical reads still refuse changed physical prefix evidence', async () => {
  const f = await fixture(),
    prefix = await f.input(f.rows.slice(0, f.cuts[1]!));
  const retained = await prepareLocalBaseline(prefix, f.ctx, auth, null, {
    current: 'ab'.repeat(32),
    previous: null,
    revision: 1,
  });
  const damaged = structuredClone(await f.input());
  const bytes = damaged.records.find((r) => r.kind === 'heads')!.bytes;
  bytes[0] = bytes[0]! ^ 1;
  await expect(verifyCompleteLocalBaseline(damaged, f.ctx, auth, retained, true)).rejects.toThrow();
});

it('the full oracle detects a missing original beyond the next 32-source publication batch', async () => {
  const f = await fixture(Array.from({ length: 70 }, () => false));
  const catalogue = new Set(
    inspectInbound(f.rows, f.ctx.route, f.ctx.inbound).delivery.spool.sourceRecords.map(
      (r) => r.seq,
    ),
  );
  const input = await f.input(
    f.rows.filter((r) => r.seq <= f.rows[f.cuts[0]! - 1]!.seq || catalogue.has(r.seq)),
  );
  const retained = await prepareLocalBaseline(input, f.ctx, auth, null, {
    current: 'ab'.repeat(32),
    previous: null,
    revision: 1,
  });
  const good = await verifyCompleteLocalBaseline(input, f.ctx, auth, retained, true);
  const decoded = decodeLocalBaseline(retained.baseline.payload);
  expect(decoded.sources.length).toBe(35);
  decoded.sources.pop(); // Simulates a candidate-builder omission, not an unauthenticated disk edit.
  const payload = encodeLocalBaseline(decoded),
    mac = await auth.sign(baselineAuthenticationPayload(payload));
  const bad = {
    baseline: { payload, mac },
    anchor: { revision: decoded.revision, hash: digest(payload) },
  };
  const replay = await replayLocalBaseline(
    bad.baseline,
    bad.anchor,
    { ...input, records: [] },
    f.ctx,
    auth,
  );
  const select = (spool: typeof replay.census.delivery.spool) =>
    selectEnvelopeSources(spool, f.ctx.route, true, crypto.subtle);
  expect(await select(replay.census.delivery.spool)).toEqual(
    await select(good!.ledger.census.delivery.spool),
  );
  expect((await select(replay.census.delivery.spool)).length).toBe(32);
  await expect(verifyCompleteLocalBaseline(input, f.ctx, auth, bad, true)).rejects.toThrow(
    'integrity',
  );
});

it('rebases successive partial cuts using only authenticated predecessors and suffixes, including an empty suffix', async () => {
  await fc.assert(
    fc.asyncProperty(fc.array(fc.boolean(), { minLength: 3, maxLength: 8 }), async (actions) => {
      const f = await fixture(actions, true),
        first = await f.input(f.rows.slice(0, f.cuts[0]));
      let p = await prepareLocalBaseline(first, f.ctx, auth, null, {
        current: 'ab'.repeat(32),
        previous: null,
        revision: 1,
      });
      let cut = f.cuts[0]!;
      expect(decodeLocalBaseline(p.baseline.payload).sources[0]!.consumed).toEqual([0]);
      for (const next of [cut, f.cuts[1]!, f.rows.length, f.rows.length]) {
        const all = await f.input(f.rows.slice(0, next)),
          previous = p;
        p = await rebaseLocalBaseline(
          previous.baseline,
          previous.anchor,
          { ...all, records: f.rows.slice(cut, next) },
          f.ctx,
          auth,
        );
        const b = decodeLocalBaseline(p.baseline.payload);
        expect(b.revision).toBe(previous.anchor.revision + 1);
        expect(b.predecessor).toBe(previous.anchor.hash);
        expect(b.cut.sequence).toBe(f.rows[next - 1]!.seq);
        expect(b.journalEra).toEqual(decodeLocalBaseline(previous.baseline.payload).journalEra);
        const reduced = await replayLocalBaseline(
          p.baseline,
          p.anchor,
          { ...all, records: [] },
          f.ctx,
          auth,
        );
        const full = await replayFullLocalHistory(all, f.ctx);
        stateEqual(reduced.snapshot, full.snapshot);
        expect(observation(reduced)).toEqual(observation(full));
        expect(
          await selectEnvelopeSources(
            reduced.census.delivery.spool,
            f.ctx.route,
            true,
            crypto.subtle,
          ),
        ).toEqual(
          await selectEnvelopeSources(full.census.delivery.spool, f.ctx.route, true, crypto.subtle),
        );
        cut = next;
      }
    }),
    { numRuns: 12, seed: 131026 },
  );
});

it('rebase refuses tampered predecessors, missing suffix events, prefix replay and unsettled positions before signing', async () => {
  const f = await fixture(),
    first = await f.input(f.rows.slice(0, f.cuts[0])),
    p = await prepareLocalBaseline(first, f.ctx, auth),
    all = await f.input();
  const suffix = { ...all, records: f.rows.slice(f.cuts[0]) };
  let signs = 0;
  const checked = {
    ...auth,
    sign: async (b: Bytes) => {
      signs++;
      return auth.sign(b);
    },
  };
  const bad = structuredClone(p.baseline);
  bad.mac[0]! ^= 1;
  await expect(rebaseLocalBaseline(bad, p.anchor, suffix, f.ctx, checked)).rejects.toThrow();
  await expect(
    rebaseLocalBaseline(
      p.baseline,
      p.anchor,
      { ...suffix, records: suffix.records.slice(1) },
      f.ctx,
      checked,
    ),
  ).rejects.toThrow();
  await expect(rebaseLocalBaseline(p.baseline, p.anchor, all, f.ctx, checked)).rejects.toThrow();
  const lastResponse = all.records.at(-1)!;
  const pending = await f.input(all.records.slice(0, -1));
  expect(lastResponse.kind).toBe('heads');
  await expect(
    rebaseLocalBaseline(
      p.baseline,
      p.anchor,
      { ...pending, records: pending.records.slice(f.cuts[0]) },
      f.ctx,
      checked,
    ),
  ).rejects.toThrow('ineligible');
  expect(signs).toBe(0);
});

it('rebase keeps inherited checkpoint evidence and current authority even when the next suffix has no events', async () => {
  for (const joined of [false, true]) {
    const f = await memberFixture(),
      c: LocalBaselineContext = f.ctx;
    if (joined) c.installation = { kind: 'joined', initialEpoch: 3 };
    try {
      await f.appendOwn();
      await f.appendPeer();
      await f.appendHistory();
      const first = await memberInput(f.rows, c),
        cut = f.rows.length;
      const p = await prepareLocalBaseline(first, c, auth);
      await f.adopt();
      await f.appendOwn();
      await f.appendPeer();
      const all = await memberInput(f.rows, c);
      const q = await rebaseLocalBaseline(
        p.baseline,
        p.anchor,
        { ...all, records: f.rows.slice(cut) },
        c,
        auth,
      );
      const r = await rebaseLocalBaseline(q.baseline, q.anchor, { ...all, records: [] }, c, auth);
      const a = decodeLocalBaseline(p.baseline.payload),
        b = decodeLocalBaseline(r.baseline.payload);
      expect(b.history).toEqual(a.history);
      expect(b.authorityState.epoch).toBe(c.route.epoch);
      expect(b.cut.sequence).toBe(f.rows.at(-1).seq);
      expect(
        observation(
          await replayLocalBaseline(r.baseline, r.anchor, { ...all, records: [] }, c, auth),
        ),
      ).toEqual(observation(await replayFullLocalHistory(all, c)));
    } finally {
      f.clear();
    }
  }
});

it('rebase captures caller buffers before awaiting and never signs after its owner retires', async () => {
  const f = await fixture(),
    first = await f.input(f.rows.slice(0, f.cuts[0])),
    p = await prepareLocalBaseline(first, f.ctx, auth),
    all = await f.input();
  for (const retired of [false, true]) {
    const held = structuredClone(p),
      tail = structuredClone({ ...all, records: f.rows.slice(f.cuts[0]) });
    let release!: () => void,
      arrived!: () => void,
      current = true,
      once = true,
      signs = 0;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const checked: BaselineAuthentication = {
      sign: async (b) => {
        signs++;
        return auth.sign(b);
      },
      verify: async (b, mac) => {
        if (once) {
          once = false;
          arrived();
          await blocked;
        }
        return auth.verify(b, mac);
      },
    };
    const work = rebaseLocalBaseline(
      held.baseline,
      held.anchor,
      tail,
      {
        ...f.ctx,
        assertCurrent: () => {
          if (!current) throw Error('Retired rebase owner');
        },
      },
      checked,
    );
    await entered;
    held.baseline.payload.fill(0);
    held.baseline.mac.fill(0);
    held.anchor.hash = ZERO;
    for (const r of tail.records) r.bytes.fill(0);
    tail.counter.next_seq++;
    current = !retired;
    release();
    if (retired) {
      await expect(work).rejects.toThrow('Retired rebase owner');
      expect(signs).toBe(0);
    } else {
      const q = await work;
      const replayed = await replayLocalBaseline(
        q.baseline,
        q.anchor,
        { ...all, records: [] },
        f.ctx,
        auth,
      );
      stateEqual(replayed.snapshot, (await replayFullLocalHistory(all, f.ctx)).snapshot);
    }
  }
});

// This fixture seals actual protocol history. The planner receives no database/writer/allocator.
async function retentionFixture(f: Awaited<ReturnType<typeof fixture>>, records = f.rows) {
  let retired = false;
  const check = () => {
    if (retired) throw Error('retired fixture owner');
  };
  const task: SessionTask = {
    signal: new AbortController().signal,
    step: (fn) => {
      check();
      return fn();
    },
    wait: async (fn) => {
      check();
      const result = await fn();
      check();
      return result;
    },
  };
  const crypt = cryptFor(f.ctx.identity, {
    aes: await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]),
    hmac: key,
  });
  const input = await f.input(records);
  input.counter.mac = await crypt.sign(task, counterPayload(f.ctx.identity, input.counter));
  const inventory: RetentionInventory = {
    rows: [],
    metadata: [{ key: 'counter', value: input.counter }],
  };
  for (const r of records)
    inventory.rows.push({
      store: recordStore(r.kind),
      key: r.seq,
      value: await crypt.seal(task, { v: 1, seq: r.seq, gen: r.gen, kind: r.kind }, r.bytes),
    });
  let signs = 0;
  const read = {
    open: (r: StoredRecord) => crypt.open(task, r),
    verify: (b: Bytes, mac: Bytes) => crypt.verify(task, b, mac),
    auth: {
      ...auth,
      sign: async (b: Bytes) => {
        check();
        signs++;
        return auth.sign(b);
      },
    },
  };
  const binding = { lifetime: {}, intent: input.counter.intent };
  const context = { ...f.ctx, assertCurrent: check };
  return {
    task,
    inventory,
    binding,
    context,
    read,
    crypt,
    input,
    retire: () => {
      retired = true;
    },
    signs: () => signs,
    plan: () => planLocalRetention(task, inventory, context, read, binding),
  };
}

it('dry run enumerates exact interleaved sealed keys, preserves partial capsules and burns, and isolates all callers', async () => {
  const f = await fixture([false, true, false], true);
  // Leave a low reserved hole and a partly consumed capsule; a maximum sequence is not the census.
  const rows = f.rows.slice(0, f.cuts[0]).map((r) => ({ ...r, seq: r.seq + 3 }));
  const g = await retentionFixture(f, rows),
    before = structuredClone(g.inventory);
  const plan = await g.plan();
  if (plan.kind !== 'local-retention-dry-run') throw Error(plan.reason);
  try {
    expect(g.inventory).toEqual(before);
    const report = retentionPlanReport(plan),
      evidence = inspectRetentionPlan(plan);
    expect(report).toMatchObject({
      kind: 'planned',
      rows: rows.length,
      metadataChunks: 0,
      previousRevision: 0,
      revision: 1,
      survivors: 0,
      dispositions: { 'source-carried': 1, 'content-covered': 2, 'receive-frontier': 1 },
    });
    expect(evidence.deleteRows.map((r) => [r.store, r.key]).sort()).toEqual(
      before.rows.map((r) => [r.store, r.key]).sort(),
    );
    const b = decodeLocalBaseline(evidence.candidate.baseline.payload);
    expect(b.cut.nextSequence).toBe(g.input.counter.next_seq);
    expect(b.cut.reserved).toEqual([[1, g.input.counter.next_seq - 1]]);
    expect(b.sources[0]!.consumed).toEqual([0]);
    expect(b.own.attempts).toBe(2);
    expect(b.sources[0]!.record.bytes).toEqual(rows.find((r) => r.kind === 'outbound')!.bytes);
    const reduced = await replayLocalBaseline(
      evidence.candidate.baseline,
      evidence.candidate.anchor,
      { records: [], counter: evidence.counter },
      f.ctx,
      auth,
    );
    const full = await replayFullLocalHistory(g.input, f.ctx);
    expect(
      await selectEnvelopeSources(reduced.census.delivery.spool, f.ctx.route, true, crypto.subtle),
    ).toEqual(
      await selectEnvelopeSources(full.census.delivery.spool, f.ctx.route, true, crypto.subtle),
    );
    evidence.deleteRows[0]!.value.ct.fill(0);
    evidence.candidate.baseline.payload.fill(0);
    report.dispositions['source-carried'] = 999;
    expect(retentionPlanReport(plan).dispositions['source-carried']).toBe(1);
    verifyRetentionPlan(plan, before, g.binding);
    g.inventory.rows[0]!.value = null;
    verifyRetentionPlan(plan, before, g.binding);
    expect(() => verifyRetentionPlan(plan, before, { ...g.binding, lifetime: {} })).toThrow(
      'identity',
    );
    expect(() =>
      verifyRetentionPlan(plan, before, { ...g.binding, intent: 'ee'.repeat(16) }),
    ).toThrow('identity');
    g.retire();
    expect(() => verifyRetentionPlan(plan, before, g.binding)).toThrow('retired');
  } finally {
    disposeRetentionPlan(plan);
  }
  expect(() => retentionPlanReport(plan)).toThrow('expired');
});

it('exact plan rejects changed, extra, missing and late lower-key rows and raw metadata changes', async () => {
  const f = await fixture();
  const g = await retentionFixture(
    f,
    f.rows.map((r) => ({ ...r, seq: r.seq + 4 })),
  );
  const plan = await g.plan();
  if (plan.kind !== 'local-retention-dry-run') throw Error(plan.reason);
  const changes: ((i: RetentionInventory) => void)[] = [
    (i) => {
      (i.rows[0]!.value as StoredRecord).ct[0]! ^= 1;
    },
    (i) => {
      (i.rows[0]!.value as StoredRecord).nonce[0]! ^= 1;
    },
    (i) => {
      i.rows[0]!.key = 1;
    },
    (i) => {
      i.rows[0]!.store = 'outbound';
    },
    (i) => {
      (i.rows[0]!.value as StoredRecord).kind = 'state';
    },
    (i) => {
      i.rows.pop();
    },
    (i) => {
      i.rows.push({ ...structuredClone(i.rows[0]!), key: 1 });
    },
    (i) => {
      i.rows.push(structuredClone(i.rows[0]!));
    },
    (i) => {
      (i.metadata[0]!.value as ContentCounter).mac[0]! ^= 1;
    },
    (i) => {
      (i.metadata[0]!.value as ContentCounter).next_seq++;
    },
    (i) => {
      i.metadata.push({ key: ['local-baseline', 0], value: {} });
    },
    (i) => {
      i.metadata.length = 0;
    },
    (i) => {
      (i.rows[0]!.value as unknown as Record<string, unknown>)['unknown'] = true;
    },
  ];
  try {
    for (const change of changes) {
      const changed = structuredClone(g.inventory);
      change(changed);
      expect(() => verifyRetentionPlan(plan, changed, g.binding)).toThrow('inventory changed');
    }
    const reordered = structuredClone(g.inventory);
    reordered.rows.reverse();
    verifyRetentionPlan(plan, reordered, g.binding);
  } finally {
    disposeRetentionPlan(plan);
  }
});

it('dry-run projection remains equivalent through the next allocation and a second cut', async () => {
  const f = await fixture([false, true, false, false], true),
    first = await retentionFixture(f, f.rows.slice(0, f.cuts[0]));
  const p = await first.plan();
  if (p.kind !== 'local-retention-dry-run') throw Error(p.reason);
  try {
    let { candidate } = inspectRetentionPlan(p),
      cut = f.cuts[0]!;
    for (const next of [f.cuts[1]!, f.rows.length]) {
      const all = await f.input(f.rows.slice(0, next)),
        suffix = { ...all, records: f.rows.slice(cut, next) };
      const projected = await replayLocalBaseline(
        candidate.baseline,
        candidate.anchor,
        suffix,
        f.ctx,
        auth,
      );
      const reference = await replayFullLocalHistory(all, f.ctx);
      stateEqual(projected.snapshot, reference.snapshot);
      expect(observation(projected)).toEqual(observation(reference));
      candidate = await rebaseLocalBaseline(
        candidate.baseline,
        candidate.anchor,
        suffix,
        f.ctx,
        auth,
      );
      expect(decodeLocalBaseline(candidate.baseline.payload).sources).toEqual([]);
      cut = next;
    }
  } finally {
    disposeRetentionPlan(p);
  }
});

it('dry run skips unsettled/pending/capacity cuts but refuses damaged evidence before signing', async () => {
  const f = await fixture(),
    unsettled = await retentionFixture(f, f.rows.slice(0, -1));
  expect(await unsettled.plan()).toEqual({ kind: 'skipped', reason: 'ineligible' });
  expect(unsettled.signs()).toBe(0);
  const doc = new Y.Doc({ gc: false }),
    updates: Bytes[] = [];
  doc.on('update', (u: Uint8Array) => updates.push(new Uint8Array(u)));
  doc.getText('pending').insert(0, 'parent');
  doc.getText('pending').insert(6, 'child');
  doc.destroy();
  const seq = f.rows.at(-1)!.seq + 1;
  const pending = await retentionFixture(f, [
    ...f.rows,
    { seq, kind: 'update', gen: 1, bytes: updates[1]! },
  ]);
  expect(await pending.plan()).toEqual({ kind: 'skipped', reason: 'ineligible' });
  const large = new Y.Doc({ gc: false });
  large.getText('large').insert(0, 'x'.repeat(LOCAL_BASELINE_LIMIT / 2));
  const capacity = await retentionFixture(f, [
    ...f.rows,
    { seq, kind: 'state', gen: 1, bytes: new Uint8Array(Y.encodeStateAsUpdate(large)) },
  ]);
  large.destroy();
  expect(await capacity.plan()).toEqual({ kind: 'skipped', reason: 'capacity' });
  expect(capacity.signs()).toBe(0);
  const changed = await retentionFixture(f);
  (changed.inventory.rows[0]!.value as StoredRecord).ct[0]! ^= 1;
  await expect(changed.plan()).rejects.toThrow();
  expect(changed.signs()).toBe(0);
  const unknown = await retentionFixture(f);
  const at = unknown.inventory.rows.find((r) => r.store === 'heads')!;
  const header = at.value as StoredRecord;
  at.value = await unknown.crypt.seal(
    unknown.task,
    { v: 1, seq: header.seq, gen: header.gen, kind: header.kind },
    new TextEncoder().encode('["unknown"]'),
  );
  await expect(unknown.plan()).rejects.toThrow();
  expect(unknown.signs()).toBe(0);
});

it('dry-run inputs are captured before crypto, and a retired owner cannot finish a plan', async () => {
  const f = await fixture(),
    g = await retentionFixture(f);
  const copy = structuredClone(g.inventory);
  const planning = g.plan();
  g.inventory.rows.length = 0;
  (g.inventory.metadata[0]!.value as ContentCounter).mac.fill(0);
  const plan = await planning;
  if (plan.kind !== 'local-retention-dry-run') throw Error(plan.reason);
  try {
    verifyRetentionPlan(plan, copy, g.binding);
  } finally {
    disposeRetentionPlan(plan);
  }
  const retired = await retentionFixture(f),
    work = retired.plan();
  retired.retire();
  await expect(work).rejects.toThrow('retired');
  expect(retired.signs()).toBe(0);
});

it('generated exact plans cover every physical key across holes and varying settled cuts, and reject a changed old row', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.boolean(), { minLength: 2, maxLength: 8 }),
      fc.nat(6),
      fc.nat(7),
      async (actions, hole, selector) => {
        const f = await fixture(actions, true),
          cut = f.cuts[selector % f.cuts.length]!;
        const g = await retentionFixture(
          f,
          f.rows.slice(0, cut).map((r) => ({ ...r, seq: r.seq + hole })),
        );
        const before = structuredClone(g.inventory),
          plan = await g.plan();
        if (plan.kind !== 'local-retention-dry-run') throw Error(plan.reason);
        try {
          const evidence = inspectRetentionPlan(plan),
            d = decodeLocalBaseline(evidence.candidate.baseline.payload);
          expect(evidence.deleteRows.length).toBe(before.rows.length);
          expect(new Set(evidence.deleteRows.map((r) => r.key)).size).toBe(before.rows.length);
          expect(evidence.survivors).toEqual([]);
          const projected = await replayLocalBaseline(
            evidence.candidate.baseline,
            evidence.candidate.anchor,
            { records: [], counter: evidence.counter },
            f.ctx,
            auth,
          );
          const reference = await replayFullLocalHistory(g.input, f.ctx);
          stateEqual(projected.snapshot, reference.snapshot);
          expect(observation(projected)).toEqual(observation(reference));
          expect(d.own.attempts).toBe(2 * ((selector % f.cuts.length) + 1));
          const row = before.rows[(selector + hole) % before.rows.length]!;
          (row.value as StoredRecord).ct[0]! ^= 1;
          expect(() => verifyRetentionPlan(plan, before, g.binding)).toThrow('inventory changed');
          expect(g.inventory).not.toEqual(before);
        } finally {
          disposeRetentionPlan(plan);
        }
      },
    ),
    { numRuns: 12, seed: 131027 },
  );
});
