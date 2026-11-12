import { HistoryReplyRefused } from '../account/historyHttp';
import { type AccountAccess } from '../account/accountHttp';
/** Two lanes, one pass. Runtime scheduling contains no account or storage authority. */
import type { DriverClock, DriverGate, DriverOperations } from './accountDriver';
import type { ReceiveHaltDetail, ReceiveStep } from './accountReceiveDriver';
import { EnvelopeSizeError } from '../../account-protocol/envelope';
import { AdmissionError } from './admissionQueue';
import { ContentError } from './contentRecord';
import { CustodyError } from './custodyRecord';
import { InboundError } from './accountInbound';
import { createBatchWindow, type BatchTiming } from './batchWindow';
export type SyncLane = 'send' | 'receive';
/** A receive condition that stays named while receiving otherwise continues. Not a halt. */
export type SyncStanding = 'history-unverified' | 'history-waiting';
export type SyncGate = DriverGate | 'sign-in-required';
export type SyncHalt =
  | 'closed'
  | 'conflict'
  | 'finalized'
  | 'envelope-size'
  | 'integrity'
  | import('./accountReceiveDriver').ReceiveHalt;
export type OutboundStep = { receivedThrough?: number; acceptedNow?: true } & (
  | { kind: 'idle' | 'progress' | 'unknown' | 'paused' | 'held'; acceptedThrough: number }
  | { kind: 'batching'; acceptedThrough: number; due: number }
  | { kind: 'blocked'; acceptedThrough: number; reason: SyncHalt }
);
/** Scheduling hint read live at each decision. Never authority: the owner still checks effects. */
export interface SyncHold {
  /** Stop before allocating a new envelope; allocated positions still drain to acceptance. */
  readonly send: boolean;
  /** Do not start receive passes. A pass already running finishes normally. */
  readonly receive: boolean;
  /** Do not start a receive pass whose only cause is the idle reconciliation timer. A content
   * hint, reconnection, retry, authority change or unanswered submit still starts one at once. */
  readonly idlePoll?: boolean;
}
/** A completed check can yield its turn without claiming progress or a complete idle sweep. */
export type SyncReceiveStep = ReceiveStep | { kind: 'yielded'; receivedThrough: number };
export interface SyncLaneStatus {
  readonly phase: 'starting' | 'working' | 'idle' | 'retrying' | 'offline' | 'blocked' | 'closed';
  readonly failures: number;
  readonly nextAttemptAt: number | null;
  readonly reason:
    | SyncHalt
    | 'local-storage'
    | 'sign-in-required'
    | 'request-expired'
    | 'network-unavailable'
    | SyncStanding
    | null;
  readonly issueSince: number | null;
  readonly lastSuccessAt: number | null;
  /** Only beside a halt whose step named its cause; cleared with the halt. */
  readonly detail?: ReceiveHaltDetail;
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
  haltDetail?: ReceiveHaltDetail | undefined;
  retryReason?: 'request-expired' | 'operation-failed' | 'network-unavailable' | undefined;
  standing?: SyncStanding | undefined;
  issueSince?: number;
  lastSuccessAt?: number;
  expedite: boolean;
  dirty: boolean;
  continuing: boolean;
  /** Send only: parked at a settled boundary (nothing allocated and unaccepted). */
  held: boolean;
  /** Receive only: the pending deadline came from the idle interval and no signal since. */
  routine: boolean;
}
const clockDefault: DriverClock = {
  now: () => Date.now(),
  set: (fn, delay) => setTimeout(fn, delay),
  clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};
const names: SyncLane[] = ['send', 'receive'];
/** A live hint stream can still miss its last content hint. Bound idle reconciliation too. */
export const idleReceiveInterval = (notificationHealthy: boolean): number =>
  notificationHealthy ? 15000 + Math.random() * 5000 : 5000;
