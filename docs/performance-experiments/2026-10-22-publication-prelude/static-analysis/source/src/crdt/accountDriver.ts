import { type AccountAccess } from '../account/accountHttp';
/** Internal scheduler and owned-operation composition. Runtime status never authorizes a write. */
export type DriverGate = 'ready' | 'offline' | 'local-storage' | 'closed';
export type DriverBlock =
  | 'closed'
  | 'conflict'
  | 'finalized'
  | 'local-storage'
  | 'operation-failed';
export interface DriverStatus {
  readonly phase: 'starting' | 'working' | 'idle' | 'retrying' | 'offline' | 'blocked' | 'closed';
  readonly acceptedThrough: number;
  readonly position: number | null;
  readonly failures: number;
  readonly retryAt: number | null;
  readonly reason: DriverBlock | null;
}
export type DriverStep =
  | { kind: 'idle' | 'progress' | 'unknown'; acceptedThrough: number }
  | { kind: 'blocked'; acceptedThrough: number; reason: DriverBlock };
export interface DriverClock {
  now(): number;
  set(callback: () => void, delay: number): unknown;
  clear(timer: unknown): void;
}
const realClock: DriverClock = {
  now: () => Date.now(),
  set: (callback, delay) => setTimeout(callback, delay),
  clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};
