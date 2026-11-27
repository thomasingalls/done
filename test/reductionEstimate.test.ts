// @vitest-environment node
/** Phase 565: the History panel's reduction estimator, as pure functions. Sequences of what a
 * device measured go in through the same reducer the scheduler uses; wording-ready figures come
 * out. Every honesty rule has a case that fails if the rule is broken (recorded mutations in
 * docs/development-evidence/2026-11-27-post-release-repair/565-reduction-progress-display/). */
import { describe, expect, it } from 'vitest';
import {
  beginReductionPass,
  copyReductionFacts,
  endReductionPass,
  estimateReduction,
  readableDuration,
  recordReductionProgress as record,
  reductionStep,
  REDUCTION_MIN_LEFT_MS as MIN_LEFT,
  type LocalReductionFacts,
} from '../src/crdt/reductionProgress';

const S = 1000,
  MIN = 60 * S;
interface Pass {
  at: number;
  online?: boolean;
  /** Pass start to its checking (durability, reading, opening). */
  read: number;
  /** Results imported from saved progress, and the census estimate. */
  saved?: number;
  planned?: number;
  /** Checking's start to the first fresh check; then fresh results over `slice`. */
  prefix?: number;
  budget?: number;
  fresh?: number;
  slice?: number;
  /** How the pass ended, `after` its last count (its save), or still running. */
  end?: 'saved' | 'cut' | 'removed';
  after?: number;
}
/** One pass, as the owner reports it: stages, the journal's counts, then the outcome. */
function pass(prior: LocalReductionFacts | undefined, p: Pass) {
  let f = beginReductionPass(prior, p.at, p.online ?? false);
  for (const stage of ['durability', 'reading'] as const) f = record(f, { stage }, p.at);
  f = record(f, { stage: 'opening', completed: 0, total: 5000 }, p.at);
  let last = p.at;
  if (p.saved !== undefined) {
    last = p.at + p.read;
    f = record(f, { stage: 'verifying' }, last);
    const counts = { saved: p.saved, held: p.saved, fresh: 0 };
    f = record(
      f,
      { stage: 'verifying', ...counts, ...(p.planned === undefined ? {} : { planned: p.planned }) },
      last,
    );
    if (p.prefix !== undefined) {
      last += p.prefix;
      f = record(f, { stage: 'verifying', ...counts, budget: p.budget ?? p.slice ?? 0 }, last);
      if (p.fresh !== undefined) {
        last += p.slice ?? 0;
        f = record(
          f,
          { stage: 'verifying', saved: p.saved, held: p.saved + p.fresh, fresh: p.fresh },
          last,
        );
      }
    }
  }
  return { f: p.end ? endReductionPass(f, p.end, last + (p.after ?? 0)) : f, last };
}
/** A reduction of `planned` results: pass 1 saves 1,000 results in a 20 s slice after a 30 s read
 * and a 2 s prefix, and its save takes 5 s. Fresh rate: 50 results a second. */
function onePass(online = false, planned = 10_000) {
  return pass(undefined, {
    at: 0,
    online,
    read: 30 * S,
    saved: 0,
    planned,
    prefix: 2 * S,
    budget: 20 * S,
    fresh: 1000,
    slice: 20 * S,
    end: 'saved',
    after: 5 * S,
  });
}

describe('until there is a measurement it says it is estimating', () => {
  it('shows no time before this device measured reading, the prefix and a fresh rate', () => {
    // Pass 1, reading: nothing measured.
    let f = beginReductionPass(undefined, 0, false);
    f = record(f, { stage: 'reading' }, 0);
    const reading = estimateReduction(f, true, 5 * S);
    expect(reading.stepLeft).toBeUndefined();
    expect(reading.allLeft).toBeUndefined();
    expect(reading.checked).toBeUndefined();
    // Checking began: the read is measured, the total estimated, but no fresh rate yet.
    f = record(f, { stage: 'verifying' }, 30 * S);
    f = record(f, { stage: 'verifying', saved: 0, held: 0, fresh: 0, planned: 10_000 }, 30 * S);
    expect(estimateReduction(f, true, 31 * S).stepLeft).toBeUndefined();
    expect(estimateReduction(f, true, 31 * S).checked).toBe(0);
    // First fresh check: the budget is known, still no result measured.
    f = record(f, { stage: 'verifying', saved: 0, held: 0, fresh: 0, budget: 20 * S }, 32 * S);
    for (const now of [32 * S, 40 * S, 52 * S, 80 * S])
      expect(estimateReduction(f, true, now).stepLeft).toBeUndefined();
    // A cut before any fresh result: paused, and still estimating the work left.
    const cut = endReductionPass(f, 'cut', 33 * S);
    expect(estimateReduction(cut, false, 40 * S).workLeft).toBeUndefined();
    // One measured fresh result is a measurement: from now on there is a figure.
    f = record(f, { stage: 'verifying', saved: 0, held: 1, fresh: 1 }, 32 * S + 20);
    expect(estimateReduction(f, true, 33 * S).stepLeft).toBeGreaterThan(0);
  });
  it('computes each figure from the measured rates (a worked example)', () => {
    // After pass 1: 9,000 results left at 50 a second is 180 s of fresh work; slices of 20 s make
    // 9 passes, each re-reading 30 s and re-checking saved results (2 s for 0 saved: the census
    // prefix, kept as measured), with 8 saves of 5 s between them. Steps 2 and 3: 30 s each.
    const { f } = onePass();
    const paused = estimateReduction(f, false, 100 * S);
    expect(paused.saved).toBe(10);
    expect(paused.workLeft).toBe(9 * 32 * S + 180 * S + 8 * 5 * S + 60 * S);
    expect(paused.waits).toBe('none');
    // Running pass 2 (begun as pass 1's save ended), 10 s into its read: the same, less the 10 s,
    // with pass 2's own slice and save.
    const running = pass(f, { at: 57 * S, read: 30 * S }).f;
    expect(running.waitMs).toBe(0);
    const e = estimateReduction(running, true, 67 * S);
    expect(e.stepLeft).toBe(20 * S + 2 * S + 20 * S + 5 * S + 8 * 32 * S + 160 * S + 7 * 5 * S);
    expect(e.allLeft).toBe(e.stepLeft! + 60 * S);
    expect(e.overrun).toBe(false);
  });
});

describe('until there is a measurement it says it is estimating (after a cut)', () => {
  it('a pass cut before any slice was saved still sizes the work left by its measured budget', () => {
    // Pass 1 checks 1,000 fresh results in 20 s of a 40 s budget, then input cuts it.
    const one = pass(undefined, {
      at: 0,
      read: 30 * S,
      saved: 0,
      planned: 10_000,
      prefix: 2 * S,
      budget: 40 * S,
      fresh: 1000,
      slice: 20 * S,
      end: 'cut',
      after: S,
    }).f;
    const e = estimateReduction(one, false, 60 * S);
    expect(e.redo).toEqual({ from: 10, to: 0 });
    // 10,000 results at 50 a second is 200 s in 5 passes of the 40 s budget, each re-reading
    // 32 s, with 4 saves (unmeasured: as long as a setup) and both later steps (30 s each).
    expect(e.workLeft).toBe(5 * 32 * S + 200 * S + 4 * 32 * S + 60 * S);
  });
  it("the active pass's own first results do not swing a rate earlier passes measured", () => {
    const { f } = onePass(false, 10_000);
    // Pass 2's first 3 s of fresh checks run at 10 a second, a slower family beginning.
    const two = pass(f, {
      at: 57 * S,
      read: 30 * S,
      saved: 1000,
      planned: 10_000,
      prefix: 2 * S,
      budget: 20 * S,
      fresh: 30,
      slice: 3 * S,
    });
    // Still 50 a second, as measured over pass 1: 8,970 left is 179.4 s of fresh work; 17 s of
    // this slice remain, then its save, then 9 passes (32 s setups, 8 saves of 5 s) for 162.4 s.
    const e = estimateReduction(two.f, true, two.last);
    expect(e.stepLeft).toBe(17 * S + 5 * S + 9 * 32 * S + 162.4 * S + 8 * 5 * S);
  });
});

