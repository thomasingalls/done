// @vitest-environment node
/** Phase 557: a local reduction's plan checks its content rows against the candidate snapshot a
 * batch at a time (one fork, every row applied in turn, one comparison) instead of forking the
 * whole document once per row. These cases count the forks while history grows fourfold, refuse
 * every adversarial row wherever it sits relative to a batch, and compare every verdict with the
 * per-call reference `verifyInboundCoverage`. Real protocol history (memberFixture), real
 * WebCrypto; the adversarial rows are put in at the coverage view's boundary, because the plan's
 * earlier verification refuses most of them before coverage runs. */
import { afterEach, expect, it, vi } from 'vitest';
// Import the plan first: inboundLedger reaches it again through an import cycle, and a plan first
// loaded inside the mock factory below would bind the unmocked module.
import {
  planLocalRetention,
  disposeRetentionPlan,
  type RetentionInventory,
} from '../src/crdt/localRetentionPlan';
import {
  checkInBatches,
  createInboundCoverage,
  inspectInbound,
  verifyInboundCoverage,
} from '../src/crdt/inboundLedger';
import { cryptFor, keys } from './local-baseline/anchor-fixture';
import { task } from './local-baseline/one-shot-fixture';
import { extendSpoolWitness } from '../src/crdt/spoolRecord';
import {
  counterPayload,
  emptySpoolWitness,
  recordStore,
  type ContentCounter,
  type OpenedRecord,
} from '../src/crdt/contentRecord';
import { Y } from '../src/crdt/yjs';
import type { LocalBaselineContext } from '../src/crdt/localBaselineReplay';
import type { Bytes } from '../src/crdt/custodyCrypto';
// @ts-expect-error Shared independent real-protocol JavaScript fixture.
import { memberFixture } from './local-baseline/fixtures.mjs';

const seam = vi.hoisted(() => ({
  /** Whole-document forks and comparisons, counted only while `counting`. */
  counting: false,
  forks: 0,
  compares: 0,
  /** Yjs transactions on those forks after they are made (each computes two whole state vectors). */
  transactions: 0,
  /** Plan-level substitution at the coverage view's boundary; off unless `active`. */
  active: false,
  extra: undefined as Uint8Array | undefined,
  substitute: new Map<number, Uint8Array>(),
  budget: undefined as number | undefined,
  /** What the plan did through the view: holds, the content row at each settle, alone checks. */
  holds: 0,
  settles: [] as number[],
  alone: [] as number[],
  refusedAt: undefined as number | undefined,
  /** Makes classifying a receive-frontier row throw, as a damaged row would. */
  classifyFault: false,
}));
vi.mock('../src/crdt/inboundRecord', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/crdt/inboundRecord')>();
  return {
    ...actual,
    inspectInboundReceipt(...args: Parameters<typeof actual.inspectInboundReceipt>) {
      if (seam.classifyFault) throw Error('injected classification fault');
      return actual.inspectInboundReceipt(...args);
    },
  };
});
vi.mock('../src/crdt/yjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/crdt/yjs')>();
  return {
    ...actual,
    forkDoc(...args: Parameters<typeof actual.forkDoc>) {
      if (!seam.counting) return actual.forkDoc(...args);
      seam.forks++;
      const fork = actual.forkDoc(...args);
      fork.on('afterTransaction', () => {
        if (seam.counting) seam.transactions++;
      });
      return fork;
    },
    sameDocState(...args: Parameters<typeof actual.sameDocState>) {
      if (seam.counting) seam.compares++;
      return actual.sameDocState(...args);
    },
  };
});
vi.mock('../src/crdt/inboundLedger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/crdt/inboundLedger')>();
  return {
    ...actual,
    createInboundCoverage(options?: Parameters<typeof actual.createInboundCoverage>[0]) {
      const coverage = actual.createInboundCoverage(options);
      return {
        ...coverage,
        bind(records: readonly OpenedRecord[]) {
          // Only the plan's view: one candidate snapshot at sequence 0 (replays bind whole rows).
          const plan = records.length === 1 && records[0]!.kind === 'state' && !records[0]!.seq;
          if (!seam.active || !plan) return coverage.bind(records);
          // The candidate snapshot, optionally with extra content merged in; every real row stays
          // covered by it. Content rows are numbered in the order the plan holds them.
          const bound: readonly OpenedRecord[] = seam.extra
            ? [{ ...records[0]!, bytes: Y.mergeUpdates([records[0]!.bytes, seam.extra]) as Bytes }]
            : records;
          const view = coverage.bind(bound);
          const at = new Map<Bytes, number>();
          let index = -1;
          return {
            check(_input: readonly OpenedRecord[], updates: readonly Bytes[]) {
              const row = at.get(updates[0]!)!;
              seam.alone.push(row);
              try {
                view.check(bound, updates);
              } catch (e) {
                seam.refusedAt = row;
                throw e;
              }
            },
            hold(_input: readonly OpenedRecord[], update: Bytes) {
              index++;
              seam.holds++;
              const used = (seam.substitute.get(index) as Bytes | undefined) ?? update;
              at.set(used, index);
              return view.hold(bound, used);
            },
            settle(_input: readonly OpenedRecord[]) {
              seam.settles.push(index);
              return view.settle(bound);
            },
          };
        },
      };
    },
    checkInBatches(...args: Parameters<typeof actual.checkInBatches>) {
      const [view, records, budget, checkpoint] = args;
      return actual.checkInBatches(view, records, seam.budget ?? budget, checkpoint);
    },
  };
});

