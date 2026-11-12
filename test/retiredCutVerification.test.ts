// @vitest-environment node
// A history snapshot whose cuts fall inside history this device already reduced is verified, not
// skipped: the publisher's accepted chain is read from the cut to the retained frontier.
import { sign } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  prepareLocalBaseline,
  replayLocalBaseline,
  replayFullLocalHistory,
  rebaseLocalBaseline,
  type BaselineAuthentication,
  type LocalBaselineContext,
} from '../src/crdt/localBaselineReplay';
import {
  applyHistoryReceiveCuts,
  historyAdvances,
  inspectInbound,
  type InboundState,
} from '../src/crdt/inboundLedger';
import { checkRetainedCheckpointCuts } from '../src/crdt/retentionCheckpoint';
import { decodeLocalBaseline } from '../src/crdt/localBaselineRecord';
import { decodeHistoryInstall, verifyHistoryInstall } from '../src/crdt/historyInstall';
import { RetiredHistoryRequired, type RetiredCut } from '../src/crdt/retainedHistory';
import { InboundError } from '../src/crdt/accountInbound';
import {
  verifyRetiredCuts,
  RetiredCutUnverifiable,
  type RetiredCutReader,
} from '../src/crdt/retiredCutVerification';
import {
  emptySpoolWitness,
  type ContentCounter,
  type OpenedRecord,
} from '../src/crdt/contentRecord';
import { extendSpoolWitness } from '../src/crdt/spoolRecord';
// @ts-expect-error Shared real-protocol JavaScript fixture.
import { memberFixture } from './local-baseline/fixtures.mjs';
// @ts-expect-error Shared real-protocol JavaScript oracle.
import { hash } from './account-decisions/oracle.mjs';

type Entry = { envelope: Uint8Array<ArrayBuffer>; proof: Uint8Array<ArrayBuffer> };
type HistoryHead = { credentialId: string; position: number; link: string };
const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, [
  'sign',
  'verify',
]);
const auth: BaselineAuthentication = {
  sign: async (p) => new Uint8Array(await crypto.subtle.sign('HMAC', key, p)),
  verify: (p, mac) => crypto.subtle.verify('HMAC', key, mac, p),
};
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const json = (v: unknown) => new Uint8Array(Buffer.from(JSON.stringify(v)));
const lifetime = { assertCurrent() {} };
async function input(records: readonly OpenedRecord[], c: LocalBaselineContext) {
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
type Cursor = { position: number; link: string };
const view = (s: InboundState) => ({
  own: [s.prefix.position, s.prefix.link, s.startingPoint ?? null],
  peers: [...(s.peers ?? [])].map(([id, p]) => [
    id,
    p.prefix.position,
    p.prefix.link,
    p.startingPoint ?? null,
  ]),
  installed: s.installedHistory ?? null,
  cuts: [...(s.checkpointCuts ?? new Map<string, Cursor>())],
});

/** A snapshot admitted with cuts own 1 / peer 1, delivered only after this device received own 2
 * and peer 2..4 and reduced past both cuts: the reduced-peer strand, at unit scale. */
async function reducedPastSnapshot() {
  const f = await memberFixture(),
    c: LocalBaselineContext = f.ctx;
  const own: Entry[] = [],
    peer: Entry[] = [];
  own.push(await f.appendOwn());
  peer.push(await f.appendPeer());
  const record: Uint8Array<ArrayBuffer> = await f.appendHistory();
  const install = f.rows.splice(-2); // admitted now, delivered after reduction
  own.push(await f.appendOwn());
  for (let i = 0; i < 3; i++) peer.push(await f.appendPeer());
  const prefix = await input(f.rows, c),
    reduced = await prepareLocalBaseline(prefix, c, auth),
    cut = f.rows.length;
  for (const r of install) f.rows.push({ ...r, seq: f.rows.length + 1 });
  const self: string = c.route.credential,
    other: string = f.f.context.candidate.id;
  const heads: HistoryHead[] = decodeHistoryInstall(record).checkpoint.heads;
  const streams = new Map<string, Entry[]>([
    [self, own],
    [other, peer],
  ]);
  return {
    f,
    c,
    self,
    other,
    record,
    heads,
    reduced,
    cut,
    prefix,
    streams,
    b: decodeLocalBaseline(reduced.baseline.payload),
    all: await input(f.rows, c),
  };
}
type X = Awaited<ReturnType<typeof reducedPastSnapshot>>;
/** The service: signed read-v2 pages over each publisher's accepted entries. */
function service(
  x: X,
  change: (page: {
    publisher: string;
    after: number;
    items: Entry[];
    through: number;
  }) => void = () => {},
  pageKey = x.f.f.f.keys.acceptance,
) {
  const reads: { publisher: string; after: number; limit: number }[] = [];
  const io: RetiredCutReader = {
    sign: async (message) => sign(null, message, x.f.f.keys.existing).toString('hex'),
    read: async (request) => {
      const r = JSON.parse(Buffer.from(request).toString());
      const publisher: string = r[6],
        after: number = r[10],
        limit: number = r[11];
      reads.push({ publisher, after, limit });
      const list = x.streams.get(publisher)!;
      const page = {
        publisher,
        after,
        items: list.slice(after, after + limit),
        through: list.length,
      };
      change(page);
      const body = [
        'done/private-read-page/v2',
        2,
        hash(request),
        page.through,
        page.after + page.items.length,
        page.items.map((e) => [hex(e.envelope), hex(e.proof)]),
      ];
      return json([...body, sign(null, json(body), pageKey).toString('hex')]);
    },
  };
  return { io, reads };
}
function needsOf(x: X, heads = x.heads, verified?: ReadonlyMap<string, RetiredCut>) {
  try {
    checkRetainedCheckpointCuts(x.b, heads, undefined, verified);
  } catch (cause) {
    if (cause instanceof RetiredHistoryRequired) return cause.needs;
    throw cause;
  }
  return [];
}
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => 'accepted',
    (e: unknown) =>
      e instanceof InboundError
        ? 'integrity:' + e.reason
        : e instanceof RetiredCutUnverifiable
          ? 'unverifiable'
          : 'other:' + String(e),
  );

