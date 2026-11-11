/** Public presentation and explicit actions only. No credential, proof, journal or arbitrary RPC. */
import type { NetworkLogin, LoginStatus } from '../account/networkLogin';
import type { DeviceRoster, DeviceRosterSnapshot } from '../account/deviceRoster';
import type {
  HistoryMaintenanceCommand,
  HistoryMaintenanceStatus,
} from '../account/historyMaintenance';
import type { AutomaticHistoryStatus } from '../account/automaticHistoryMaintenance';
import type { LocalRetentionStatus } from './automaticLocalRetention';
import { copyRetentionDetail } from './localRetentionDetail';
import type { SyncRuntime, SyncStatus, SyncLane } from './accountSyncDriver';
import type { WorkerChannel } from './workerChannel';
export type NetworkLoginView = Pick<
  NetworkLogin,
  'getSnapshot' | 'subscribe' | 'connect' | 'signOut'
>;
export interface AccountSessionSource {
  login: NetworkLoginView;
  sync?: SyncRuntime | undefined;
  devices: DeviceRoster;
}
interface SessionState {
  login: LoginStatus;
  sync: SyncStatus | null;
  local: LocalRetentionStatus | null;
  automatic: AutomaticHistoryStatus | null;
  devices: { remove: boolean; history: boolean; detached: boolean; transition?: string };
}
interface SessionHint {
  sequence: number;
  state: SessionState;
}
const fail = () => Error('Worker session presentation changed');
function fields(v: unknown, required: readonly string[], optional: readonly string[] = []) {
  if (!v || typeof v !== 'object' || Object.getPrototypeOf(v) !== Object.prototype) throw fail();
  const d = Object.getOwnPropertyDescriptors(v);
  if (
    Reflect.ownKeys(v).some(
      (k) =>
        typeof k !== 'string' || ![...required, ...optional].includes(k) || !('value' in d[k]!),
    ) ||
    required.some((k) => !Object.hasOwn(d, k))
  )
    throw fail();
}
const number = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const timestamp = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER;
const text = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 512;
const phases = ['idle', 'waiting', 'running', 'halted', 'closed'];
const loginStates = [
  'closed',
  'disconnected',
  'connect',
  'reconnect',
  'connecting',
  'remembered',
  'storage-error',
  'sign-out-pending',
  'signed-out',
];
const commands = ['inspect', 'create', 'resume', 'verify', 'discard', 'prune'];
function history(input: unknown): HistoryMaintenanceStatus {
  fields(input, ['sequence', 'pending', 'canDiscard'], ['pruned']);
  const v = input as HistoryMaintenanceStatus;
  if (
    !number(v.sequence) ||
    !['none', 'resume', 'verify', 'waiting', 'stale'].includes(v.pending) ||
    typeof v.canDiscard !== 'boolean' ||
    (Object.hasOwn(v, 'pruned') && v.pruned !== true)
  )
    throw fail();
  return Object.freeze({ ...v });
}
function sync(input: unknown): SyncStatus {
  fields(input, ['send', 'receive']);
  const out = {} as { send: SyncStatus['send']; receive: SyncStatus['receive'] };
  for (const name of ['send', 'receive'] as const) {
    const v = (input as SyncStatus)[name],
      pos = name === 'send' ? 'acceptedThrough' : 'receivedThrough';
    fields(v, ['phase', 'failures', 'nextAttemptAt', 'reason', 'issueSince', 'lastSuccessAt', pos]);
    if (
      !['starting', 'working', 'idle', 'retrying', 'offline', 'blocked', 'closed'].includes(
        v.phase,
      ) ||
      !number(v.failures) ||
      !number((v as unknown as Record<string, unknown>)[pos]) ||
      ['nextAttemptAt', 'issueSince', 'lastSuccessAt'].some(
        (k) => v[k as 'issueSince'] !== null && !timestamp(v[k as 'issueSince']),
      ) ||
      (v.reason !== null &&
        ![
          'closed',
          'conflict',
          'finalized',
          'envelope-size',
          'integrity',
          'operation-failed',
          'inbound-size',
          'response-too-large',
          'local-storage',
          'sign-in-required',
          'request-expired',
          'network-unavailable',
        ].includes(v.reason))
    )
      throw fail();
    Object.assign(out, { [name]: Object.freeze({ ...v }) });
  }
  return Object.freeze(out);
}
function local(input: unknown): LocalRetentionStatus {
  fields(input, ['phase', 'reason'], ['progress', 'detail']);
  const { detail: raw, ...rest } = input as LocalRetentionStatus;
  // Presentation only: an unknown or malformed detail is dropped and the page falls back.
  const detail = rest.reason === 'capacity' ? copyRetentionDetail(raw) : undefined;
  const v: LocalRetentionStatus = { ...rest, ...(detail ? { detail } : {}) };
  if (!phases.includes(v.phase) || (v.reason !== undefined && !text(v.reason))) throw fail();
  if (v.progress !== undefined) {
    const p = v.progress;
    fields(p, ['stage', 'attempt', 'elapsedMs'], ['completed', 'total']);
    if (
      ![
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
      ].includes(p.stage) ||
      !number(p.attempt) ||
      !number(p.elapsedMs) ||
      ((p.completed !== undefined || p.total !== undefined) &&
        (!number(p.completed) || !number(p.total) || p.completed! > p.total!))
    )
      throw fail();
    return Object.freeze({ ...v, progress: Object.freeze({ ...p }) });
  }
  return Object.freeze({ ...v });
}
function automatic(input: unknown): AutomaticHistoryStatus {
  fields(input, ['phase', 'reason'], ['history']);
  const v = input as AutomaticHistoryStatus;
  if (
    !phases.includes(v.phase) ||
    (v.reason !== undefined && !['peer', 'stale', 'connection', 'owner-error'].includes(v.reason))
  )
    throw fail();
  return Object.freeze({ ...v, ...(v.history ? { history: history(v.history) } : {}) });
}
export function captureAccountSessionState(input: unknown): Readonly<SessionState> {
  fields(input, ['login', 'sync', 'local', 'automatic', 'devices']);
  const v = input as SessionState,
    d = v.devices;
  fields(d, ['remove', 'history', 'detached'], ['transition']);
  if (
    !loginStates.includes(v.login) ||
    ['remove', 'history', 'detached'].some((k) => typeof d[k as 'remove'] !== 'boolean') ||
    (d.transition !== undefined && !text(d.transition))
  )
    throw fail();
  return Object.freeze({
    login: v.login,
    sync: v.sync === null ? null : sync(v.sync),
    local: v.local === null ? null : local(v.local),
    automatic: v.automatic === null ? null : automatic(v.automatic),
    devices: Object.freeze({ ...d }),
  });
}
function snapshot(source: AccountSessionSource) {
  return captureAccountSessionState({
    login: source.login.getSnapshot(),
    sync: source.sync?.status ?? null,
    local: source.devices.localHistory?.status ?? null,
    automatic: source.devices.automaticHistory?.status ?? null,
    devices: {
      remove: !!source.devices.remove,
      history: !!source.devices.history,
      detached: source.devices.detached === true,
      ...(source.devices.transition ? { transition: source.devices.transition } : {}),
    },
  });
}
/** At most one request and one latest snapshot. Status delivery never holds a native mutation. */
export function publishAccountSession(
  source: AccountSessionSource,
  signal: AbortSignal,
  send: (hint: SessionHint) => Promise<unknown>,
  failed: () => void,
) {
  let closed = signal.aborted,
    sending = false,
    queued = false,
    sequence = 0;
  let pending: Readonly<SessionState> | undefined;
  const stops: (() => void)[] = [];
  let resolve!: () => void, reject!: (e: unknown) => void;
  const ready = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  void ready.catch(() => {});
  const close = () => {
    if (closed) return;
    closed = true;
    pending = undefined;
    for (const stop of stops.splice(0)) stop();
    signal.removeEventListener('abort', close);
    reject(fail());
  };
  const drain = async () => {
    queued = false;
    if (closed || sending || !pending) return;
    const state = pending;
    pending = undefined;
    sending = true;
    try {
      if (!number(++sequence)) throw fail();
      await send({ sequence, state });
      if (!closed) resolve();
    } catch (e) {
      if (!closed) {
        close();
        failed();
      }
      reject(e);
    } finally {
      sending = false;
      schedule();
    }
  };
  const schedule = () => {
    if (!closed && !queued && !sending && pending) {
      queued = true;
      queueMicrotask(() => void drain());
    }
  };
  const observe = () => {
    if (closed) return;
    try {
      pending = snapshot(source);
      schedule();
    } catch (e) {
      close();
      reject(e);
      failed();
    }
  };
  const attach = (stop: () => void) => {
    if (closed) stop();
    else stops.push(stop);
  };
  if (closed) reject(fail());
  else {
    signal.addEventListener('abort', close, { once: true });
    try {
      attach(source.login.subscribe(observe));
      if (source.sync) attach(source.sync.onStatus(observe));
      if (source.devices.localHistory) attach(source.devices.localHistory.onStatus(observe));
      if (source.devices.automaticHistory)
        attach(source.devices.automaticHistory.onStatus(observe));
      observe();
    } catch (e) {
      close();
      reject(e);
      failed();
    }
  }
  return Object.freeze({ ready, close, observe });
}
export type AccountSessionCommand =
  | { kind: 'connect' | 'signOut' | 'roster' | 'localRetry' }
  | { kind: 'syncRetry'; lane: SyncLane }
  | { kind: 'remove'; target: string }
  | { kind: 'history'; command: HistoryMaintenanceCommand };
