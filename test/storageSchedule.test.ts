/**
 * The storage models, composed and scheduled (queue item 3b, the `S0-2`/`S0-3`
 * interface; TRD §§6.1/7.4/13.7, `P-3`, `P-1` criterion 11).
 *
 * `test/writeAdmission.test.ts` owns the write-admission orderings and
 * `test/generationApply.test.ts` owns the transition's kill points — and both
 * `S0-9` rounds convicted the *composition*: each suite steps around the
 * other's machine, so a reservation crossing the marker advance (`FU-09`), a
 * kill between a journal refusal and the forced batch's commit (`FU-08`), and
 * a second device under one store key (`P-3` joint 1) were unexpressible
 * rather than refuted. This file puts both machines in **one world** under
 * `test/scheduler.ts`, splits durable from volatile state, and makes those
 * three windows schedules instead of prose.
 *
 * **What the demonstrations assert, and what they do not.** The boundary
 * census proves the four check-to-commit pairs `P-3` falsifier 21 names are
 * expressible — by executing a kill and a second writer inside each window,
 * never by naming steps. The reproductions then drive the *current* models
 * into the states the dispositions describe, and assert those states are
 * reached: **each such assertion states an open defect, not an invariant.**
 * The stage returns invert them — `S0-3` under `P-3` falsifiers 17–18 (the
 * refusal window), the `S0-2`/`S0-3` interface under falsifiers 19–20 (the
 * fence and the retirement composition), `S0-3` under falsifiers 14–15 (the
 * key scope) — and this file is written so each flip is one assertion
 * reversed, with the schedule kept. No `falsifies:` tag appears here on
 * purpose: a reproduction demonstrates a finding, it does not refuse one, and
 * a claim would say the repair exists before it does.
 *
 * Sizes are symbolic exactly as in writeAdmission.test.ts: `MAX_UPDATE` 64 and
 * `BUDGET` 8 keep schedules legible, and `check-update-limit.mjs` owns the
 * real constants' derivation.
 */

import { describe, expect, it } from 'vitest';
import {
  type Boundary,
  type Machine,
  type Point,
  type Step,
  type World,
  type Writer,
  between,
  demonstrateBoundary,
  runSchedule,
  upTo,
} from './scheduler';

const MAX_UPDATE = 64;

type Refusal = 'oversize' | 'quota' | 'unavailable';

interface Durable {
  /** localStorage WAL entries — synchronous, survive a kill. */
  journal: readonly { id: string; chars: number }[];
  journalCapacity: number;
  journalAvailable: boolean;
  /** IndexedDB committed records. */
  records: readonly { id: string; seq: number; gen: number }[];
  seq: { next: number; reserved: Readonly<Record<number, number>> };
  /** The active-generation marker — `GenerationApply` step 5's subject. */
  activeGen: number;
  apply: { step: number; targetGen: number; settled: boolean } | null;
  /** Which generations this device can still open. */
  openers: readonly number[];
  checkpoints: readonly { gen: number }[];
  /**
   * The classification ledger: what step 3 snapshotted per generation. Step 7
   * consumes it as if it were complete — which is exactly the claim `S0-2`'s
   * step 5 makes and nothing enforces, so the ledger is durable state here in
   * order to *exhibit* the record that escaped it.
   */
  ledger: Readonly<Record<number, readonly number[]>>;
}

interface Volatile {
  /** The live document — the authoritative Yjs state, rebuilt on reload. */
  doc: readonly string[];
  /** The batch buffer — updates awaiting the asynchronous IndexedDB commit. */
  pending: readonly { id: string; chars: number }[];
  admission: 'ok' | Refusal | null;
  reservation: { from: number; k: number; gen: number } | null;
  notDurable: Refusal | null;
}

type W = World<Durable, Volatile>;

const storedChars = (bytes: number) => Math.ceil((bytes + 16) / 3) * 4 + 40;

