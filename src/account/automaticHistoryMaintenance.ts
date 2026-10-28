/** Scheduling only. Every command still belongs to the authenticated, serial history owner. */
import type { HistoryMaintenanceCommand, HistoryMaintenanceStatus } from './historyMaintenance';
import type { LocalRetentionHint } from '../crdt/automaticLocalRetention';

export const SERVICE_HISTORY_QUIET_MS = 10000;
export const SERVICE_HISTORY_MIN_RECORDS = 1024;
export const SERVICE_HISTORY_INTERVAL_MS = 60 * 60000;
export const SERVICE_HISTORY_RETRY_MS = 60000;
/** Experimental until heavy preparation can pause without occupying the storage tail. */
export const hasAutomaticServiceHistory = () =>
  import.meta.env?.['VITE_ACCOUNT_HISTORY_AUTO'] === '1';
export interface AutomaticHistoryStatus {
  readonly phase: 'idle' | 'waiting' | 'running' | 'halted' | 'closed';
  readonly reason: 'peer' | 'stale' | 'connection' | 'owner-error' | undefined;
  readonly history?: Readonly<HistoryMaintenanceStatus>;
}
export interface AutomaticHistoryRuntime {
  readonly status: AutomaticHistoryStatus;
  onStatus(listener: () => void): () => void;
}
type AutomaticCommand = Exclude<HistoryMaintenanceCommand, 'discard'>;
export function createAutomaticServiceHistory(options: {
  signal: AbortSignal;
  observe(): { ready: boolean; hint: LocalRetentionHint | undefined };
  run(command: AutomaticCommand): Promise<HistoryMaintenanceStatus>;
  retryable(cause: unknown): boolean;
}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false,
    running = false,
    halted = false;
  let quietUntil = Date.now() + SERVICE_HISTORY_QUIET_MS,
    notBefore = 0;
  let lastCreate = -Infinity,
    observed: LocalRetentionHint | undefined;
  let growthRecords = 0,
    createdGrowth = 0;
  let needsInspect = true,
    event = 0,
    prunedSequence = 0;
  let failures = 0,
    waitForEvent = false;
  let history: Readonly<HistoryMaintenanceStatus> | undefined;
  let reason: AutomaticHistoryStatus['reason'];
  let status: AutomaticHistoryStatus = Object.freeze({ phase: 'idle', reason: undefined });
  const listeners = new Set<() => void>();
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
    if (status.phase === phase && status.reason === reason && status.history === history) return;
    status = Object.freeze({ phase, reason, ...(history ? { history } : {}) });
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        /* presentation cannot affect the owner */
      }
    }
  };
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const observe = () => {
    const value = options.observe(),
      h = value.hint;
    const hint =
      h &&
      Number.isSafeInteger(h.revision) &&
      h.revision >= 0 &&
      Number.isSafeInteger(h.records) &&
      h.records >= 0
        ? { revision: h.revision, records: h.records }
        : undefined;
    if (hint) {
      const added =
        observed?.revision === hint.revision
          ? Math.max(0, hint.records - observed.records)
          : hint.records;
      growthRecords = Math.min(Number.MAX_SAFE_INTEGER, growthRecords + added);
      observed = hint;
    }
    return {
      ready: value.ready,
      hint,
    };
  };
  const canCreate = () => {
    observe();
    // History inspection refreshes custody and invalidates the live ledger hint. Previously
    // observed growth still schedules a fresh owner command; it never grants proof or authority.
    return (
      growthRecords - createdGrowth >= SERVICE_HISTORY_MIN_RECORDS &&
      Date.now() >= lastCreate + SERVICE_HISTORY_INTERVAL_MS
    );
  };
  const eligible = () => !closed && !halted && !waitForEvent && observe().ready;
  const schedule = () => {
    clear();
    const observation = observe();
    if (
      closed ||
      halted ||
      running ||
      waitForEvent ||
      !observation.ready ||
      (!needsInspect && (history?.pending !== 'none' || !canCreate()))
    ) {
      publish();
      return;
    }
    timer = setTimeout(
      () => {
        timer = undefined;
        void attempt();
      },
      Math.max(0, quietUntil - Date.now(), notBefore - Date.now()),
    );
    publish();
  };
  const capture = (value: HistoryMaintenanceStatus) => {
    const { sequence, pending, canDiscard, pruned } = value;
    if (
      !Number.isSafeInteger(sequence) ||
      sequence < 0 ||
      !['none', 'resume', 'verify', 'waiting', 'stale'].includes(pending) ||
      typeof canDiscard !== 'boolean' ||
      (pruned !== undefined && pruned !== true)
    )
      throw Error('Invalid history scheduling result');
    // No object, writing, identifier, error message or authority capability is retained.
    return Object.freeze({
      sequence,
      pending,
      canDiscard,
      ...(pruned ? { pruned: true as const } : {}),
    });
  };
  const attempt = async () => {
    if (running || !eligible()) return;
    if (Date.now() < Math.max(quietUntil, notBefore)) {
      schedule();
      return;
    }
    running = true;
    const began = event;
    needsInspect = false;
    reason = undefined;
    publish();
    let command: AutomaticCommand = 'inspect';
    try {
      // One inspection plus at most three existing owner actions. Never manufacture admission,
      // cancel a saved proposal, or interpret a scheduling hint as permission to prune.
      for (let steps = 0; steps < 4; steps++) {
        if (!eligible() || Date.now() < quietUntil || event !== began) {
          needsInspect = true;
          break;
        }
        observe();
        const growthAtStart = growthRecords;
        const answer = capture(await options.run(command));
        if (closed) return;
        if (command === 'prune' && (!answer.pruned || answer.pending !== 'none'))
          throw Error('History prune was not confirmed');
        history = answer;
        if (command === 'create') {
          createdGrowth = growthAtStart;
          lastCreate = Date.now();
        }
        if (command === 'prune' && answer.pruned) prunedSequence = answer.sequence;
        publish();
        if (answer.pending === 'waiting' || answer.pending === 'stale') {
          reason = answer.pending === 'waiting' ? 'peer' : 'stale';
          break;
        }
        if (answer.pending === 'resume' || answer.pending === 'verify') command = answer.pending;
        else if (answer.sequence >= 2 && answer.sequence > prunedSequence) command = 'prune';
        else if (canCreate()) command = 'create';
        else break;
      }
      failures = 0;
    } catch (cause) {
      if (!closed) {
        needsInspect = true;
        if (options.retryable(cause)) {
          reason = 'connection';
          failures = Math.min(failures + 1, 5);
          notBefore = Date.now() + SERVICE_HISTORY_RETRY_MS * 2 ** (failures - 1);
          // Events, not a periodic retry scan, re-arm failed work. Hints never reset this clock.
          waitForEvent = event === began;
        } else {
          halted = true;
          reason = 'owner-error';
        }
      }
    } finally {
      running = false;
      if (!closed) schedule();
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
    get status() {
      return status;
    },
    onStatus(listener: () => void) {
      if (closed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    activity() {
      if (closed || halted) return;
      quietUntil = Date.now() + SERVICE_HISTORY_QUIET_MS;
      schedule();
    },
    refresh() {
      if (!closed && !halted) schedule();
    },
    hint() {
      if (closed || halted) return;
      event++;
      needsInspect = true;
      waitForEvent = false;
      schedule();
    },
    dispose,
  });
}
