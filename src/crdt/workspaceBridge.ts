/** Bounded scheduling observations. No writing bytes, custody receipts or native permission. */
import type { AdmissionStatus } from './admissionQueue';
import type { AdmittedWorkspace } from './admittedWorkspace';
import type { AccountWorkspacePort } from './accountWorkspacePort';
import type { WorkerChannel } from './workerChannel';
export interface WorkspaceHint {
  readonly sequence: number;
  readonly status: AdmissionStatus;
  readonly changed: boolean;
  readonly local: boolean;
}
const refused = () => Error('Workspace scheduling observation changed');
function fields(value: unknown, expected: readonly string[], optional: readonly string[] = []) {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    throw refused();
  const d = Object.getOwnPropertyDescriptors(value),
    keys = Reflect.ownKeys(value);
  if (
    keys.some(
      (k) =>
        typeof k !== 'string' || ![...expected, ...optional].includes(k) || !('value' in d[k]!),
    ) ||
    expected.some((k) => !Object.hasOwn(d, k))
  )
    throw refused();
}
/** Capture only bounded status data used by the scheduler. Pressure causes remain in the UI. */
export function workspaceSchedulingStatus(value: AdmissionStatus): AdmissionStatus {
  return captureWorkspaceStatus({
    state: value.state,
    revision: value.revision,
    pendingItems: value.pendingItems,
    pendingBytes: value.pendingBytes,
    reservedBytes: value.reservedBytes,
    durable: value.durable,
    pressure: value.pressure ? { code: value.pressure.code } : null,
    ...(value.maintenance ? { maintenance: value.maintenance } : {}),
  });
}
function captureWorkspaceStatus(input: unknown): AdmissionStatus {
  fields(
    input,
    ['state', 'revision', 'pendingItems', 'pendingBytes', 'reservedBytes', 'durable', 'pressure'],
    ['maintenance'],
  );
  const s = input as AdmissionStatus;
  if (
    !['active', 'blocked', 'closing', 'closed', 'failed'].includes(s.state) ||
    ['revision', 'pendingItems', 'pendingBytes', 'reservedBytes'].some(
      (k) =>
        !Number.isSafeInteger(s[k as keyof AdmissionStatus]) || (s[k as 'revision'] as number) < 0,
    ) ||
    typeof s.durable !== 'boolean' ||
    (Object.hasOwn(s, 'maintenance') &&
      (typeof s.maintenance !== 'string' ||
        !['running', 'retained', 'deferred'].includes(s.maintenance)))
  )
    throw refused();
  if (s.pressure !== null) {
    fields(s.pressure, ['code']);
    if (
      typeof s.pressure.code !== 'string' ||
      s.pressure.code.length > 128 ||
      !s.pressure.code.length
    )
      throw refused();
  }
  return Object.freeze({
    ...s,
    pressure: s.pressure ? Object.freeze({ code: s.pressure.code }) : null,
  });
}
function captureHint(input: unknown): WorkspaceHint {
  fields(input, ['sequence', 'status', 'changed', 'local']);
  const h = input as WorkspaceHint;
  if (
    !Number.isSafeInteger(h.sequence) ||
    h.sequence < 1 ||
    typeof h.changed !== 'boolean' ||
    typeof h.local !== 'boolean'
  )
    throw refused();
  return Object.freeze({
    sequence: h.sequence,
    status: captureWorkspaceStatus(h.status),
    changed: h.changed,
    local: h.local,
  });
}
/** One outstanding call plus one merged latest status. Never a synchronous input-handler RPC. */
export function forwardWindowWorkspace(
  workspace: AdmittedWorkspace,
  signal: AbortSignal,
  send: (hint: WorkspaceHint) => Promise<unknown>,
  failed: () => void,
) {
  let pending: Omit<WorkspaceHint, 'sequence'> | undefined,
    sequence = 0,
    sending = false,
    scheduled = false,
    closed = false;
  const stops: (() => void)[] = [];
  const close = () => {
    if (closed) return;
    closed = true;
    pending = undefined;
    for (const stop of stops.splice(0)) stop();
    signal.removeEventListener('abort', close);
  };
  const drain = () => {
    scheduled = false;
    if (closed || sending || !pending) return;
    const state = pending;
    pending = undefined;
    sending = true;
    void (async () => {
      try {
        if (!Number.isSafeInteger(++sequence)) throw refused();
        await send({ sequence, ...state });
      } catch {
        if (!closed) {
          close();
          failed();
        }
      } finally {
        sending = false;
        schedule();
      }
    })();
  };
  const schedule = () => {
    if (!closed && !scheduled && !sending && pending) {
      scheduled = true;
      queueMicrotask(drain);
    }
  };
  const observe = (changed = false, local = false) => {
    if (closed) return;
    try {
      pending = {
        status: workspaceSchedulingStatus(workspace.status),
        changed: changed || pending?.changed === true,
        local: local || pending?.local === true,
      };
      schedule();
    } catch {
      close();
      failed();
    }
  };
  const attach = (stop: () => void) => {
    if (closed) stop();
    else stops.push(stop);
  };
  if (signal.aborted) close();
  else {
    signal.addEventListener('abort', close, { once: true });
    try {
      attach(workspace.subscribe(() => observe(true)));
      attach(workspace.onStatus(() => observe()));
      attach(
        workspace.outgoing((bytes) => {
          bytes.fill(0);
          observe(false, true);
        }),
      );
      if (signal.aborted) close();
      else observe();
    } catch {
      close();
      failed();
    }
  }
  return Object.freeze({ close });
}
/** Minimal actual Worker-facing workspace port. Status observations never satisfy durability. */
export function createWorkerWorkspacePort(
  channel: Pick<WorkerChannel, 'request'>,
  initial: AdmissionStatus,
  signal: AbortSignal,
  closeNative: () => Promise<void>,
) {
  let status = captureWorkspaceStatus(initial),
    sequence = 0,
    closed = false;
  const changed = new Set<() => void>(),
    local = new Set<() => void>(),
    observers = new Set<(status: AdmissionStatus) => void>();
  const live = () => {
    if (closed || signal.aborted) throw refused();
  };
  const stop = () => {
    if (closed) return;
    closed = true;
    changed.clear();
    local.clear();
    observers.clear();
    signal.removeEventListener('abort', stop);
  };
  signal.addEventListener('abort', stop, { once: true });
  if (signal.aborted) stop();
  let closing: Promise<void> | undefined;
  const workspace: AccountWorkspacePort = Object.freeze({
    get status() {
      return closed
        ? Object.freeze({ ...status, state: 'closed' as const, durable: false })
        : status;
    },
    whenDurable: async () => {
      live();
      await channel.request('workspaceDurable');
      live();
    },
    subscribe: (fn: () => void) => {
      live();
      changed.add(fn);
      return () => changed.delete(fn);
    },
    localChanges: (fn: () => void) => {
      live();
      local.add(fn);
      return () => local.delete(fn);
    },
    onStatus: (fn: (status: AdmissionStatus) => void) => {
      live();
      observers.add(fn);
      return () => observers.delete(fn);
    },
    close: () => {
      stop();
      closing ??= closeNative();
      return closing;
    },
  });
  return Object.freeze({
    workspace,
    stop,
    update(input: unknown) {
      live();
      const h = captureHint(input);
      if (h.sequence !== sequence + 1) throw refused();
      sequence = h.sequence;
      status = h.status;
      for (const fn of observers) fn(status);
      if (h.changed) for (const fn of changed) fn();
      if (h.local) for (const fn of local) fn();
    },
  });
}
