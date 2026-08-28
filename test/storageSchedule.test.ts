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
 * inverts its own with the schedule kept. All three are now inverted.
 * `FU-09`'s at the `S0-2` return (2026-08-28): the commit step carries
 * `P-3`'s ratified fence, the marker advance finalizes the outgoing ledger
 * atomically, and the reproduction's schedule asserts the permanent negative.
 * `FU-08`'s and `P-3` joint 1's at the `S0-3` return (2026-08-28): the write
 * path stages its input and promotes only under a durable carrier, so the
 * refusal window holds nothing a kill can lose (falsifiers 17–18), and the
 * store derivation binds the store identity, so every key is counted by
 * exactly one counter (falsifiers 14–15) — each on the reproduction's own
 * schedule, with the pre-return worlds held as permanent negatives. No
 * `falsifies:` tag appears here on purpose: a reproduction demonstrates a
 * finding's repair at its return; the finding dispositions stay `S0-10`'s.
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