describe('the percentage counts saved, reusable work only', () => {
  it('re-reading rows and re-checking saved results on later passes does not move it', () => {
    let f: LocalReductionFacts | undefined;
    for (let n = 0; n < 3; n++)
      f = pass(f, {
        at: n * 100 * S,
        read: 30 * S,
        saved: n * 100,
        planned: 1000,
        prefix: 2 * S,
        budget: 20 * S,
        fresh: 100,
        slice: 20 * S,
        end: 'saved',
        after: 5 * S,
      }).f;
    expect(estimateReduction(f!, false, 300 * S).saved).toBe(30);
    // Pass 4 re-reads every row and re-checks the 300 saved results: still 30%.
    let p = beginReductionPass(f, 300 * S, false);
    for (const [stage, at] of [
      ['durability', 300],
      ['reading', 300],
      ['opening', 301],
      ['verifying', 330],
    ] as const) {
      p = record(p, { stage }, at * S);
      expect(estimateReduction(p, true, at * S + 1).checked).toBe(30);
    }
    for (let held = 0; held <= 300; held += 50) {
      // The journal re-checks saved results: they are hits, `held` stays at the saved 300.
      p = record(
        p,
        { stage: 'verifying', saved: 300, held: 300, fresh: 0, planned: 1000 },
        331 * S,
      );
      expect(estimateReduction(p, true, 331 * S).checked).toBe(30);
    }
    p = record(p, { stage: 'verifying', saved: 300, held: 300, fresh: 0, budget: 20 * S }, 332 * S);
    p = record(p, { stage: 'verifying', saved: 300, held: 350, fresh: 50 }, 342 * S);
    expect(estimateReduction(p, true, 342 * S).checked).toBe(35);
    expect(estimateReduction(p, true, 342 * S).saved).toBe(30);
  });
  it('a cut pass falls back to what was saved and says the rest is being redone', () => {
    const { f: one } = onePass(false, 4000);
    // Pass 2 checks 600 fresh results, then input cuts it before it saves.
    const two = pass(one, {
      at: 100 * S,
      read: 30 * S,
      saved: 1000,
      planned: 4000,
      prefix: 2 * S,
      budget: 20 * S,
      fresh: 600,
      slice: 12 * S,
    });
    expect(estimateReduction(two.f, true, two.last).checked).toBe(40);
    const cut = endReductionPass(two.f, 'cut', two.last + S);
    const paused = estimateReduction(cut, false, two.last + 2 * S);
    expect(paused.saved).toBe(25);
    expect(paused.redo).toEqual({ from: 40, to: 25 });
    // The next pass re-checks: 25% while it redoes the lost part, then the note clears.
    let three = pass(cut, { at: 200 * S, read: 30 * S, saved: 1000, planned: 4000 }).f;
    expect(estimateReduction(three, true, 231 * S)).toMatchObject({
      checked: 25,
      redo: { from: 40, to: 25 },
    });
    three = record(three, { stage: 'verifying', saved: 1000, held: 1600, fresh: 600 }, 240 * S);
    expect(estimateReduction(three, true, 240 * S).redo).toBeUndefined();
  });
  it('saved progress that could not be reused (a stale checkpoint) shows the fall', () => {
    const { f } = onePass(false, 2000);
    expect(estimateReduction(f, false, 60 * S).saved).toBe(50);
    // Pass 2 imports nothing: content compaction made the saved checkpoint stale.
    const two = pass(f, { at: 100 * S, read: 30 * S, saved: 0, planned: 2000 }).f;
    const e = estimateReduction(two, true, 131 * S);
    expect(e.checked).toBe(0);
    expect(e.redo).toEqual({ from: 50, to: 0 });
  });
  it('more history arriving shows as more to check, not as lost work', () => {
    const { f } = onePass(false, 2000);
    const two = pass(f, { at: 100 * S, read: 30 * S, saved: 1000, planned: 2500 }).f;
    const e = estimateReduction(two, true, 131 * S);
    expect(e).toMatchObject({ checked: 40, grew: true });
    expect(e.redo).toBeUndefined();
  });
  it('stays below 100% until a full check completed, then the total is exact', () => {
    // The census estimate was low: more results held than estimated, still checking.
    const { f } = onePass(false, 1000);
    expect(estimateReduction(f, false, 60 * S).saved).toBe(99);
    let final = pass(f, {
      at: 100 * S,
      read: 30 * S,
      saved: 1000,
      planned: 1000,
      prefix: 2 * S,
      budget: 20 * S,
      fresh: 200,
      slice: 4 * S,
    }).f;
    expect(estimateReduction(final, true, 137 * S)).toMatchObject({ checked: 99, exact: false });
    final = record(final, { stage: 'building' }, 140 * S);
    expect(estimateReduction(final, true, 141 * S)).toMatchObject({
      step: 2,
      checked: 100,
      exact: true,
    });
    expect(final.total).toBe(1200);
  });
});

describe('an estimate never sits at zero while work continues', () => {
  it.each([
    ['re-reading, past the measured read', 'read'],
    ['checking fresh results, past the census estimate', 'fresh'],
    ['saving, past the measured save', 'save'],
    ['building, past one measured read', 'build'],
    ['saving the smaller history, past one measured read', 'store'],
  ] as const)('%s: positive, re-estimated and called longer than expected', (_, part) => {
    const { f: one } = onePass(false, 2000);
    let f: LocalReductionFacts, since: number;
    if (part === 'read') {
      f = pass(one, { at: 100 * S, read: 30 * S }).f;
      since = 100 * S;
    } else if (part === 'fresh' || part === 'save') {
      const p = pass(one, {
        at: 100 * S,
        read: 30 * S,
        saved: 1000,
        planned: 2000,
        prefix: 2 * S,
        budget: 20 * S,
        fresh: part === 'fresh' ? 1000 : 500,
        slice: part === 'fresh' ? 10 * S : 20 * S,
      });
      f = p.f;
      since = 132 * S;
    } else {
      f = pass(one, {
        at: 100 * S,
        read: 30 * S,
        saved: 1000,
        planned: 2000,
        prefix: 2 * S,
        budget: 20 * S,
        fresh: 1000,
        slice: 10 * S,
      }).f;
      f = record(f, { stage: 'building' }, 150 * S);
      if (part === 'store') f = record(f, { stage: 'installing' }, 160 * S);
      since = part === 'store' ? 160 * S : 150 * S;
    }
    let previous = 0;
    for (const after of [60, 120, 600, 3600]) {
      const e = estimateReduction(f, true, since + after * S);
      expect(e.overrun).toBe(true);
      expect(e.stepLeft).toBeGreaterThanOrEqual(MIN_LEFT);
      expect(e.allLeft).toBeGreaterThanOrEqual(e.stepLeft!);
      // Re-estimated as time passes, not stuck.
      expect(e.stepLeft).toBeGreaterThan(previous);
      previous = e.stepLeft!;
    }
  });
  it('counts down without reaching zero across the final pass, its steps 2 and 3 included', () => {
    // The final pass of 2,000 results: its re-read, its last fresh results, then steps 2 and 3,
    // each sampled every 7 s from its start to well past its estimate.
    const { f: one } = onePass(false, 2000);
    const reading = pass(one, { at: 100 * S, read: 30 * S }).f;
    const checking = pass(one, {
      at: 100 * S,
      read: 30 * S,
      saved: 1000,
      planned: 2000,
      prefix: 2 * S,
      budget: 40 * S,
      fresh: 900,
      slice: 18 * S,
    }).f;
    const building = record(checking, { stage: 'building' }, 160 * S);
    const storing = record(building, { stage: 'installing' }, 160 * S);
    for (const [facts, from] of [
      [reading, 100],
      [checking, 150],
      [building, 160],
      [storing, 160],
    ] as const)
      for (let t = from; t < from + 240; t += 7) {
        const e = estimateReduction(facts, true, t * S);
        expect(e.stepLeft).toBeGreaterThan(0);
        expect(e.allLeft).toBeGreaterThanOrEqual(e.stepLeft!);
      }
  });
});