export function captureAccountSessionCommand(input: unknown): AccountSessionCommand {
  if (!input || typeof input !== 'object') throw fail();
  const k = Object.getOwnPropertyDescriptor(input, 'kind');
  if (!k || !('value' in k)) throw fail();
  const kind = k.value;
  fields(input, [
    'kind',
    ...(kind === 'syncRetry'
      ? ['lane']
      : kind === 'remove'
        ? ['target']
        : kind === 'history'
          ? ['command']
          : []),
  ]);
  const c = input as AccountSessionCommand;
  if (
    !['connect', 'signOut', 'roster', 'localRetry', 'syncRetry', 'remove', 'history'].includes(
      kind,
    ) ||
    (c.kind === 'syncRetry' && !['send', 'receive'].includes(c.lane)) ||
    (c.kind === 'remove' && !text(c.target)) ||
    (c.kind === 'history' && !commands.includes(c.command))
  )
    throw fail();
  return Object.freeze({ ...c });
}
/** All command results are original operation results; status never authorizes them. */
export async function executeAccountSessionCommand(
  source: AccountSessionSource,
  input: unknown,
  live: () => void,
) {
  live();
  const c = captureAccountSessionCommand(input);
  let result: unknown;
  switch (c.kind) {
    case 'connect':
      result = await source.login.connect();
      break;
    case 'signOut':
      result = await source.login.signOut();
      break;
    case 'roster':
      result = await source.devices.read();
      break;
    case 'localRetry':
      if (!source.devices.localHistory) throw fail();
      source.devices.localHistory.retry();
      break;
    case 'syncRetry':
      if (!source.sync) throw fail();
      source.sync.retry(c.lane);
      break;
    case 'remove':
      if (!source.devices.remove) throw fail();
      result = await source.devices.remove(c.target);
      break;
    case 'history':
      if (!source.devices.history) throw fail();
      result = await source.devices.history(c.command);
      break;
  }
  live();
  return result;
}
function roster(input: unknown): DeviceRosterSnapshot {
  fields(input, ['epoch', 'currentDevice', 'devices'], ['generation', 'detached']);
  const v = input as DeviceRosterSnapshot;
  if (
    !number(v.epoch) ||
    !text(v.currentDevice) ||
    (v.generation !== undefined && !number(v.generation)) ||
    (v.detached !== undefined && typeof v.detached !== 'boolean') ||
    !Array.isArray(v.devices) ||
    v.devices.length > 4096
  )
    throw fail();
  const devices = v.devices.map((d) => {
    fields(d, ['id', 'state']);
    if (!text(d.id) || !['certified', 'pending'].includes(d.state)) throw fail();
    return Object.freeze({ ...d });
  });
  return Object.freeze({ ...v, devices: Object.freeze(devices) });
}
export function createWindowAccountSession(
  channel: Pick<WorkerChannel, 'request'>,
  signal: AbortSignal,
  failed: () => void,
) {
  let state: Readonly<SessionState> | undefined,
    sequence = 0,
    closed = signal.aborted;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch {
        /* observers own errors */
      }
    }
  };
  const close = () => {
    if (closed) return;
    closed = true;
    signal.removeEventListener('abort', close);
    notify();
    listeners.clear();
  };
  if (!closed) signal.addEventListener('abort', close, { once: true });
  const live = () => {
    if (closed || signal.aborted || !state) throw fail();
  };
  const read = () => {
    if (!state) throw fail();
    return state;
  };
  const request = async (command: AccountSessionCommand) => {
    live();
    const value = await channel.request('sessionCommand', captureAccountSessionCommand(command));
    live();
    return value;
  };
  const fire = (command: AccountSessionCommand) => {
    live();
    void request(command).catch(() => {
      if (!closed) failed();
    });
  };
  const subscribe = (fn: () => void) => {
    if (!closed) listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  };
  const login: NetworkLoginView = Object.freeze({
    getSnapshot: () => (closed ? 'closed' : read().login),
    subscribe,
    connect: async () => {
      await request({ kind: 'connect' });
    },
    signOut: async () => {
      await request({ kind: 'signOut' });
    },
  });
  // These caches are presentation only. None is used to admit input or grant a native operation.
  let endedSync: SyncStatus | undefined;
  const syncView: SyncRuntime = Object.freeze({
    get status() {
      const value = read().sync;
      if (!value) throw fail();
      return closed
        ? (endedSync ??= Object.freeze({
            send: Object.freeze({ ...value.send, phase: 'closed', nextAttemptAt: null }),
            receive: Object.freeze({ ...value.receive, phase: 'closed', nextAttemptAt: null }),
          }))
        : value;
    },
    onStatus: (fn: (status: SyncStatus) => void) => subscribe(() => fn(syncView.status)),
    retry: (lane: SyncLane) => fire({ kind: 'syncRetry', lane }),
  });
  let endedLocal: LocalRetentionStatus | undefined,
    endedAutomatic: AutomaticHistoryStatus | undefined;
  const localView = Object.freeze({
    get status() {
      const value = read().local;
      if (!value) throw fail();
      return closed ? (endedLocal ??= Object.freeze({ ...value, phase: 'closed' })) : value;
    },
    onStatus: subscribe,
    retry: () => fire({ kind: 'localRetry' }),
  });
  const automaticView = Object.freeze({
    get status() {
      const value = read().automatic;
      if (!value) throw fail();
      return closed ? (endedAutomatic ??= Object.freeze({ ...value, phase: 'closed' })) : value;
    },
    onStatus: subscribe,
  });
  let devices: DeviceRoster | undefined;
  return Object.freeze({
    close,
    update(input: unknown) {
      if (closed || signal.aborted) throw fail();
      fields(input, ['sequence', 'state']);
      const h = input as SessionHint;
      if (!number(h.sequence) || h.sequence !== sequence + 1) throw fail();
      const next = captureAccountSessionState(h.state);
      if (
        state &&
        (Object.keys(state.devices)
          .filter((k) => k !== 'transition')
          .some((k) => state!.devices[k as 'remove'] !== next.devices[k as 'remove']) ||
          !!state.sync !== !!next.sync ||
          !!state.local !== !!next.local ||
          !!state.automatic !== !!next.automatic)
      )
        throw fail();
      sequence = h.sequence;
      state = next;
      notify();
    },
    get ports() {
      live();
      const s = read();
      devices ??= Object.freeze({
        get detached() {
          return read().devices.detached;
        },
        get transition() {
          return read().devices.transition;
        },
        ...(s.local ? { localHistory: localView } : {}),
        ...(s.automatic ? { automaticHistory: automaticView } : {}),
        read: async () => roster(await request({ kind: 'roster' })),
        ...(s.devices.remove
          ? {
              remove: async (target: string) => {
                const v = await request({ kind: 'remove', target });
                if (v !== 'pending' && v !== 'applying') throw fail();
                return v;
              },
            }
          : {}),
        ...(s.devices.history
          ? {
              history: async (command: HistoryMaintenanceCommand) =>
                history(await request({ kind: 'history', command })),
            }
          : {}),
      });
      return Object.freeze({ networkLogin: login, ...(s.sync ? { sync: syncView } : {}), devices });
    },
  });
}