const clean: (() => void)[] = [];
afterEach(() => {
  clean.splice(0).forEach((f) => f());
  Object.assign(seam, {
    counting: false,
    forks: 0,
    compares: 0,
    transactions: 0,
    active: false,
    extra: undefined,
    substitute: new Map(),
    budget: undefined,
    holds: 0,
    settles: [],
    alone: [],
    refusedAt: undefined,
    classifyFault: false,
  });
});
const COVERAGE = 'Inbound content coverage is missing';

/** A sealed retention inventory over `pairs` own positions and `pairs` received peer receipts. */
const histories = new Map<number, ReturnType<typeof build>>();
const history = (pairs: number) => {
  let built = histories.get(pairs);
  if (!built) histories.set(pairs, (built = build(pairs)));
  return built;
};
async function build(pairs: number) {
  const f = await memberFixture();
  for (let i = 0; i < pairs; i++) {
    await f.appendOwn();
    await f.appendPeer();
  }
  const context: LocalBaselineContext = f.ctx,
    records: OpenedRecord[] = f.rows;
  let witness = emptySpoolWitness();
  for (const e of inspectInbound(records, context.route, context.inbound).delivery.spool.events)
    witness = await extendSpoolWitness(witness, e, crypto.subtle);
  const next = records.at(-1)!.seq + 1;
  const counter: ContentCounter = {
    v: 2,
    spool: witness,
    store_id: context.identity.storeId,
    intent: '04'.repeat(16),
    active_gen: 1,
    next_seq: next,
    reserved: { 1: next - 1 },
    mac: new Uint8Array(32),
  };
  const crypt = cryptFor(context.identity, await keys());
  counter.mac = await crypt.sign(task, counterPayload(context.identity, counter));
  const inventory: RetentionInventory = {
    metadata: [{ key: 'counter', value: counter }],
    rows: [],
  };
  for (const row of records)
    inventory.rows.push({
      key: row.seq,
      store: recordStore(row.kind),
      value: await crypt.seal(
        task,
        { v: 1, seq: row.seq, gen: row.gen, kind: row.kind },
        row.bytes,
      ),
    });
  const auth = {
    sign: (b: Bytes) => crypt.sign(task, b),
    verify: (b: Bytes, m: Bytes) => crypt.verify(task, b, m),
  };
  // Content rows in the order the plan's coverage loop meets them (the content store, by key).
  const content = records.filter((r) => r.kind === 'update').map((r) => r.bytes);
  const doc = new Y.Doc({ gc: false });
  for (const u of content) Y.applyUpdate(doc, u);
  const snapshot = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  const plan = async (progress?: (p: { stage: string; completed?: number }) => void) => {
    const p = await planLocalRetention(
      task,
      structuredClone(inventory),
      context,
      { open: (r) => crypt.open(task, r), verify: auth.verify, auth },
      { lifetime: {}, intent: counter.intent, allowReduced: true },
      undefined,
      progress as never,
    );
    if (p.kind !== 'skipped') clean.push(() => disposeRetentionPlan(p));
    return p;
  };
  return { content, snapshot, plan };
}

