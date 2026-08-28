/**
 * `GenerationApply`, as an executable model (TRD §13.7, §15 row 15).
 *
 * **This tests a construction, not shipped code, and the distinction matters.**
 * The transition worker does not exist: `S0-2` selected this machine and Stage 4
 * builds it. What can be checked now is whether the selected step order and its
 * invariants actually hold under a kill at every point — and that is worth
 * checking now, because the alternative is discovering the ordering is wrong
 * after an implementation has been written against it.
 *
 * **Why this is a test and not a vector.** Every other falsifier in `S0-2`
 * Stage D is a property of bytes, and bytes go in `test/vectors/`. This one is a
 * property of a *sequence*: that a crash between any two steps resumes without
 * losing work. There is nothing to publish as a value, so it lives here.
 *
 * Row 15 already named `applying` in its local order. What it did not do was
 * make it durable, so a kill inside it was unrecoverable — the finding is
 * `f-4259822-generation-switch-local-durability-undefined`. The eight steps
 * below are that state made into a record.
 *
 * **What this does not test.** It says nothing about whether IndexedDB, the
 * journal or the relay behave as modelled; those are Stage 1 and Stage 4
 * integration concerns (`L-1`, `L-2`). It models the *decisions* the worker
 * makes, and it is only as good as that model — which is why each invariant is
 * written as the sentence it comes from rather than as a bare assertion.
 */

import { describe, expect, it } from 'vitest';

/** The eight ordered steps. 5 is the commit point; 1–4 are reversible. */
const STEPS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
type Step = (typeof STEPS)[number];

const COMMIT_POINT = 5;

interface World {
  activeGen: number;
  /** Which generations this device can still open. */
  openers: Set<number>;
  /** Old-generation work that must survive the transition. */
  journal: readonly string[];
  batch: readonly string[];
  /** Exact bytes awaiting an authenticated resolution (§7.4). */
  outbound: readonly string[];
  /**
   * The durable record.
   *
   * **`settled` is not decoration, and writing this model without it is how I
   * found that out.** With the record simply deleted at step 8, `null` meant
   * both *never started* and *finished*, so a restart after a completed
   * transition could not tell them apart and began a second one — advancing a
   * generation nobody asked to advance. The record is settled first and cleaned
   * afterwards, which is what `A-schemas.md`'s `settled_at` is for.
   */
  apply: { step: Step; targetGen: number; settled: boolean } | null;
  checkpoints: readonly { gen: number }[];
  coveredUnder: number | null;
}

const initial = (): World => ({
  activeGen: 4,
  openers: new Set([3, 4]),
  journal: ['j1', 'j2'],
  batch: ['b1'],
  outbound: ['e41'],
  apply: null,
  checkpoints: [{ gen: 4 }, { gen: 3 }],
  coveredUnder: null,
});

/** §13.7's predicate: openers retire only when nothing retained needs them. */
const mayDropGeneration = (gen: number, checkpoints: readonly { gen: number }[]) =>
  !checkpoints.some((c) => c.gen === gen);

/**
 * One step, as a pure transition. Each is idempotent: applying it to a world
 * that has already passed it returns that world unchanged.
 */
const applyStep = (w: World, step: Step): World => {
  if (w.apply?.settled === true) return w;
  const targetGen = w.apply?.targetGen ?? w.activeGen + 1;
  const rec = (s: Step, settled = false) => ({ step: s, targetGen, settled });
  switch (step) {
    case 1:
      return { ...w, apply: rec(1) };
    case 2:
      return { ...w, openers: new Set([...w.openers, targetGen]), apply: rec(2) };
    case 3:
      return { ...w, apply: rec(3) };
    case 4:
      return { ...w, coveredUnder: targetGen, apply: rec(4) };
    case 5:
      return { ...w, activeGen: targetGen, apply: rec(5) };
    case 6:
      // Idempotent by construction: admitting a checkpoint that is already the
      // newest is a no-op, not a second entry. Prepending unconditionally would
      // evict the second-newest on a replay -- destroying the fallback while
      // resuming the transition that was supposed to preserve it.
      //
      // The prepend models the RECORD's granularity -- step 6 is one recorded
      // state -- and not the install itself: since the S0-5 return (FU-11),
      // installing a checkpoint tuple is its own machine with its own durable
      // record, whose content commit and head activation are separate steps
      // with kill points between them. test/storageSchedule.test.ts schedules
      // that machine; S0-5 A-schemas §4 states it. A kill inside step 6
      // resumes through BOTH records.
      return {
        ...w,
        checkpoints: w.checkpoints.some((c) => c.gen === targetGen)
          ? w.checkpoints
          : [{ gen: targetGen }, ...w.checkpoints].slice(0, 2),
        apply: rec(6),
      };
    case 7: {
      // Decide first, then delete: mutating the set being iterated is legal and
      // is exactly the kind of clever that a retirement predicate should not be.
      const retirable = [...w.openers].filter(
        (gen) => gen !== w.activeGen && mayDropGeneration(gen, w.checkpoints),
      );
      const openers = new Set(w.openers);
      for (const gen of retirable) openers.delete(gen);
      return { ...w, openers, apply: rec(7) };
    }
    case 8:
      return { ...w, apply: rec(8, true) };
  }
};