const durable = (over: Partial<Durable> = {}): Durable => ({
  journal: [],
  journalCapacity: 4096,
  journalAvailable: true,
  records: [],
  seq: { next: 1, reserved: {} },
  activeGen: 4,
  apply: null,
  openers: [3, 4],
  checkpoints: [{ gen: 4 }, { gen: 3 }],
  ledger: {},
  ...over,
});

/** The reload path: the document is exactly what durable state can rebuild. */
const recover = (d: Durable): Volatile => ({
  doc: [...d.records.map((r) => r.id), ...d.journal.map((j) => j.id)],
  pending: d.journal.map((j) => ({ id: j.id, chars: j.chars })),
  admission: null,
  reservation: null,
  notDurable: null,
});

const world = (over: Partial<Durable> = {}): W => {
  const d = durable(over);
  return { durable: d, volatile: recover(d), observed: [] };
};

// --- the write path, as atomic steps -------------------------------------------
//
// Step boundaries are real yield points or cross-page interleaving points: a
// kill may land at any of them (process death respects no handler), and a
// second writer is always another page, so it may interleave at any of them
// too. What one page's handler does between two boundaries stays fused.

const editSteps = (id: string, bytes: number): Step<Durable, Volatile>[] => [
  {
    id: 'apply',
    // The authoritative mutation. From here until something durable holds the
    // update, the document is ahead of every carrier.
    run: (w) => ({ ...w, volatile: { ...w.volatile, doc: [...w.volatile.doc, id] } }),
  },
  {
    id: 'admit',
    run: (w) => {
      const used = w.durable.journal.reduce((n, e) => n + e.chars, 0);
      const admission: Volatile['admission'] =
        bytes > MAX_UPDATE
          ? 'oversize'
          : !w.durable.journalAvailable
            ? 'unavailable'
            : used + storedChars(bytes) > w.durable.journalCapacity
              ? 'quota'
              : 'ok';
      return { ...w, volatile: { ...w.volatile, admission } };
    },
  },
];

const sealStep = (id: string, bytes: number): Step<Durable, Volatile> => ({
  id: 'seal',
  // The synchronous journal write, and the acknowledgement it licenses.
  run: (w) => ({
    durable: {
      ...w.durable,
      journal: [...w.durable.journal, { id, chars: storedChars(bytes) }],
    },
    volatile: { ...w.volatile, pending: [...w.volatile.pending, { id, chars: storedChars(bytes) }] },
    observed: [...w.observed, `saved:${id}`],
  }),
});

const refuseStep = (id: string, bytes: number): Step<Durable, Volatile> => ({
  id: 'refuse',
  // The current model's residual rule: mark not-durable, force the batch,
  // withhold the acknowledgement. The forced batch is asynchronous, so the
  // handler returns here with the input held in memory and nowhere else.
  run: (w) => ({
    ...w,
    volatile: {
      ...w.volatile,
      notDurable: w.volatile.admission === 'ok' ? null : (w.volatile.admission as Refusal),
      pending: [...w.volatile.pending, { id, chars: storedChars(bytes) }],
    },
  }),
});

const batchSteps = (ackOnCommit: string | null): Step<Durable, Volatile>[] => [
  {
    id: 'reserve',
    // One readwrite transaction: grant the range, count it against the
    // generation the writer sees *now* — which is the fact FU-09 turns on.
    run: (w) => {
      const k = w.volatile.pending.length;
      const gen = w.durable.activeGen;
      return {
        ...w,
        durable: {
          ...w.durable,
          seq: {
            next: w.durable.seq.next + k,
            reserved: { ...w.durable.seq.reserved, [gen]: (w.durable.seq.reserved[gen] ?? 0) + k },
          },
        },
        volatile: { ...w.volatile, reservation: { from: w.durable.seq.next, k, gen } },
      };
    },
  },
  {
    id: 'commit',
    // The asynchronous IndexedDB transaction: records land under the
    // reservation's generation — the one captured at reserve, not the marker's
    // current value — the journal entries it covered are removed, and the
    // refusal path's acknowledgement arrives here.
    run: (w) => {
      const r = w.volatile.reservation;
      if (r === null) throw new Error('commit without a reservation is not a schedule this model takes');
      const committed = w.volatile.pending.map((p, i) => ({ id: p.id, seq: r.from + i, gen: r.gen }));
      const ids = new Set(committed.map((c) => c.id));
      return {
        durable: {
          ...w.durable,
          records: [...w.durable.records, ...committed],
          journal: w.durable.journal.filter((j) => !ids.has(j.id)),
        },
        volatile: { ...w.volatile, pending: [], reservation: null, notDurable: null },
        observed: ackOnCommit === null ? w.observed : [...w.observed, `saved:${ackOnCommit}`],
      };
    },
  },
];