/** Constructed Yjs updates, each relative to the document `base` (bytes of a complete state). */
let nextClient = 7_000_000;
function capture(doc: Y.Doc, change: () => void): Uint8Array {
  let update: Uint8Array | undefined;
  const on = (u: Uint8Array) => {
    update = update ? Y.mergeUpdates([update, u]) : u;
  };
  doc.on('update', on);
  try {
    change();
  } finally {
    doc.off('update', on);
  }
  return update!;
}
const docOf = (...updates: Uint8Array[]) => {
  const doc = new Y.Doc({ gc: false });
  doc.clientID = nextClient++;
  for (const u of updates) Y.applyUpdate(doc, u);
  return doc;
};
function adversaries(base: Uint8Array, covered: Uint8Array) {
  const fresh = (text: string, root = 'own') => {
    const d = docOf();
    return capture(d, () => d.getText(root).insert(0, text));
  };
  // Uncovered writing, long enough to be a large row.
  const insert = fresh('uncovered writing '.repeat(4));
  // A child whose origin is in an update the snapshot lacks: alone it sits pending.
  const parent = docOf();
  const dependency = capture(parent, () => parent.getText('dep').insert(0, 'dependency'));
  const childDoc = docOf(dependency);
  const child = capture(childDoc, () => childDoc.getText('dep').insert(10, ' child'));
  // A deletion of content the snapshot holds undeleted, with no insertion.
  const holder = docOf(base);
  const deletion = capture(holder, () => holder.getText('peer').delete(0, 1));
  // A deletion of content the snapshot never had: alone it sits as pending deletions.
  const insertDoc = docOf(insert);
  const undo = capture(insertDoc, () => insertDoc.getText('own').delete(0, 4));
  // Covered and uncovered parts in one update.
  const partial = Y.mergeUpdates([covered, fresh('partly new')]);
  // A known item re-sent with an origin inside a surrogate pair: applying it splits the pair, which
  // replaces both halves. `extra` holds the pair and the item as first written.
  const emojiDoc = docOf();
  const emoji = capture(emojiDoc, () => emojiDoc.getText('emoji').insert(0, 'a\u{1F600}b'));
  const writer = nextClient++;
  const atEnd = docOf(emoji);
  atEnd.clientID = writer;
  const first = capture(atEnd, () => atEnd.getText('emoji').insert(4, 'X'));
  const inPair = docOf(emoji);
  inPair.clientID = writer;
  const split = capture(inPair, () => inPair.getText('emoji').insert(2, 'X'));
  const extra = Y.mergeUpdates([emoji, first]);
  const malformed = new Uint8Array([0xff, 0xff, 0xff]);
  return { insert, dependency, child, deletion, undo, partial, split, extra, malformed };
}

