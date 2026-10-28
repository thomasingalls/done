/** Scheduling hints are not retention proofs. Only the current owner's removal path may mutate. */
import {
  copyRetentionProgress,
  type RetentionProgress,
  type RetentionProgressSink,
} from './contentMaintenance';
export interface LocalRetentionHint {
  readonly revision: number;
  readonly records: number;
}
export const LOCAL_RETENTION_MIN_RECORDS = 1024;
export const LOCAL_RETENTION_QUIET_MS = 10000;
export const LOCAL_RETENTION_COOLDOWN_MS = 30 * 60000;
export const LOCAL_RETENTION_RETRY_MS = 60000;
export interface LocalRetentionStatus {
  readonly phase: 'idle' | 'waiting' | 'running' | 'halted' | 'closed';
  readonly reason: string | undefined;
  readonly progress?: RetentionProgress & { readonly attempt: number; readonly elapsedMs: number };
}
/** Presentation/retry port: never exposes evidence, counters or a mutation capability. */
export interface LocalRetentionRuntime {
  readonly status: LocalRetentionStatus;
  onStatus(listener: () => void): () => void;
  retry(): boolean;
  readonly diagnostics?: {
    readonly attempts: number;
    readonly interruptions: number;
    readonly completions: number;
    readonly events: readonly LocalRetentionStatus['progress'][];
  };
}
type Outcome = { kind: string; reason?: string };
export function createAutomaticLocalRetention(options: {
  signal: AbortSignal;
  observe(): { ready: boolean; hint: LocalRetentionHint | undefined };
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
  const listeners = new Set<() => void>();
  let status: LocalRetentionStatus = Object.freeze({ phase: 'idle', reason: undefined });
  const publish = () => {
    const phase = closed
      ? 'closed'
      : halted
        ? 'halted'
        : running
          ? 'running'
          : timer !== undefined
            ? 'waiting'
            : 'idle';
    if (status.phase === phase && status.reason === reason && status.progress === progress) return;
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
  const observation = () => {
    const { ready, hint } = options.observe();
    if (
      !ready ||
      !hint ||
      !Number.isSafeInteger(hint.revision) ||
      hint.revision < 0 ||
      !Number.isSafeInteger(hint.records) ||
      hint.records < LOCAL_RETENTION_MIN_RECORDS
    )
      return undefined;
    return { revision: hint.revision, key: `${hint.revision}:${hint.records}` };
  };
  const schedule = () => {
    clear();
    if (closed || halted || running) {
      publish();
      return;
    }
    const hint = observation();
    if (!hint || hint.key === parked) {
      publish();
      return;
    }
    timer = setTimeout(
      () => {
        timer = undefined;
        void attempt().finally(publish);
      },
      Math.max(0, quietUntil - Date.now(), notBefore - Date.now()),
    );
    publish();
  };
  const attempt = async () => {
    if (closed || halted || running) return;
    const hint = observation();
    if (!hint || hint.key === parked) return;
    if (Date.now() < Math.max(quietUntil, notBefore)) {
      schedule();
      return;
    }
    running = true;
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
    let again = false;
    try {
      const result = await options.remove(hint.revision, report);
      if (closed) return;
      if (result.kind === 'removed' || result.kind === 'already-removed') {
        completions++;
        removalComplete = true;
        if (progress) report({ stage: 'complete' });
        reason = undefined;
        notBefore = Date.now() + LOCAL_RETENTION_COOLDOWN_MS;
        again = true;
      } else if (result.kind === 'skipped') {
        if (result.reason === 'activity-or-journal') interruptions++;
        reason = result.reason;
        notBefore = Date.now() + LOCAL_RETENTION_RETRY_MS;
        // Retrying an unchanged capacity/history refusal cannot help. A different authenticated
        // ledger hint permits another attempt, still behind the retry clock.
        if (['capacity', 'history-required', 'ineligible'].includes(result.reason ?? ''))
          parked = hint.key;
        // Transient refusal needs a new event, not a periodic scan of the same history.
        again = wakes !== started;
      } else {
        halted = true;
        reason = 'unexpected-result';
      }
    } catch {
      // The removal owner already closes on uncertain mutation. Never turn integrity/storage
      // failure into an automatic retry or reinterpret it as permission to remove anything.
      if (!closed) {
        halted = true;
        reason = 'owner-error';
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
    get diagnostics() {
      return Object.freeze({
        attempts,
        interruptions,
        completions,
        events: Object.freeze(attemptEvents.map((e) => e)),
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
      wakes++;
      quietUntil = Date.now() + LOCAL_RETENTION_QUIET_MS;
      schedule();
      return true;
    },
  });
}
