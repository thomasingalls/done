/** Phase 565: what a local history reduction has done and measured during this open of the app,
 * and the estimates the History panel shows from it. Presentation only. Nothing here schedules,
 * admits, stores or authorizes anything, and nothing read from it changes when or whether a
 * reduction runs. Pure and dependency-light, so the page can import it.
 *
 * A reduction proceeds in passes. Each pass reads every saved row, re-checks what earlier passes
 * saved, checks fresh results until its budget, and saves them; the pass that reaches the end
 * of checking builds the smaller history and saves it instead. The panel shows three steps:
 * 1. check saved history (durability, reading, opening, verifying; repeats in passes),
 * 2. build the smaller history (building, coverage, current),
 * 3. save it (installing, readback). */
import { RETENTION_STAGES, type RetentionProgress } from './contentMaintenance';

type Stage = RetentionProgress['stage'];
/** Facts about the reduction in progress (or the one that just finished), kept in memory by the
 * scheduler and published beside its status. Times are wall clock (`Date.now()`) milliseconds;
 * durations are milliseconds; counts are verified results (preparation receipts). */
export interface LocalReductionFacts {
  /** When this reduction's first pass began. */
  readonly since: number;
  /** Passes begun in this reduction. Every pass re-reads all saved history. */
  readonly pass: number;
  /** When the active or last pass began, its latest stage, and when that stage and its step began. */
  readonly passSince: number;
  readonly stage: Stage;
  readonly stageSince: number;
  readonly stepSince: number;
  /** Routine sync could run when the pass began, so waits between passes include its pauses. */
  readonly online: boolean;
  /** When the last pass ended; absent while a pass runs. */
  readonly endedAt?: number;
  /** When the reduction completed. */
  readonly finishedAt?: number;
  /** Results saved and reusable: imported when the pass began, or after its save. */
  readonly saved?: number;
  /** Results held in the active pass: saved plus its fresh results, unsaved until it saves. */
  readonly held?: number;
  /** About how many results a full check makes (the census estimate), and the exact number once
   * a full check of this history completed. */
  readonly planned?: number;
  readonly total?: number;
  /** Results held before the latest loss (a cut pass's fresh work, a saved checkpoint that could
   * not be reused): what is being redone. Cleared at the next save or once caught up. */
  readonly lostFrom?: number;
  /** The census estimate grew when this pass began: new history arrived. */
  readonly grew?: boolean;
  /** Active pass: its first fresh check, its latest count and fresh results so far. `budgetMs`:
   * the latest fresh-work budget a pass reported (the active pass's once it reports one). */
  readonly freshSince?: number;
  readonly countedAt?: number;
  readonly fresh?: number;
  readonly budgetMs?: number;
  /** Measured in this reduction. `readMs`: the last pass's start to its checking (durability,
   * reading, opening). `prefixMs`: its checking's start to its first fresh check, re-checking
   * `prefixOf` saved results; `prefixBaseMs`/`prefixBaseOf`: the same for the first pass that
   * measured it. `freshMs`/`freshOf`: fresh-check time and results over ended passes;
   * `lastFreshMs`/`lastFreshOf`: the same over a window in which each earlier pass weighs 0.9. `sliceMs`: the last saved pass's fresh
   * work. `saveMs`: its save. `waitMs`: the shortest wait between passes. `buildMs`/`storeMs`: the
   * longest time seen in steps 2 and 3. */
  readonly readMs?: number;
  readonly prefixMs?: number;
  readonly prefixOf?: number;
  readonly prefixBaseMs?: number;
  readonly prefixBaseOf?: number;
  readonly freshMs?: number;
  readonly freshOf?: number;
  readonly lastFreshMs?: number;
  readonly lastFreshOf?: number;
  readonly sliceMs?: number;
  readonly saveMs?: number;
  readonly waitMs?: number;
  readonly buildMs?: number;
  readonly storeMs?: number;
}
const numberFields = [
  'since',
  'pass',
  'passSince',
  'stageSince',
  'stepSince',
  'endedAt',
  'finishedAt',
  'saved',
  'held',
  'planned',
  'total',
  'lostFrom',
  'freshSince',
  'countedAt',
  'fresh',
  'budgetMs',
  'readMs',
  'prefixMs',
  'prefixOf',
  'prefixBaseMs',
  'prefixBaseOf',
  'freshMs',
  'freshOf',
  'lastFreshMs',
  'lastFreshOf',
  'sliceMs',
  'saveMs',
  'waitMs',
  'buildMs',
  'storeMs',
] as const;
const required = ['since', 'pass', 'passSince', 'stageSince', 'stepSince'] as const;
/** The step a stage belongs to. */
export function reductionStep(stage: Stage): 1 | 2 | 3 {
  return stage === 'building' || stage === 'coverage' || stage === 'current'
    ? 2
    : stage === 'installing' || stage === 'readback' || stage === 'complete'
      ? 3
      : 1;
}
const whole = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
/** Presentation only: a frozen copy of well-formed facts, or undefined. It crosses from the Worker
 * to the page; anything else is dropped and the page falls back to the stage sentences. */