/** A local edit whose journal write succeeds: the ordinary path. */
const editor = (name: string, id: string, bytes = 8): Writer<Durable, Volatile> => ({
  name,
  steps: [...editSteps(id, bytes), sealStep(id, bytes), ...batchSteps(null)],
});

/** A local edit the journal refuses: `P-3`'s residual path, decomposed. */
const refusedEditor = (name: string, id: string, bytes = 8): Writer<Durable, Volatile> => ({
  name,
  steps: [...editSteps(id, bytes), refuseStep(id, bytes), ...batchSteps(id)],
});

// --- GenerationApply, over the same world --------------------------------------

const mayDrop = (gen: number, checkpoints: readonly { gen: number }[]) =>
  !checkpoints.some((c) => c.gen === gen);

const transition = (): Writer<Durable, Volatile> => ({
  name: 'transition',
  // Resumable by design: each step is driven by the durable apply record, which
  // is the property generationApply.test.ts proves and this writer inherits.
  resumable: true,
  steps: [
    {
      id: 'verify-outcome',
      run: (w) => ({
        ...w,
        durable: {
          ...w.durable,
          apply: { step: 1, targetGen: w.durable.activeGen + 1, settled: false },
        },
      }),
    },
    {
      id: 'install-opener',
      run: (w) => {
        const target = w.durable.apply?.targetGen ?? w.durable.activeGen + 1;
        return {
          ...w,
          durable: {
            ...w.durable,
            openers: w.durable.openers.includes(target) ? w.durable.openers : [...w.durable.openers, target],
            apply: { step: 2, targetGen: target, settled: false },
          },
        };
      },
    },
    {
      id: 'classify',
      // Step 3: snapshot every old-generation object. The ledger entry is what
      // step 7 will consume — and a record committed after this moment is in no
      // snapshot, which is the whole of FU-09's mechanism.
      run: (w) => {
        const g = w.durable.activeGen;
        const target = w.durable.apply?.targetGen ?? g + 1;
        return {
          ...w,
          durable: {
            ...w.durable,
            ledger: {
              ...w.durable.ledger,
              [g]: w.durable.records.filter((r) => r.gen === g).map((r) => r.seq),
            },
            apply: { step: 3, targetGen: target, settled: false },
          },
        };
      },
    },
    {
      id: 'cover',
      run: (w) => ({
        ...w,
        durable: {
          ...w.durable,
          apply: { step: 4, targetGen: w.durable.apply?.targetGen ?? 0, settled: false },
        },
      }),
    },
    {
      id: 'advance-marker',
      // The commit point. S0-2's step-5 claim — "only once no new write can
      // select g" — is asserted by nothing here, faithfully.
      run: (w) => {
        const target = w.durable.apply?.targetGen ?? w.durable.activeGen + 1;
        return {
          ...w,
          durable: { ...w.durable, activeGen: target, apply: { step: 5, targetGen: target, settled: false } },
        };
      },
    },
    {
      id: 'admit-checkpoint',
      run: (w) => {
        const target = w.durable.apply?.targetGen ?? w.durable.activeGen;
        return {
          ...w,
          durable: {
            ...w.durable,
            checkpoints: w.durable.checkpoints.some((c) => c.gen === target)
              ? w.durable.checkpoints
              : [{ gen: target }, ...w.durable.checkpoints].slice(0, 2),
            apply: { step: 6, targetGen: target, settled: false },
          },
        };
      },
    },
    {
      id: 'retire-openers',
      // Step 7 consumes step 3's classification as if it were complete. The
      // predicate here is the shipped model's — retained checkpoints — and the
      // ledger stands beside it so a test can exhibit the record it never saw.
      run: (w) => {
        const target = w.durable.apply?.targetGen ?? w.durable.activeGen;
        return {
          ...w,
          durable: {
            ...w.durable,
            openers: w.durable.openers.filter(
              (gen) => gen === w.durable.activeGen || !mayDrop(gen, w.durable.checkpoints),
            ),
            apply: { step: 7, targetGen: target, settled: false },
          },
        };
      },
    },
    {
      id: 'settle',
      run: (w) => ({
        ...w,
        durable: {
          ...w.durable,
          apply: { step: 8, targetGen: w.durable.apply?.targetGen ?? 0, settled: true },
        },
      }),
    },
  ],
});