/** Each case: the adversarial rows in the order they are placed, at offsets from a position. */
const NAMES = [
  'an uncovered insertion',
  'a missing dependency left pending',
  'two uncovered rows, the later supplying the earlier one’s dependency',
  'a deletion-only row',
  'a row covered only in part',
  'the same uncovered row twice',
  'an uncovered insertion followed by a row deleting it',
  'a known item re-sent with an origin inside a surrogate pair',
  'an uncovered row followed by a malformed one',
] as const;
const CASES = (a: ReturnType<typeof adversaries>) =>
  ({
    'an uncovered insertion': [[0, a.insert]],
    'a missing dependency left pending': [[0, a.child]],
    'two uncovered rows, the later supplying the earlier one’s dependency': [
      [0, a.child],
      [1, a.dependency],
    ],
    'a deletion-only row': [[0, a.deletion]],
    'a row covered only in part': [[0, a.partial]],
    'the same uncovered row twice': [
      [0, a.insert],
      [1, a.insert.slice()],
    ],
    'an uncovered insertion followed by a row deleting it': [
      [0, a.insert],
      [1, a.undo],
    ],
    'a known item re-sent with an origin inside a surrogate pair': [[0, a.split]],
    'an uncovered row followed by a malformed one': [
      [0, a.insert],
      [1, a.malformed],
    ],
  }) satisfies Record<(typeof NAMES)[number], [number, Uint8Array][]> as Record<
    string,
    [number, Uint8Array][]
  >;

/** The reference: each update checked alone with a fresh view, stopping at the first refusal. */
function reference(base: Uint8Array, updates: readonly Uint8Array[]) {
  const records: OpenedRecord[] = [{ seq: 0, kind: 'state', gen: 1, bytes: base as Bytes }];
  for (let i = 0; i < updates.length; i++)
    try {
      verifyInboundCoverage(records, [updates[i]! as Bytes]);
    } catch (e) {
      return { refusedAt: i, message: (e as Error).message };
    }
  return { refusedAt: undefined, message: undefined };
}
/** The batched pass, exactly as the plan drives it, with the alone checks recorded. */
async function batched(base: Uint8Array, updates: readonly Uint8Array[], budget: number) {
  const records: OpenedRecord[] = [{ seq: 0, kind: 'state', gen: 1, bytes: base as Bytes }];
  const coverage = createInboundCoverage(),
    view = coverage.bind(records);
  const index = new Map<Uint8Array, number>(updates.map((u, i) => [u, i]));
  const alone: number[] = [];
  let pauses = 0,
    settles = 0;
  const recording = {
    ...view,
    check(input: readonly OpenedRecord[], us: readonly Bytes[]) {
      alone.push(index.get(us[0]!)!);
      view.check(input, us);
    },
    settle(input: readonly OpenedRecord[]) {
      settles++;
      return view.settle(input);
    },
  };
  const pass = checkInBatches(recording, records, budget, () => {
    pauses++;
    return undefined;
  });
  try {
    for (const u of updates) {
      const settling = pass.add(u as Bytes);
      if (settling) await settling;
    }
    await pass.finish();
    return { refusedAt: undefined, message: undefined, alone, pauses, settles };
  } catch (e) {
    return { refusedAt: alone.at(-1), message: (e as Error).message, alone, pauses, settles };
  } finally {
    coverage.clear();
  }
}

it('a reduction makes about a constant number of whole-document forks and comparisons while history grows fourfold', async () => {
  const counts = [];
  for (const pairs of [24, 96]) {
    const h = await history(pairs);
    seam.forks = seam.compares = seam.transactions = 0;
    const p = await h.plan((progress) => {
      if (progress.stage !== 'coverage') return;
      // From the first coverage report to the bare one after the row loop.
      seam.counting = progress.completed !== undefined;
    });
    expect(p.kind).toBe('local-retention-dry-run');
    counts.push({
      pairs,
      rows: h.content.length,
      forks: seam.forks,
      compares: seam.compares,
      transactions: seam.transactions,
    });
  }
  const [small, large] = counts as [(typeof counts)[0], (typeof counts)[0]];
  expect(large.rows).toBe(4 * small.rows);
  // One fork per row would be 48 and 192 here.
  expect(small.forks).toBeGreaterThan(0);
  expect(large.forks).toBeLessThanOrEqual(small.forks + 1);
  expect(large.compares).toBeLessThanOrEqual(small.compares + 1);
  expect(large.forks).toBeLessThan(large.rows / 16);
  // Rows are applied a group at a time in one transaction: one per row would be 48 and 192.
  expect(large.transactions).toBeGreaterThan(0);
  expect(large.transactions).toBeLessThanOrEqual(large.rows / 16);
});