export function copyReductionFacts(input: unknown): LocalReductionFacts | undefined {
  try {
    if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype)
      return;
    const d = Object.getOwnPropertyDescriptors(input);
    const known = new Set<string>([...numberFields, 'stage', 'online', 'grew']);
    for (const key of Reflect.ownKeys(input))
      if (typeof key !== 'string' || !known.has(key) || !('value' in d[key]!)) return;
    const value = (k: string): unknown => d[k]?.value;
    if (required.some((k) => !whole(value(k)))) return;
    const out: Record<string, unknown> = {};
    for (const k of numberFields) {
      const v = value(k);
      if (v === undefined) continue;
      if (!whole(v)) return;
      out[k] = v;
    }
    const stage = value('stage'),
      online = value('online'),
      grew = value('grew');
    if (!RETENTION_STAGES.includes(stage as Stage) || typeof online !== 'boolean') return;
    if (grew !== undefined && grew !== true) return;
    if ((out['pass'] as number) < 1) return;
    return Object.freeze({
      ...out,
      stage,
      online,
      ...(grew ? { grew: true } : {}),
    }) as unknown as LocalReductionFacts;
  } catch {
    return;
  }
}
const ms = (v: number) => Math.max(0, Math.round(v));
type Mutable = { -readonly [K in keyof LocalReductionFacts]: LocalReductionFacts[K] };
const without = (f: LocalReductionFacts, ...keys: (keyof LocalReductionFacts)[]) => {
  const copy: Partial<Mutable> = { ...f };
  for (const k of keys) delete copy[k];
  return copy as Mutable;
};
/** A pass began at `at`. A finished or absent reduction starts a new one. */
export function beginReductionPass(
  prior: LocalReductionFacts | undefined,
  at: number,
  online: boolean,
): LocalReductionFacts {
  at = ms(at);
  if (!prior || prior.finishedAt !== undefined)
    return Object.freeze({
      since: at,
      pass: 1,
      passSince: at,
      stage: 'durability',
      stageSince: at,
      stepSince: at,
      online,
    });
  const next = without(prior, 'endedAt', 'freshSince', 'countedAt', 'fresh', 'grew');
  if (prior.endedAt !== undefined) {
    const wait = ms(at - prior.endedAt);
    next.waitMs = Math.min(prior.waitMs ?? wait, wait);
  }
  if (prior.saved !== undefined) next.held = prior.saved;
  return Object.freeze({
    ...next,
    pass: prior.pass + 1,
    passSince: at,
    stage: 'durability' as const,
    stageSince: at,
    stepSince: at,
    online,
  });
}
/** Fold one progress report of the active pass. Returns `facts` itself when nothing changed. */
export function recordReductionProgress(
  facts: LocalReductionFacts,
  progress: RetentionProgress,
  at: number,
): LocalReductionFacts {
  at = ms(at);
  const next: Mutable = { ...facts };
  let changed = false;
  if (progress.stage !== facts.stage) {
    changed = true;
    const from = reductionStep(facts.stage),
      to = reductionStep(progress.stage);
    next.stage = progress.stage;
    next.stageSince = at;
    if (progress.stage === 'verifying' && from === 1) next.readMs = ms(at - facts.passSince);
    if (to !== from) {
      next.stepSince = at;
      // Leaving step 1 for step 2 means this pass checked everything: the count it reported is
      // exact. A pass without the journal's counts reported none.
      if (from === 1 && to === 2 && facts.countedAt !== undefined && facts.held !== undefined)
        next.total = facts.held;
      if (from === 2) next.buildMs = Math.max(facts.buildMs ?? 0, ms(at - facts.stepSince));
    }
  }
  if (progress.stage === 'verifying' && progress.held !== undefined) {
    changed = true;
    const first = facts.countedAt === undefined;
    if (first && progress.saved !== undefined) {
      // Saved progress that this pass could not import was lost (for example a stale
      // checkpoint); show it as being redone rather than silently starting lower.
      if (facts.saved !== undefined && progress.saved < facts.saved)
        next.lostFrom = Math.max(facts.lostFrom ?? 0, facts.saved);
      next.saved = progress.saved;
    }
    if (progress.planned !== undefined) {
      if (first && facts.planned !== undefined && progress.planned > facts.planned)
        next.grew = true;
      if (progress.planned !== facts.planned && facts.total !== undefined) delete next.total;
      next.planned = progress.planned;
    }
    next.held = progress.held;
    if (progress.fresh !== undefined) next.fresh = progress.fresh;
    next.countedAt = at;
    if (progress.budget !== undefined && facts.freshSince === undefined) {
      next.freshSince = at;
      next.budgetMs = progress.budget;
      next.prefixMs = ms(at - facts.stageSince);
      next.prefixOf = next.saved ?? 0;
      if (facts.prefixBaseMs === undefined) {
        next.prefixBaseMs = next.prefixMs;
        next.prefixBaseOf = next.prefixOf;
      }
    }
    if (next.lostFrom !== undefined && next.held >= next.lostFrom) delete next.lostFrom;
  }
  return changed ? Object.freeze(next) : facts;
}
/** The active pass ended at `at`: `saved` (its fresh results were saved), `removed` (the reduction
 * completed) or `cut` (anything else: what it held beyond its saved results is lost). */
