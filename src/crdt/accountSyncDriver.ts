/** Two lanes, one pass. Runtime scheduling contains no account or storage authority. */
import type { DriverClock, DriverGate, DriverOperations } from './accountDriver';
import type { ReceiveStep } from './accountReceiveDriver';
export type SyncLane = 'send' | 'receive';
export type SyncHalt = 'closed' | 'conflict' | 'finalized' | 'operation-failed';
export type OutboundStep =
  | { kind: 'idle' | 'progress' | 'unknown' | 'paused'; acceptedThrough: number }
  | { kind: 'blocked'; acceptedThrough: number; reason: SyncHalt };
export interface SyncLaneStatus {
  readonly phase: 'starting' | 'working' | 'idle' | 'retrying' | 'offline' | 'blocked' | 'closed';
  readonly failures: number;
  readonly nextAttemptAt: number | null;
  readonly reason: SyncHalt | 'local-storage' | 'request-expired' | null;
}
export interface SyncStatus {
  readonly send: SyncLaneStatus & { readonly acceptedThrough: number };
  readonly receive: SyncLaneStatus & { readonly receivedThrough: number };
}
interface Lane {
  phase: 'starting' | 'working' | 'idle' | 'retrying';
  position: number;
  failures: number;
  due?: number | undefined;
  halt?: SyncHalt | undefined;
  retryReason?: 'request-expired' | undefined;
  expedite: boolean;
  dirty: boolean;
}
const clockDefault: DriverClock = {
  now: () => Date.now(),
  set: (fn, delay) => setTimeout(fn, delay),
  clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};