const POSITIONS = ['first', 'in the middle', 'last', 'closing a batch', 'opening a batch'] as const;
it.each(NAMES)(
  'a plan holding %s is refused at that row, first, in the middle, last and on each side of a batch boundary',
  async (name) => {
    const h = await history(12);
    const a = adversaries(h.snapshot, h.content[3]!);
    const rows = CASES(a)[name]!;
    const n = h.content.length,
      span = Math.max(...rows.map(([offset]) => offset));
    // Rows 0..boundary make the first batch: the budget is exactly their bytes as held.
    const boundary = Math.floor(n / 2);
    for (const where of POSITIONS) {
      const start = {
        first: 0,
        'in the middle': Math.floor(boundary / 2),
        last: n - 1 - span,
        'closing a batch': boundary - span,
        'opening a batch': boundary + 1,
      }[where];
      seam.active = true;
      seam.extra = a.extra;
      seam.substitute = new Map(rows.map(([offset, bytes]) => [start + offset, bytes]));
      seam.holds = 0;
      seam.settles = [];
      seam.alone = [];
      seam.refusedAt = undefined;
      const held = h.content.map((u, i) => seam.substitute.get(i) ?? u);
      seam.budget = held.slice(0, boundary + 1).reduce((s, u) => s + u.length, 0);
      const expected = reference(Y.mergeUpdates([h.snapshot, a.extra]), held);
      expect(expected.refusedAt, `${name}, ${where}: the reference refuses`).toBe(start);
      await expect(h.plan(), `${name}, ${where}`).rejects.toThrow(expected.message);
      expect(seam.refusedAt, `${name}, ${where}: refused row`).toBe(start);
      // Raised when the batch holding the row settled: every earlier batch closed before the row,
      // and no row after that batch's last was held.
      const closed = seam.settles.at(-1)!,
        earlier = seam.settles.slice(0, -1);
      expect(closed, `${name}, ${where}: batch end`).toBeGreaterThanOrEqual(start);
      expect(
        earlier.every((s) => s < start),
        `${name}, ${where}: earlier batches`,
      ).toBe(true);
      expect(seam.holds - 1, `${name}, ${where}: rows held`).toBe(closed);
      // The first batch closes at its budget, not at the end of the pass (an unreadable row
      // closes its batch at once).
      if (start <= boundary && !rows.some(([, b]) => b === a.malformed))
        expect(closed, `${name}, ${where}: first batch end`).toBe(boundary);
      // Rows checked alone before the refusal come from the same batch, before the row, and passed.
      const opened = earlier.at(-1) ?? -1;
      expect(
        seam.alone.slice(0, -1).every((r) => r > opened && r < start),
        `${name}, ${where}: rows checked alone`,
      ).toBe(true);
    }
  },
);

it('content rows settle before any other row is classified, so an uncovered last row refuses before a later damaged row', async () => {
  const h = await history(12);
  const a = adversaries(h.snapshot, h.content[3]!);
  seam.active = true;
  seam.substitute = new Map([[h.content.length - 1, a.insert]]);
  // One batch: every content row is still unproven when the loop reaches the other rows. Settled
  // there, the batch fails and the last row refuses alone before any receipt is classified.
  seam.budget = Infinity;
  const plan = h.plan((p) => {
    if (p.stage === 'coverage') seam.classifyFault = p.completed !== undefined;
  });
  await expect(plan).rejects.toThrow(COVERAGE);
  expect(seam.refusedAt).toBe(h.content.length - 1);
  // The fault itself is live: with every content row covered, it is what the plan meets.
  seam.substitute = new Map();
  await expect(
    h.plan((p) => {
      if (p.stage === 'coverage') seam.classifyFault = p.completed !== undefined;
    }),
  ).rejects.toThrow('injected classification fault');
});