describe('a reduction that finished is not continued', () => {
  it('a pass after a finished reduction starts a new one: pass 1, nothing saved, nothing measured', () => {
    // A reduction of 2,000 results finishes in its second pass.
    const done = pass(onePass(false, 2000).f, {
      at: 57 * S,
      read: 30 * S,
      saved: 1000,
      prefix: 2 * S,
      budget: 20 * S,
      fresh: 1000,
      slice: 20 * S,
      end: 'removed',
      after: 5 * S,
    }).f;
    expect(done).toMatchObject({ pass: 2, saved: 1000, finishedAt: 114 * S });
    // Forty minutes later more history is reduced: its first pass carries nothing over.
    const at = 40 * MIN;
    let f = beginReductionPass(done, at, true);
    expect(f).toEqual({
      since: at,
      pass: 1,
      passSince: at,
      stage: 'durability',
      stageSince: at,
      stepSince: at,
      online: true,
    });
    f = record(f, { stage: 'reading' }, at);
    const e = estimateReduction(f, true, at + 5 * S);
    expect(e).toMatchObject({ step: 1, pass: 1, exact: false, grew: false, overrun: false });
    for (const key of ['checked', 'saved', 'redo', 'stepLeft', 'allLeft'] as const)
      expect(e[key]).toBeUndefined();
  });
});
describe('steps 2 and 3 are seen only in the final pass', () => {
  it('sizes each as one measured full read until seen, then by the longest time seen', () => {
    const { f } = onePass(false, 2000);
    // Before step 2 is seen: one 30 s read each.
    const two = pass(f, { at: 100 * S, read: 30 * S }).f;
    const e = estimateReduction(two, true, 101 * S);
    expect(e.allLeft! - e.stepLeft!).toBe(60 * S);
    // The final pass reaches step 2 and is cut 45 s into it.
    let final = pass(f, {
      at: 100 * S,
      read: 30 * S,
      saved: 1000,
      planned: 2000,
      prefix: 2 * S,
      budget: 20 * S,
      fresh: 1000,
      slice: 10 * S,
    }).f;
    final = record(final, { stage: 'building' }, 142 * S);
    final = endReductionPass(final, 'cut', 187 * S);
    expect(final.buildMs).toBe(45 * S);
    // The redo is shown, and step 2 is now allowed the 45 s it was seen to take.
    const next = pass(final, { at: 300 * S, read: 30 * S }).f;
    const later = estimateReduction(next, true, 301 * S);
    expect(later.redo).toEqual({ from: 99, to: 50 });
    expect(later.allLeft! - later.stepLeft!).toBe(45 * S + 30 * S);
  });
});

describe('waits between passes', () => {
  it('online: says waits are not counted until one is measured, then counts the shortest', () => {
    const { f } = onePass(true, 10_000);
    const before = estimateReduction(f, false, 60 * S);
    expect(before.waits).toBe('excluded');
    // Pass 2 starts after the 60 s yield: a measured wait.
    const two = pass(f, {
      at: 25 * S + 32 * S + 60 * S,
      online: true,
      read: 30 * S,
      saved: 1000,
      planned: 10_000,
      prefix: 3 * S,
      budget: 20 * S,
      fresh: 1000,
      slice: 20 * S,
      end: 'saved',
      after: 5 * S,
    });
    const after = estimateReduction(two.f, false, two.last + 10 * S);
    expect(after.waits).toBe('included');
    expect(two.f.waitMs).toBe(60 * S);
    // 8,000 left at 50 a second: 160 s in 8 passes, 7 saves and 7 waits between them. The prefix
    // took 2 s with nothing saved and 3 s with 1,000 saved (1 ms a result); later passes re-check
    // about 6,000 (the midpoint of the 2,000 held and the 10,000 total): 8 s, after the 30 s read.
    const quiet = 8 * (30 + 8) * S + 160 * S + 7 * 5 * S + 60 * S;
    expect(after.workLeft).toBe(quiet + 7 * 60 * S);
    // The person kept the device busy for 10 minutes: that wait does not become the estimate.
    const three = pass(two.f, {
      at: two.last + 5 * S + 10 * MIN,
      online: true,
      read: 30 * S,
      saved: 2000,
      planned: 10_000,
      prefix: 2 * S,
      budget: 20 * S,
      fresh: 1000,
      slice: 20 * S,
      end: 'saved',
      after: 5 * S,
    });
    expect(three.f.waitMs).toBe(60 * S);
  });
  it('offline with no wait measured: no waits ahead are claimed', () => {
    expect(estimateReduction(onePass(false).f, false, 60 * S).waits).toBe('none');
  });
});

describe('wording-ready figures', () => {
  it('rounds for reading: seconds under a minute in tens, rounded up, never zero; then minutes, then hours', () => {
    const rows: [number, string, number][] = [
      [0, 'seconds', 10],
      [-5, 'seconds', 10],
      [4000, 'seconds', 10],
      [9999, 'seconds', 10],
      [10000, 'seconds', 10],
      [40000, 'seconds', 40],
      [41000, 'seconds', 50],
      [50001, 'minutes', 1],
      [59000, 'minutes', 1],
      [61000, 'minutes', 2],
      [270000, 'minutes', 5],
      [7140000, 'minutes', 119],
      [7200001, 'hours', 3],
    ];
    expect(rows.map(([ms]) => readableDuration(ms))).toEqual(
      rows.map(([, unit, value]) => ({ unit, value })),
    );
  });
  it('maps each stage to its step', () => {
    expect(
      Object.fromEntries(
        [
          'durability',
          'reading',
          'opening',
          'verifying',
          'building',
          'coverage',
          'current',
          'installing',
          'readback',
          'complete',
        ].map((stage) => [stage, reductionStep(stage as Parameters<typeof reductionStep>[0])]),
      ),
    ).toEqual({
      durability: 1,
      reading: 1,
      opening: 1,
      verifying: 1,
      building: 2,
      coverage: 2,
      current: 2,
      installing: 3,
      readback: 3,
      complete: 3,
    });
  });
  it('copies only well-formed facts across the Worker boundary', () => {
    const { f } = onePass(true);
    expect(copyReductionFacts(JSON.parse(JSON.stringify(f)))).toEqual(f);
    for (const bad of [
      null,
      [],
      { ...f, pass: 0 },
      { ...f, saved: -1 },
      { ...f, held: 1.5 },
      { ...f, stage: 'FAKE-STAGE' },
      { ...f, online: 'yes' },
      { ...f, grew: false },
      { ...f, note: 'FAKE-PRIVATE-SENTINEL' },
    ])
      expect(copyReductionFacts(bad)).toBeUndefined();
    const { since: _since, ...partial } = f;
    expect(copyReductionFacts(partial)).toBeUndefined();
  });
});

type Attempt = readonly [
  start: number,
  beforeChecking: number,
  opened: number,
  checking: number,
  budget: number,
  setup: number,
  imported: number,
  fresh: number,
  save: number,
  end: number,
  outcome: number,
  build: number,
  store: number,
];
/** Replays a lab run's per-attempt table (phase 564 record) through the reducer, as the owner
 * would have reported it, and samples the estimate at each pass's start and end. */