it('verifies both cuts against the chain read up to the retained frontiers, then installs', async () => {
  const x = await reducedPastSnapshot();
  try {
    const needs = needsOf(x);
    // Both cuts are below what this device kept, with no retained link: each needs the chain.
    expect(needs.map((n) => [n.credentialId, n.cut.position, n.through.position]).sort()).toEqual(
      [
        [x.self, 1, 2],
        [x.other, 1, 4],
      ].sort(),
    );
    const pre = await replayLocalBaseline(
      x.reduced.baseline,
      x.reduced.anchor,
      { ...x.prefix, records: [] },
      x.c,
      auth,
    );
    // Control: without the read, the install refuses exactly as before (the strand).
    await expect(
      applyHistoryReceiveCuts(structuredClone(pre.inbound), x.c.inbound, pre.census, x.heads),
    ).rejects.toThrow('retired history');
    const { io, reads } = service(x);
    const verified = await verifyRetiredCuts(x.c.inbound, needs, io, lifetime);
    // Only the missing ranges are read: own 2, peer 2..4. Nothing at or above a frontier.
    expect(reads).toEqual(
      expect.arrayContaining([
        { publisher: x.self, after: 1, limit: 1 },
        { publisher: x.other, after: 1, limit: 3 },
      ]),
    );
    expect(reads).toHaveLength(2);
    const retired = checkRetainedCheckpointCuts(x.b, x.heads, undefined, verified);
    const state = structuredClone(pre.inbound);
    await applyHistoryReceiveCuts(state, x.c.inbound, pre.census, x.heads, Infinity, retired);
    // Frontiers never move back; the admitted cuts become this device's checkpoint cuts.
    expect(state.prefix).toEqual(pre.inbound.prefix);
    expect(state.peers!.get(x.other)!.prefix).toEqual(pre.inbound.peers!.get(x.other)!.prefix);
    expect([...state.checkpointCuts!].sort()).toEqual(
      x.heads.map((h) => [h.credentialId, { position: h.position, link: h.link }]).sort(),
    );
    // Evidence for a different cut or a different frontier is not evidence for this one.
    const moved = new Map(
      [...verified].map(([id, v]) => [
        id,
        { ...v, through: { position: v.through.position + 1, link: v.through.link } },
      ]),
    );
    expect(needsOf(x, x.heads, moved)).toHaveLength(2);
  } finally {
    x.f.clear();
  }
}, 60000);