export function endReductionPass(
  facts: LocalReductionFacts,
  outcome: 'saved' | 'removed' | 'cut',
  at: number,
): LocalReductionFacts {
  at = ms(at);
  const next = without(facts, 'freshSince', 'countedAt', 'fresh');
  next.endedAt = at;
  const live =
    facts.freshSince !== undefined && facts.countedAt !== undefined
      ? ms(facts.countedAt - facts.freshSince)
      : undefined;
  // Fresh checking time and results measure the rate, whatever ended the pass.
  if (live !== undefined && (facts.fresh ?? 0) > 0) {
    next.freshMs = (facts.freshMs ?? 0) + live;
    next.freshOf = (facts.freshOf ?? 0) + facts.fresh!;
    // A decaying window over ended passes: each earlier pass weighs nine tenths as much.
    next.lastFreshMs = Math.round(0.9 * (facts.lastFreshMs ?? 0)) + live;
    next.lastFreshOf = Math.round(0.9 * (facts.lastFreshOf ?? 0)) + facts.fresh!;
  }
  const step = reductionStep(facts.stage);
  if (step === 2) next.buildMs = Math.max(facts.buildMs ?? 0, ms(at - facts.stepSince));
  if (step === 3 && facts.stage !== 'complete')
    next.storeMs = Math.max(facts.storeMs ?? 0, ms(at - facts.stepSince));
  if (outcome === 'removed') next.finishedAt = at;
  else if (outcome === 'saved') {
    if (facts.held !== undefined) next.saved = facts.held;
    if (live !== undefined) next.sliceMs = live;
    if (facts.countedAt !== undefined) next.saveMs = ms(at - facts.countedAt);
    delete next.lostFrom;
  } else if (facts.held !== undefined && facts.saved !== undefined && facts.held > facts.saved) {
    next.lostFrom = Math.max(facts.lostFrom ?? 0, facts.held);
    next.held = facts.saved;
  }
  return Object.freeze(next);
}