export function createSyncScheduler(options: {
  signal: AbortSignal;
  gate(): SyncGate;
  /** `holdNewEnvelope` is consulted at the same boundary, before any batch delay. */
  send(
    beforeNewEnvelope?: () => number | undefined,
    holdNewEnvelope?: () => boolean,
  ): Promise<OutboundStep>;
  receive(sendDue: () => boolean): Promise<SyncReceiveStep>;
  detach(): void;
  clock?: DriverClock;
  receiveInterval?(): number;
  publicationBatch?: BatchTiming;
  /** Maintenance may ask routine sync to hold; call wake('hold') when it changes. */
  hold?(): SyncHold | undefined;
  /** Read after each receive step. Progress from other devices does not clear it; only the
   * owner reporting it gone does. */
  standing?(): SyncStanding | undefined;
}) {
  const clock = options.clock ?? clockDefault;
  const batch = options.publicationBatch
    ? createBatchWindow(options.publicationBatch, () => clock.now())
    : undefined;
  const fresh = (): Lane => ({
    phase: 'starting',
    position: 0,
    failures: 0,
    expedite: false,
    dirty: false,
    continuing: false,
    held: false,
    routine: false,
  });
  const lanes = { send: fresh(), receive: fresh() };
  const listeners = new Set<(status: SyncStatus) => void>();
  let stopped = false,
    timer: unknown,
    work: Promise<void> | undefined;
  let active: SyncLane | undefined,
    last: SyncLane = 'receive';
  let signInSince: number | undefined;
  let turn = 0;
  const hold = (): SyncHold | undefined => {
    try {
      return options.hold?.();
    } catch {
      return undefined; // A hint observer cannot stop synchronization.
    }
  };
  // A parked sender stays parked only while the hold asks; receive defers for the whole request,
  // or only its idle reconciliation poll. Any signal clears `routine`, so it runs at once.
  const deferred = (name: SyncLane) => {
    if (name === 'send') return lanes.send.held && hold()?.send === true;
    const current = hold();
    return current?.receive === true || (lanes.receive.routine && current?.idlePoll === true);
  };
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
            : gate === 'local-storage' || gate === 'sign-in-required'
              ? 'blocked'
              : lane.phase,
      failures: lane.failures,
      nextAttemptAt:
        !stopped &&
        gate === 'ready' &&
        !lane.halt &&
        active !== name &&
        lane.due !== undefined &&
        !deferred(name)
          ? Math.max(
              lane.due,
              name === 'send' && lane.failures === 0 ? (batch?.due ?? -Infinity) : -Infinity,
            )
          : null,
      issueSince: (lane.halt ? lane.issueSince : (signInSince ?? lane.issueSince)) ?? null,
      lastSuccessAt: lane.lastSuccessAt ?? null,
      ...(!stopped && lane.halt && lane.haltDetail ? { detail: lane.haltDetail } : {}),
      reason: stopped
        ? null
        : (lane.halt ??
          (gate === 'local-storage' || gate === 'sign-in-required'
            ? gate
            : // Reads that fail because of it (a pruned stream) do not hide the cause.
              (lane.standing ?? lane.retryReason ?? null))),
    };
  };
  const snapshot = (): SyncStatus =>
    Object.freeze({
      send: Object.freeze({ ...laneStatus('send'), acceptedThrough: lanes.send.position }),
      receive: Object.freeze({ ...laneStatus('receive'), receivedThrough: lanes.receive.position }),
    });
  let value = snapshot();
  const publish = () => {
    if (options.gate() === 'sign-in-required') signInSince ??= clock.now();
    else signInSince = undefined;
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
    batch?.clear();
    clear();
    for (const name of names) {
      lanes[name].due = undefined;
      lanes[name].dirty = lanes[name].expedite = false;
      lanes[name].continuing = false;
      lanes[name].held = false;
      lanes[name].routine = false;
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
  const eligible = () =>
    names.filter((name) => !lanes[name].halt && lanes[name].due !== undefined && !deferred(name));
  // A failed operation owns its retry clock. New typing cannot move it in either direction.
  const dueAt = (name: SyncLane) =>
    name === 'send' && lanes.send.failures === 0
      ? Math.max(lanes.send.due!, batch?.due ?? -Infinity)
      : lanes[name].due!;
  const arm = () => {
    if (!ready() || work) {
      clear();
      return;
    }
    // Observers can reenter arm; replace any timer they installed after notification too.
    clear();
    const pending = eligible();
    if (!pending.length) return;
    const due = Math.min(...pending.map(dueAt));
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
    const due = eligible().filter((name) => dueAt(name) <= clock.now());
    const name = due.find((n) => n !== last) ?? due[0];
    if (!name) {
      arm();
      return;
    }
    active = name;
    const currentTurn = ++turn;
    const lane = lanes[name];
    work = Promise.resolve()
      .then(async () => {
        // A hold can engage between choosing this lane and starting it. Keep its deadline.
        if (!ready() || lane.halt || deferred(name)) return;
        lane.phase = 'working';
        // Keep the deadline until after observers have had their last opportunity to pause this pass.
        if (!ready() || lane.halt) return;
        lane.due = undefined;
        lane.routine = false;
        if (!lane.continuing) lane.dirty = lane.expedite = false;
        lane.continuing = false;
        last = name;
        const result =
          name === 'receive'
            ? await options.receive(
                () =>
                  !stopped &&
                  turn === currentTurn &&
                  active === 'receive' &&
                  options.gate() === 'ready' &&
                  !lanes.send.halt &&
                  lanes.send.due !== undefined &&
                  // A parked sender cannot use the turn; do not cut a receive sweep for it.
                  !deferred('send') &&
                  dueAt('send') <= clock.now(),
              )
            : await options.send(
                batch
                  ? () => {
                      // Local edits may have arrived while the send prelude awaited storage. Delay only
                      // allocation of a new envelope; persisted submissions still retry on their own clock.
                      if (batch.due !== undefined && batch.due > clock.now()) return batch.due;
                      batch.clear();
                      return undefined;
                    }
                  : undefined,
                // Same boundary: any allocated position has been driven first, so reduction can
                // cut here. Persisted submissions never wait for a hold.
                options.hold ? () => hold()?.send === true : undefined,
              );
        if (stopped) return;
        const position =
          'acceptedThrough' in result ? result.acceptedThrough : result.receivedThrough;
        if (position < lane.position)
          throw new ContentError('repair-required', 'Durable lane position regressed');
        lane.position = position;
        // A retained submit receipt already contributes to the composed inbound prefix.
        // Publish that verified aggregate without scheduling a network read of our own write.
        if (
          name === 'send' &&
          'receivedThrough' in result &&
          result.receivedThrough !== undefined
        ) {
          if (result.receivedThrough < lanes.receive.position)
            throw new ContentError('repair-required', 'Durable receive position regressed');
          lanes.receive.position = result.receivedThrough;
        }
        if (
          (name === 'send' && 'acceptedNow' in result && result.acceptedNow) ||
          (name === 'receive' && (result.kind === 'progress' || result.kind === 'idle'))
        )
          lane.lastSuccessAt = clock.now();
        if (name === 'receive') {
          try {
            lane.standing = options.standing?.();
          } catch {
            lane.standing = undefined; // An observer cannot stop synchronization.
          }
          if (lane.standing) lane.issueSince ??= clock.now();
        }
        // An unanswered submit can have committed. Preserve independent read reconciliation,
        // but never override a receiver's failure backoff or diagnostic halt.
        if (
          name === 'send' &&
          result.kind === 'unknown' &&
          !lanes.receive.halt &&
          lanes.receive.failures === 0
        ) {
          lanes.receive.due = Math.min(lanes.receive.due ?? clock.now(), clock.now());
          lanes.receive.routine = false;
        }
        if (result.kind === 'held') {
          // Parked, not failed or idle-swept: local edits keep their dirty mark for release.
          delete lane.issueSince;
          lane.phase = 'idle';
          lane.failures = 0;
          lane.retryReason = undefined;
          lane.due = undefined;
          lane.expedite = false;
          lane.held = true;
        } else if (result.kind === 'yielded') {
          // Preserve hints received before/during the pause, so completing the remaining
          // checks cannot hide writing on a publisher checked before that hint.
          lane.continuing = true;
          lane.due = clock.now();
        } else if (result.kind === 'batching') {
          delete lane.issueSince;
          lane.phase = 'idle';
          lane.failures = 0;
          lane.retryReason = undefined;
          lane.due = result.due;
          lane.dirty = lane.expedite = false;
        } else if (result.kind === 'blocked') {
          lane.halt = result.reason;
          lane.haltDetail =
            'detail' in result && result.detail ? Object.freeze({ ...result.detail }) : undefined;
          lane.issueSince ??= clock.now();
          lane.due = undefined;
          lane.expedite = lane.dirty = false;
        } else if (result.kind === 'paused') {
          lane.due = clock.now() + (lane.expedite ? 0 : 50);
          lane.expedite = false;
        } else {
          const retryable = result.kind === 'unknown' || result.kind === 'expired';
          lane.retryReason =
            result.kind === 'expired'
              ? 'request-expired'
              : retryable
                ? 'network-unavailable'
                : undefined;
          if (retryable || lane.standing) lane.issueSince ??= clock.now();
          else delete lane.issueSince;
          lane.phase = retryable ? 'retrying' : result.kind === 'idle' ? 'idle' : 'working';
          lane.failures = retryable ? Math.min(lane.failures + 1, 6) : 0;
          const delay = retryable
            ? Math.min(1000 * 2 ** (lane.failures - 1), 30000)
            : result.kind === 'progress'
              ? name === 'receive'
                ? 0
                : 50
              : name === 'receive'
                ? (options.receiveInterval?.() ?? 5000)
                : undefined;
          lane.due = lane.expedite
            ? clock.now()
            : lane.dirty && !retryable
              ? clock.now() + (name === 'receive' ? 0 : 50)
              : delay !== undefined
                ? clock.now() + delay
                : lane.dirty
                  ? clock.now() + 50
                  : undefined;
          // Only a clean idle sweep's own timer is routine; a hint during the pass made it dirty.
          lane.routine =
            name === 'receive' && result.kind === 'idle' && !lane.expedite && !lane.dirty;
          lane.expedite = lane.dirty = false;
        }
        ready();
      })
      .catch((cause) => {
        if (!stopped) {
          if (options.gate() === 'offline') delete lane.issueSince;
          else lane.issueSince ??= clock.now();
          if (cause instanceof EnvelopeSizeError) lane.halt = 'envelope-size';
          else if (cause instanceof HistoryReplyRefused)
            lane.halt = cause.reason === 'size' ? 'inbound-size' : 'integrity';
          else if (
            cause instanceof AdmissionError &&
            (cause.code === 'inactive-session' || cause.code === 'discarded')
          )
            lane.halt = 'closed';
          else if (
            (cause instanceof AdmissionError &&
              cause.code !== 'storage-failed' &&
              cause.code !== 'queue-full') ||
            cause instanceof InboundError ||
            (cause instanceof ContentError && cause.code !== 'storage-failed') ||
            (cause instanceof CustodyError && cause.code !== 'storage-failed')
          )
            lane.halt = 'integrity';
          if (lane.halt) lane.due = undefined;
          else {
            lane.phase = 'retrying';
            lane.retryReason = 'operation-failed';
            lane.failures = Math.min(lane.failures + 1, 6);
            lane.due = clock.now() + Math.min(1000 * 2 ** (lane.failures - 1), 30000);
          }
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
  const wake = (
    cause:
      | 'start'
      | 'gate'
      | 'online'
      | 'authority'
      | 'local'
      | 'remote'
      | 'retry'
      | 'flush'
      | 'hold',
    target?: SyncLane,
  ) => {
    if (stopped) return;
    // Released: the parked sender checks once for edits that arrived while it was held.
    const send = lanes.send;
    if (send.held && !hold()?.send) {
      send.held = false;
      if (!send.halt && active !== 'send')
        send.due = Math.min(send.due ?? clock.now(), clock.now());
      else if (active === 'send') send.dirty = true;
    }
    if (options.gate() === 'offline')
      for (const lane of Object.values(lanes)) delete lane.issueSince;
    if (cause === 'local') {
      // A due publication window survives receive work or an asynchronous send prelude.
      // Local journal flushing owns a separate window with its original policy.
      if (batch?.due !== undefined && batch.due <= clock.now()) batch.close();
      batch?.note();
    }
    if (cause === 'flush' || cause === 'authority' || (cause === 'retry' && target === 'send'))
      batch?.close();
    for (const name of names) {
      if (cause === 'retry' && name !== target) continue;
      const lane = lanes[name];
      if (options.gate() === 'ready' && (lane.halt || lane.failures))
        lane.issueSince ??= clock.now();
      if (cause === 'remote' && name === 'receive' && !lane.halt) {
        if (active === name || lane.continuing) lane.dirty = true;
        else if (lane.failures === 0) {
          lane.due = Math.min(lane.due ?? clock.now(), clock.now());
          lane.routine = false; // A hint is a real signal, never an idle-poll deferral.
        }
      }
      // Only the owner calls this after installing verified membership. Other evidence halts stay closed.
      if (cause === 'retry' || (cause === 'authority' && name === 'send' && lane.halt === 'closed'))
        lane.halt = lane.haltDetail = undefined;
      if (cause === 'local' && name === 'send') {
        lane.dirty = true;
        if (!lane.halt && active !== name && lane.due === undefined) lane.due = clock.now() + 50;
      }
      if (
        cause === 'flush' &&
        name === 'send' &&
        batch?.due !== undefined &&
        !lane.halt &&
        lane.failures === 0
      ) {
        if (active === name) lane.dirty = true;
        else lane.due = Math.min(lane.due ?? clock.now(), clock.now());
      }
      if (cause === 'start' && lane.due === undefined && active !== name && !lane.halt)
        lane.due = clock.now();
      if ((cause === 'online' || cause === 'authority' || cause === 'retry') && !lane.halt) {
        if (active === name || lane.continuing) lane.expedite = true;
        else {
          lane.due = clock.now();
          lane.routine = false;
        }
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
/** Scheduling budget only; every check still belongs to its native verified receive owner. */
export function createReceiveSweep() {
  let held: { context: object; count: number; remaining: number } | undefined;
  return {
    reset() {
      held = undefined;
    },
    async run(
      context: object,
      count: number,
      check: () => Promise<ReceiveStep>,
      sendDue: () => boolean,
    ): Promise<SyncReceiveStep> {
      if (!Number.isSafeInteger(count) || count < 1) throw Error('Invalid receive sweep size');
      if (!held || held.context !== context || held.count !== count)
        held = { context, count, remaining: count };
      const sweep = held;
      try {
        for (;;) {
          const step = await check();
          if (step.kind !== 'idle' || held !== sweep || --sweep.remaining === 0) {
            if (held === sweep) held = undefined;
            return step;
          }
          if (sendDue()) return { kind: 'yielded', receivedThrough: step.receivedThrough };
        }
      } catch (cause) {
        if (held === sweep) held = undefined;
        throw cause;
      }
    },
  };
}
/** Private v9 outbound step, retaining v8's byte retry with explicit paused outcomes. */
export async function driveOutboundStep(
  ops: DriverOperations,
  token: AccountAccess,
  gate: () => DriverGate,
  beforeNewEnvelope?: () => number | undefined,
  holdNewEnvelope?: () => boolean,
): Promise<OutboundStep> {
  const progress = (s: Awaited<ReturnType<DriverOperations['deliveryStatus']>>) => ({
    acceptedThrough: s.acceptedThrough,
    ...(s.receivedThrough !== undefined ? { receivedThrough: s.receivedThrough } : {}),
  });
  let status = await ops.deliveryStatus();
  if (status.state === 'closed' && gate() === 'ready' && (await ops.retryRetiredGeneration?.()))
    status = await ops.deliveryStatus();
  const pause = (): OutboundStep | null => {
    if (status.state !== 'ready')
      return { kind: 'blocked', ...progress(status), reason: status.state };
    if (gate() !== 'ready') return { kind: 'paused', ...progress(status) };
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
      // acceptedThrough + 1 has no submission and no persisted spool position: nothing allocated
      // is unaccepted. Parking here leaves the settled cut local reduction requires.
      if (holdNewEnvelope?.()) return { kind: 'held', ...progress(status) };
      const due = beforeNewEnvelope?.();
      if (due !== undefined) return { kind: 'batching', due, ...progress(status) };
      const prepared = await ops.prepareNextEnvelope();
      if (!prepared) return pause() ?? { kind: 'idle', ...progress(status) };
      prepared.bytes.fill(0);
      if (prepared.position !== position) throw Error('Unexpected delivery position');
    }
    paused = pause();
    if (paused) return paused;
    const submission = await ops.prepareSubmission(position);
    if ('bytes' in submission && submission.bytes instanceof Uint8Array) submission.bytes.fill(0);
    if (submission.kind !== 'ready') {
      status = await ops.deliveryStatus();
      return pause() ?? { kind: 'progress', ...progress(status) };
    }
  }
  paused = pause();
  if (paused) return paused;
  await ops.submitPending(token);
  let next = await ops.deliveryStatus();
  let retried = false;
  if (next.state === 'closed' && gate() === 'ready' && (await ops.retryRetiredGeneration?.())) {
    retried = true;
    next = await ops.deliveryStatus();
  }
  if (next.acceptedThrough < status.acceptedThrough)
    throw Error('Durable delivery prefix regressed');
  if (next.state !== 'ready') return { kind: 'blocked', ...progress(next), reason: next.state };
  return {
    kind:
      retried || next.acceptedThrough > status.acceptedThrough
        ? 'progress'
        : gate() !== 'ready'
          ? 'paused'
          : 'unknown',
    ...progress(next),
    ...(next.acceptedThrough > status.acceptedThrough ? { acceptedNow: true as const } : {}),
  };
}

export type SyncRuntime = ReturnType<typeof createSyncScheduler>['runtime'];
