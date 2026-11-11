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
export interface LocalRetentionHint {
  readonly revision: number;
  readonly records: number;
}
export const LOCAL_RETENTION_MIN_RECORDS = 1024;
export const LOCAL_RETENTION_QUIET_MS = 10000;
export const LOCAL_RETENTION_COOLDOWN_MS = 30 * 60000;
export const LOCAL_RETENTION_RETRY_MS = 60000;
/** Longest a settled hold may defer routine sync before it yields (scheduling bound, unmeasured). */
export const LOCAL_RETENTION_HOLD_MS = 5 * 60000;
/** Normal sync window after a hold or poll deferral expires, before it may engage again. */
export const LOCAL_RETENTION_HOLD_YIELD_MS = 60000;
/** Unmeasured scheduling bound: the longest a running attempt, with the saved slices it continues
 * into at once, may defer routine idle receive polls (counted from the first slice) before polls
 * resume for the yield window. Hints and other sync signals are never deferred by it. */
export const LOCAL_RETENTION_POLL_HOLD_MS = 60000;
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
}
type Outcome = { kind: string; reason?: string };
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
  remove(revision: number, report: RetentionProgressSink): Promise<Outcome>;
}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false,
    running = false,
    halted = false;
  let quietUntil = Date.now() + LOCAL_RETENTION_QUIET_MS,
    notBefore = 0;
  let parked: string | undefined, reason: string | undefined;
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
  // Poll deferral, on any device without the hold: a running attempt, and the saved slice it
  // continues into at once, ask the receive lane to skip routine idle polls. Hints still run.
  // Any wait between slices releases it, so the deferred poll runs before the next slice.
  let pollSince: number | undefined,
    pollTimer: ReturnType<typeof setTimeout> | undefined,
    pollYieldUntil = 0,
    continuing = false;
  const listeners = new Set<() => void>();
  let status: LocalRetentionStatus = Object.freeze({ phase: 'idle', reason: undefined });
  const holdLevel = () =>
    closed ? 0 : holdSince !== undefined ? (holdSettled ? 3 : 2) : pollSince !== undefined ? 1 : 0;
  const releasePoll = () => {
    if (pollTimer !== undefined) clearTimeout(pollTimer);
    pollTimer = undefined;
    pollSince = undefined;
  };
  const publish = () => {
    // Every path ends here: no attempt running or continuing at once means no deferral.
    if (pollSince !== undefined && !running && !continuing) releasePoll();
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
    if (
      status.phase === phase &&
      status.reason === reason &&
      status.progress === progress &&
      publishedHold === hold
    )
      return;
    publishedHold = hold;
    status = Object.freeze({ phase, reason, ...(progress ? { progress } : {}) });
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
    holdSince = undefined;
    holdSettled = false;
  };
  const startHoldBudget = () => {
    if (holdSince !== undefined && holdTimer === undefined)
      holdTimer = setTimeout(() => expireHold(), LOCAL_RETENTION_HOLD_MS);
  };
  const observation = () => {
    const { ready, hint, synchronized, hold, deferPolls } = options.observe();
    const valid =
      ready &&
      hint &&
      Number.isSafeInteger(hint.revision) &&
      hint.revision >= 0 &&
      Number.isSafeInteger(hint.records) &&
      hint.records >= LOCAL_RETENTION_MIN_RECORDS;
    // A hint withdrawn by an in-flight validation, or pending input, never releases a hold.
    // Only the owner's stable hold observation, outcomes, the budget and lifecycle do.
    if (hold !== true) releaseHold();
    // Quiet lanes under an engaged hold mean the sender is parked. Waiting for the envelope
    // already in flight (lanes still busy) stays unbounded; nothing new is withheld by it yet.
    else if (synchronized !== false) startHoldBudget();
    // Same rule for the poll deferral: a hidden page or pressure releases it even mid-attempt.
    if (deferPolls !== true) releasePoll();
    return {
      hint: valid
        ? { revision: hint.revision, key: `${hint.revision}:${hint.records}` }
        : undefined,
      synchronized: synchronized !== false,
      holdable: hold === true && !holdSpent,
      deferrable: deferPolls === true,
    };
  };
  const schedule = () => {
    clear();
    if (closed || halted) {
      continuing = false;
      publish();
      return;
    }
    // A running attempt keeps its flight, but a hidden page or cleared owner hint still releases
    // the lanes (for example so a hidden page can publish).
    const { hint, synchronized, holdable } = observation();
    if (running) {
      publish();
      return;
    }
    // Busy sync used to leave no timer. A hold-wanting owner still needs the due moment.
    if (!hint || hint.key === parked || (!synchronized && !holdable)) {
      continuing = false;
      publish();
      return;
    }
    const yielding = !synchronized && holdSince === undefined ? holdYieldUntil : 0;
    const delay = Math.max(
      0,
      quietUntil - Date.now(),
      notBefore - Date.now(),
      yielding - Date.now(),
    );
    // A saved slice keeps the poll deferral only while its next slice is due at once.
    continuing &&= delay === 0;
    timer = setTimeout(() => {
      timer = undefined;
      continuing = false;
      void attempt().finally(publish);
    }, delay);
    publish();
  };
  const expirePoll = () => {
    pollTimer = undefined;
    if (closed || pollSince === undefined) return;
    // Liveness bound: routine polls resume even mid-attempt; the next one interrupts as before.
    releasePoll();
    pollYieldUntil = Date.now() + LOCAL_RETENTION_HOLD_YIELD_MS;
    publish();
  };
  const expireHold = () => {
    holdTimer = undefined;
    if (closed || holdSince === undefined) return;
    // Liveness bound: routine sync resumes even mid-attempt; its next job interrupts as before.
    releaseHold();
    holdYieldUntil = Date.now() + LOCAL_RETENTION_HOLD_YIELD_MS;
    if (running) publish();
    else schedule();
  };
  const attempt = async () => {
    if (closed || halted || running) return;
    const { hint, synchronized, holdable, deferrable } = observation();
    if (!hint || hint.key === parked) return;
    const now = Date.now();
    if (now < Math.max(quietUntil, notBefore)) {
      schedule();
      return;
    }
    // Due. Ask routine sync to stop at its next settled boundary; lane changes refresh us.
    if (holdSince === undefined && holdable && now >= holdYieldUntil) holdSince = now;
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
      // Any device: a routine idle poll would cancel this attempt through the storage queue.
      pollSince = now;
      pollTimer = setTimeout(() => expirePoll(), LOCAL_RETENTION_POLL_HOLD_MS);
    }
    attempts++;
    const stamp = (currentAttempt = {}),
      began = Date.now();
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
    let again = false,
      saved = false;
    try {
      let result: Outcome;
      try {
        result = await options.remove(hint.revision, report);
      } catch (cause) {
        // All preparation ceilings share this closed class. Saved receipts remain intact;
        // the existing skipped path parks this exact hint behind the retry clock.
        if (!(cause instanceof PreparationCapacity)) throw cause;
        result = { kind: 'skipped', reason: 'capacity' };
      }
      if (closed) return;
      if (result.kind === 'removed' || result.kind === 'already-removed') {
        completions++;
        removalComplete = true;
        if (progress) report({ stage: 'complete' });
        reason = undefined;
        notBefore = Date.now() + LOCAL_RETENTION_COOLDOWN_MS;
        releaseHold();
        again = true;
      } else if (result.kind === 'preparation-saved') {
        // Useful bounded work is durable. Yield before another slice; input/readiness still wins.
        reason = 'preparation-saved';
        notBefore = 0;
        again = saved = true;
      } else if (result.kind === 'skipped') {
        if (result.reason === 'activity-or-journal') interruptions++;
        reason = result.reason;
        const priorityOnly =
          result.reason === 'activity-or-journal' &&
          isPriorityOnlyMaintenanceInterruption(interruptedOutcomes.get(result));
        notBefore =
          Date.now() + (priorityOnly ? LOCAL_RETENTION_QUIET_MS : LOCAL_RETENTION_RETRY_MS);
        // Retrying an unchanged capacity/history refusal cannot help. A different authenticated
        // ledger hint permits another attempt, still behind the retry clock.
        if (['capacity', 'history-required', 'ineligible'].includes(result.reason ?? '')) {
          parked = hint.key;
          // Holding sync cannot repair capacity or missing history: do not hold again until a
          // manual retry or reopen, even when the budget lapsed before this outcome arrived. An
          // ineligible cut (for example an unaccepted position left while offline) may settle
          // later, so it only releases; parking still needs a new hint.
          if (result.reason !== 'ineligible') holdSpent = true;
          if (holdSince !== undefined) releaseHold(result.reason !== 'ineligible');
        }
        // Transient refusal needs a new event, not a periodic scan of the same history. A held
        // device retries behind the same clock, bounded by the hold budget, so it cannot stall.
        again = wakes !== started || holdSince !== undefined;
      } else {
        halted = true;
        reason = 'unexpected-result';
        releaseHold();
      }
    } catch (cause) {
      // The removal owner already closes on uncertain mutation. Never turn integrity/storage
      // failure into an automatic retry or reinterpret it as permission to remove anything.
      if (!closed) {
        halted = true;
        reason = 'owner-error';
        releaseHold();
        // Do not read arbitrary error names, messages, causes, stacks or getters.
        // This closed application class has data-free codes; all other failures stay generic.
        ownerError = ownerErrorCode(cause);
      }
    } finally {
      if (currentAttempt === stamp) currentAttempt = undefined;
      running = false;
      // schedule() keeps this only if the next slice is due at once; publish() then releases.
      continuing = saved && !closed && !halted;
      if (again) schedule();
      else continuing = false;
      publish();
    }
  };
  const dispose = () => {
    closed = true;
    clear();
    releaseHold();
    continuing = false;
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
      holdYieldUntil = 0;
      pollYieldUntil = 0;
      wakes++;
      quietUntil = Date.now() + LOCAL_RETENTION_QUIET_MS;
      schedule();
      return true;
    },
  });
}
