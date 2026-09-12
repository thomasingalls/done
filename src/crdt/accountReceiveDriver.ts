/** Private receive polling. Runtime timers and observations never supply receive authority. */
import type { DriverClock, DriverGate } from './accountDriver';
export const RECEIVE_POLL_MS = 5000;
export const RECEIVE_YIELD_MS = 50;
export type ReceiveHalt = 'conflict' | 'operation-failed';
export interface ReceiveDriverStatus {
  readonly phase: 'starting' | 'working' | 'idle' | 'retrying' | 'offline' | 'blocked' | 'closed';
  readonly receivedThrough: number;
  readonly failures: number;
  readonly nextAttemptAt: number | null;
  readonly reason: ReceiveHalt | 'local-storage' | 'request-expired' | null;
}
export type ReceiveStep =
  | { kind: 'idle' | 'progress' | 'unknown' | 'expired' | 'paused'; receivedThrough: number }
  | { kind: 'blocked'; receivedThrough: number; reason: ReceiveHalt };
export type ReceiveWake = 'start' | 'gate' | 'online' | 'retry';
const realClock: DriverClock = {
  now: () => Date.now(),
  set: (fn, delay) => setTimeout(fn, delay),
  clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};
/** Internal deterministic clock/operation seam; the factory supplies only held owner operations. */
export function createReceiveScheduler(options: {
  signal: AbortSignal;
  gate(): DriverGate;
  step(): Promise<ReceiveStep>;
  detach(): void;
  clock?: DriverClock;
}) {
  const clock = options.clock ?? realClock;
  const listeners = new Set<(status: ReceiveDriverStatus) => void>();
  let value: ReceiveDriverStatus = Object.freeze({
    phase: 'starting',
    receivedThrough: 0,
    failures: 0,
    nextAttemptAt: null,
    reason: null,
  });
  let phase: 'starting' | 'working' | 'idle' | 'retrying' = 'starting';
  let stopped = false,
    expedited = false;
  let receivedThrough = 0,
    failures = 0;
  // Halt is separate from the temporary connectivity/admission gate: offline/online cannot erase it.
  let halt: ReceiveHalt | undefined, due: number | undefined;
  let retryReason: 'request-expired' | undefined;
  let timer: unknown, work: Promise<void> | undefined;
  const publish = (next: ReceiveDriverStatus) => {
    if (Object.entries(next).every(([k, v]) => value[k as keyof ReceiveDriverStatus] === v)) return;
    value = Object.freeze(next);
    for (const listener of [...listeners]) {
      try {
        listener(value);
      } catch {
        /* Observers own their errors. */
      }
    }
  };
  const clear = () => {
    if (timer !== undefined) {
      clock.clear(timer);
      timer = undefined;
    }
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    expedited = false;
    due = undefined;
    clear();
    options.signal.removeEventListener('abort', stop);
    options.detach();
    publish({ phase: 'closed', receivedThrough, failures, nextAttemptAt: null, reason: null });
    listeners.clear();
  };
  const ready = () => {
    if (stopped) return false;
    const gate = options.gate();
    if (gate === 'closed') {
      stop();
      return false;
    }
    const allowed = gate === 'ready' && halt === undefined;
    publish({
      phase: halt
        ? 'blocked'
        : gate === 'offline'
          ? 'offline'
          : gate === 'local-storage'
            ? 'blocked'
            : phase,
      receivedThrough,
      failures,
      nextAttemptAt: allowed && !work ? (due ?? null) : null,
      reason: halt ?? (gate === 'local-storage' ? 'local-storage' : (retryReason ?? null)),
    });
    return !stopped && options.gate() === 'ready' && halt === undefined;
  };
  const arm = () => {
    if (!ready() || work || due === undefined) {
      clear();
      return;
    }
    // A status observer may itself wake/arm us. Replace that timer too, after notification.
    clear();
    timer = clock.set(
      () => {
        timer = undefined;
        begin();
      },
      Math.max(0, due - clock.now()),
    );
  };
  const begin = () => {
    if (stopped || work || !ready()) return;
    // Publish only after registering work; synchronous status observers may close or wake us.
    work = Promise.resolve()
      .then(async () => {
        if (stopped || !ready()) return;
        phase = 'working';
        if (!ready() || stopped) return;
        due = undefined;
        const result = await options.step();
        if (stopped) return;
        receivedThrough = result.receivedThrough;
        if (result.kind === 'blocked') {
          halt = result.reason;
          due = undefined;
          expedited = false;
        } else if (result.kind === 'paused') {
          phase = 'working';
          due = clock.now() + (expedited ? 0 : RECEIVE_YIELD_MS);
          expedited = false;
        } else {
          const retryable = result.kind === 'unknown' || result.kind === 'expired';
          retryReason = result.kind === 'expired' ? 'request-expired' : undefined;
          phase = retryable ? 'retrying' : result.kind === 'idle' ? 'idle' : 'working';
          failures = retryable ? Math.min(failures + 1, 6) : 0;
          const delay = retryable
            ? Math.min(1000 * 2 ** (failures - 1), 30000)
            : result.kind === 'idle'
              ? RECEIVE_POLL_MS
              : RECEIVE_YIELD_MS;
          due = clock.now() + (expedited ? 0 : delay);
          expedited = false;
        }
        ready();
      })
      .catch(() => {
        if (stopped) return;
        halt = 'operation-failed';
        due = undefined;
        expedited = false;
        ready();
      })
      .finally(() => {
        work = undefined;
        arm();
      });
  };
  const wake = (cause: ReceiveWake = 'gate') => {
    if (stopped) return;
    if (cause === 'retry') halt = undefined;
    if (cause === 'retry' || (cause === 'online' && !halt)) expedited = true;
    if (cause === 'start' && due === undefined && !work && !halt) due = clock.now();
    if (expedited && !work) {
      due = clock.now();
      expedited = false;
    }
    arm();
  };
  options.signal.addEventListener('abort', stop, { once: true });
  if (options.signal.aborted) stop();
  return {
    wake,
    dispose: async () => {
      stop();
      await work;
    },
    status: () => value,
    onStatus(listener: (status: ReceiveDriverStatus) => void) {
      if (!stopped) listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
export interface ReceiveDriverOperations {
  receiveStatus(): Promise<{ state: 'ready' | 'conflict'; receivedThrough: number }>;
  receiveNext(token: string): Promise<{ kind: string }>;
}
/** A transport return cannot advance progress. Only the current authenticated durable census can. */
export async function driveReceiveStep(
  ops: ReceiveDriverOperations,
  token: string,
  gate: () => DriverGate,
): Promise<ReceiveStep> {
  const before = await ops.receiveStatus();
  if (before.state === 'conflict')
    return { kind: 'blocked', receivedThrough: before.receivedThrough, reason: 'conflict' };
  if (gate() !== 'ready') return { kind: 'paused', receivedThrough: before.receivedThrough };
  const result = await ops.receiveNext(token);
  const after = await ops.receiveStatus();
  if (after.receivedThrough < before.receivedThrough)
    throw Error('Durable receive prefix regressed');
  if (after.state === 'conflict')
    return { kind: 'blocked', receivedThrough: after.receivedThrough, reason: 'conflict' };
  return {
    kind:
      after.receivedThrough > before.receivedThrough
        ? 'progress'
        : result.kind === 'empty'
          ? 'idle'
          : gate() !== 'ready'
            ? 'paused'
            : result.kind === 'expired'
              ? 'expired'
              : 'unknown',
    receivedThrough: after.receivedThrough,
  };
}