const names: SyncLane[] = ['send', 'receive'];
export function createSyncScheduler(options: {
  signal: AbortSignal;
  gate(): DriverGate;
  send(): Promise<OutboundStep>;
  receive(): Promise<ReceiveStep>;
  detach(): void;
  clock?: DriverClock;
}) {
  const clock = options.clock ?? clockDefault;
  const fresh = (): Lane => ({
    phase: 'starting',
    position: 0,
    failures: 0,
    expedite: false,
    dirty: false,
  });
  const lanes = { send: fresh(), receive: fresh() };
  const listeners = new Set<(status: SyncStatus) => void>();
  let stopped = false,
    timer: unknown,
    work: Promise<void> | undefined;
  let active: SyncLane | undefined,
    last: SyncLane = 'receive';
  const laneStatus = (name: SyncLane): SyncLaneStatus => {
    const lane = lanes[name],
      gate = options.gate();
    return {
      phase: stopped
        ? 'closed'
        : lane.halt
          ? 'blocked'
          : gate === 'offline'
            ? 'offline'
            : gate === 'local-storage'
              ? 'blocked'
              : lane.phase,
      failures: lane.failures,
      nextAttemptAt:
        !stopped && gate === 'ready' && !lane.halt && active !== name ? (lane.due ?? null) : null,
      reason: stopped
        ? null
        : (lane.halt ?? (gate === 'local-storage' ? 'local-storage' : (lane.retryReason ?? null))),
    };
  };
  const snapshot = (): SyncStatus =>
    Object.freeze({
      send: Object.freeze({ ...laneStatus('send'), acceptedThrough: lanes.send.position }),
      receive: Object.freeze({ ...laneStatus('receive'), receivedThrough: lanes.receive.position }),
    });
  let value = snapshot();
  const publish = () => {
    const next = snapshot();
    if (JSON.stringify(next) === JSON.stringify(value)) return;
    value = next;
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
    clear();
    for (const name of names) {
      lanes[name].due = undefined;
      lanes[name].dirty = lanes[name].expedite = false;
    }
    options.signal.removeEventListener('abort', stop);
    options.detach();
    publish();
    listeners.clear();
  };
  const ready = () => {
    if (options.gate() === 'closed') stop();
    publish();
    return !stopped && options.gate() === 'ready';
  };
  const eligible = () => names.filter((name) => !lanes[name].halt && lanes[name].due !== undefined);
  const arm = () => {
    if (!ready() || work) {
      clear();
      return;
    }
    // Observers can reenter arm; replace any timer they installed after notification too.
    clear();
    const pending = eligible();
    if (!pending.length) return;
    const due = Math.min(...pending.map((name) => lanes[name].due!));
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
    const due = eligible().filter((name) => lanes[name].due! <= clock.now());
    const name = due.find((n) => n !== last) ?? due[0];
    if (!name) {
      arm();
      return;
    }
    active = name;
    const lane = lanes[name];
    work = Promise.resolve()
      .then(async () => {
        if (!ready() || lane.halt) return;
        lane.phase = 'working';
        // Keep the deadline until after observers have had their last opportunity to pause this pass.
        if (!ready() || lane.halt) return;
        lane.due = undefined;
        lane.dirty = lane.expedite = false;
        last = name;
        const result = await options[name]();
        if (stopped) return;
        const position =
          'acceptedThrough' in result ? result.acceptedThrough : result.receivedThrough;
        if (position < lane.position) throw Error('Durable lane position regressed');
        const advanced = position > lane.position;
        lane.position = position;
        // Durable send progress makes a new read useful. Preserve receive backoff and evidence halts.
        if (
          name === 'send' &&
          advanced &&
          result.kind !== 'blocked' &&
          position > lanes.receive.position &&
          !lanes.receive.halt &&
          lanes.receive.failures === 0
        )
          lanes.receive.due = Math.min(lanes.receive.due ?? clock.now(), clock.now());
        if (result.kind === 'blocked') {
          lane.halt = result.reason;
          lane.due = undefined;
          lane.expedite = lane.dirty = false;
        } else if (result.kind === 'paused') {
          lane.due = clock.now() + (lane.expedite ? 0 : 50);
          lane.expedite = false;
        } else {
          const retryable = result.kind === 'unknown' || result.kind === 'expired';
          lane.retryReason = result.kind === 'expired' ? 'request-expired' : undefined;
          lane.phase = retryable ? 'retrying' : result.kind === 'idle' ? 'idle' : 'working';
          lane.failures = retryable ? Math.min(lane.failures + 1, 6) : 0;
          const delay = retryable
            ? Math.min(1000 * 2 ** (lane.failures - 1), 30000)
            : result.kind === 'progress'
              ? 50
              : name === 'receive'
                ? 5000
                : undefined;
          lane.due = lane.expedite
            ? clock.now()
            : delay !== undefined
              ? clock.now() + delay
              : lane.dirty
                ? clock.now() + 50
                : undefined;
          lane.expedite = lane.dirty = false;
        }
        ready();
      })
      .catch(() => {
        if (!stopped) {
          lane.halt = 'operation-failed';
          lane.due = undefined;
          lane.expedite = lane.dirty = false;
          ready();
        }
      })
      .finally(() => {
        active = undefined;
        work = undefined;
        arm();
      });
  };
  const wake = (cause: 'start' | 'gate' | 'online' | 'local' | 'retry', target?: SyncLane) => {
    if (stopped) return;
    for (const name of names) {
      if (cause === 'retry' && name !== target) continue;
      const lane = lanes[name];
      if (cause === 'retry') lane.halt = undefined;
      if (cause === 'local' && name === 'send') {
        lane.dirty = true;
        if (!lane.halt && active !== name && lane.due === undefined) lane.due = clock.now() + 50;
      }
      if (cause === 'start' && lane.due === undefined && active !== name && !lane.halt)
        lane.due = clock.now();
      if ((cause === 'online' || cause === 'retry') && !lane.halt) {
        if (active === name) lane.expedite = true;
        else lane.due = clock.now();
      }
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
    runtime: Object.freeze({
      get status() {
        return value;
      },
      retry: (lane: SyncLane) => {
        if (names.includes(lane)) wake('retry', lane);
      },
      onStatus(listener: (status: SyncStatus) => void) {
        if (!stopped) listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    }),
  };
}
/** Private v9 outbound step, retaining v8's byte retry with explicit paused outcomes. */
export async function driveOutboundStep(
  ops: DriverOperations,
  token: string,
  gate: () => DriverGate,
): Promise<OutboundStep> {
  let status = await ops.deliveryStatus();
  const pause = (): OutboundStep | null => {
    if (status.state !== 'ready')
      return { kind: 'blocked', acceptedThrough: status.acceptedThrough, reason: status.state };
    if (gate() !== 'ready') return { kind: 'paused', acceptedThrough: status.acceptedThrough };
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
      if (!prepared) return pause() ?? { kind: 'idle', acceptedThrough: status.acceptedThrough };
      prepared.bytes.fill(0);
      if (prepared.position !== position) throw Error('Unexpected delivery position');
    }
    paused = pause();
    if (paused) return paused;
    const submission = await ops.prepareSubmission(position);
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
  if (next.acceptedThrough < status.acceptedThrough)
    throw Error('Durable delivery prefix regressed');
  if (next.state !== 'ready')
    return { kind: 'blocked', acceptedThrough: next.acceptedThrough, reason: next.state };
  return {
    kind:
      next.acceptedThrough > status.acceptedThrough
        ? 'progress'
        : gate() !== 'ready'
          ? 'paused'
          : 'unknown',
    acceptedThrough: next.acceptedThrough,
  };
}
