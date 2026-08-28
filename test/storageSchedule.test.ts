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
 * never by naming steps. The reproductions then drive the models into the
 * states the dispositions describe: **an assertion that such a state is
 * reached states an open defect, not an invariant**, and each stage return
 * inverts its own with the schedule kept. All four are now inverted.
 * `FU-09`'s at the `S0-2` return (2026-08-28): the commit step carries
 * `P-3`'s ratified fence, the marker advance finalizes the outgoing ledger
 * atomically, and the reproduction's schedule asserts the permanent negative.
 * `FU-08`'s and `P-3` joint 1's at the `S0-3` return (2026-08-28): the write
 * path stages its input and promotes only under a durable carrier, so the
 * refusal window holds nothing a kill can lose (falsifiers 17–18), and the
 * store derivation binds the store identity, so every key is counted by
 * exactly one counter (falsifiers 14–15) — each on the reproduction's own
 * schedule, with the pre-return worlds held as permanent negatives. And
 * `FU-10`'s at the `S0-4` return (2026-08-28): §7.4's `PositionCounter` — the
 * class's last member, a different counter with a different owner — stages
 * the spool row in the grant's own transaction, so the crash between
 * reservation and spool insertion leaves an identity the model's own recovery
 * rule occupies, with the counter-only world kept as the detected negative.
 * No `falsifies:` tag appears here on purpose: a reproduction demonstrates a
 * finding's repair at its return; the finding dispositions stay `S0-10`'s.
 * And `FU-11`'s at the `S0-5` return (2026-08-28): checkpoint install is a
 * machine — a durable install record whose content commit and head activation
 * are two steps with a real window between them — where before the return it
 * was one array prepend nothing could kill inside (`ST-06`), so partial
 * install, content-before-head rollback and the second-newest fallback are
 * schedules here rather than opener arithmetic.
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
  type Trace,
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
   * The classification ledger: what step 3 snapshotted per generation, and
   * what step 5 finalizes in the same atomic transaction that advances the
   * marker (the S0-2 return). Step 7 consumes it as complete — true by
   * construction now, because the fence lets no record commit under a
   * generation the marker has left.
   */
  ledger: Readonly<Record<number, readonly number[]>>;
}

interface Volatile {
  /** The live document — the authoritative Yjs state, rebuilt on reload. */
  doc: readonly string[];
  /**
   * The update produced against staged state, awaiting admission — not yet in
   * the document (`P-3`'s ratified carrier rule, the `S0-3` return).
   */
  staged: { id: string; chars: number } | null;
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
  staged: null,
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
    id: 'stage',
    // The input runs against staged state and produces the update bytes; the
    // authoritative document is untouched until a durable carrier holds them
    // (P-3's ratified rule, the S0-3 return). Before the return this step was
    // `apply` — the authoritative mutation, ahead of every carrier.
    run: (w) => ({
      ...w,
      volatile: { ...w.volatile, staged: { id, chars: storedChars(bytes) } },
    }),
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
  // The synchronous journal write — the durable carrier — with the promotion
  // and the acknowledgement it licenses, in one handler. Fusing them is
  // crash-equivalent: killed after the setItem, the reload replays the journal
  // into the document, which is the same observable world.
  run: (w) => ({
    durable: {
      ...w.durable,
      journal: [...w.durable.journal, { id, chars: storedChars(bytes) }],
    },
    volatile: {
      ...w.volatile,
      staged: null,
      doc: [...w.volatile.doc, id],
      pending: [...w.volatile.pending, { id, chars: storedChars(bytes) }],
    },
    observed: [...w.observed, `saved:${id}`],
  }),
});