it('full replay, the live verified install and a cold reopen reach the same state', async () => {
  const x = await reducedPastSnapshot();
  try {
    const full = await replayFullLocalHistory(x.all, x.c);
    const pre = await replayLocalBaseline(
      x.reduced.baseline,
      x.reduced.anchor,
      { ...x.prefix, records: [] },
      x.c,
      auth,
    );
    const { io } = service(x);
    const verified = await verifyRetiredCuts(x.c.inbound, needsOf(x), io, lifetime);
    const live = structuredClone(pre.inbound);
    await applyHistoryReceiveCuts(
      live,
      x.c.inbound,
      pre.census,
      x.heads,
      Infinity,
      checkRetainedCheckpointCuts(x.b, x.heads, undefined, verified),
    );
    const installed = await verifyHistoryInstall(x.c.inbound, x.record, undefined, x.c);
    installed.update.fill(0);
    live.installedHistory = installed.installed;
    // Cold reopen: the stored baseline plus the committed installation, with no network at all.
    const cold = await replayLocalBaseline(
      x.reduced.baseline,
      x.reduced.anchor,
      { ...x.all, records: x.f.rows.slice(x.cut) },
      x.c,
      auth,
    );
    expect(view(live)).toEqual(view(full.inbound));
    expect(view(cold.inbound)).toEqual(view(full.inbound));
    // The next reduction folds the installation into a baseline that replays to the same state.
    const next = await rebaseLocalBaseline(
      x.reduced.baseline,
      x.reduced.anchor,
      { ...x.all, records: x.f.rows.slice(x.cut) },
      x.c,
      auth,
    );
    const reopened = await replayLocalBaseline(
      next.baseline,
      next.anchor,
      { ...x.all, records: [] },
      x.c,
      auth,
    );
    expect(view(reopened.inbound).installed).toEqual(view(full.inbound).installed);
    expect(view(reopened.inbound).cuts).toEqual(view(full.inbound).cuts);
    expect(reopened.inbound.peers!.get(x.other)!.prefix).toEqual(
      full.inbound.peers!.get(x.other)!.prefix,
    );
  } finally {
    x.f.clear();
  }
}, 60000);

it('refuses an inconsistent cut as integrity, where skipping the cut would have merged it', async () => {
  const x = await reducedPastSnapshot();
  try {
    const pre = await replayLocalBaseline(
      x.reduced.baseline,
      x.reduced.anchor,
      { ...x.prefix, records: [] },
      x.c,
      auth,
    );
    for (const id of [x.other, x.self]) {
      const forked = x.heads.map((h) =>
        h.credentialId === id ? { ...h, link: 'ee'.repeat(32) } : h,
      );
      const needs = needsOf(x, forked);
      expect(needs.find((n) => n.credentialId === id)!.cut.link).toBe('ee'.repeat(32));
      // Control: applied without evidence, as a skip would, nothing objects to the forked cut.
      const skipped = structuredClone(pre.inbound);
      await applyHistoryReceiveCuts(
        skipped,
        x.c.inbound,
        pre.census,
        forked,
        Infinity,
        'committed',
      );
      expect(skipped.checkpointCuts!.get(id)!.link).toBe('ee'.repeat(32));
      // The read of the real chain does not connect that cut to what this device kept.
      expect(await refusal(verifyRetiredCuts(x.c.inbound, needs, service(x).io, lifetime))).toMatch(
        /^integrity:/,
      );
    }
    // A frontier link that differs from the served chain's end is refused the same way.
    const needs = needsOf(x).map((n) =>
      n.credentialId === x.other ? { ...n, through: { ...n.through, link: 'dd'.repeat(32) } } : n,
    );
    expect(await refusal(verifyRetiredCuts(x.c.inbound, needs, service(x).io, lifetime))).toBe(
      'integrity:prefix',
    );
  } finally {
    x.f.clear();
  }
}, 60000);