/** Run from wherever the durable record says we are, to settled. */
const resume = (w: World): World => {
  if (w.apply?.settled === true) return w; // finished, not "never started"
  let next = w;
  const from = (w.apply?.step ?? 0) + 1;
  for (const step of STEPS) if (step >= from) next = applyStep(next, step);
  return next;
};

/** Run steps 1..k and stop, as a kill at k would leave it. */
const killAfter = (k: Step): World => {
  let w = initial();
  for (const step of STEPS) {
    if (step > k) break;
    w = applyStep(w, step);
  }
  return w;
};

/** Steps 1–4 are reversible: discard the record and nothing moved. */
const rollback = (_w: World): World => initial();

// falsifies: f-4259822-generation-switch-local-durability-undefined
describe('GenerationApply — a kill at every step', () => {
  it('settles to the same state from every kill point', () => {
    const settled = resume(initial());
    for (const k of STEPS) {
      const resumed = resume(killAfter(k));
      expect(resumed.activeGen, `killed after step ${k}`).toBe(settled.activeGen);
      // Sets compare structurally, which avoids ordering the comparison at all.
      expect(resumed.openers, `killed after step ${k}`).toEqual(settled.openers);
      expect(resumed.apply?.settled, `killed after step ${k}`).toBe(true);
    }
  });

  it('loses no old journal, batch or unresolved outbound work at any kill point', () => {
    for (const k of STEPS) {
      const w = killAfter(k);
      const resumed = resume(w);
      for (const stage of [w, resumed]) {
        expect(stage.journal, `killed after step ${k}`).toEqual(initial().journal);
        expect(stage.batch, `killed after step ${k}`).toEqual(initial().batch);
        // §7.4: exact bytes are retained until an authenticated resolution, and
        // a generation switch is not one.
        expect(stage.outbound, `killed after step ${k}`).toEqual(initial().outbound);
      }
    }
  });

  it('does not move the active generation before the commit point', () => {
    for (const k of STEPS) {
      const w = killAfter(k);
      if (k < COMMIT_POINT) {
        expect(w.activeGen, `killed after step ${k}`).toBe(initial().activeGen);
      } else {
        expect(w.activeGen, `killed after step ${k}`).toBe(initial().activeGen + 1);
      }
    }
  });

  it('has the successor openable before it advances the marker', () => {
    // Step 5 may only be taken once g+1 is reopenable, which is step 2's job.
    const beforeCommit = killAfter(4);
    expect(beforeCommit.openers.has(initial().activeGen + 1)).toBe(true);
    expect(beforeCommit.activeGen).toBe(initial().activeGen);
  });

  it('is idempotent: replaying a completed step changes nothing', () => {
    for (const k of STEPS) {
      const w = killAfter(k);
      expect(applyStep(w, k)).toEqual(w);
    }
  });

  it('rolls back cleanly from any pre-commit step', () => {
    for (const k of STEPS) {
      if (k >= COMMIT_POINT) continue;
      const rolled = rollback(killAfter(k));
      expect(rolled.activeGen, `rolled back from step ${k}`).toBe(initial().activeGen);
      expect(rolled.openers.has(initial().activeGen), `rolled back from step ${k}`).toBe(true);
      expect(rolled.journal, `rolled back from step ${k}`).toEqual(initial().journal);
    }
  });

  it('retires an old opener only when nothing retained needs it', () => {
    const settled = resume(initial());
    // After one rotation the retained pair is {5, 4}; 3 is retained by nothing.
    expect(settled.checkpoints.map((c) => c.gen)).toEqual([5, 4]);
    expect(settled.openers.has(3)).toBe(false);
    expect(settled.openers.has(4)).toBe(true);
    expect(settled.openers.has(5)).toBe(true);
  });

  it('keeps the second-newest checkpoint openable, which is what test 8 falls back to', () => {
    const settled = resume(initial());
    for (const cp of settled.checkpoints) {
      expect(settled.openers.has(cp.gen), `checkpoint under generation ${cp.gen}`).toBe(true);
    }
  });
});
