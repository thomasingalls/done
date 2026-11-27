/** Scheduling hints are not retention proofs. Only the current owner's removal path may mutate. */
import {
  copyRetentionProgress,
  type RetentionProgress,
  type RetentionProgressSink,
  type MaintenanceInterrupted,
  isPriorityOnlyMaintenanceInterruption,
} from './contentMaintenance';
import { PreparationCapacity } from './preparationCapacity';
import { LocalBaselineError } from './localBaselineError';
import { copyRetentionDetail, type LocalRetentionDetail } from './localRetentionDetail';
import { PREPARATION_SETUP_RATIO } from './retentionPreparation';
export type { LocalRetentionCause, LocalRetentionDetail } from './localRetentionDetail';
export interface LocalRetentionHint {
  readonly revision: number;
  readonly records: number;
  /** The adopted view holds an installation older builds cannot replay (`InboundState.foldDue`).
   * Its reduction is due now: no growth threshold or cooldown, every other check unchanged. */
  readonly fold?: true;
}
export const LOCAL_RETENTION_MIN_RECORDS = 1024;
export const LOCAL_RETENTION_QUIET_MS = 10000;
export const LOCAL_RETENTION_COOLDOWN_MS = 30 * 60000;
export const LOCAL_RETENTION_RETRY_MS = 60000;
/** Consecutive completed folds that may skip the cooldown while the owner still reports one due.
 * A correct fold clears the report, so this only bounds a fold that did not carry it. */
export const LOCAL_RETENTION_FOLD_STREAK = 3;
/** A settled hold's budget (scheduling bound, unmeasured). Before a window's first save it is at
 * least what this device measured one saved slice needs, and an attempt still running unsaved and
 * uninterrupted when it lapses gets a longer one instead of losing its work (phase 564). */
export const LOCAL_RETENTION_HOLD_MS = 5 * 60000;
/** Normal sync window after a hold or poll deferral ends, before it may engage again. */
export const LOCAL_RETENTION_HOLD_YIELD_MS = 60000;
/** The idle-poll deferral's first window, used only until this history has a measured setup.
 * After that a run's window is what the device measured one saved slice needs (`measuredNeed`),
 * and an attempt still running unsaved when its window ends gets a longer one, so no setup
 * duration can keep a device from saving (phase 564). The deferral ends at the run's first save
 * and the yield follows. Hints and other sync signals are never deferred by it. */
export const LOCAL_RETENTION_POLL_HOLD_MS = 60000;
/** What one more saved slice needs, from this device's measurements: the setup, a slice of
 * `PREPARATION_SETUP_RATIO` times setup and save (the owner's grown budget), and the save. A save
 * not yet measured counts as long as the setup, as the owner reserves it (phase 564). */