/** An internal deterministic seam; production supplies only lifecycle-owned operations below. */
export function createDeliveryScheduler(options: {
  signal: AbortSignal;
  gate(): DriverGate;
  step(): Promise<DriverStep>;
  detach(): void;
  clock?: DriverClock;
}) {
  const clock = options.clock ?? realClock,
    listeners = new Set<(value: DriverStatus) => void>();
  let value: DriverStatus = Object.freeze({
    phase: 'starting',
    acceptedThrough: 0,
    position: null,
    failures: 0,
    retryAt: null,
    reason: null,
  });
  let stopped = false,
    dirty = false,
    expedited = false;
  let timer: unknown, work: Promise<void> | undefined;
  const publish = (next: Partial<DriverStatus>) => {
    if (Object.entries(next).every(([key, item]) => value[key as keyof DriverStatus] === item))
      return;
    value = Object.freeze({ ...value, ...next });
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
    dirty = expedited = false;
    clear();
    options.signal.removeEventListener('abort', stop);
    options.detach();
    publish({ phase: 'closed', retryAt: null, reason: null });
    listeners.clear();
  };
  const gate = (): boolean => {
    const state = options.gate();
    if (state === 'closed') {
      stop();
      return false;
    }
    if (state !== 'ready') {
      clear();
      publish({
        phase: state === 'offline' ? 'offline' : 'blocked',
        retryAt: null,
        reason: state === 'local-storage' ? 'local-storage' : null,
      });
      return false;
    }
    return true;
  };
  const schedule = (delay: number) => {
    clear();
    timer = clock.set(() => {
      timer = undefined;
      begin();
    }, delay);
  };
  const begin = () => {
    if (stopped || work || !gate()) return;
    dirty = expedited = false;
    // Set work before invoking any owner code or thenable, including reentrant observers.
    work = Promise.resolve()
      .then(async () => {
        if (stopped || !gate()) return;
        publish({ phase: 'working', retryAt: null, reason: null });
        if (stopped || !gate()) return;
        const result = await options.step();
        if (stopped) return;
        publish({ acceptedThrough: result.acceptedThrough, position: result.acceptedThrough + 1 });
        if (stopped) return;
        if (result.kind === 'blocked') {
          publish({ phase: 'blocked', retryAt: null, reason: result.reason });
          dirty = expedited = false;
        } else if (!gate()) {
          dirty = true;
        } else if (result.kind === 'unknown') {
          const failures = Math.min(value.failures + 1, 6),
            delay = Math.min(1000 * 2 ** (failures - 1), 30000);
          publish({ phase: 'retrying', failures, retryAt: clock.now() + delay, reason: null });
        } else {
          publish({
            phase: result.kind === 'progress' ? 'working' : 'idle',
            failures: 0,
            retryAt: null,
            reason: null,
          });
          dirty ||= result.kind === 'progress';
        }
      })
      .catch(() => {
        if (!stopped && gate()) {
          dirty = expedited = false;
          publish({ phase: 'blocked', retryAt: null, reason: 'operation-failed' });
        }
      })
      .finally(() => {
        work = undefined;
        if (stopped || !gate() || value.phase === 'blocked') return;
        if (value.phase === 'retrying')
          schedule(expedited ? 0 : Math.max(0, value.retryAt! - clock.now()));
        else if (dirty) schedule(0);
      });
  };
  const wake = (expedite = false) => {
    if (stopped) return;
    dirty = true;
    expedited ||= expedite;
    if (!gate()) return;
    if (value.phase === 'blocked' && value.reason !== 'local-storage' && !expedite) return;
    if (work) return;
    if (value.phase === 'retrying' && !expedite) return;
    if (timer === undefined || expedite) schedule(expedite ? 0 : 50);
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
    onStatus(listener: (status: DriverStatus) => void) {
      if (!stopped) listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
export interface DriverOperations {
  retryRetiredGeneration?(): Promise<boolean>;
  deliveryStatus(): Promise<{
    state: 'ready' | 'closed' | 'conflict' | 'finalized';
    acceptedThrough: number;
    /** Aggregate verified inbound progress, when composed with the receiver. */
    receivedThrough?: number;
    submissions: number[];
  }>;
  spoolStatus(): Promise<{ positions: { position: number; persisted: boolean }[] }>;
  prepareNextEnvelope(): Promise<{ position: number; bytes: Uint8Array } | null>;
  prepareSubmission(position: number): Promise<{ kind: string }>;
  submitPending(token: AccountAccess): Promise<{ kind: string }>;
}
/** All reads, grants and commits below are the existing exclusive v8 owner methods. */
export async function driveDeliveryStep(
  ops: DriverOperations,
  token: AccountAccess,
  gate: () => DriverGate,
): Promise<DriverStep> {
  let status = await ops.deliveryStatus();
  const pause = (): DriverStep | null => {
    if (status.state !== 'ready')
      return { kind: 'blocked', acceptedThrough: status.acceptedThrough, reason: status.state };
    if (gate() !== 'ready') return { kind: 'idle', acceptedThrough: status.acceptedThrough };
    return null;
  };
  let paused = pause();
  if (paused) return paused;
  const position = status.acceptedThrough + 1;
  if (!status.submissions.includes(position)) {
    const spool = await ops.spoolStatus();
    paused = pause();
    if (paused) return paused;
    if (!spool.positions.some((p) => p.position === position && p.persisted)) {
      const prepared = await ops.prepareNextEnvelope();
      if (!prepared) return { kind: 'idle', acceptedThrough: status.acceptedThrough };
      prepared.bytes.fill(0);
      if (prepared.position !== position) throw Error('Unexpected delivery position');
    }
    paused = pause();
    if (paused) return paused;
    const submission = await ops.prepareSubmission(position);
    // Returned exact bytes are inspection copies, not a second network authority.
    if ('bytes' in submission && submission.bytes instanceof Uint8Array) submission.bytes.fill(0);
    if (submission.kind !== 'ready') {
      status = await ops.deliveryStatus();
      return pause() ?? { kind: 'progress', acceptedThrough: status.acceptedThrough };
    }
  }
  paused = pause();
  if (paused) return paused;
  await ops.submitPending(token);
  const next = await ops.deliveryStatus();
  if (next.state !== 'ready')
    return { kind: 'blocked', acceptedThrough: next.acceptedThrough, reason: next.state };
  return {
    kind: next.acceptedThrough > status.acceptedThrough ? 'progress' : 'unknown',
    acceptedThrough: next.acceptedThrough,
  };
}