const machine = (
  writers: readonly Writer<Durable, Volatile>[],
  over: Partial<Durable> = {},
): Machine<Durable, Volatile> => ({ initial: world(over), recover, writers });

const all = <D, V>(w: Writer<D, V>): Point[] => w.steps.map((s) => ({ step: `${w.name}.${s.id}` }));

// --- the boundary census --------------------------------------------------------

/**
 * P-3 falsifier 21's four check-to-commit pairs, each with the machine that
 * carries it. This table is the census: a model change that fuses a pair fails
 * `demonstrateBoundary` below, not a review.
 */
const CENSUS: { boundary: Boundary; build: () => Machine<Durable, Volatile> }[] = [
  {
    boundary: { name: 'admission to seal', writer: 'editor', check: 'admit', commit: 'seal', secondWriter: 'tab2.seal' },
    build: () => machine([editor('editor', 'e1'), editor('tab2', 't1')]),
  },
  {
    boundary: { name: 'refusal to batch commit', writer: 'editor', check: 'refuse', commit: 'commit', secondWriter: 'tab2.apply' },
    build: () => machine([refusedEditor('editor', 'e1'), refusedEditor('tab2', 't1')], { journalAvailable: false }),
  },
  {
    boundary: { name: 'reserve to record commit', writer: 'editor', check: 'reserve', commit: 'commit', secondWriter: 'transition.advance-marker' },
    build: () => machine([editor('editor', 'e1'), transition()]),
  },
  {
    boundary: { name: 'classification to retirement', writer: 'transition', check: 'classify', commit: 'retire-openers', secondWriter: 'editor.commit' },
    build: () => machine([editor('editor', 'e1'), transition()]),
  },
];