export function measuredNeed(setupMs: number, saveMs?: number) {
  return (1 + PREPARATION_SETUP_RATIO) * (setupMs + (saveMs ?? setupMs));
}
/** Scheduling hint for the sync lanes. Never authority: the owner still checks every effect. */
export interface LocalRetentionHold {
  /** Do not allocate a new envelope; drive already allocated positions to acceptance. */
  readonly send: boolean;
  /** Do not start receive passes; an attempt is running or between slices. */
  readonly receive: boolean;
  /** Skip receive passes caused only by the idle poll timer; signals still start them. */
  readonly idlePoll?: boolean;
}
export interface LocalRetentionStatus {
  readonly phase: 'idle' | 'waiting' | 'running' | 'halted' | 'closed';
  readonly reason: string | undefined;
  readonly progress?: RetentionProgress & { readonly attempt: number; readonly elapsedMs: number };
  /** Present only with reason `capacity`, when the owner knows which cause fired. */
  readonly detail?: LocalRetentionDetail;
}
/** Presentation/retry port: never exposes evidence, counters or a mutation capability. */
export interface LocalRetentionView {
  readonly status: LocalRetentionStatus;
  onStatus(listener: () => void): () => void;
  retry(): void;
  readonly diagnostics?: {
    readonly attempts: number;
    readonly interruptions: number;
    readonly completions: number;
    readonly events: readonly LocalRetentionStatus['progress'][];
    readonly ownerError?: string;
    /** Longest setup and last save the owner measured on this history (phase 564). */
    readonly setupMs?: number;
    readonly saveMs?: number;
    /** Wall clock at which the engaged hold or idle-poll window ends. */
    readonly windowEndsAt?: number;
  };
}
export interface LocalRetentionRuntime extends LocalRetentionView {
  retry(): boolean;
}
export interface LocalRetentionObservation {
  /** Local readiness. Without `synchronized`, the caller has also folded sync quiet into it. */
  readonly ready: boolean;
  readonly hint: LocalRetentionHint | undefined;
  /** Both sync lanes are quiet. Omitted means already part of `ready`. */
  readonly synchronized?: boolean;
  /** Stable owner observation: reduction is the way out of a costly path, so a due attempt may
   * ask routine sync to hold. Must not flip with transient readiness such as pending input. */
  readonly hold?: boolean;
  /** Stable owner observation for any device, under the same rule as `hold`: a running attempt
   * may ask the receive lane to skip routine idle polls. Omitted means never. */
  readonly deferPolls?: boolean;
  /** Routine sync can run now (its gate is ready). False: no window protects an attempt from
   * anything, so its slice is not planned to end at one (phase 564). Omitted means it can. */
  readonly routineSync?: boolean;
}
/** The owner's measurements of an attempt, in milliseconds (phase 564). */
export type LocalRetentionMeasure = (kind: 'setup' | 'save', ms: number) => void;
type Outcome = { kind: string; reason?: string; detail?: unknown };
const interruptedOutcomes = new WeakMap<Outcome, MaintenanceInterrupted>();
/** Native scheduling metadata only. Serialization loses it and conservatively keeps 60 seconds. */
export function localRetentionInterrupted(cause: MaintenanceInterrupted) {
  const outcome = Object.freeze({ kind: 'skipped' as const, reason: 'activity-or-journal' });
  interruptedOutcomes.set(outcome, cause);
  return outcome;
}
/** Re-arms the sync lanes when the hold's tier engages, changes or releases. The scheduler reads
 * the hold live; this is deferred so a retention publish never re-enters it synchronously. */