/** The smallest estimate shown while work continues; an estimate never reaches zero. */
export const REDUCTION_MIN_LEFT_MS = 10_000;
export interface ReductionEstimate {
  /** The step running now, or for a paused reduction the step its next pass starts with. */
  readonly step: 1 | 2 | 3;
  readonly pass: number;
  /** Percent of checking done in this reduction: saved results plus the active pass's fresh ones.
   * Below 100 until a full check completed. Absent without a total to measure against. */
  readonly checked?: number;
  /** Percent saved and reusable. */
  readonly saved?: number;
  /** The total is exact (a full check completed), not the census estimate. */
  readonly exact: boolean;
  /** Checking that has to be redone: the percent held before the loss, and the percent now. */
  readonly redo?: { readonly from: number; readonly to: number };
  /** New history arrived at this pass, so there is more to check. */
  readonly grew: boolean;
  /** Running: milliseconds left in the active step and in the whole reduction. Absent: estimating. */
  readonly stepLeft?: number;
  readonly allLeft?: number;
  /** Paused: milliseconds of quiet work the reduction still needs. Absent: estimating. */
  readonly workLeft?: number;
  /** The active part of the step outlasted its estimate; the time left was re-estimated. */
  readonly overrun: boolean;
  /** Online, with passes ahead: whether the whole-reduction figure counts the pauses between passes
   * that let sync run, as measured on this device (`included`), or not yet measured (`excluded`).
   * Otherwise `none` (offline, a measured wait between passes is still in the figure). */
  readonly waits: 'included' | 'excluded' | 'none';
}
/** Estimates from what this device measured in this reduction (`facts`), at `now`.
 *
 * Step 1: results left = total (exact, else the census estimate) less results held; fresh time
 * left = results left / the fresh rate, the slower of this reduction's and the recent passes'
 * (each earlier pass weighing 0.9), both measured over ended passes (the first pass's own, until
 * it ends). The active pass finishes its budget, then
 * saves (the measured save; before one, as long as the setup, as the owner reserves it). Each
 * later pass costs the measured reading, the re-check of saved results (the measured prefix,
 * with the per-result slope between the first and latest measured prefixes, at the midpoint of
 * held and total results) and a slice (the last saved slice, else the latest budget), with the
 * shortest measured wait between passes. Steps 2 and 3 are seen only in the final pass: each is
 * allowed one full read of saved history (the measured `readMs`), or the longest time seen in it
 * if that is longer. A part that outlasts its estimate is re-estimated as half the time it has
 * taken so far, never below `REDUCTION_MIN_LEFT_MS`. */