describe('the boundary census — every check-to-commit pair is schedulable', () => {
  for (const c of CENSUS) {
    it(`${c.boundary.name}: a kill and a second writer land inside the window`, () => {
      const { killed, raced } = demonstrateBoundary(c.build(), c.boundary);
      // Execution receipts, not step names: the kill ran inside the window,
      // and the race ran the second writer's step between check and commit.
      expect(killed.ran).toContain('kill');
      expect(killed.ran[killed.ran.length - 2]).toBe(`${c.boundary.writer}.${c.boundary.check}`);
      const checkAt = raced.ran.indexOf(`${c.boundary.writer}.${c.boundary.check}`);
      const secondAt = raced.ran.indexOf(c.boundary.secondWriter);
      const commitAt = raced.ran.indexOf(`${c.boundary.writer}.${c.boundary.commit}`);
      expect(checkAt).toBeGreaterThanOrEqual(0);
      expect(secondAt).toBeGreaterThan(checkAt);
      expect(commitAt).toBeGreaterThan(secondAt);
    });
  }

  it('fails on a boundary a model has fused into one step — the FU-08 shape, refused permanently', () => {
    // The pre-scheduler write-admission model made the refusal path one total
    // synchronous function; rebuilt here, the census check must refuse it with
    // the diagnosis rather than pass around it.
    const fused: Writer<Durable, Volatile> = {
      name: 'editor',
      steps: [
        {
          id: 'edit',
          run: (w) => w,
        },
      ],
    };
    expect(() =>
      demonstrateBoundary(machine([fused, editor('tab2', 't1')]), {
        name: 'refusal to batch commit',
        writer: 'editor',
        check: 'edit',
        commit: 'edit',
        secondWriter: 'tab2.seal',
      }),
    ).toThrow(/no kill point between the check and the commit|FU-08/u);
  });

  it('refuses a schedule that breaks a writer’s program order, and one that resumes a dead page', () => {
    const m = machine([editor('editor', 'e1'), transition()]);
    expect(() => runSchedule(m, [{ step: 'editor.seal' }])).toThrow(/program order/u);
    expect(() => runSchedule(m, [{ kill: true }, { step: 'editor.apply' }])).toThrow(/not resumable/u);
    // The transition is resumable — its steps are driven by the durable apply
    // record — so continuing it across a kill is a schedule the model takes.
    const t = transition();
    const resumed = runSchedule(m, [...upTo(t, 'classify'), { kill: true }, ...between(t, 'classify')]);
    expect(resumed.world.durable.apply).toMatchObject({ step: 8, settled: true });
    expect(resumed.world.durable.activeGen).toBe(5);
  });
});

// --- the three windows, driven to the states the dispositions describe ----------

describe('FU-08 — the refusal window, now a schedulable state', () => {
  const m = () => machine([refusedEditor('editor', 'e1')], { journalAvailable: false });
  const e = refusedEditor('editor', 'e1');

  it('reaches the state the disposition describes: the document ahead of everything durable', () => {
    const beforeKill = runSchedule(m(), upTo(e, 'refuse'));
    // The handler has returned: the mutation is authoritative, the journal
    // refused, the acknowledgement is withheld — and nothing durable holds e1.
    expect(beforeKill.world.volatile.doc).toContain('e1');
    expect(beforeKill.world.volatile.notDurable).toBe('unavailable');
    expect(beforeKill.world.observed).not.toContain('saved:e1');
    expect(beforeKill.world.durable.journal).toHaveLength(0);
    expect(beforeKill.world.durable.records).toHaveLength(0);
  });

  it('loses the integrated update at the kill point — the open defect, stated as reached', () => {
    const killed = runSchedule(m(), [...upTo(e, 'refuse'), { kill: true }]);
    // This assertion states FU-08, not an invariant: the recovered document
    // no longer holds an update the live one had integrated, and no durable
    // carrier can rebuild it. P-3's ratified rule — nothing becomes
    // authoritative without a durable carrier — flips this at the S0-3 return
    // into falsifier 17's permanent negative: no kill point on the refusal
    // path may show a document ahead of what durable state can rebuild.
    expect(killed.world.volatile.doc).not.toContain('e1');
    expect(killed.world.durable.journal).toHaveLength(0);
    expect(killed.world.durable.records).toHaveLength(0);
  });

  it('does not lose the same edit on the ordinary path, which is what makes the window the defect', () => {
    const ok = editor('editor', 'e1');
    const killed = runSchedule(machine([ok]), [...upTo(ok, 'seal'), { kill: true }]);
    // Same kill point, journal available: the WAL holds the update and the
    // reload replays it. The refusal path's loss is the residual rule's,
    // not the scheduler's.
    expect(killed.world.volatile.doc).toContain('e1');
    expect(killed.world.observed).toContain('saved:e1');
  });
});