export function watchLocalRetentionHold(
  retention: {
    readonly hold: LocalRetentionHold | undefined;
    onStatus(listener: () => void): () => void;
  },
  wake: () => void,
): () => void {
  let tier = '';
  return retention.onStatus(() => {
    const hold = retention.hold;
    const next = !hold
      ? ''
      : hold.receive
        ? 'settled'
        : hold.send
          ? 'engaged'
          : hold.idlePoll
            ? 'polls'
            : '';
    if (next === tier) return;
    tier = next;
    queueMicrotask(wake);
  });
}
const ownerErrorCode = (cause: unknown): string => {
  if (cause instanceof LocalBaselineError) {
    const code: unknown = Object.getOwnPropertyDescriptor(cause, 'reason')?.value;
    return ['scope', 'integrity', 'ineligible', 'history-required'].includes(code as string)
      ? `LocalBaselineError:${code as string}`
      : 'LocalBaselineError';
  }
  return cause instanceof Error ? 'Error' : 'non-error';
};
export function createAutomaticLocalRetention(options: {
  signal: AbortSignal;
  observe(): LocalRetentionObservation;
  /** `protectedUntil` (wall clock): when routine sync may resume and interrupt this attempt;
   * omitted when nothing can. `measure` receives the owner's setup and save times (phase 564). */
  remove(
    revision: number,
    report: RetentionProgressSink,
    protectedUntil?: number,
    measure?: LocalRetentionMeasure,
  ): Promise<Outcome>;
}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false,
    running = false,
    halted = false;
  let quietUntil = Date.now() + LOCAL_RETENTION_QUIET_MS,
    notBefore = 0,
    // The cooldown after a completed removal. A due fold skips it, at most once per retry
    // interval and for a bounded streak (`foldStreak`), so a fold that does not clear cannot loop.
    cooldownUntil = 0,
    foldNotBefore = 0,
    foldStreak = 0;
  let parked: string | undefined, reason: string | undefined;
  // Shown only beside reason `capacity`; cleared by every other outcome.
  let detail: LocalRetentionDetail | undefined;
  let wakes = 0;
  let attempts = 0,
    interruptions = 0,
    completions = 0;
  let progress: LocalRetentionStatus['progress'];
  let attemptEvents: LocalRetentionStatus['progress'][] = [];
  let currentAttempt: object | undefined;
  let ownerError: string | undefined;
  // Hold: engaged when a due attempt finds sync busy (or starts on a hold-wanting owner);
  // settled when an attempt actually starts under it. The budget runs from the first moment
  // sync is quiet under the hold, so a parked sender never waits on local readiness unbounded.
  let holdSince: number | undefined,
    holdSettled = false,
    holdTimer: ReturnType<typeof setTimeout> | undefined,
    holdYieldUntil = 0,
    holdSpent = false,
    publishedHold = 0;
  // When the settled hold's budget lapses and routine sync resumes (phase 556), from when it began.
  let holdEndsAt: number | undefined,
    holdBudgetSince: number | undefined,
    // An attempt in this held window was cut (input or the journal): the person is active, so its
    // budget lapses as before instead of growing (phase 564).
    holdCut = false;
  // Holding sync is for progress (a saved slice or a completed removal). A held window that ends,
  // by its budget or by an outcome, with neither marks the history it was engaged on: no further
  // hold on that history until progress, a manual check or reopening. A saved account attempt
  // blocks every history until an attempt gets past it, since no quiet sync can finish it.
  let holdKey: string | undefined,
    holdProgress = false,
    holdIdleKey: string | undefined,
    holdBlocked = false;
  // Poll deferral, on any device without the hold: a running attempt asks the receive lane to skip
  // routine idle polls until its run's first save, then the yield follows (phase 564). Hints still
  // run. Any other end of the attempt releases it, so the deferred poll runs before the next one.
  let pollSince: number | undefined,
    pollEndsAt = 0,
    pollTimer: ReturnType<typeof setTimeout> | undefined,
    pollYieldUntil = 0;
  // What the owner measured on this history (phase 564): the longest setup and the last save. They
  // size each window; a completed removal starts a new history and clears them.
  let measuredSetup: number | undefined, measuredSave: number | undefined;
  const need = () =>
    measuredSetup === undefined ? undefined : measuredNeed(measuredSetup, measuredSave);
  /** The next window for a running attempt that outlasted its own unsaved: twice the last, and at
   * least what the device has measured one saved slice needs. Doubling reaches any setup. */
  const longer = (length: number) => Math.max(2 * length, need() ?? 0);
  /** Inside the poll yield, a device that measured it needs longer than the yield has left cannot
   * save before a routine poll cuts it; it waits for the yield to end, when its next window starts,
   * instead of reading every row for nothing (phase 564). Routine sync that cannot run: no wait. */
  const yieldWait = (deferrable: boolean, routineSync: boolean) => {
    const now = Date.now(),
      needed = need();
    return deferrable && routineSync && needed !== undefined && now < pollYieldUntil
      ? needed >= pollYieldUntil - now
        ? pollYieldUntil
        : 0
      : 0;
  };
  const listeners = new Set<() => void>();
  let status: LocalRetentionStatus = Object.freeze({ phase: 'idle', reason: undefined });
  const holdLevel = () =>
    closed ? 0 : holdSince !== undefined ? (holdSettled ? 3 : 2) : pollSince !== undefined ? 1 : 0;
  const releasePoll = () => {
    if (pollTimer !== undefined) clearTimeout(pollTimer);
    pollTimer = undefined;
    pollSince = undefined;
  };
  const armPoll = () => {
    if (pollTimer !== undefined) clearTimeout(pollTimer);
    pollTimer = setTimeout(() => expirePoll(), Math.max(0, pollEndsAt - Date.now()));
  };
  const publish = () => {
    // Every path ends here: no attempt running means no deferral.
    if (pollSince !== undefined && !running) releasePoll();
    const phase = closed
      ? 'closed'
      : halted
        ? 'halted'
        : running
          ? 'running'
          : timer !== undefined || holdSince !== undefined
            ? 'waiting'
            : 'idle';
    const hold = holdLevel();
    const shown = reason === 'capacity' ? detail : undefined;
    if (
      status.phase === phase &&
      status.reason === reason &&
      status.progress === progress &&
      status.detail === shown &&
      publishedHold === hold
    )
      return;
    publishedHold = hold;
    status = Object.freeze({
      phase,
      reason,
      ...(progress ? { progress } : {}),
      ...(shown ? { detail: shown } : {}),
    });
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        /* observer owns its failure */
      }
    }
  };
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const releaseHold = (spend = false) => {
    if (spend) holdSpent = true;
    if (holdTimer !== undefined) clearTimeout(holdTimer);
    holdTimer = undefined;
    holdEndsAt = undefined;
    holdBudgetSince = undefined;
    holdSince = undefined;
    holdSettled = false;
  };
  /** End the held window through its budget or an outcome, marking its history if it did nothing. */
  const closeWindow = (spend = false) => {
    if (holdSince === undefined) return;
    if (!holdProgress) holdIdleKey = holdKey;
    releaseHold(spend);
  };
  /** Progress shows the hold is useful: it clears every bound but a spent hold. */
  const progressed = () => {
    holdProgress = holdSince !== undefined;
    holdIdleKey = undefined;
    holdBlocked = false;
  };
  const armHold = (length: number) => {
    if (holdTimer !== undefined) clearTimeout(holdTimer);
    holdEndsAt = holdBudgetSince! + length;
    holdTimer = setTimeout(() => expireHold(), Math.max(0, holdEndsAt - Date.now()));
  };
  const startHoldBudget = () => {
    if (holdSince !== undefined && holdTimer === undefined) {
      holdBudgetSince = Date.now();
      // Never shorter than what this device measured one saved slice needs (phase 564).
      armHold(Math.max(LOCAL_RETENTION_HOLD_MS, need() ?? 0));
    }
  };
  const observation = () => {
    const { ready, hint, synchronized, hold, deferPolls, routineSync } = options.observe();
    const fold = hint?.fold === true;
    // The episode ends when the owner stops reporting a fold; the next one starts a new streak.
    if (hint && !fold) foldStreak = 0;
    const valid =
      ready &&
      hint &&
      Number.isSafeInteger(hint.revision) &&
      hint.revision >= 0 &&
      Number.isSafeInteger(hint.records) &&
      (hint.records >= LOCAL_RETENTION_MIN_RECORDS || fold);
    // A hint withdrawn by an in-flight validation, or pending input, never releases a hold.
    // Only the owner's stable hold observation, outcomes, the budget and lifecycle do.
    if (hold !== true) releaseHold();
    // Quiet lanes under an engaged hold mean the sender is parked. Waiting for the envelope
    // already in flight (lanes still busy) stays unbounded; nothing new is withheld by it yet.
    else if (synchronized !== false) startHoldBudget();
    // Same rule for the poll deferral: a hidden page or pressure releases it even mid-attempt.
    if (deferPolls !== true) releasePoll();
    const key = hint ? `${hint.revision}:${hint.records}` : undefined;
    return {
      hint: valid
        ? {
            revision: hint.revision,
            key: key!,
            // Skip the cooldown only while the streak allows; the retry clocks always apply.
            notBefore:
              fold && foldStreak < LOCAL_RETENTION_FOLD_STREAK
                ? Math.max(notBefore, foldNotBefore)
                : Math.max(notBefore, cooldownUntil),
            fold,
          }
        : undefined,
      synchronized: synchronized !== false,
      holdable:
        hold === true &&
        !holdSpent &&
        !holdBlocked &&
        (holdIdleKey === undefined || key !== holdIdleKey),
      deferrable: deferPolls === true,
      routineSync: routineSync !== false,
    };
  };
  const schedule = () => {
    clear();
    if (closed || halted) {
      publish();
      return;
    }
    // A running attempt keeps its flight, but a hidden page or cleared owner hint still releases
    // the lanes (for example so a hidden page can publish).
    const { hint, synchronized, holdable, deferrable, routineSync } = observation();
    if (running) {
      publish();
      return;
    }
    // Busy sync used to leave no timer. A hold-wanting owner still needs the due moment.
    if (!hint || hint.key === parked || (!synchronized && !holdable)) {
      publish();
      return;
    }
    const yielding = !synchronized && holdSince === undefined ? holdYieldUntil : 0;
    const delay = Math.max(
      0,
      quietUntil - Date.now(),
      hint.notBefore - Date.now(),
      yielding - Date.now(),
      holdSince === undefined && !holdable ? yieldWait(deferrable, routineSync) - Date.now() : 0,
    );
    timer = setTimeout(() => {
      timer = undefined;
      void attempt().finally(publish);
    }, delay);
    publish();
  };
  /** The run's deferral ends: routine polls resume and the yield runs before the next window. */
  const endPollWindow = () => {
    releasePoll();
    pollYieldUntil = Date.now() + LOCAL_RETENTION_HOLD_YIELD_MS;
    publish();
  };
  const expirePoll = () => {
    pollTimer = undefined;
    if (closed || pollSince === undefined) return;
    // An attempt still running here has not saved (a save ends the window): the window was shorter
    // than this device needs. Cutting it would lose its work and the next window would be no
    // longer, so it grows instead, without a fixed ceiling (phase 564). Only routine polls wait.
    if (running) {
      pollEndsAt = pollSince + longer(pollEndsAt - pollSince);
      armPoll();
      return;
    }
    endPollWindow();
  };
  const expireHold = () => {
    holdTimer = undefined;
    if (closed || holdSince === undefined) return;
    // Same rule before a held window's first save, for an attempt nothing has cut: the budget
    // grows instead of lapsing. This hold parks the sender too, so new writing waits as long as
    // the device needs to save once (phase 564). Input in the window keeps the old bound.
    if (running && holdSettled && !holdProgress && !holdCut && holdBudgetSince !== undefined) {
      armHold(longer(holdEndsAt! - holdBudgetSince));
      publish();
      return;
    }
    // Liveness bound: routine sync resumes even mid-attempt; its next job interrupts as before.
    // A budget spent without progress does not come back on the same history.
    closeWindow();
    holdYieldUntil = Date.now() + LOCAL_RETENTION_HOLD_YIELD_MS;
    if (running) publish();
    else schedule();
  };
  const attempt = async () => {
    if (closed || halted || running) return;
    const { hint, synchronized, holdable, deferrable, routineSync } = observation();
    if (!hint || hint.key === parked) return;
    const now = Date.now();
    if (
      now <
      Math.max(
        quietUntil,
        hint.notBefore,
        holdSince === undefined && !holdable ? yieldWait(deferrable, routineSync) : 0,
      )
    ) {
      schedule();
      return;
    }
    // Due. Ask routine sync to stop at its next settled boundary; lane changes refresh us.
    if (holdSince === undefined && holdable && now >= holdYieldUntil) {
      holdSince = now;
      holdKey = hint.key;
      holdProgress = false;
      holdCut = false;
    }
    if (!synchronized) {
      if (holdSince === undefined && holdable) schedule(); // yielding: recheck when it ends
      return;
    }
    running = true;
    if (holdSince !== undefined) {
      // The settled hold already defers every receive pass, within its own budget.
      releasePoll();
      if (!holdSettled) {
        holdSettled = true;
        startHoldBudget();
      }
    } else if (
      pollSince === undefined &&
      deferrable &&
      now >= Math.max(pollYieldUntil, holdYieldUntil)
    ) {
      // Any device: a routine idle poll would cancel this attempt through the storage queue. The
      // window is what this history measured one saved slice needs (phase 564).
      pollSince = now;
      pollEndsAt = now + (need() ?? LOCAL_RETENTION_POLL_HOLD_MS);
      armPoll();
    }
    attempts++;
    const stamp = (currentAttempt = {}),
      began = Date.now();
    const measure: LocalRetentionMeasure = (kind, ms) => {
      if (closed || currentAttempt !== stamp || !Number.isFinite(ms) || ms < 0) return;
      if (kind === 'setup') measuredSetup = Math.max(measuredSetup ?? 0, ms);
      else if (kind === 'save') measuredSave = ms;
    };
    let removalComplete = false;
    let reportedAt = -Infinity;
    progress = undefined;
    attemptEvents = [];
    const report: RetentionProgressSink = (value) => {
      if (closed || !running || currentAttempt !== stamp) return;
      const next = copyRetentionProgress(value);
      if (!next) return;
      if (next.stage === 'complete' && !removalComplete) return;
      const sameStage = progress?.stage === next.stage;
      if (sameStage && progress?.completed === next.completed && progress?.total === next.total)
        return;
      if (sameStage && next.completed !== next.total && Date.now() - reportedAt < 250) return;
      progress = Object.freeze({
        ...next,
        attempt: attempts,
        elapsedMs: Math.max(progress?.elapsedMs ?? 0, Date.now() - began),
      });
      if (!sameStage && attemptEvents.length < 16) attemptEvents.push(progress);
      reportedAt = Date.now();
      publish();
    };
    publish();
    const started = wakes;
    let again = false;
    try {
      let result: Outcome;
      try {
        // When routine sync resumes and its next job interrupts (phase 556): the settled hold's
        // budget, or the end of the run's idle-poll window. Neither (a yield): now, so the slice
        // keeps the plain target. Routine sync that cannot run (an unready gate) resumes never, so
        // no window plans the slice (phase 564). Hints and input still interrupt at any time.
        const protectedUntil = !routineSync
          ? undefined
          : holdSince !== undefined && holdSettled
            ? (holdEndsAt ?? now)
            : pollSince !== undefined
              ? pollEndsAt
              : now;
        result = await options.remove(hint.revision, report, protectedUntil, measure);
      } catch (cause) {
        // All preparation ceilings share this closed class. Saved receipts remain intact;
        // the existing skipped path parks this exact hint behind the retry clock.
        if (!(cause instanceof PreparationCapacity)) throw cause;
        result = { kind: 'skipped', reason: 'capacity', detail: cause.detail };
      }
      if (closed) return;
      if (result.kind === 'removed' || result.kind === 'already-removed') {
        completions++;
        removalComplete = true;
        if (progress) report({ stage: 'complete' });
        reason = undefined;
        detail = undefined;
        notBefore = 0;
        cooldownUntil = Date.now() + LOCAL_RETENTION_COOLDOWN_MS;
        if (hint.fold) {
          foldStreak++;
          foldNotBefore = Date.now() + LOCAL_RETENTION_RETRY_MS;
        }
        progressed();
        releaseHold();
        // A new, smaller history: its windows start from new measurements.
        measuredSetup = measuredSave = undefined;
        again = true;
      } else if (result.kind === 'preparation-saved') {
        // Useful bounded work is durable. Yield before another slice; input/readiness still wins.
        reason = 'preparation-saved';
        detail = undefined;
        notBefore = 0;
        progressed();
        // The run's idle-poll window ends at its first save; routine polls get the yield before
        // the next window (phase 564). The next slice may still start at once, unprotected.
        if (pollSince !== undefined) {
          releasePoll();
          pollYieldUntil = Date.now() + LOCAL_RETENTION_HOLD_YIELD_MS;
        }
        again = true;
      } else if (result.kind === 'skipped') {
        const why = result.reason ?? '';
        if (why === 'activity-or-journal') interruptions++;
        if (why === 'activity-or-journal' && holdSince !== undefined) holdCut = true;
        reason = result.reason;
        // Presentation only: which limit fired. Parking and retry timing never read it.
        detail = why === 'capacity' ? copyRetentionDetail(result.detail) : undefined;
        const priorityOnly =
          why === 'activity-or-journal' &&
          isPriorityOnlyMaintenanceInterruption(interruptedOutcomes.get(result));
        notBefore =
          Date.now() + (priorityOnly ? LOCAL_RETENTION_QUIET_MS : LOCAL_RETENTION_RETRY_MS);
        // Retrying an unchanged refusal cannot help. A different authenticated ledger hint
        // permits another attempt, still behind the retry clock. A saved account attempt (a
        // history snapshot, approval or rotation still in progress) waits the same way.
        if (['capacity', 'history-required', 'ineligible', 'durable-attempt'].includes(why))
          parked = hint.key;
        // Any other outcome lifts that block. Most come from past the saved-attempt check; one
        // that did not (an interruption before it) costs at most one held check, on new history.
        holdBlocked = why === 'durable-attempt';
        // Holding sync cannot repair capacity or missing history: do not hold again until a
        // manual retry or reopen, even when the budget lapsed before this outcome arrived.
        const spend = why === 'capacity' || why === 'history-required';
        if (spend) holdSpent = true;
        // Quiet lanes can help only these two: a pending receive promotion settles while receive
        // is held, and sync's own jobs stop interrupting. Every other refusal ends the window,
        // including an ineligible cut, which may settle later (it is parked until a new hint)
        // and a reason this build does not know.
        if (why !== 'activity-or-journal' && why !== 'pending-promotion') closeWindow(spend);
        // Transient refusal needs a new event, not a periodic scan of the same history. A held
        // device retries behind the same clock, bounded by the hold budget, so it cannot stall.
        again = wakes !== started || holdSince !== undefined;
      } else {
        halted = true;
        reason = 'unexpected-result';
        detail = undefined;
        releaseHold();
      }
    } catch (cause) {
      // The removal owner already closes on uncertain mutation. Never turn integrity/storage
      // failure into an automatic retry or reinterpret it as permission to remove anything.
      if (!closed) {
        halted = true;
        reason = 'owner-error';
        detail = undefined;
        releaseHold();
        // Do not read arbitrary error names, messages, causes, stacks or getters.
        // This closed application class has data-free codes; all other failures stay generic.
        ownerError = ownerErrorCode(cause);
      }
    } finally {
      if (currentAttempt === stamp) currentAttempt = undefined;
      running = false;
      if (again) schedule();
      publish();
    }
  };
  const dispose = () => {
    closed = true;
    clear();
    releaseHold();
    releasePoll();
    options.signal.removeEventListener('abort', dispose);
    publish();
    listeners.clear();
  };
  options.signal.addEventListener('abort', dispose, { once: true });
  if (options.signal.aborted) dispose();
  return Object.freeze({
    wake() {
      if (closed || halted) return;
      wakes++;
      quietUntil = Date.now() + LOCAL_RETENTION_QUIET_MS;
      schedule();
    },
    // Sync readiness can change without user activity. Keep its quiet clock distinct so routine
    // polling cannot postpone maintenance forever; eligibility is still rechecked on every attempt.
    refresh() {
      if (closed || halted) return;
      wakes++;
      schedule();
    },
    dispose,
    get status() {
      return status;
    },
    /** Read live by the sync scheduler; changes are also announced through onStatus. */
    get hold(): LocalRetentionHold | undefined {
      const level = holdLevel();
      if (!level) return undefined;
      // The poll deferral never parks the sender: the send lane has no idle timer, a local edit
      // already interrupts preparation through the journal, and the owner refuses an unsettled cut.
      return Object.freeze(
        level === 1
          ? { send: false, receive: false, idlePoll: true }
          : { send: true, receive: level === 3 },
      );
    },
    get diagnostics() {
      return Object.freeze({
        attempts,
        interruptions,
        completions,
        events: Object.freeze(attemptEvents.map((e) => e)),
        ...(ownerError ? { ownerError } : {}),
        ...(measuredSetup !== undefined ? { setupMs: measuredSetup } : {}),
        ...(measuredSave !== undefined ? { saveMs: measuredSave } : {}),
        ...(holdSince !== undefined && holdEndsAt !== undefined
          ? { windowEndsAt: holdEndsAt }
          : pollSince !== undefined
            ? { windowEndsAt: pollEndsAt }
            : {}),
      });
    },
    onStatus(listener: () => void) {
      if (closed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    retry() {
      if (closed || halted || running) return false;
      parked = undefined;
      holdSpent = false;
      // A manual check is the person asking for one more try, held if the device holds.
      holdIdleKey = undefined;
      holdBlocked = false;
      holdYieldUntil = 0;
      pollYieldUntil = 0;
      wakes++;
      quietUntil = Date.now() + LOCAL_RETENTION_QUIET_MS;
      schedule();
      return true;
    },
  });
}