export function estimateReduction(
  facts: LocalReductionFacts,
  running: boolean,
  now: number,
): ReductionEstimate {
  const total = facts.total ?? facts.planned;
  const percent = (n: number | undefined) =>
    total === undefined || n === undefined
      ? undefined
      : Math.min(99, Math.floor((100 * n) / Math.max(total, 1)));
  const step = running ? reductionStep(facts.stage) : 1;
  const held = facts.held ?? facts.saved;
  const checked = step === 1 ? percent(held) : 100;
  const saved = percent(facts.saved);
  const from = percent(facts.lostFrom);
  const redo =
    from !== undefined && saved !== undefined && from > saved ? { from, to: saved } : undefined;
  let overrun = false;
  const overran = (elapsed: number) => {
    overrun = true;
    return Math.max(REDUCTION_MIN_LEFT_MS, elapsed / 2);
  };
  // Measurements.
  const read = facts.readMs;
  // Re-checking costs a fixed part (reading the census) plus a part per saved result: the slope
  // between the first and the latest measured prefix. With one measurement, the prefix as measured.
  const { prefixMs, prefixOf, prefixBaseMs, prefixBaseOf } = facts;
  const prefixPer =
    prefixMs !== undefined &&
    prefixOf !== undefined &&
    prefixBaseMs !== undefined &&
    prefixBaseOf !== undefined &&
    prefixOf > prefixBaseOf
      ? Math.max(0, (prefixMs - prefixBaseMs) / (prefixOf - prefixBaseOf))
      : undefined;
  const prefixFor = (results: number) =>
    prefixMs === undefined
      ? undefined
      : prefixPer === undefined
        ? prefixMs
        : Math.max(prefixBaseMs ?? 0, prefixMs + prefixPer * (results - prefixOf!));
  // The active pass's own fresh work counts only until an ended pass has measured a rate: its
  // first moments check whatever family comes first, and would swing the estimate.
  const liveFresh =
    running &&
    step === 1 &&
    !facts.freshOf &&
    facts.freshSince !== undefined &&
    facts.countedAt !== undefined
      ? { results: facts.fresh ?? 0, ms: facts.countedAt - facts.freshSince }
      : { results: 0, ms: 0 };
  // The slower of the rate over this reduction and over recent passes: checks come in families
  // of different cost, and a slower family that has begun should not be promised away.
  const rateResults = (facts.freshOf ?? 0) + liveFresh.results,
    rateMs = (facts.freshMs ?? 0) + liveFresh.ms;
  const overall = rateResults > 0 && rateMs > 0 ? rateResults / rateMs : undefined;
  const recent =
    facts.lastFreshOf && facts.lastFreshMs ? facts.lastFreshOf / facts.lastFreshMs : undefined;
  const rate = overall === undefined ? undefined : Math.min(overall, recent ?? overall);
  // Later passes re-check more saved results each; sized at the midpoint of what is held now and
  // the total, so the re-check's growth is counted without charging every pass for the last.
  const futurePrefix =
    total === undefined ? undefined : prefixFor(((held ?? 0) + Math.max(total, held ?? 0)) / 2);
  const setup = read === undefined || futurePrefix === undefined ? undefined : read + futurePrefix;
  const save = facts.saveMs ?? setup;
  const slice = facts.sliceMs ?? facts.budgetMs;
  const wait = facts.waitMs;
  // Steps 2 and 3: one full read each, or longer if this reduction already saw them take longer.
  const build = read === undefined ? undefined : Math.max(read, facts.buildMs ?? 0);
  const store = read === undefined ? undefined : Math.max(read, facts.storeMs ?? 0);
  /** Later passes for `fresh` milliseconds of fresh work, from a pass's start: work and waits. */
  const later = (fresh: number) => {
    if (fresh <= 0) return { work: 0, passes: 0 };
    if (setup === undefined || save === undefined || !slice) return undefined;
    const passes = Math.ceil(fresh / slice);
    return { work: passes * setup + fresh + (passes - 1) * save, passes };
  };
  const left = total === undefined || held === undefined ? undefined : Math.max(0, total - held);
  const freshLeft = left === undefined || rate === undefined ? undefined : left / rate;
  let stepLeft: number | undefined, allLeft: number | undefined, workLeft: number | undefined;
  let passesAhead = 0;
  if (!running) {
    const plan = freshLeft === undefined ? undefined : later(freshLeft);
    if (plan && build !== undefined && store !== undefined) {
      passesAhead = Math.max(0, plan.passes - 1);
      workLeft = plan.work + build + store + passesAhead * (wait ?? 0);
    }
  } else if (step === 1) {
    let step1: number | undefined;
    if (facts.freshSince === undefined) {
      // Before this pass's first fresh check: reading and re-checking saved results.
      const expected =
        read === undefined || facts.saved === undefined ? undefined : prefixFor(facts.saved);
      const elapsed = now - facts.passSince;
      if (expected !== undefined && read !== undefined && freshLeft !== undefined && slice) {
        const before = read + expected;
        const setupLeft = before - elapsed > 0 ? before - elapsed : overran(elapsed);
        if (freshLeft <= slice) step1 = setupLeft + freshLeft;
        else {
          const plan = later(freshLeft - slice);
          if (plan && save !== undefined) {
            step1 = setupLeft + slice + save + plan.work + plan.passes * (wait ?? 0);
            passesAhead = plan.passes;
          }
        }
      }
    } else if (freshLeft !== undefined) {
      const elapsed = now - facts.freshSince,
        budget = facts.budgetMs ?? 0;
      if (left === 0) step1 = overran(elapsed);
      else if (freshLeft <= budget - elapsed) step1 = freshLeft;
      else if (elapsed < budget) {
        const plan = later(freshLeft - (budget - elapsed));
        if (plan && save !== undefined) {
          step1 = budget - elapsed + save + plan.work + plan.passes * (wait ?? 0);
          passesAhead = plan.passes;
        }
      } else if (save !== undefined) {
        // The slice is over: the pass is saving.
        const saving = elapsed - budget;
        const plan = later(freshLeft);
        if (plan) {
          step1 = (save - saving > 0 ? save - saving : overran(saving)) + plan.work;
          step1 += plan.passes * (wait ?? 0);
          passesAhead = plan.passes;
        }
      }
    }
    stepLeft = step1;
    if (step1 !== undefined && build !== undefined && store !== undefined)
      allLeft = step1 + build + store;
  } else if (facts.stage !== 'complete') {
    const length = step === 2 ? build : store;
    const elapsed = now - facts.stepSince;
    if (length !== undefined) {
      stepLeft = length - elapsed > 0 ? length - elapsed : overran(elapsed);
      allLeft = step === 2 ? stepLeft + store! : stepLeft;
    }
  }
  // A figure shown while work continues is never zero.
  const floor = (v: number) => Math.max(REDUCTION_MIN_LEFT_MS / 10, v);
  return Object.freeze({
    step,
    pass: facts.pass,
    ...(checked === undefined ? {} : { checked }),
    ...(saved === undefined ? {} : { saved }),
    exact: facts.total !== undefined,
    ...(redo ? { redo } : {}),
    grew: facts.grew === true,
    ...(stepLeft === undefined ? {} : { stepLeft: floor(stepLeft) }),
    ...(allLeft === undefined ? {} : { allLeft: floor(allLeft) }),
    ...(workLeft === undefined ? {} : { workLeft: floor(workLeft) }),
    overrun: overrun as boolean,
    // Measured waits are always in the figure; only online are they pauses that let sync run.
    waits:
      passesAhead === 0 || !facts.online ? 'none' : wait !== undefined ? 'included' : 'excluded',
  });
}
/** Wording-ready rounding: seconds only under a minute, in steps of ten, rounded up, and never
 * below ten (so never zero); otherwise minutes rounded up; whole hours, rounded up, from two
 * hours. */
export interface ReadableDuration {
  readonly unit: 'seconds' | 'minutes' | 'hours';
  readonly value: number;
}
export function readableDuration(milliseconds: number): ReadableDuration {
  const tens = Math.max(10, Math.ceil((milliseconds > 0 ? milliseconds : 0) / 10_000) * 10);
  if (tens < 60) return { unit: 'seconds', value: tens };
  const minutes = Math.ceil(milliseconds / 60_000);
  if (minutes < 120) return { unit: 'minutes', value: minutes };
  return { unit: 'hours', value: Math.ceil(milliseconds / 3_600_000) };
}