describe('FU-09 — a reservation crossing the marker advance, now a schedulable interleaving', () => {
  it('commits a late g record after classification closed, and retirement never sees it', () => {
    // Reserve under g=4, let two full transitions run (4 -> 5 -> 6), then let
    // the granted range commit. The record lands under generation 4 — the
    // reservation's, not the marker's — after every classification that will
    // ever look at generation 4 has closed: the first cycle classifies gen 4
    // before the record exists, the second classifies gen 5 only, and the
    // two-retained checkpoint rule ages generation 4's checkpoint out, so
    // step 7 retires its opener with the record outside every ledger entry.
    const e = editor('editor', 'e1');
    const t1 = { ...transition(), name: 'rotate1' };
    const t2 = { ...transition(), name: 'rotate2' };
    const composed = machine([e, t1, t2]);
    const trace = runSchedule(composed, [
      ...upTo(e, 'reserve'),
      ...all(t1),
      ...all(t2),
      ...between(e, 'reserve', 'commit'),
    ]);

    const d = trace.world.durable;
    const lateRecord = d.records.find((r) => r.id === 'e1');
    // The composition falsifier 20 forbids, reached: a record sealed under a
    // generation whose opener is retired, visible to no classification ledger.
    // This states the open defect at the S0-2/S0-3 interface — P-3's ratified
    // fence (the committing transaction validates its generation where the
    // commit lands, and aborts into re-reservation) flips it at the return
    // under falsifiers 19–20.
    expect(lateRecord).toMatchObject({ gen: 4 });
    expect(d.activeGen).toBe(6);
    expect(d.openers).not.toContain(4);
    expect(d.ledger[4] ?? []).not.toContain(lateRecord?.seq);
    // And the abandoned-looking range is still counted against g — the half of
    // falsifier 19 that already holds and must survive the repair.
    expect(d.seq.reserved[4]).toBe(1);
  });
});

describe('P-3 joint 1 — a second device under one store key, now an expressible writer', () => {
  /**
   * Two stores, two SeqCounters, one derived key — because today's derivation
   * binds only the workspace, every device holding K_g derives the identical
   * K_store. Symbolic budget of 8 invocations keeps the arithmetic visible.
   */
  interface TwoStores {
    a: { next: number; reserved: number };
    b: { next: number; reserved: number };
  }
  const BUDGET = 8;
  const reserveOn = (device: 'a' | 'b', k: number): Step<TwoStores, null> => ({
    id: `reserve-${k}`,
    run: (w) => ({
      ...w,
      durable: {
        ...w.durable,
        [device]: { next: w.durable[device].next + k, reserved: w.durable[device].reserved + k },
      },
    }),
  });
  const mustRotateBefore = (reserved: number, k: number) => reserved + k >= BUDGET;

  it('lets every per-store comparison pass while the shared key exceeds its budget', () => {
    const m: Machine<TwoStores, null> = {
      initial: {
        durable: { a: { next: 1, reserved: 0 }, b: { next: 1, reserved: 0 } },
        volatile: null,
        observed: [],
      },
      recover: () => null,
      writers: [
        { name: 'deviceA', steps: [reserveOn('a', 3), reserveOn('a', 2)] },
        { name: 'deviceB', steps: [reserveOn('b', 3), reserveOn('b', 2)] },
      ],
    };
    const trace = runSchedule(m, [
      { step: 'deviceA.reserve-3' },
      { step: 'deviceB.reserve-3' },
      { step: 'deviceA.reserve-2' },
      { step: 'deviceB.reserve-2' },
    ]);
    const { a, b } = trace.world.durable;
    // Each counter, read alone, says no rotation is due — the one comparison
    // §6.1 relies on fires on neither device.
    expect(mustRotateBefore(a.reserved, 1)).toBe(false);
    expect(mustRotateBefore(b.reserved, 1)).toBe(false);
    // And the key's true invocation count is the sum no counter can see. This
    // assertion states the open defect — round 1's "one live construction
    // defect", the class-2 limit case: the second writer is on another device,
    // under the same key, invisible to every local counter. P-3's ratified
    // joint 1 (one key per counter) makes the sum-over-stores term
    // structurally zero at the S0-3 return, under falsifiers 14–15.
    expect(a.reserved + b.reserved).toBeGreaterThanOrEqual(BUDGET);
  });
});