it('refuses tampered entries in the verification read; short honest pages still verify', async () => {
  const x = await reducedPastSnapshot();
  try {
    const needs = needsOf(x).filter((n) => n.credentialId === x.other);
    const flip = (b: Uint8Array, at: number) => {
      const copy = b.slice();
      copy[at]! ^= 1;
      return copy;
    };
    const cases: [string, Parameters<typeof service>[1], Parameters<typeof service>[2]?][] = [
      [
        'altered envelope',
        (p) => {
          p.items[1] = { ...p.items[1]!, envelope: flip(p.items[1]!.envelope, 200) };
        },
      ],
      [
        'altered acceptance proof',
        (p) => {
          p.items[0] = { ...p.items[0]!, proof: flip(p.items[0]!.proof, 40) };
        },
      ],
      ['reordered', (p) => void p.items.reverse()],
      [
        'truncated: stream ends before the frontier',
        (p) => {
          p.items = [];
          p.through = p.after;
        },
      ],
      [
        'truncated: last entry dropped but its position claimed',
        (p) => {
          p.items = p.items.slice(0, -1);
          p.after += 1;
        },
      ],
      [
        'from another publisher',
        (p) => {
          p.items = x.streams.get(x.self)!.slice(p.after, p.after + p.items.length);
        },
      ],
      ['page signed by another key', () => {}, x.f.f.keys.existing],
    ];
    const outcomes: Record<string, string> = {};
    for (const [name, change, pageKey] of cases)
      outcomes[name] = await refusal(
        verifyRetiredCuts(x.c.inbound, needs, service(x, change, pageKey).io, lifetime),
      );
    // Each one is an integrity refusal (receive halts as integrity), never a skip or a retry.
    expect(outcomes).toEqual({
      'altered envelope': 'integrity:record',
      'altered acceptance proof': 'integrity:unverified',
      reordered: 'integrity:scope',
      'truncated: stream ends before the frontier': 'integrity:prefix',
      'truncated: last entry dropped but its position claimed': 'integrity:record',
      'from another publisher': 'integrity:scope',
      'page signed by another key': 'integrity:unverified',
    });
    // Control: the same reader with no tampering verifies, including one entry per page.
    expect(await refusal(verifyRetiredCuts(x.c.inbound, needs, service(x).io, lifetime))).toBe(
      'accepted',
    );
    const short = service(x, (p) => void p.items.splice(1));
    expect(await refusal(verifyRetiredCuts(x.c.inbound, needs, short.io, lifetime))).toBe(
      'accepted',
    );
    expect(short.reads.map((r) => r.after)).toEqual([1, 2, 3]);
  } finally {
    x.f.clear();
  }
}, 60000);

it('reports unverifiable when the service holds no answer or the range exceeds the replay bound', async () => {
  const x = await reducedPastSnapshot();
  try {
    const needs = needsOf(x);
    const pruned = service(x);
    pruned.io.read = async () => {
      throw new RetiredCutUnverifiable(); // the owner maps a 409 `unavailable` answer to this
    };
    expect(await refusal(verifyRetiredCuts(x.c.inbound, needs, pruned.io, lifetime))).toBe(
      'unverifiable',
    );
    const far = service(x);
    const wide = needs.map((n, i) =>
      i ? n : { ...n, through: { position: n.cut.position + 4097, link: n.through.link } },
    );
    expect(await refusal(verifyRetiredCuts(x.c.inbound, wide, far.io, lifetime))).toBe(
      'unverifiable',
    );
    expect(far.reads).toHaveLength(0);
    // Control: within the bound the same needs verify.
    expect(await refusal(verifyRetiredCuts(x.c.inbound, needs, service(x).io, lifetime))).toBe(
      'accepted',
    );
  } finally {
    x.f.clear();
  }
}, 60000);