it('every verdict and refusal matches the per-call reference over constructed histories, batch sizes and placements', async () => {
  const h = await history(12);
  const a = adversaries(h.snapshot, h.content[3]!);
  const base = Y.mergeUpdates([h.snapshot, a.extra]);
  // Honest rows, the snapshot's own bytes, a deletion already applied, and duplicates of each.
  const holder = docOf(base);
  const deleted = capture(holder, () => holder.getText('peer').delete(0, 2));
  const afterDelete = Y.encodeStateAsUpdate(holder);
  const covered = [...h.content.slice(0, 8), base, h.content[2]!.slice()];
  const bases: [string, Uint8Array, Uint8Array[]][] = [
    ['the candidate', base, covered],
    ['after a deletion', afterDelete, [...covered.slice(0, 6), deleted, deleted.slice()]],
    // A view whose own state sits pending: nothing is batched, every row is checked alone.
    ['a pending view', Y.mergeUpdates([base, a.child]), [...covered.slice(0, 4), a.child]],
  ];
  let compared = 0;
  for (const [label, state, honest] of bases)
    for (const rows of [[], ...Object.values(CASES(a))])
      for (let at = 0; at <= honest.length; at += 3) {
        const updates = [...honest];
        for (const [offset, bytes] of rows) updates.splice(at + offset, 0, bytes);
        const total = updates.reduce((s, u) => s + u.length, 0);
        const expected = reference(state, updates);
        for (const budget of [1, Math.ceil(total / 3), Infinity]) {
          const got = await batched(state, updates, budget);
          expect(
            { refusedAt: got.refusedAt, message: got.message },
            `${label}, rows at ${at}, budget ${budget}`,
          ).toEqual(expected);
          compared++;
        }
      }
  // Across group boundaries: 192 honest rows, so one batch holds several groups of 64.
  const big = await history(96);
  const extra = Y.mergeUpdates([big.snapshot, a.extra]);
  for (const rows of [[], ...Object.values(CASES(a))])
    for (const at of [62, 63, 64, 127, 128]) {
      const updates: Uint8Array[] = [...big.content];
      for (const [offset, bytes] of rows) updates.splice(at + offset, 0, bytes);
      const expected = reference(extra, updates);
      const got = await batched(extra, updates, Infinity);
      expect({ refusedAt: got.refusedAt, message: got.message }, `96 pairs, rows at ${at}`).toEqual(
        expected,
      );
      compared++;
    }
  expect(compared).toBeGreaterThan(300);
});

it('a batch that is not proven is checked again one row at a time, yielding before each', async () => {
  const h = await history(12);
  const a = adversaries(h.snapshot, h.content[3]!);
  const updates = [...h.content.slice(0, 9), a.insert, ...h.content.slice(9, 12)];
  const got = await batched(h.snapshot, updates, Infinity);
  expect(got.message).toBe(COVERAGE);
  expect(got.refusedAt).toBe(9);
  // One batch; nine rows passed alone before the tenth refused, each after a yield.
  expect(got.settles).toBe(1);
  expect(got.alone).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect(got.pauses).toBe(10);
  // An honest pass is proven by its batches alone.
  const honest = await batched(h.snapshot, h.content, Math.ceil(h.snapshot.length / 2));
  expect(honest.message).toBeUndefined();
  expect(honest.alone).toEqual([]);
  expect(honest.pauses).toBe(0);
  // A view whose own state sits pending never proves a batch: every row is checked alone.
  const pending = await batched(Y.mergeUpdates([h.snapshot, a.child]), h.content, Infinity);
  expect(pending.message).toBeUndefined();
  expect(pending.alone).toEqual(h.content.map((_, i) => i));
  // One settle per row, each closing at once, and the empty one at the end of the pass.
  expect(pending.settles).toBe(h.content.length + 1);
});