function replay(attempts: readonly Attempt[], online: boolean, planned: number) {
  const offset = 1000,
    finished = attempts.at(-1)![9] + offset;
  let f: LocalReductionFacts | undefined;
  const starts: { pass: number; checked?: number; allLeft?: number; actual: number }[] = [];
  const ends: { saved?: number; redo?: { from: number; to: number }; lostFresh: boolean }[] = [];
  for (const [n, a] of attempts.entries()) {
    const [start, before, , checking, budget, setup, imported, fresh, , end, outcome] = a;
    const t0 = start + offset,
      done = end + offset;
    f = beginReductionPass(f, t0, online);
    for (const stage of ['durability', 'reading'] as const) f = record(f, { stage }, t0);
    f = record(f, { stage: 'opening', completed: 0, total: 7202 }, t0);
    const e = estimateReduction(f, true, t0 + 1);
    starts.push({
      pass: n + 1,
      ...(e.checked === undefined ? {} : { checked: e.checked }),
      ...(e.allLeft === undefined ? {} : { allLeft: e.allLeft }),
      actual: finished - t0 - 1,
    });
    let lostFresh = false;
    if (checking >= 0) {
      const v = t0 + before,
        vEnd = v + checking,
        first = setup > 0 ? Math.max(v, t0 + setup) : Math.max(v, vEnd - budget);
      f = record(f, { stage: 'verifying' }, v);
      // Re-reading the rows never moved the percentage.
      expect(estimateReduction(f, true, v).checked).toBe(starts.at(-1)!.checked);
      if (imported >= 0)
        f = record(
          f,
          { stage: 'verifying', saved: imported, held: imported, fresh: 0, planned },
          v,
        );
      if (outcome === 2) {
        f = record(
          f,
          { stage: 'verifying', saved: imported, held: imported, fresh: 0, budget },
          first,
        );
        f = record(
          f,
          { stage: 'verifying', saved: imported, held: planned, fresh: planned - imported },
          vEnd,
        );
        f = record(f, { stage: 'building' }, vEnd);
        f = record(f, { stage: 'installing' }, vEnd + a[11]);
        f = record(f, { stage: 'complete' }, vEnd + a[11] + a[12]);
      } else if (fresh > 0) {
        f = record(
          f,
          { stage: 'verifying', saved: imported, held: imported, fresh: 0, budget },
          first,
        );
        f = record(
          f,
          { stage: 'verifying', saved: imported, held: imported + fresh, fresh },
          Math.min(first + budget, done),
        );
        lostFresh = outcome === 1;
      }
    }
    f = endReductionPass(f, outcome === 0 ? 'saved' : outcome === 2 ? 'removed' : 'cut', done);
    const paused = estimateReduction(f, false, done);
    ends.push({
      ...(paused.saved === undefined ? {} : { saved: paused.saved }),
      ...(paused.redo ? { redo: paused.redo } : {}),
      lostFresh,
    });
  }
  return { f: f!, starts, ends };
}
describe('replays of real multi-pass reductions (phase 564 lab runs)', () => {
  // Both runs reduce the same 1,000-position seed (7,202 rows). They predate phase 565, so the
  // census figure is not in their logs: the total is taken as 10,685 results, r06's last import
  // (10,296) plus its previous pass's 389 fresh results, an upper estimate.
  const planned = 10_685;
  it('r07 (online, x20, 130 attempts, 104 cut): saved progress never falls, each lost slice shows', () => {
    const { f, starts, ends } = replay(r07, true, planned);
    expect(f.finishedAt).toBeDefined();
    let saved = 0;
    for (const end of ends) {
      if (end.saved === undefined) continue;
      expect(end.saved).toBeGreaterThanOrEqual(saved);
      saved = end.saved;
    }
    // Attempt 1 checked 8,703 fresh results and was cut before saving them: the fall is shown.
    expect(ends[0]).toMatchObject({ lostFresh: true, saved: 0, redo: { from: 81, to: 0 } });
    for (const end of ends) if (end.lostFresh) expect(end.redo).toBeDefined();
    // Each pass starts at the saved percentage, however often it re-read the rows.
    const checkedAtStarts = starts.map((s) => s.checked ?? 0);
    for (let i = 1; i < checkedAtStarts.length; i++)
      expect(checkedAtStarts[i]).toBe(ends[i - 1]!.saved ?? 0);
  });
  it('r06 (offline, x100, 156 passes): the percentage rises monotonically and the estimate converges', () => {
    const { f, starts } = replay(r06, false, planned);
    expect(f.finishedAt).toBeDefined();
    const checked = starts.map((s) => s.checked ?? 0);
    for (let i = 1; i < checked.length; i++)
      expect(checked[i]).toBeGreaterThanOrEqual(checked[i - 1]!);
    const estimates = starts.filter((s) => s.allLeft !== undefined);
    // Pass 1 has nothing measured; every later pass has a figure.
    expect(estimates[0]!.pass).toBe(2);
    expect(estimates).toHaveLength(155);
    // Tolerance, stated: once five passes have measured the rates, no pass raises the
    // whole-reduction estimate by more than 30% (largest rise in this run: 24%, at pass 74).
    for (let i = 5; i < estimates.length; i++)
      expect(estimates[i]!.allLeft! / estimates[i - 1]!.allLeft!).toBeLessThanOrEqual(1.3);
    // From pass 45 (about fifteen passes into the slower family of checks that began near pass
    // 30) until a quarter of the run remains, it stays between half and three times the time
    // actually left (seen: 0.68 to 2.86). Earlier it is optimistic: the first passes checked a
    // family about seven times faster, which no measurement before it could show.
    const quarter = estimates[0]!.actual / 4;
    for (const s of estimates.filter((s) => s.pass >= 45 && s.actual >= quarter)) {
      expect(s.allLeft! / s.actual).toBeGreaterThanOrEqual(0.5);
      expect(s.allLeft! / s.actual).toBeLessThanOrEqual(3);
    }
    // And it converges at the end: when a faster family of checks returns at pass 153, the
    // estimate falls in each of the last three passes (seen: 144, 65, 43, 21 s, against 12.6,
    // 9.4, 6.3 and 3.2 s actually left; the rest is the steps 2 and 3 allowance and a setup).
    for (let i = estimates.length - 3; i < estimates.length; i++)
      expect(estimates[i]!.allLeft!).toBeLessThan(estimates[i - 1]!.allLeft!);
    expect(estimates.at(-1)!.allLeft!).toBeLessThan(estimates.at(-4)!.allLeft! / 4);
  });
});
/** Lab run r06 (564 record: run-r06-1000-ts100-offline.log.gz): [start ms, start to checking ms,
 * rows opened, checking ms (-1: none), budget ms, setup ms, imported, fresh, save ms, end ms,
 * outcome (0 saved, 1 cut, 2 removed), step 2 ms, step 3 ms]; times are the lab's, to 0.1 s. */