it('only a committed installation older builds cannot replay asks for a fold, and a fold clears it', async () => {
  const x = await reducedPastSnapshot();
  try {
    // Full history: every cut is known, nothing needs folding.
    const full = await replayFullLocalHistory(x.all, x.c);
    expect(full.inbound.foldDue).toBeUndefined();
    // The reduced store before the installation: nothing to fold.
    const pre = await replayLocalBaseline(
      x.reduced.baseline,
      x.reduced.anchor,
      { ...x.prefix, records: [] },
      x.c,
      auth,
    );
    expect(pre.inbound.foldDue).toBeUndefined();
    // Cold reopen with the committed installation in the suffix: a fold is due.
    const cold = await replayLocalBaseline(
      x.reduced.baseline,
      x.reduced.anchor,
      { ...x.all, records: x.f.rows.slice(x.cut) },
      x.c,
      auth,
    );
    expect(cold.inbound.foldDue).toBe(true);
    // The fold: a reduction carries the installation in the baseline; nothing is due after it.
    const next = await rebaseLocalBaseline(
      x.reduced.baseline,
      x.reduced.anchor,
      { ...x.all, records: x.f.rows.slice(x.cut) },
      x.c,
      auth,
    );
    const folded = await replayLocalBaseline(
      next.baseline,
      next.anchor,
      { ...x.all, records: [] },
      x.c,
      auth,
    );
    expect(folded.inbound.foldDue).toBeUndefined();
    // Online, the same flag tells the owner this installation would need a fold.
    const { io } = service(x);
    const verified = await verifyRetiredCuts(x.c.inbound, needsOf(x), io, lifetime);
    const live = structuredClone(pre.inbound);
    await applyHistoryReceiveCuts(
      live,
      x.c.inbound,
      pre.census,
      x.heads,
      Infinity,
      checkRetainedCheckpointCuts(x.b, x.heads, undefined, verified),
    );
    expect(live.foldDue).toBe(true);
    // Control: an installation at cuts this device retains exactly asks for nothing.
    const origin = pre.census.delivery.spool.origin!;
    const exact = x.heads.map((h) =>
      h.credentialId === x.other
        ? { credentialId: h.credentialId, ...pre.inbound.peers!.get(x.other)!.prefix }
        : { credentialId: h.credentialId, position: origin.position, link: origin.link },
    );
    const plain = structuredClone(pre.inbound);
    await applyHistoryReceiveCuts(
      plain,
      x.c.inbound,
      pre.census,
      exact.map(({ credentialId, position, link }) => ({ credentialId, position, link })),
      Infinity,
      checkRetainedCheckpointCuts(x.b, exact),
    );
    expect(plain.foldDue).toBeUndefined();
    // Either kind of retired cut alone asks for it: a peer's, or this device's own.
    for (const id of [x.other, x.self]) {
      const only = exact.map((e) =>
        e.credentialId === id ? x.heads.find((h) => h.credentialId === id)! : e,
      );
      const state = structuredClone(pre.inbound);
      await applyHistoryReceiveCuts(
        state,
        x.c.inbound,
        pre.census,
        only,
        Infinity,
        checkRetainedCheckpointCuts(x.b, only, undefined, verified),
      );
      expect([id, state.foldDue]).toEqual([id, true]);
    }
  } finally {
    x.f.clear();
  }
}, 60000);

it('a snapshot is needed only when it moves a receive cursor forward', async () => {
  const x = await reducedPastSnapshot();
  try {
    const pre = await replayLocalBaseline(
      x.reduced.baseline,
      x.reduced.anchor,
      { ...x.prefix, records: [] },
      x.c,
      auth,
    );
    // Reduced past both cuts: the device is ahead everywhere, so it can skip quietly.
    expect(historyAdvances(pre.inbound, x.c.inbound, x.heads)).toBe(false);
    // Behind on the peer by one position: needed.
    const peer = pre.inbound.peers!.get(x.other)!.prefix;
    expect(
      historyAdvances(pre.inbound, x.c.inbound, [
        ...x.heads.filter((h) => h.credentialId !== x.other),
        { credentialId: x.other, position: peer.position + 1, link: 'ab'.repeat(32) },
      ]),
    ).toBe(true);
    // At the frontier exactly: not needed.
    expect(
      historyAdvances(pre.inbound, x.c.inbound, [
        { credentialId: x.other, position: peer.position, link: peer.link },
      ]),
    ).toBe(false);
  } finally {
    x.f.clear();
  }
}, 60000);