const refuseStep = (id: string, bytes: number): Step<Durable, Volatile> => ({
  id: 'refuse',
  // P-3's ratified residual rule (the S0-3 return): the mark is set — and
  // read, by the forced flush and §7.10's surface — the staged input is held
  // as pending, the document is NOT mutated and nothing is acknowledged. The
  // handler returns here with the document equal to recoverable state; the
  // forced batch's commit below is the carrier the promotion and the
  // acknowledgement wait for.
  run: (w) => ({
    ...w,
    volatile: {
      ...w.volatile,
      notDurable: w.volatile.admission === 'ok' ? null : (w.volatile.admission as Refusal),
      staged: null,
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
    // The asynchronous IndexedDB transaction — with the fence (P-3 joint 3,
    // ratified 2026-08-28; the S0-2 return): the committing transaction reads
    // the active marker under the same serialization the allocator leans on,
    // and when the marker moved past the reservation's generation it aborts
    // into re-reservation — the abandoned range stays counted against its
    // generation, and the pending updates wait for the retry transaction
    // below. When the marker did not move, records land under the
    // reservation's generation, the journal entries they covered are removed,
    // and the refusal path's acknowledgement arrives here.
    run: (w) => {
      const r = w.volatile.reservation;
      if (r === null) throw new Error('commit without a reservation is not a schedule this model takes');
      if (r.gen !== w.durable.activeGen) {
        return { ...w, volatile: { ...w.volatile, reservation: null } };
      }
      const committed = w.volatile.pending.map((p, i) => ({ id: p.id, seq: r.from + i, gen: r.gen }));
      const ids = new Set(committed.map((c) => c.id));
      return {
        durable: {
          ...w.durable,
          records: [...w.durable.records, ...committed],
          journal: w.durable.journal.filter((j) => !ids.has(j.id)),
        },
        volatile: {
          ...w.volatile,
          pending: [],
          reservation: null,
          notDurable: null,
          // The promotion the refusal path waited for: a pending update the
          // document does not yet hold appears now, carried.
          doc: [
            ...w.volatile.doc,
            ...committed.map((c) => c.id).filter((id) => !w.volatile.doc.includes(id)),
          ],
        },
        observed: ackOnCommit === null ? w.observed : [...w.observed, `saved:${ackOnCommit}`],
      };
    },
  },
  {
    id: 're-reserve',
    // The retry the fence's abort licenses: a fresh reservation transaction
    // under the marker the abort observed. A separate step on purpose — the
    // window between the abort and this transaction is real, and a second
    // marker advance inside it is a schedule this model can take, refused
    // again by the same fence at re-commit.
    run: (w) => {
      if (w.volatile.pending.length === 0 || w.volatile.reservation !== null) return w;
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
    id: 're-commit',
    // The retried commit, under the same fence. A no-op when the first commit
    // already landed the batch.
    run: (w) => {
      const r = w.volatile.reservation;
      if (r === null || w.volatile.pending.length === 0) return w;
      if (r.gen !== w.durable.activeGen) {
        return { ...w, volatile: { ...w.volatile, reservation: null } };
      }
      const committed = w.volatile.pending.map((p, i) => ({ id: p.id, seq: r.from + i, gen: r.gen }));
      const ids = new Set(committed.map((c) => c.id));
      return {
        durable: {
          ...w.durable,
          records: [...w.durable.records, ...committed],
          journal: w.durable.journal.filter((j) => !ids.has(j.id)),
        },
        volatile: {
          ...w.volatile,
          pending: [],
          reservation: null,
          notDurable: null,
          doc: [
            ...w.volatile.doc,
            ...committed.map((c) => c.id).filter((id) => !w.volatile.doc.includes(id)),
          ],
        },
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
      // step 7 will consume; a record can still commit under g between here
      // and step 5 — legitimately, the marker has not moved — which is why
      // step 5 finalizes the ledger atomically with the advance.
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
      // The commit point — and, since the S0-2 return, the moment step 3's
      // classification is complete: the marker and the records share one
      // serialization domain (the fence reads the marker in the committing
      // record transaction), so no g record can commit after this step, and
      // the same atomic transaction finalizes g's ledger over everything that
      // did. "Only once no new write can select g" is construction now, not a
      // claim the suites step around.
      run: (w) => {
        const g = w.durable.activeGen;
        const target = w.durable.apply?.targetGen ?? g + 1;
        return {
          ...w,
          durable: {
            ...w.durable,
            activeGen: target,
            ledger: {
              ...w.durable.ledger,
              [g]: w.durable.records.filter((r) => r.gen === g).map((r) => r.seq),
            },
            apply: { step: 5, targetGen: target, settled: false },
          },
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
      // Step 7 consumes the classification step 5 finalized — complete by the
      // fence's construction. The predicate here is the shipped model's —
      // retained checkpoints — and the invariant the inversion asserts is
      // that no record's generation loses its opener while outside the ledger.
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
    boundary: { name: 'refusal to batch commit', writer: 'editor', check: 'refuse', commit: 'commit', secondWriter: 'tab2.stage' },
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
    expect(() => runSchedule(m, [{ kill: true }, { step: 'editor.stage' }])).toThrow(/not resumable/u);
    // The transition is resumable — its steps are driven by the durable apply
    // record — so continuing it across a kill is a schedule the model takes.
    const t = transition();
    const resumed = runSchedule(m, [...upTo(t, 'classify'), { kill: true }, ...between(t, 'classify')]);
    expect(resumed.world.durable.apply).toMatchObject({ step: 8, settled: true });
    expect(resumed.world.durable.activeGen).toBe(5);
  });
});

// --- the three windows, driven to the states the dispositions describe ----------

describe('FU-08 — the refusal window, inverted at the S0-3 return', () => {
  /**
   * The schedules are the reproduction's, kept exactly (P-3's charter: each
   * flip is one assertion reversed, with the schedule kept). Before the
   * return, `apply` mutated the authoritative document ahead of every carrier,
   * so the kill at the refuse boundary lost an update the person had watched
   * appear. Under the ratified rule — nothing becomes authoritative without a
   * durable carrier — the input is staged, the document waits for the forced
   * batch's commit, and the same kill unshows nothing because nothing was
   * shown. Falsifiers 17–18.
   */
  const m = () => machine([refusedEditor('editor', 'e1')], { journalAvailable: false });
  const e = refusedEditor('editor', 'e1');

  it('returns from the refusal with the document equal to recoverable state, the mark readable', () => {
    const beforeKill = runSchedule(m(), upTo(e, 'refuse'));
    const v = beforeKill.world.volatile;
    // The handler has returned: the mark is set — read here, which is what
    // write-only state cannot be — the acknowledgement is withheld, the input
    // is held as pending, and the document does NOT hold e1, because nothing
    // durable does. The disposition's state — "the document has the change
    // and nothing durable does" — is unreachable, not merely survived.
    expect(v.notDurable).toBe('unavailable');
    expect(v.doc).not.toContain('e1');
    expect(v.pending.map((p) => p.id)).toContain('e1');
    expect(beforeKill.world.observed).not.toContain('saved:e1');
    expect(beforeKill.world.durable.journal).toHaveLength(0);
  });

  it('loses nothing at the reproduction’s kill point — the schedule kept, the assertion reversed', () => {
    const killed = runSchedule(m(), [...upTo(e, 'refuse'), { kill: true }]);
    // The permanent negative on the exact schedule that used to reach the
    // defect: the person was shown nothing, so the crash unshows nothing —
    // and no reload shows a document ahead of what durable state rebuilds,
    // because the live document was never ahead.
    expect(killed.world.observed).not.toContain('saved:e1');
    expect(killed.world.volatile.doc).not.toContain('e1');
    expect(killed.world.durable.records).toHaveLength(0);
  });

  it('shows no document ahead of durable state at any point on the refusal path — falsifier 17', () => {
    const full = all(e);
    for (let cut = 1; cut <= full.length; cut++) {
      const live = runSchedule(m(), full.slice(0, cut));
      const carried = new Set([
        ...live.world.durable.records.map((r) => r.id),
        ...live.world.durable.journal.map((j) => j.id),
      ]);
      // The ratified rule, asserted at every step boundary: the live document
      // holds nothing a durable carrier does not…
      for (const id of live.world.volatile.doc) expect(carried.has(id)).toBe(true);
      // …and neither does anything the person has been shown (the observed
      // log survives a kill on purpose).
      for (const o of live.world.observed.filter((x) => x.startsWith('saved:')))
        expect(carried.has(o.slice('saved:'.length))).toBe(true);
      // And the kill at this boundary rebuilds exactly the carried state.
      const killed = runSchedule(m(), [...full.slice(0, cut), { kill: true }]);
      for (const id of killed.world.volatile.doc) expect(carried.has(id)).toBe(true);
    }
  });

  it('promotes and acknowledges the refused edit exactly at the forced batch’s commit — falsifier 18', () => {
    const mid = runSchedule(m(), upTo(e, 'reserve'));
    expect(mid.world.observed).not.toContain('saved:e1');
    const done = runSchedule(m(), upTo(e, 'commit'));
    // The commit is the carrier: the record lands, the promotion and the
    // acknowledgement arrive here and not before, and the mark clears — the
    // refusal state is read at both ends of its life.
    expect(done.world.durable.records.map((r) => r.id)).toContain('e1');
    expect(done.world.volatile.doc).toContain('e1');
    expect(done.world.observed).toContain('saved:e1');
    expect(done.world.volatile.notDurable).toBeNull();
  });

  it('does not delay the same edit on the ordinary path, where the journal is the carrier', () => {
    const ok = editor('editor', 'e1');
    const killed = runSchedule(machine([ok]), [...upTo(ok, 'seal'), { kill: true }]);
    // Same kill point, journal available: the WAL holds the update, the
    // acknowledgement rode the synchronous write, and the reload replays it.
    // The refusal path's deferral is the residual rule's, not the scheduler's.
    expect(killed.world.volatile.doc).toContain('e1');
    expect(killed.world.observed).toContain('saved:e1');
  });
});

describe('FU-09 — the fence: a reservation cannot outlive its generation (inverted at the S0-2 return)', () => {
  /**
   * The schedule is the reproduction's, kept exactly (P-3's charter: each flip
   * is one assertion reversed, with the schedule kept): reserve under g=4, let
   * two full transitions run (4 -> 5 -> 6), then let the granted range try to
   * commit. Before the return the record landed under generation 4 — after
   * every classification that would ever look at generation 4 had closed, with
   * its opener retired — the composition P-3 falsifier 20 forbids. Under the
   * ratified fence the commit validates its generation where the commit lands
   * and aborts into re-reservation under the successor. Falsifiers 19–20
   * finish at the S0-3 return, where the write-admission machine consolidates.
   */
  it('aborts the late commit into re-reservation under the successor, and no ledger is escaped', () => {
    const e = editor('editor', 'e1');
    const t1 = { ...transition(), name: 'rotate1' };
    const t2 = { ...transition(), name: 'rotate2' };
    const composed = machine([e, t1, t2]);
    const trace = runSchedule(composed, [
      ...upTo(e, 'reserve'),
      ...all(t1),
      ...all(t2),
      ...between(e, 'reserve'),
    ]);

    const d = trace.world.durable;
    const record = d.records.find((r) => r.id === 'e1');
    // The permanent negative: the update lands under the marker's current
    // generation, never under the one the reservation crossed out of.
    expect(record).toMatchObject({ gen: 6 });
    expect(d.records.filter((r) => r.gen === 4)).toHaveLength(0);
    expect(d.activeGen).toBe(6);
    expect(d.openers).not.toContain(4);
    // No record's generation lost its opener while outside its finalized
    // ledger — the composition falsifier 20 forbids, now unreachable on the
    // reproduction's own schedule.
    for (const r of d.records) {
      if (!d.openers.includes(r.gen)) {
        expect(d.ledger[r.gen] ?? []).toContain(r.seq);
      }
    }
    // And the abandoned range stays counted against g — the half of
    // falsifier 19 that already held and survives the repair, composing with
    // falsifier 8's never-reused gap.
    expect(d.seq.reserved[4]).toBe(1);
    expect(d.seq.reserved[6]).toBe(1);
  });

  it('commits normally when the marker did not move, so the fence costs the ordinary path nothing', () => {
    const e = editor('editor', 'e1');
    const only = machine([e]);
    const trace = runSchedule(only, [...upTo(e, 'commit')]);
    expect(trace.world.durable.records.find((r) => r.id === 'e1')).toMatchObject({ gen: 4 });
    expect(trace.world.durable.seq.reserved[4]).toBe(1);
  });

  it('a record that legitimately commits between classify and the advance is inside the finalized ledger', () => {
    // The window the fence deliberately leaves open: the marker has not moved,
    // so a commit under g is correct — and step 5's atomic re-finalization is
    // what keeps step 7's view complete for exactly this case.
    const e = editor('editor', 'e1');
    const t = transition();
    const composed = machine([e, t]);
    const trace = runSchedule(composed, [
      ...upTo(t, 'classify'),
      ...upTo(e, 'commit'),
      ...between(t, 'classify'),
    ]);
    const d = trace.world.durable;
    const record = d.records.find((r) => r.id === 'e1');
    expect(record).toMatchObject({ gen: 4 });
    expect(d.ledger[4]).toContain(record?.seq);
  });
});

describe('P-3 joint 1 — one key per counter, inverted at the S0-3 return', () => {
  /**
   * The schedule is the reproduction's, kept exactly: several devices, each
   * with its own SeqCounter, reserving toward the budget's edge under one
   * `K_g`. Before the return the derivation bound only the workspace, so every
   * store derived the identical `K_store` and the key's true invocation count
   * was the sum no counter could see — round 1's "one live construction
   * defect". Under the ratified rule the `info` binds the store identity
   * (row 3 §§3–4, the `wrong-store-subkey` vector): **one key per counter**,
   * so the sum over devices is a sum over distinct keys and falsifier 15's
   * sum-over-stores term is structurally zero for every device count.
   * Symbolic budget of 8 invocations keeps the arithmetic visible.
   */
  type Stores = Record<string, { next: number; reserved: number }>;
  const BUDGET = 8;
  /** The ratified derivation, symbolically: the info binds (K_g, workspace, store_id). */
  const deriveKey = (kg: string, workspace: string, storeId: string) =>
    `K(${kg},${workspace},${storeId})`;
  /** The pre-return derivation — the mutation that must fail (falsifier 14). */
  const storeBlindKey = (kg: string, workspace: string) => `K(${kg},${workspace})`;

  const DEVICES = ['a', 'b', 'c'];
  const counterOf = (durable: Stores, device: string) => {
    const c = durable[device];
    if (c === undefined) throw new Error(`no counter for device ${device}`);
    return c;
  };
  const reserveOn = (device: string, k: number): Step<Stores, null> => ({
    id: `reserve-${k}`,
    run: (w) => {
      const cur = counterOf(w.durable, device);
      return {
        ...w,
        durable: { ...w.durable, [device]: { next: cur.next + k, reserved: cur.reserved + k } },
      };
    },
  });
  const mustRotateBefore = (reserved: number, k: number) => reserved + k >= BUDGET;

  /** The reproduction's schedule, generalized to D writers at the budget's edge. */
  const atTheEdge = (): Trace<Stores, null> => {
    const m: Machine<Stores, null> = {
      initial: {
        durable: Object.fromEntries(DEVICES.map((d) => [d, { next: 1, reserved: 0 }])),
        volatile: null,
        observed: [],
      },
      recover: () => null,
      writers: DEVICES.map((d) => ({
        name: `device-${d}`,
        steps: [reserveOn(d, 3), reserveOn(d, 2)],
      })),
    };
    return runSchedule(m, [
      ...DEVICES.map((d) => ({ step: `device-${d}.reserve-3` })),
      ...DEVICES.map((d) => ({ step: `device-${d}.reserve-2` })),
    ]);
  };

  it('derives a distinct key for every store holding one K_g — falsifier 14', () => {
    // Two stores never derive one K_store: the info binds the store identity.
    const keys = DEVICES.map((d) => deriveKey('Kg', 'ws', `st_${d}`));
    expect(new Set(keys).size).toBe(DEVICES.length);
    // And the pre-return derivation is exactly the collision the info term
    // removes — the identical key on every device, which is the mutation the
    // wrong-store-subkey vector holds as a published negative.
    const blind = DEVICES.map(() => storeBlindKey('Kg', 'ws'));
    expect(new Set(blind).size).toBe(1);
  });

  it('counts every invocation of each key with exactly one counter, no key over budget — falsifier 15', () => {
    const trace = atTheEdge();
    // Under the ratified derivation, each key's invocation count IS its own
    // counter's reserved — one key per counter — and at the budget's edge no
    // key exceeds it while every comparison still has authority over its key.
    const byKey = new Map<string, number>();
    for (const d of DEVICES) {
      const key = deriveKey('Kg', 'ws', `st_${d}`);
      byKey.set(key, (byKey.get(key) ?? 0) + counterOf(trace.world.durable, d).reserved);
    }
    expect(byKey.size).toBe(DEVICES.length);
    for (const d of DEVICES) {
      const own = counterOf(trace.world.durable, d).reserved;
      expect(byKey.get(deriveKey('Kg', 'ws', `st_${d}`))).toBe(own);
      expect(own).toBeLessThan(BUDGET);
      expect(mustRotateBefore(own, 1)).toBe(false);
    }
    // The permanent negative, on the same schedule: a store-blind derivation
    // puts every store's reservations under ONE key, whose true count is the
    // sum — over budget while every per-store comparison stays quiet. The
    // world the ratified rule refuses is detected, not assumed away.
    const shared = new Map<string, number>();
    for (const d of DEVICES) {
      const key = storeBlindKey('Kg', 'ws');
      shared.set(key, (shared.get(key) ?? 0) + counterOf(trace.world.durable, d).reserved);
    }
    const sharedCount = shared.get(storeBlindKey('Kg', 'ws')) ?? 0;
    expect(sharedCount).toBeGreaterThanOrEqual(BUDGET);
    for (const d of DEVICES)
      expect(mustRotateBefore(counterOf(trace.world.durable, d).reserved, 1)).toBe(false);
  });
});

describe('FU-10 — the abandoned position, inverted at the S0-4 return', () => {
  /**
   * §7.4's `PositionCounter` and the outbound spool in one world — NOT §6.1's
   * `seq` (S0-4 A-schemas §0: two numbers share a name and nothing else). The
   * disposition's schedule is: reserve, die before spool insertion. Before the
   * return `Reserve` moved the counter and nothing else, so recovery saw a
   * counted position with no durable identity — ST-05's exact state: no
   * reservation row or digest is durable, `Refuse` needs the digest of an
   * envelope that was never minted, and the chain cannot advance under the
   * no-skip rule without a recovery algorithm outside the selected records.
   * Under the ratified shape the grant and the row are one atomic step — one
   * IndexedDB readwrite transaction across the counter and the spool — and
   * the model's own recovery rule occupies what it finds.
   */

  interface Row {
    position: number;
    gen: number;
    state: 'reserved' | 'minted' | 'sent';
    digest: string | null;
  }
  interface PosDurable {
    counter: { next: number; reserved: Readonly<Record<number, number>> };
    spool: readonly Row[];
    activeGen: number;
  }
  interface PosVolatile {
    /** Each page's in-flight job — the granted position, then the unminted bytes. */
    jobs: Readonly<Record<string, { position: number; bytes?: string }>>;
  }

  const posWorld = (): World<PosDurable, PosVolatile> => ({
    durable: { counter: { next: 1, reserved: {} }, spool: [], activeGen: 4 },
    volatile: { jobs: {} },
    observed: [],
  });
  /** The reload path: in-flight jobs died with the page; the spool is the truth. */
  const posRecover = (): PosVolatile => ({ jobs: {} });

  /**
   * The outbound path. `staged: false` is the pre-return shape — the counter
   * moves alone, and the spool learns of the position only at the promote —
   * kept so the detected negative stays executable. `staged: true` is the
   * ratified shape: the grant and the row commit together.
   */
  const outbound = (name: string, staged: boolean): Writer<PosDurable, PosVolatile> => ({
    name,
    steps: [
      {
        id: 'reserve',
        run: (w) => {
          const position = w.durable.counter.next;
          const gen = w.durable.activeGen;
          return {
            ...w,
            durable: {
              ...w.durable,
              counter: {
                next: position + 1,
                reserved: {
                  ...w.durable.counter.reserved,
                  [gen]: (w.durable.counter.reserved[gen] ?? 0) + 1,
                },
              },
              spool: staged
                ? [...w.durable.spool, { position, gen, state: 'reserved' as const, digest: null }]
                : w.durable.spool,
            },
            volatile: { jobs: { ...w.volatile.jobs, [name]: { position } } },
          };
        },
      },
      {
        id: 'mint',
        run: (w) => {
          const job = w.volatile.jobs[name];
          if (job === undefined) throw new Error(`${name}.mint without a reservation in memory`);
          return {
            ...w,
            volatile: {
              jobs: { ...w.volatile.jobs, [name]: { ...job, bytes: `${name}@${job.position}` } },
            },
          };
        },
      },
      {
        id: 'promote',
        run: (w) => {
          const job = w.volatile.jobs[name];
          if (job?.bytes === undefined) throw new Error(`${name}.promote without minted bytes`);
          const bytes = job.bytes;
          return {
            ...w,
            durable: {
              ...w.durable,
              spool: staged
                ? w.durable.spool.map((r) =>
                    r.position === job.position && r.state === 'reserved'
                      ? { ...r, state: 'minted' as const, digest: bytes }
                      : r,
                  )
                : [
                    ...w.durable.spool,
                    {
                      position: job.position,
                      gen: w.durable.activeGen,
                      state: 'minted' as const,
                      digest: bytes,
                    },
                  ],
            },
          };
        },
      },
      {
        id: 'send',
        run: (w) => {
          const job = w.volatile.jobs[name];
          if (job === undefined) throw new Error(`${name}.send without a job`);
          return {
            ...w,
            durable: {
              ...w.durable,
              spool: w.durable.spool.map((r) =>
                r.position === job.position && r.state === 'minted'
                  ? { ...r, state: 'sent' as const }
                  : r,
              ),
            },
          };
        },
      },
    ],
  });

  /**
   * The model's own recovery rule (S0-4 A-schemas §2), resumable because every
   * step reads durable state alone: each `reserved` row is occupied by a fresh
   * first attempt at its own position — the row is durable proof nothing was
   * ever sent — sealing under the current generation and counting the fresh
   * licence there when the marker moved, with the abandoned licence kept.
   */
  const recovery = (): Writer<PosDurable, PosVolatile> => ({
    name: 'recovery',
    resumable: true,
    steps: [
      {
        id: 'occupy',
        run: (w) => {
          let reserved = w.durable.counter.reserved;
          const gen = w.durable.activeGen;
          const spool = w.durable.spool.map((r) => {
            if (r.state !== 'reserved') return r;
            if (r.gen !== gen) reserved = { ...reserved, [gen]: (reserved[gen] ?? 0) + 1 };
            return { ...r, gen, state: 'minted' as const, digest: `recovery@${r.position}` };
          });
          return {
            ...w,
            durable: { ...w.durable, spool, counter: { ...w.durable.counter, reserved } },
          };
        },
      },
    ],
  });

  const rotatePos = (): Writer<PosDurable, PosVolatile> => ({
    name: 'rotate',
    steps: [
      {
        id: 'advance',
        run: (w) => ({ ...w, durable: { ...w.durable, activeGen: w.durable.activeGen + 1 } }),
      },
    ],
  });

  const posMachine = (
    writers: readonly Writer<PosDurable, PosVolatile>[],
  ): Machine<PosDurable, PosVolatile> => ({
    initial: posWorld(),
    recover: posRecover,
    writers,
  });

  /** Every counted position is identified by exactly one spool row. */
  const identified = (d: PosDurable) => {
    for (let p = 1; p < d.counter.next; p++) {
      expect(d.spool.filter((r) => r.position === p)).toHaveLength(1);
    }
  };

  it('detects the pre-return world: a counted position no durable state can occupy or close', () => {
    const m = posMachine([outbound('tab', false), recovery()]);
    const t = runSchedule(m, [{ step: 'tab.reserve' }, { kill: true }, { step: 'recovery.occupy' }]);
    const d = t.world.durable;
    const granted = d.counter.next - 1;
    // The licence was counted — and nothing identifies what it was for. The
    // recovery rule ran and changed nothing, because there is no row to read:
    // ST-05's state, reached and kept as the detected negative. The position
    // can be neither occupied (what bytes? which reservation?) nor closed
    // (Refuse needs the digest of an envelope that was never minted), and the
    // chain stalls at it under the no-skip rule.
    expect(d.counter.reserved[4]).toBe(1);
    expect(d.spool.find((r) => r.position === granted)).toBeUndefined();
  });

  it('leaves no unresolvable position at any kill point — the schedule kept, the assertion reversed', () => {
    const w = outbound('tab', true);
    const full = all(w);
    for (let cut = 1; cut <= full.length; cut++) {
      // Before the kill: at every step boundary, every counted position is
      // already identified — the grant and the row are one atomic step, so
      // the disposition's window between them is unreachable, not survived.
      const live = runSchedule(posMachine([outbound('tab', true)]), full.slice(0, cut));
      identified(live.world.durable);
      const before = live.world.durable.spool.find((r) => r.digest !== null)?.digest ?? null;

      // The kill at this boundary, then the recovery rule: nothing stays
      // `reserved`, every position is identified, and a row that already held
      // bytes holds the same bytes — recovery re-mints only what was never
      // minted, because a minted row's rule is resubmit.
      const killed = runSchedule(posMachine([outbound('tab', true), recovery()]), [
        ...full.slice(0, cut),
        { kill: true },
        { step: 'recovery.occupy' },
      ]);
      const d = killed.world.durable;
      identified(d);
      expect(d.spool.some((r) => r.state === 'reserved')).toBe(false);
      if (before !== null) {
        expect(d.spool.find((r) => r.digest === before)?.digest).toBe(before);
      }
    }
  });

  it('recovers across a generation advance: the fresh licence is counted where the mint seals', () => {
    const m = posMachine([outbound('tab', true), rotatePos(), recovery()]);
    const t = runSchedule(m, [
      { step: 'tab.reserve' },
      { step: 'rotate.advance' },
      { kill: true },
      { step: 'recovery.occupy' },
    ]);
    const d = t.world.durable;
    // FU-09's rule at this counter: the abandoned licence stays counted under
    // the generation that granted it, the fresh mint seals under the marker's
    // current generation and is counted there, and the row says which.
    expect(d.counter.reserved[4]).toBe(1);
    expect(d.counter.reserved[5]).toBe(1);
    expect(d.spool.find((r) => r.position === 1)).toMatchObject({ gen: 5, state: 'minted' });
  });

  it('gives two tabs distinct identified positions, and recovery resolves both', () => {
    const m = posMachine([outbound('tabA', true), outbound('tabB', true), recovery()]);
    const t = runSchedule(m, [
      { step: 'tabA.reserve' },
      { step: 'tabB.reserve' },
      { kill: true },
      { step: 'recovery.occupy' },
    ]);
    const d = t.world.durable;
    identified(d);
    expect(d.spool.map((r) => r.position)).toEqual([1, 2]);
    expect(d.spool.every((r) => r.state === 'minted' && r.digest !== null)).toBe(true);
  });
});

describe('FU-11 — the staged install: activation is one commit, and the fallback actually installs (the S0-5 return)', () => {
  /**
   * §7.6's checkpoint tuple, installed as a machine (`S0-5` A-schemas §4). The
   * pre-return world was `generationApply` step 6's single array prepend —
   * content installation, head activation, semantic admission and retention
   * fused into one step, so `ST-06`'s windows were unexpressible rather than
   * refuted, and the second-newest check proved opener-set arithmetic. Under
   * the ratified shape a durable install record drives two commits:
   * `commit-content` writes the tuple's content into its durable slot —
   * visible to nothing — and `activate` flips the live pair (content root and
   * head baseline) together, or rolls the stage back when the window's second
   * writer made the tuple ineligible. Trim reads the ACTIVE pair, so a tuple
   * nobody admitted licenses no trim, and pre-admission envelopes survive
   * every schedule.
   */

  interface CpTuple {
    gen: number;
    /** Ciphertext present and digest-verified at the store, or lost. */
    bytes: string | null;
    /** A verified `SemanticAdmission` is durable beside the tuple. */
    admitted: boolean;
  }
  interface CpDurable {
    /** The store's retained tuples, newest first. */
    tuples: readonly CpTuple[];
    openers: readonly number[];
    /** Durable content slots `commit-content` wrote — installed, not live. */
    content: Readonly<Record<number, string>>;
    /** The durable install record a fresh page resumes from. */
    install: { gen: number } | null;
    /** The live pair a reader consumes. They move together or not at all. */
    activeContent: string | null;
    activeHeads: number | null;
    /** Pre-checkpoint envelopes trimmed below this generation. */
    trimmedBelow: number | null;
  }

  const cpWorld = (over: Partial<CpDurable> = {}): World<CpDurable, null> => ({
    durable: {
      tuples: [
        { gen: 4, bytes: 'cp@4', admitted: true },
        { gen: 3, bytes: 'cp@3', admitted: true },
      ],
      openers: [3, 4],
      content: { 3: 'content@3' },
      install: null,
      activeContent: 'content@3',
      activeHeads: 3,
      trimmedBelow: null,
      ...over,
    },
    volatile: null,
    observed: [],
  });

  /** The pick: the newest tuple whose bytes, admission and opener all survive. */
  const newestComplete = (d: CpDurable): number | null =>
    d.tuples.find((t) => t.bytes !== null && t.admitted && d.openers.includes(t.gen))?.gen ?? null;

  const tupleOf = (d: CpDurable, gen: number) => d.tuples.find((t) => t.gen === gen);

  /**
   * The installer, resumable because both steps read the durable install
   * record. `choose` is the restore rule — `newestComplete` exercises the
   * fallback; a constant exercises one tuple's window.
   */
  const installer = (
    name: string,
    choose: (d: CpDurable) => number | null,
  ): Writer<CpDurable, null> => ({
    name,
    resumable: true,
    steps: [
      {
        id: 'commit-content',
        // The check-and-stage: bytes, admission and opener are read, the pick
        // is recorded durably, and the content commits into its slot. Nothing
        // becomes live here — a reader still sees the prior pair.
        run: (w) => {
          const gen = w.durable.install?.gen ?? choose(w.durable);
          if (gen === null || gen === w.durable.activeHeads) return w;
          const t = tupleOf(w.durable, gen);
          if (t?.bytes == null || !t.admitted || !w.durable.openers.includes(gen)) return w;
          return {
            ...w,
            durable: {
              ...w.durable,
              content: { ...w.durable.content, [gen]: `content@${gen}` },
              install: { gen },
            },
          };
        },
      },
      {
        id: 'activate',
        // The one commit that makes anything live: the content root and the
        // head baseline flip together, or not at all. It re-verifies against
        // durable state, because a second writer can land inside the window —
        // and when the tuple became ineligible there, it rolls the stage back
        // rather than serving a mixture.
        run: (w) => {
          const r = w.durable.install;
          if (r === null) return w;
          const t = tupleOf(w.durable, r.gen);
          const c = w.durable.content[r.gen];
          if (t?.bytes == null || !t.admitted || c === undefined) {
            const content = { ...w.durable.content };
            delete content[r.gen];
            return { ...w, durable: { ...w.durable, content, install: null } };
          }
          return {
            ...w,
            durable: { ...w.durable, activeContent: c, activeHeads: r.gen, install: null },
            observed: [...w.observed, `installed:${r.gen}`],
          };
        },
      },
    ],
  });

  /**
   * Trim, as its own writer so a schedule can attempt it anywhere: it reads
   * the ACTIVE pair, and only an admitted active tuple licenses it — which is
   * where "signed before any pre-checkpoint envelope may be trimmed" becomes a
   * gate that executes rather than an obligation (P-8 requirement 7).
   */
  const trimmer = (): Writer<CpDurable, null> => ({
    name: 'trimmer',
    resumable: true,
    steps: [
      {
        id: 'trim',
        run: (w) => {
          const g = w.durable.activeHeads;
          if (g === null) return w;
          const t = tupleOf(w.durable, g);
          if (t === undefined || !t.admitted) return w;
          return { ...w, durable: { ...w.durable, trimmedBelow: g } };
        },
      },
    ],
  });

  /** §11.3 test 8's event as a writer: the store loses the newest tuple's bytes. */
  const lose = (gen: number): Writer<CpDurable, null> => ({
    name: 'lose',
    steps: [
      {
        id: 'drop-bytes',
        run: (w) => ({
          ...w,
          durable: {
            ...w.durable,
            tuples: w.durable.tuples.map((t) => (t.gen === gen ? { ...t, bytes: null } : t)),
          },
        }),
      },
    ],
  });

  const cpMachine = (
    writers: readonly Writer<CpDurable, null>[],
    over: Partial<CpDurable> = {},
  ): Machine<CpDurable, null> => ({ initial: cpWorld(over), recover: () => null, writers });

  /** The live pair references one tuple, and its content is durably present. */
  const pairConsistent = (d: CpDurable) => {
    if (d.activeHeads === null) {
      expect(d.activeContent).toBeNull();
      return;
    }
    expect(d.activeContent).toBe(d.content[d.activeHeads]);
  };

  it('the install window is schedulable: a kill and a second writer land between the content commit and the activation', () => {
    const { killed, raced } = demonstrateBoundary(
      cpMachine([installer('install', newestComplete), lose(4)]),
      {
        name: 'content commit to activation',
        writer: 'install',
        check: 'commit-content',
        commit: 'activate',
        secondWriter: 'lose.drop-bytes',
      },
    );
    expect(killed.ran).toContain('kill');
    // Killed inside the window: content committed, nothing live moved.
    expect(killed.world.durable.install).toEqual({ gen: 4 });
    expect(killed.world.durable.activeHeads).toBe(3);
    // Raced: the loss landed inside the window, and the activation rolled the
    // stage back rather than serving content whose tuple is gone — the
    // content-before-head rollback, executed.
    expect(raced.world.durable.activeHeads).toBe(3);
    expect(raced.world.durable.activeContent).toBe('content@3');
    expect(raced.world.durable.install).toBeNull();
    expect(raced.world.durable.content[4]).toBeUndefined();
  });

  it('refuses the pre-return installer, which fused content, heads, admission and retention into one step', () => {
    // generationApply step 6's array prepend, rebuilt as a writer: the census
    // check must refuse it with the FU-08 diagnosis rather than pass around
    // it — the window ST-06 could only describe is not allowed to disappear.
    const fused: Writer<CpDurable, null> = {
      name: 'install',
      steps: [
        {
          id: 'admit-checkpoint',
          run: (w) => ({
            ...w,
            durable: {
              ...w.durable,
              content: { ...w.durable.content, 4: 'content@4' },
              activeContent: 'content@4',
              activeHeads: 4,
              trimmedBelow: 4,
            },
          }),
        },
      ],
    };
    expect(() =>
      demonstrateBoundary(cpMachine([fused, lose(4)]), {
        name: 'content commit to activation',
        writer: 'install',
        check: 'admit-checkpoint',
        commit: 'admit-checkpoint',
        secondWriter: 'lose.drop-bytes',
      }),
    ).toThrow(/no kill point between the check and the commit|FU-08/u);
  });

  it('activates neither content nor heads at any kill point before the activation — P-8 requirement 12', () => {
    const w = installer('install', newestComplete);
    const full = all(w);
    for (let cut = 1; cut <= full.length; cut++) {
      const live = runSchedule(cpMachine([installer('install', newestComplete)]), full.slice(0, cut));
      const killed = runSchedule(cpMachine([installer('install', newestComplete)]), [
        ...full.slice(0, cut),
        { kill: true },
      ]);
      for (const trace of [live, killed]) {
        const d = trace.world.durable;
        pairConsistent(d);
        if (trace.ran.includes('install.activate')) {
          expect(d.activeContent).toBe('content@4');
          expect(d.activeHeads).toBe(4);
        } else {
          // The partial install: content may be durably staged, and the live
          // pair is the prior tuple's — neither content nor heads.
          expect(d.activeContent).toBe('content@3');
          expect(d.activeHeads).toBe(3);
          expect(trace.world.observed).not.toContain('installed:4');
        }
      }
    }
  });

  it('resumes across the window from the durable record, and the pair flips together', () => {
    const w = installer('install', newestComplete);
    const t = runSchedule(cpMachine([installer('install', newestComplete)]), [
      ...upTo(w, 'commit-content'),
      { kill: true },
      ...between(w, 'commit-content'),
    ]);
    const d = t.world.durable;
    expect(d.activeContent).toBe('content@4');
    expect(d.activeHeads).toBe(4);
    expect(d.install).toBeNull();
    pairConsistent(d);
  });

  for (const [why, over] of [
    ['its admission is missing', { tuples: [{ gen: 5, bytes: 'cp@5', admitted: false }, { gen: 4, bytes: 'cp@4', admitted: true }, { gen: 3, bytes: 'cp@3', admitted: true }], openers: [3, 4, 5] }],
    ['its bytes are lost', { tuples: [{ gen: 5, bytes: null, admitted: true }, { gen: 4, bytes: 'cp@4', admitted: true }, { gen: 3, bytes: 'cp@3', admitted: true }], openers: [3, 4, 5] }],
    ['its opener is gone', { tuples: [{ gen: 5, bytes: 'cp@5', admitted: true }, { gen: 4, bytes: 'cp@4', admitted: true }, { gen: 3, bytes: 'cp@3', admitted: true }], openers: [3, 4] }],
  ] as const) {
    it(`falls back to the second-newest and actually installs it when the newest ${why}`, () => {
      const restore = installer('restore', newestComplete);
      const t = runSchedule(cpMachine([installer('restore', newestComplete)], over), all(restore));
      const d = t.world.durable;
      // The fallback is an install, not arithmetic: the older complete tuple's
      // content and heads are live, through the same two commits, and the
      // receipt shows the machine ran them.
      expect(d.activeContent).toBe('content@4');
      expect(d.activeHeads).toBe(4);
      expect(t.world.observed).toContain('installed:4');
      expect(t.ran).toEqual(['restore.commit-content', 'restore.activate']);
      pairConsistent(d);
    });
  }

  it('refuses to stage an incomplete tuple even when told to install it by name', () => {
    // The pick guards the fallback; this guards the direct path: bytes that do
    // not exist cannot commit, so an incomplete tuple stages nothing. The
    // assertion sits AT the stage boundary on purpose — the activation's
    // rollback would scrub the same state by the end of the schedule, and a
    // stage guard whose only witness is the final state is not a guard.
    const lost = {
      tuples: [
        { gen: 5, bytes: null, admitted: true },
        { gen: 4, bytes: 'cp@4', admitted: true },
        { gen: 3, bytes: 'cp@3', admitted: true },
      ],
      openers: [3, 4, 5],
    };
    const named = installer('install', () => 5);
    const staged = runSchedule(cpMachine([installer('install', () => 5)], lost), upTo(named, 'commit-content'));
    // No record and no slot exist for content the machine cannot materialise.
    expect(staged.world.durable.install).toBeNull();
    expect(staged.world.durable.content[5]).toBeUndefined();
    const t = runSchedule(cpMachine([installer('install', () => 5)], lost), all(named));
    expect(t.world.durable.install).toBeNull();
    expect(t.world.durable.content[5]).toBeUndefined();
    expect(t.world.durable.activeHeads).toBe(3);
  });

  it('never trims under a tuple nobody admitted, wherever the trim is scheduled — P-8 requirement 7', () => {
    const unadmitted = {
      tuples: [
        { gen: 5, bytes: 'cp@5', admitted: false },
        { gen: 4, bytes: 'cp@4', admitted: true },
        { gen: 3, bytes: 'cp@3', admitted: true },
      ],
      openers: [3, 4, 5],
    };
    const restore = installer('restore', newestComplete);
    // Trim attempted before anything installs: the active tuple (gen 3) is
    // admitted, so envelopes below IT may go — and nothing at or above the
    // unadmitted tuple's coverage does, because trim reads the active pair.
    const early = runSchedule(cpMachine([installer('restore', newestComplete), trimmer()], unadmitted), [
      { step: 'trimmer.trim' },
    ]);
    expect(early.world.durable.trimmedBelow).toBe(3);
    // The whole restore, then trim: the fallback tuple activated, and trim
    // follows it to 4 — never to 5, which nobody admitted.
    const after = runSchedule(cpMachine([installer('restore', newestComplete), trimmer()], unadmitted), [
      ...all(restore),
      { step: 'trimmer.trim' },
    ]);
    expect(after.world.durable.trimmedBelow).toBe(4);
    expect(after.world.durable.activeHeads).toBe(4);
  });
});