const r06: readonly Attempt[] = [
  [-100, 700, 7202, 600, 20, 989, 0, 284, 200, 1100, 0, 0, 0],
  [1100, 700, 7202, 600, 20, 1094, 284, 208, 200, 2500, 0, 0, 0],
  [2500, 700, 7202, 600, 20, 1070, 492, 201, 200, 3800, 0, 0, 0],
  [3800, 700, 7202, 600, 20, 1096, 693, 219, 200, 5200, 0, 0, 0],
  [5200, 700, 7202, 700, 20, 1113, 912, 226, 200, 6600, 0, 0, 0],
  [6600, 700, 7202, 600, 20, 1110, 1138, 233, 200, 8000, 0, 0, 0],
  [8000, 700, 7202, 700, 20, 1126, 1371, 228, 200, 9400, 0, 0, 0],
  [9400, 700, 7202, 700, 20, 1131, 1599, 219, 200, 10800, 0, 0, 0],
  [10800, 800, 7202, 700, 20, 1189, 1818, 216, 200, 12300, 0, 0, 0],
  [12300, 700, 7202, 700, 20, 1159, 2034, 214, 200, 13700, 0, 0, 0],
  [13700, 700, 7202, 700, 20, 1170, 2248, 148, 200, 15200, 0, 0, 0],
  [15200, 800, 7202, 700, 20, 1197, 2396, 202, 300, 16700, 0, 0, 0],
  [16700, 700, 7202, 700, 20, 1194, 2598, 155, 300, 18200, 0, 0, 0],
  [18200, 800, 7202, 700, 20, 1219, 2753, 206, 300, 19800, 0, 0, 0],
  [19800, 800, 7202, 700, 20, 1260, 2959, 171, 300, 21400, 0, 0, 0],
  [21400, 800, 7202, 800, 20, 1250, 3130, 204, 300, 23000, 0, 0, 0],
  [23000, 800, 7202, 800, 20, 1254, 3334, 174, 300, 24500, 0, 0, 0],
  [24500, 800, 7202, 800, 20, 1290, 3508, 196, 300, 26200, 0, 0, 0],
  [26200, 900, 7202, 800, 20, 1288, 3704, 205, 300, 27800, 0, 0, 0],
  [27800, 900, 7202, 800, 20, 1276, 3909, 158, 300, 29500, 0, 0, 0],
  [29500, 900, 7202, 800, 20, 1335, 4067, 177, 300, 31200, 0, 0, 0],
  [31200, 900, 7202, 800, 20, 1312, 4244, 170, 300, 32800, 0, 0, 0],
  [32800, 900, 7202, 800, 20, 1305, 4414, 207, 300, 34500, 0, 0, 0],
  [34500, 900, 7202, 900, 20, 1351, 4621, 199, 300, 36300, 0, 0, 0],
  [36300, 900, 7202, 900, 20, 1366, 4820, 186, 300, 38000, 0, 0, 0],
  [38000, 900, 7202, 900, 20, 1382, 5006, 96, 300, 39800, 0, 0, 0],
  [39800, 900, 7202, 900, 20, 1388, 5102, 44, 300, 41600, 0, 0, 0],
  [41600, 900, 7202, 900, 20, 1370, 5146, 53, 300, 43400, 0, 0, 0],
  [43400, 900, 7202, 900, 20, 1393, 5199, 48, 300, 45100, 0, 0, 0],
  [45100, 900, 7202, 900, 20, 1402, 5247, 45, 300, 46900, 0, 0, 0],
  [46900, 900, 7202, 900, 20, 1387, 5292, 46, 300, 48700, 0, 0, 0],
  [48700, 900, 7202, 900, 20, 1412, 5338, 41, 300, 50500, 0, 0, 0],
  [50500, 900, 7202, 900, 20, 1382, 5379, 53, 300, 52300, 0, 0, 0],
  [52300, 900, 7202, 900, 20, 1401, 5432, 44, 300, 54100, 0, 0, 0],
  [54100, 900, 7202, 900, 20, 1407, 5476, 45, 300, 55900, 0, 0, 0],
  [55900, 900, 7202, 900, 20, 1398, 5521, 43, 300, 57700, 0, 0, 0],
  [57700, 900, 7202, 900, 20, 1418, 5564, 48, 300, 59500, 0, 0, 0],
  [59500, 900, 7202, 900, 20, 1418, 5612, 23, 300, 61300, 0, 0, 0],
  [61300, 900, 7202, 900, 20, 1441, 5635, 17, 300, 63100, 0, 0, 0],
  [63100, 900, 7202, 900, 20, 1395, 5652, 23, 300, 64900, 0, 0, 0],
  [64900, 900, 7202, 900, 20, 1401, 5675, 22, 300, 66700, 0, 0, 0],
  [66700, 900, 7202, 900, 20, 1427, 5697, 30, 300, 68500, 0, 0, 0],
  [68500, 900, 7202, 900, 20, 1390, 5727, 25, 300, 70300, 0, 0, 0],
  [70300, 900, 7202, 900, 20, 1441, 5752, 21, 300, 72200, 0, 0, 0],
  [72200, 900, 7202, 900, 20, 1428, 5773, 27, 300, 74000, 0, 0, 0],
  [74000, 800, 7202, 900, 20, 1408, 5800, 15, 300, 75800, 0, 0, 0],
  [75800, 900, 7202, 900, 20, 1430, 5815, 21, 300, 77600, 0, 0, 0],
  [77600, 900, 7202, 900, 20, 1421, 5836, 45, 300, 79400, 0, 0, 0],
  [79400, 900, 7202, 900, 20, 1410, 5881, 8, 300, 81200, 0, 0, 0],
  [81200, 900, 7202, 1000, 20, 1424, 5889, 42, 300, 83100, 0, 0, 0],
  [83100, 900, 7202, 900, 20, 1419, 5931, 43, 300, 84900, 0, 0, 0],
  [84900, 800, 7202, 900, 20, 1418, 5974, 50, 300, 86700, 0, 0, 0],
  [86700, 900, 7202, 1000, 20, 1459, 6024, 50, 300, 88600, 0, 0, 0],
  [88600, 900, 7202, 900, 20, 1425, 6074, 40, 300, 90400, 0, 0, 0],
  [90400, 900, 7202, 900, 20, 1431, 6114, 12, 300, 92200, 0, 0, 0],
  [92200, 900, 7202, 900, 20, 1456, 6126, 15, 300, 94100, 0, 0, 0],
  [94100, 900, 7202, 1000, 20, 1477, 6141, 15, 300, 96000, 0, 0, 0],
  [96000, 900, 7202, 1000, 20, 1460, 6156, 40, 300, 97800, 0, 0, 0],
  [97800, 900, 7202, 1000, 20, 1460, 6196, 45, 300, 99700, 0, 0, 0],
  [99700, 800, 7202, 1000, 20, 1432, 6241, 39, 400, 101600, 0, 0, 0],
  [101600, 900, 7202, 1000, 20, 1467, 6280, 45, 300, 103400, 0, 0, 0],
  [103400, 900, 7202, 1000, 20, 1497, 6325, 44, 300, 105300, 0, 0, 0],
  [105300, 900, 7202, 1000, 20, 1483, 6369, 40, 300, 107200, 0, 0, 0],
  [107200, 900, 7202, 1000, 20, 1508, 6409, 38, 300, 109100, 0, 0, 0],
  [109100, 900, 7202, 1000, 20, 1471, 6447, 46, 300, 111000, 0, 0, 0],
  [111000, 1000, 7202, 900, 20, 1506, 6493, 41, 300, 112900, 0, 0, 0],
  [112900, 1000, 7202, 1000, 20, 1516, 6534, 39, 300, 114800, 0, 0, 0],
  [114800, 1000, 7202, 1000, 20, 1525, 6573, 39, 300, 116700, 0, 0, 0],
  [116700, 1000, 7202, 900, 20, 1509, 6612, 37, 300, 118600, 0, 0, 0],
  [118600, 900, 7202, 1000, 20, 1525, 6649, 36, 300, 120500, 0, 0, 0],
  [120500, 900, 7202, 1000, 20, 1554, 6685, 38, 300, 122500, 0, 0, 0],
  [122500, 900, 7202, 1000, 20, 1558, 6723, 37, 300, 124400, 0, 0, 0],
  [124400, 1200, 7202, 1000, 20, 1906, 6760, 39, 300, 126800, 0, 0, 0],
  [126800, 1200, 7202, 1000, 20, 1848, 6799, 10, 300, 129000, 0, 0, 0],
  [129000, 1200, 7202, 1000, 20, 1809, 6809, 29, 300, 131300, 0, 0, 0],
  [131300, 1200, 7202, 1000, 20, 1905, 6838, 36, 300, 133600, 0, 0, 0],
  [133600, 1200, 7202, 1000, 20, 1863, 6874, 37, 300, 135800, 0, 0, 0],
  [135800, 1300, 7202, 1000, 20, 1938, 6911, 28, 300, 138200, 0, 0, 0],
  [138200, 1300, 7202, 1000, 20, 1942, 6939, 38, 300, 140600, 0, 0, 0],
  [140600, 1200, 7202, 1100, 20, 1871, 6977, 41, 400, 142900, 0, 0, 0],
  [142900, 1300, 7202, 1100, 20, 1950, 7018, 14, 400, 145300, 0, 0, 0],
  [145300, 1200, 7202, 1100, 20, 1940, 7032, 15, 400, 147700, 0, 0, 0],
  [147700, 1300, 7202, 1100, 20, 1952, 7047, 37, 400, 150100, 0, 0, 0],
  [150100, 1300, 7202, 1100, 20, 1892, 7084, 14, 400, 152400, 0, 0, 0],
  [152400, 1300, 7202, 1100, 20, 1940, 7098, 40, 400, 154800, 0, 0, 0],
  [154800, 1200, 7202, 1000, 20, 1858, 7138, 37, 300, 157100, 0, 0, 0],
  [157100, 1400, 7202, 1100, 20, 1965, 7175, 37, 300, 159500, 0, 0, 0],
  [159500, 1300, 7202, 1100, 20, 1969, 7212, 39, 400, 161900, 0, 0, 0],
  [161900, 1300, 7202, 1100, 20, 1950, 7251, 36, 300, 164300, 0, 0, 0],
  [164300, 1200, 7202, 1100, 20, 1900, 7287, 41, 400, 166600, 0, 0, 0],
  [166600, 1400, 7202, 1100, 20, 2020, 7328, 41, 300, 169100, 0, 0, 0],
  [169100, 1400, 7202, 1100, 20, 2000, 7369, 38, 300, 171500, 0, 0, 0],
  [171500, 1300, 7202, 1100, 20, 2003, 7407, 36, 400, 174000, 0, 0, 0],
  [174000, 1300, 7202, 1100, 20, 2015, 7443, 36, 300, 176400, 0, 0, 0],
  [176400, 1400, 7202, 1100, 20, 2026, 7479, 39, 400, 178900, 0, 0, 0],
  [178900, 1300, 7202, 1100, 20, 1972, 7518, 39, 400, 181400, 0, 0, 0],
  [181400, 1300, 7202, 1100, 20, 1965, 7557, 38, 400, 183800, 0, 0, 0],
  [183800, 1300, 7202, 1100, 20, 2047, 7595, 40, 400, 186300, 0, 0, 0],
  [186300, 1300, 7202, 1100, 20, 2047, 7635, 36, 400, 188800, 0, 0, 0],
  [188800, 1300, 7202, 1100, 20, 2022, 7671, 40, 400, 191300, 0, 0, 0],
  [191300, 1400, 7202, 1200, 20, 2066, 7711, 42, 400, 193800, 0, 0, 0],
  [193800, 1100, 7202, 1200, 20, 1813, 7753, 36, 400, 196100, 0, 0, 0],
  [196100, 1400, 7202, 1200, 20, 2099, 7789, 42, 400, 198700, 0, 0, 0],
  [198700, 1300, 7202, 1200, 20, 2044, 7831, 39, 400, 201200, 0, 0, 0],
  [201200, 1400, 7202, 1200, 20, 2067, 7870, 35, 400, 203800, 0, 0, 0],
  [203800, 1300, 7202, 1200, 20, 2061, 7905, 37, 400, 206300, 0, 0, 0],
  [206300, 1400, 7202, 1200, 20, 2136, 7942, 23, 400, 208900, 0, 0, 0],
  [208900, 1300, 7202, 1200, 20, 2081, 7965, 20, 400, 211500, 0, 0, 0],
  [211500, 1400, 7202, 1200, 20, 2110, 7985, 22, 400, 214100, 0, 0, 0],
  [214100, 1300, 7202, 1200, 20, 2021, 8007, 16, 400, 216600, 0, 0, 0],
  [216600, 1300, 7202, 1200, 20, 2052, 8023, 12, 400, 219100, 0, 0, 0],
  [219100, 1300, 7202, 1200, 20, 2117, 8035, 10, 400, 221700, 0, 0, 0],
  [221700, 1400, 7202, 1200, 20, 2163, 8045, 11, 400, 224300, 0, 0, 0],
  [224300, 1300, 7202, 1200, 20, 2055, 8056, 13, 400, 226900, 0, 0, 0],
  [226900, 1300, 7202, 1200, 20, 2028, 8069, 18, 400, 229400, 0, 0, 0],
  [229400, 1400, 7202, 1200, 20, 2213, 8087, 5, 400, 232100, 0, 0, 0],
  [232100, 1300, 7202, 1200, 20, 2094, 8092, 38, 400, 234700, 0, 0, 0],
  [234700, 1400, 7202, 1300, 20, 2169, 8130, 40, 400, 237400, 0, 0, 0],
  [237400, 1400, 7202, 1300, 20, 2215, 8170, 38, 500, 240100, 0, 0, 0],
  [240100, 1300, 7202, 1200, 20, 2080, 8208, 38, 400, 242700, 0, 0, 0],
  [242700, 1300, 7202, 1300, 20, 2179, 8246, 36, 500, 245400, 0, 0, 0],
  [245400, 1400, 7202, 1300, 20, 2103, 8282, 38, 500, 248100, 0, 0, 0],
  [248100, 1200, 7202, 1300, 20, 2052, 8320, 38, 500, 250700, 0, 0, 0],
  [250700, 1400, 7202, 1300, 20, 2171, 8358, 39, 500, 253400, 0, 0, 0],
  [253400, 1300, 7202, 1200, 20, 2093, 8397, 30, 400, 256000, 0, 0, 0],
  [256000, 1300, 7202, 1300, 20, 2150, 8427, 40, 500, 258700, 0, 0, 0],
  [258700, 1400, 7202, 1300, 20, 2216, 8467, 36, 500, 261400, 0, 0, 0],
  [261400, 1400, 7202, 1300, 20, 2183, 8503, 39, 400, 264200, 0, 0, 0],
  [264200, 1400, 7202, 1300, 20, 2223, 8542, 35, 400, 266900, 0, 0, 0],
  [266900, 1400, 7202, 1300, 20, 2190, 8577, 30, 500, 269600, 0, 0, 0],
  [269600, 1500, 7202, 1300, 20, 2213, 8607, 24, 400, 272400, 0, 0, 0],
  [272400, 1500, 7202, 1300, 20, 2256, 8631, 10, 500, 275100, 0, 0, 0],
  [275100, 1500, 7202, 1400, 20, 2260, 8641, 38, 500, 278000, 0, 0, 0],
  [278000, 1500, 7202, 1300, 20, 2322, 8679, 35, 500, 280800, 0, 0, 0],
  [280800, 1400, 7202, 1400, 20, 2242, 8714, 32, 500, 283600, 0, 0, 0],
  [283600, 1400, 7202, 1400, 20, 2192, 8746, 40, 500, 286300, 0, 0, 0],
  [286300, 1500, 7202, 1400, 20, 2302, 8786, 43, 500, 289200, 0, 0, 0],
  [289200, 1400, 7202, 1400, 20, 2245, 8829, 39, 500, 292000, 0, 0, 0],
  [292000, 1500, 7202, 1400, 20, 2308, 8868, 37, 500, 294800, 0, 0, 0],
  [294800, 1400, 7202, 1400, 20, 2270, 8905, 39, 500, 297700, 0, 0, 0],
  [297700, 1400, 7202, 1400, 20, 2247, 8944, 32, 400, 300500, 0, 0, 0],
  [300500, 1600, 7202, 1400, 20, 2449, 8976, 37, 500, 303500, 0, 0, 0],
  [303500, 1400, 7202, 1500, 20, 2320, 9013, 36, 500, 306400, 0, 0, 0],
  [306400, 1500, 7202, 1400, 20, 2391, 9049, 35, 500, 309300, 0, 0, 0],
  [309300, 1400, 7202, 1400, 20, 2281, 9084, 18, 500, 312200, 0, 0, 0],
  [312200, 1500, 7202, 1500, 20, 2391, 9102, 33, 500, 315200, 0, 0, 0],
  [315200, 1500, 7202, 1500, 20, 2422, 9135, 41, 500, 318200, 0, 0, 0],
  [318200, 1400, 7202, 1500, 20, 2353, 9176, 30, 500, 321100, 0, 0, 0],
  [321100, 1400, 7202, 1500, 20, 2363, 9206, 26, 500, 324100, 0, 0, 0],
  [324100, 1500, 7202, 1500, 20, 2488, 9232, 37, 500, 327100, 0, 0, 0],
  [327100, 1400, 7202, 1500, 20, 2392, 9269, 33, 500, 330100, 0, 0, 0],
  [330100, 1500, 7202, 1600, 20, 2367, 9302, 2, 500, 333200, 0, 0, 0],
  [333200, 1500, 7202, 1600, 20, 2578, 9304, 296, 500, 336400, 0, 0, 0],
  [336400, 1400, 7202, 1600, 20, 2514, 9600, 307, 500, 339500, 0, 0, 0],
  [339500, 1400, 7202, 1700, 20, 2500, 9907, 389, 500, 342600, 0, 0, 0],
  [342600, 1500, 7202, 1100, 20, 2523, 10296, -1, 0, 345800, 2, 400, 200],
];
/** Lab run r07 (run-r07-1000-ts20-online.log.gz), the same columns; -1: not reached. */
const r07: readonly Attempt[] = [
  [900, 900, 7202, 2200, 1787, 1191, 0, 8703, 0, 4000, 1, 0, 0],
  [4500, 500, 3136, -1, -1, -1, 0, 0, 0, 4900, 1, 0, 0],
  [5400, 700, 4896, -1, -1, -1, 0, 0, 0, 6100, 1, 0, 0],
  [6600, 700, 4512, -1, -1, -1, 0, 0, 0, 7300, 1, 0, 0],
  [7800, 900, 7202, 700, 100, 0, 0, 1195, 200, 9400, 0, 0, 0],
  [9400, 1000, 7202, 400, 100, 1406, 1195, 0, 0, 10900, 1, 0, 0],
  [11400, 600, 2592, -1, -1, -1, 1195, 0, 0, 12000, 1, 0, 0],
  [12500, 500, 1920, -1, -1, -1, 1195, 0, 0, 13000, 1, 0, 0],
  [13500, 400, 2528, -1, -1, -1, 1195, 0, 0, 14000, 1, 0, 0],
  [14500, 1000, 7202, 900, 100, 0, 1195, 1007, 300, 16400, 0, 0, 0],
  [16400, 1100, 5952, -1, -1, -1, 2202, 0, 0, 17500, 1, 0, 0],
  [18000, 500, 2624, -1, -1, -1, 2202, 0, 0, 18600, 1, 0, 0],
  [19100, 600, 2176, -1, -1, -1, 2202, 0, 0, 19700, 1, 0, 0],
  [20200, 400, 2304, -1, -1, -1, 2202, 0, 0, 20700, 1, 0, 0],
  [21200, 1100, 7202, 900, 100, 0, 2202, 1182, 300, 23200, 0, 0, 0],
  [23200, 1000, 5920, -1, -1, -1, 3384, 0, 0, 24200, 1, 0, 0],
  [24700, 700, 4000, -1, -1, -1, 3384, 0, 0, 25400, 1, 0, 0],
  [26000, 600, 2336, -1, -1, -1, 3384, 0, 0, 26500, 1, 0, 0],
  [27000, 600, 2048, -1, -1, -1, 3384, 0, 0, 27700, 1, 0, 0],
  [28200, 1100, 7202, 900, 100, 0, 3384, 1179, 300, 30300, 0, 0, 0],
  [30300, 900, 3680, -1, -1, -1, 4563, 0, 0, 31200, 1, 0, 0],
  [31700, 600, 1984, -1, -1, -1, 4563, 0, 0, 32300, 1, 0, 0],
  [32800, 400, 0, -1, -1, -1, 4563, 0, 0, 33200, 1, 0, 0],
  [33800, 600, 2080, -1, -1, -1, 4563, 0, 0, 34300, 1, 0, 0],
  [34800, 1200, 7202, 1000, 100, 0, 4563, 660, 300, 37000, 0, 0, 0],
  [37000, 900, 3392, -1, -1, -1, 5223, 0, 0, 37800, 1, 0, 0],
  [38300, 600, 2048, -1, -1, -1, 5223, 0, 0, 39000, 1, 0, 0],
  [39500, 500, 0, -1, -1, -1, 5223, 0, 0, 40000, 1, 0, 0],
  [40500, 500, 1888, -1, -1, -1, 5223, 0, 0, 41000, 1, 0, 0],
  [41500, 1100, 7202, 1000, 100, 0, 5223, 221, 300, 43600, 0, 0, 0],
  [43600, 900, 3424, -1, -1, -1, 5444, 0, 0, 44500, 1, 0, 0],
  [45000, 600, 1632, -1, -1, -1, 5444, 0, 0, 45700, 1, 0, 0],
  [46200, 400, 0, -1, -1, -1, 5444, 0, 0, 46600, 1, 0, 0],
  [47100, 500, 1920, -1, -1, -1, 5444, 0, 0, 47700, 1, 0, 0],
  [48200, 1200, 7202, 1000, 100, 0, 5444, 227, 300, 50400, 0, 0, 0],
  [50400, 800, 3776, -1, -1, -1, 5671, 0, 0, 51200, 1, 0, 0],
  [51700, 600, 1888, -1, -1, -1, 5671, 0, 0, 52300, 1, 0, 0],
  [52900, 500, 1856, -1, -1, -1, 5671, 0, 0, 53400, 1, 0, 0],
  [53900, 500, 1984, -1, -1, -1, 5671, 0, 0, 54400, 1, 0, 0],
  [54900, 1100, 7202, 1000, 100, 0, 5671, 233, 300, 57100, 0, 0, 0],
  [57100, 900, 3584, -1, -1, -1, 5904, 0, 0, 57900, 1, 0, 0],
  [58500, 700, 1920, -1, -1, -1, 5904, 0, 0, 59200, 1, 0, 0],
  [59700, 600, 1984, -1, -1, -1, 5904, 0, 0, 60200, 1, 0, 0],
  [60800, 600, 2144, -1, -1, -1, 5904, 0, 0, 61400, 1, 0, 0],
  [61900, 1200, 7202, 1000, 100, 0, 5904, 246, 300, 64100, 0, 0, 0],
  [64100, 800, 3776, -1, -1, -1, 6150, 0, 0, 64900, 1, 0, 0],
  [65400, 400, 0, -1, -1, -1, 6150, 0, 0, 65900, 1, 0, 0],
  [66400, 600, 2016, -1, -1, -1, 6150, 0, 0, 67000, 1, 0, 0],
  [67500, 600, 1760, -1, -1, -1, 6150, 0, 0, 68100, 1, 0, 0],
  [68600, 1300, 7202, 1100, 100, 0, 6150, 277, 300, 70900, 0, 0, 0],
  [70900, 700, 2016, -1, -1, -1, 6427, 0, 0, 71600, 1, 0, 0],
  [72100, 700, 2016, -1, -1, -1, 6427, 0, 0, 72800, 1, 0, 0],
  [73300, 600, 1824, -1, -1, -1, 6427, 0, 0, 73900, 1, 0, 0],
  [74400, 500, 1760, -1, -1, -1, 6427, 0, 0, 74900, 1, 0, 0],
  [75400, 1200, 7202, 1100, 100, 0, 6427, 272, 400, 77700, 0, 0, 0],
  [77700, 700, 1696, -1, -1, -1, 6699, 0, 0, 78500, 1, 0, 0],
  [79000, 600, 1856, -1, -1, -1, 6699, 0, 0, 79500, 1, 0, 0],
  [80000, 600, 1792, -1, -1, -1, 6699, 0, 0, 80700, 1, 0, 0],
  [81200, 500, 0, -1, -1, -1, 6699, 0, 0, 81700, 1, 0, 0],
  [82200, 1200, 7202, 1200, 100, 0, 6699, 244, 400, 84600, 0, 0, 0],
  [84600, 600, 1856, -1, -1, -1, 6943, 0, 0, 85200, 1, 0, 0],
  [85700, 500, 1600, -1, -1, -1, 6943, 0, 0, 86300, 1, 0, 0],
  [86800, 500, 0, -1, -1, -1, 6943, 0, 0, 87200, 1, 0, 0],
  [87700, 600, 1760, -1, -1, -1, 6943, 0, 0, 88300, 1, 0, 0],
  [88800, 1300, 7202, 1100, 100, 0, 6943, 195, 300, 91200, 0, 0, 0],
  [91200, 600, 1824, -1, -1, -1, 7138, 0, 0, 91800, 1, 0, 0],
  [92300, 600, 1664, -1, -1, -1, 7138, 0, 0, 93000, 1, 0, 0],
  [93500, 500, 0, -1, -1, -1, 7138, 0, 0, 93900, 1, 0, 0],
  [94400, 600, 1632, -1, -1, -1, 7138, 0, 0, 95000, 1, 0, 0],
  [95500, 1200, 7202, 1100, 100, 0, 7138, 212, 300, 97900, 0, 0, 0],
  [97900, 700, 1760, -1, -1, -1, 7350, 0, 0, 98600, 1, 0, 0],
  [99100, 400, 0, -1, -1, -1, 7350, 0, 0, 99500, 1, 0, 0],
  [100000, 600, 1728, -1, -1, -1, 7350, 0, 0, 100600, 1, 0, 0],
  [101100, 300, 0, -1, -1, -1, 7350, 0, 0, 101500, 1, 0, 0],
  [102000, 1200, 7202, 1100, 100, 0, 7350, 207, 300, 104400, 0, 0, 0],
  [104400, 600, 1856, -1, -1, -1, 7557, 0, 0, 105000, 1, 0, 0],
  [105500, 500, 2016, -1, -1, -1, 7557, 0, 0, 106100, 1, 0, 0],
  [106600, 500, 0, -1, -1, -1, 7557, 0, 0, 107200, 1, 0, 0],
  [107700, 500, 0, -1, -1, -1, 7557, 0, 0, 108200, 1, 0, 0],
  [108700, 1300, 7202, 1200, 100, 0, 7557, 223, 300, 111200, 0, 0, 0],
  [111200, 500, 0, -1, -1, -1, 7780, 0, 0, 111700, 1, 0, 0],
  [112200, 400, 0, -1, -1, -1, 7780, 0, 0, 112700, 1, 0, 0],
  [113200, 500, 0, -1, -1, -1, 7780, 0, 0, 113700, 1, 0, 0],
  [114300, 700, 2048, -1, -1, -1, 7780, 0, 0, 114900, 1, 0, 0],
  [115400, 1300, 7202, 1200, 100, 0, 7780, 170, 300, 117900, 0, 0, 0],
  [117900, 500, 0, -1, -1, -1, 7950, 0, 0, 118400, 1, 0, 0],
  [118900, 700, 1696, -1, -1, -1, 7950, 0, 0, 119600, 1, 0, 0],
  [120100, 500, 0, -1, -1, -1, 7950, 0, 0, 120700, 1, 0, 0],
  [121200, 500, 0, -1, -1, -1, 7950, 0, 0, 121600, 1, 0, 0],
  [122100, 1300, 7202, 1300, 100, 0, 7950, 264, 400, 124700, 0, 0, 0],
  [124700, 400, 0, -1, -1, -1, 8214, 0, 0, 125100, 1, 0, 0],
  [125600, 600, 1856, -1, -1, -1, 8214, 0, 0, 126200, 1, 0, 0],
  [126700, 700, 2048, -1, -1, -1, 8214, 0, 0, 127400, 1, 0, 0],
  [127900, 600, 1856, -1, -1, -1, 8214, 0, 0, 128500, 1, 0, 0],
  [129000, 1200, 7202, 1200, 100, 0, 8214, 175, 400, 131500, 0, 0, 0],
  [131500, 500, 0, -1, -1, -1, 8389, 0, 0, 132000, 1, 0, 0],
  [132500, 700, 1888, -1, -1, -1, 8389, 0, 0, 133200, 1, 0, 0],
  [133700, 400, 0, -1, -1, -1, 8389, 0, 0, 134200, 1, 0, 0],
  [134700, 400, 0, -1, -1, -1, 8389, 0, 0, 135100, 1, 0, 0],
  [135700, 1300, 7202, 1300, 100, 0, 8389, 197, 400, 138300, 0, 0, 0],
  [138300, 400, 0, -1, -1, -1, 8586, 0, 0, 138700, 1, 0, 0],
  [139200, 600, 1920, -1, -1, -1, 8586, 0, 0, 139800, 1, 0, 0],
  [140300, 400, 0, -1, -1, -1, 8586, 0, 0, 140800, 1, 0, 0],
  [141300, 600, 0, -1, -1, -1, 8586, 0, 0, 141900, 1, 0, 0],
  [142400, 1400, 7202, 1300, 100, 0, 8586, 176, 400, 145000, 0, 0, 0],
  [145000, 400, 0, -1, -1, -1, 8762, 0, 0, 145500, 1, 0, 0],
  [146000, 700, 1536, -1, -1, -1, 8762, 0, 0, 146700, 1, 0, 0],
  [147200, 500, 0, -1, -1, -1, 8762, 0, 0, 147700, 1, 0, 0],
  [148200, 600, 0, -1, -1, -1, 8762, 0, 0, 148800, 1, 0, 0],
  [149300, 1400, 7202, 1400, 100, 0, 8762, 221, 400, 152100, 0, 0, 0],
  [152100, 200, 0, -1, -1, -1, -1, -1, 0, 152300, 1, 0, 0],
  [152800, 500, 0, -1, -1, -1, 8983, 0, 0, 153400, 1, 0, 0],
  [153900, 400, 0, -1, -1, -1, 8983, 0, 0, 154400, 1, 0, 0],
  [154900, 500, 0, -1, -1, -1, 8983, 0, 0, 155400, 1, 0, 0],
  [155900, 1500, 7202, 1400, 100, 0, 8983, 119, 400, 158800, 0, 0, 0],
  [158800, 100, 0, -1, -1, -1, -1, -1, 0, 158900, 1, 0, 0],
  [159400, 400, 0, -1, -1, -1, 9102, 0, 0, 159900, 1, 0, 0],
  [160400, 500, 0, -1, -1, -1, 9102, 0, 0, 160900, 1, 0, 0],
  [161400, 500, 0, -1, -1, -1, 9102, 0, 0, 161900, 1, 0, 0],
  [162400, 1500, 7202, 1500, 100, 0, 9102, 156, 400, 165300, 0, 0, 0],
  [165300, 0, 0, -1, -1, -1, -1, -1, 0, 165400, 1, 0, 0],
  [165900, 600, 0, -1, -1, -1, 9258, 0, 0, 166500, 1, 0, 0],
  [167100, 500, 0, -1, -1, -1, 9258, 0, 0, 167600, 1, 0, 0],
  [168100, 500, 0, -1, -1, -1, 9258, 0, 0, 168600, 1, 0, 0],
  [169100, 1400, 7202, 1500, 100, 0, 9258, 46, 400, 172000, 0, 0, 0],
  [172000, 100, 0, -1, -1, -1, -1, -1, 0, 172100, 1, 0, 0],
  [172600, 700, 1856, -1, -1, -1, 9304, 0, 0, 173300, 1, 0, 0],
  [173800, 600, 0, -1, -1, -1, 9304, 0, 0, 174400, 1, 0, 0],
  [174900, 500, 0, -1, -1, -1, 9304, 0, 0, 175500, 1, 0, 0],
  [176000, 1400, 7202, 1200, 100, 0, 9304, -1, 0, 179100, 2, 300, 200],
];
