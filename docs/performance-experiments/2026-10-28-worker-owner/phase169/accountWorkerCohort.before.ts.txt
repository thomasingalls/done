/** Private coordination only. A joined worker must still perform ordinary Account authentication. */
import { slotPermitName } from './writeSession';
import { pageRuntimePorts } from './runtimePorts';

export interface AccountWorkerTicket {
  readonly v: 1;
  readonly slotId: string;
  readonly incarnation: string;
  readonly windowClient: string;
}
type Sync<T> = T extends PromiseLike<unknown> ? never : T;
export interface WindowAccountCohort {
  readonly ticket: AccountWorkerTicket;
  readonly signal: AbortSignal;
  readonly state: 'active' | 'closing' | 'closed' | 'failed';
  write<T>(effect: () => T & Sync<T>): T;
  beforeRelease(cleanup: () => void | Promise<void>): void;
  disposeWith(cleanup: () => void): void;
  close(): Promise<void>;
}
const windowOwners = new WeakSet<WindowAccountCohort>();
/** Internal composition must use the actual coordinator, never a structurally similar object. */
export function requireWindowAccountCohort(owner: WindowAccountCohort): void {
  if (!windowOwners.has(owner)) throw inactive();
  owner.write(() => {});
}
const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const names = (slotId: string, incarnation: string) => {
  const slot = slotPermitName(slotId);
  return {
    slot,
    reservation: slot + '/worker-supervisor',
    anchor: slot + '/worker-window/' + incarnation,
    member: slot + '/worker-member/' + incarnation,
  };
};
const inactive = () => new DOMException('Account worker cohort is inactive.', 'InvalidStateError');
const cancelled = () => new DOMException('Account worker opening was cancelled.', 'AbortError');
async function hold(locks: LockManager, name: string, mode: LockMode, signal: AbortSignal) {
  const ready = deferred<{ close(): Promise<void> }>(),
    release = deferred<void>();
  const request = locks.request(name, { mode, signal }, async () => {
    if (signal.aborted) throw cancelled();
    // Abort cancels QUEUED acquisition. An acquired lease releases only through owned cleanup.
    ready.resolve({
      close: () => {
        release.resolve();
        return request;
      },
    });
    await release.promise;
  });
  void request.catch(ready.reject);
  return ready.promise;
}

/** No keys or decrypt permission. The callback must stop/drain the actual dedicated worker.
 * A failed callback/member census retains the endpoint and supervisor leases until context death. */
export async function openWindowAccountCohort(
  slotId: string,
  stopWorker: () => Promise<void>,
  signal?: AbortSignal,
): Promise<WindowAccountCohort> {
  if (typeof window === 'undefined' || typeof stopWorker !== 'function') throw inactive();
  const locks = pageRuntimePorts.lifetime.requireLocks();
  const incarnation = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const n = names(slotId, incarnation),
    opening = new AbortController(),
    stopped = new AbortController();
  const before = new Set<() => void | Promise<void>>(),
    disposers = new Set<() => void>();
  let reservation: Awaited<ReturnType<typeof hold>> | undefined,
    anchor: Awaited<ReturnType<typeof hold>> | undefined,
    endpoint: Awaited<ReturnType<typeof hold>> | undefined;
  let state: WindowAccountCohort['state'] = 'active',
    closing: Promise<void> | undefined;
  let owner: WindowAccountCohort | undefined;
  const cancel = () => {
    opening.abort();
    if (owner) void owner.close().catch(() => {});
  };
  signal?.addEventListener('abort', cancel, { once: true });
  const stopHide = pageRuntimePorts.lifetime.onPageHide(cancel);
  const stopRetirement = pageRuntimePorts.lifetime.onRetirement(slotId, cancel);
  const detach = () => {
    signal?.removeEventListener('abort', cancel);
    stopHide();
    stopRetirement();
  };
  if (signal?.aborted) cancel();
  try {
    reservation = await hold(locks, n.reservation, 'exclusive', opening.signal);
    anchor = await hold(locks, n.anchor, 'exclusive', opening.signal);
    const barrier = await hold(locks, n.slot, 'exclusive', opening.signal);
    await barrier.close();
    endpoint = await hold(locks, n.slot, 'shared', opening.signal);
    const holders = (await locks.query()).held?.filter((v) => v.name === n.anchor);
    if (opening.signal.aborted || holders?.length !== 1 || !holders[0]?.clientId) throw cancelled();
    const ticket = Object.freeze({
      v: 1 as const,
      slotId,
      incarnation,
      windowClient: holders[0].clientId,
    });
    const live = () => {
      if (state !== 'active') throw inactive();
    };
    owner = Object.freeze({
      ticket,
      signal: stopped.signal,
      get state() {
        return state;
      },
      write<T>(effect: () => T & Sync<T>): T {
        live();
        return effect();
      },
      beforeRelease(cleanup: () => void | Promise<void>) {
        live();
        before.add(cleanup);
      },
      disposeWith(cleanup: () => void) {
        live();
        disposers.add(cleanup);
      },
      close() {
        if (closing) return closing;
        const done = deferred<void>();
        closing = done.promise;
        state = 'closing';
        stopped.abort();
        opening.abort();
        void (async () => {
          let failure: unknown;
          try {
            // Withdraw joining permission first; retain the actual slot fence throughout drain.
            await anchor!.close();
            for (const cleanup of before) await cleanup();
            await stopWorker();
            // A worker message and the browser's native release travel on different channels.
            // An actual barrier proves release; an early query/acknowledgment does not.
            const releaseDeadline = new AbortController();
            const timer = setTimeout(() => releaseDeadline.abort(), 5000);
            try {
              const released = await hold(locks, n.member, 'exclusive', releaseDeadline.signal);
              await released.close();
            } finally {
              clearTimeout(timer);
            }
          } catch (cause) {
            failure = cause;
          }
          for (const dispose of disposers) {
            try {
              const result: unknown = dispose();
              if (result && typeof result === 'object' && 'then' in result)
                throw Error('Window key disposal must finish synchronously.');
            } catch (cause) {
              failure ??= cause;
            }
          }
          before.clear();
          disposers.clear();
          detach();
          if (failure) {
            state = 'failed';
            done.reject(failure);
            return;
          }
          await endpoint!.close();
          await reservation!.close();
          state = 'closed';
          done.resolve();
        })().catch((cause) => {
          state = 'failed';
          detach();
          done.reject(cause);
        });
        return closing;
      },
    });
    windowOwners.add(owner);
    if (opening.signal.aborted) {
      await owner.close();
      throw cancelled();
    }
    return owner;
  } catch (cause) {
    opening.abort();
    detach();
    if (owner?.state === 'failed') throw cause;
    await endpoint?.close();
    await anchor?.close();
    await reservation?.close();
    throw cause;
  }
}

function captureTicket(input: AccountWorkerTicket): AccountWorkerTicket {
  if (!input || typeof input !== 'object') throw inactive();
  const fields = Object.getOwnPropertyDescriptors(input);
  if (
    Reflect.ownKeys(fields).sort().join(',') !== 'incarnation,slotId,v,windowClient' ||
    Object.values(fields).some((v) => !('value' in v))
  )
    throw inactive();
  if (
    input.v !== 1 ||
    typeof input.slotId !== 'string' ||
    !input.slotId ||
    typeof input.incarnation !== 'string' ||
    !/^[a-f0-9]{32}$/.test(input.incarnation) ||
    typeof input.windowClient !== 'string' ||
    !input.windowClient ||
    input.windowClient.length > 256
  )
    throw inactive();
  return Object.freeze({ ...input });
}

/** Internal dedicated-worker join strategy, not an Account verifier or an application API.
 * An exclusive per-incarnation member also refuses a replayed ticket in a second worker. */
export function createAccountWorkerJoin(input: AccountWorkerTicket) {
  if (typeof window !== 'undefined') throw inactive();
  const ticket = captureTicket(input),
    n = names(ticket.slotId, ticket.incarnation);
  const locks = pageRuntimePorts.lifetime.requireLocks();
  let used = false;
  const check = async (signal?: AbortSignal) => {
    if (signal?.aborted) throw cancelled();
    const held = (await locks.query()).held ?? [];
    for (const [name, mode] of [
      [n.reservation, 'exclusive'],
      [n.anchor, 'exclusive'],
      [n.slot, 'shared'],
    ] as const)
      if (
        !held.some((v) => v.name === name && v.mode === mode && v.clientId === ticket.windowClient)
      )
        throw inactive();
    if (signal?.aborted) throw cancelled();
  };
  return Object.freeze({
    async request<T>(
      name: string,
      options: { mode?: LockMode; signal?: AbortSignal },
      callback: (lock: Lock) => T | PromiseLike<T>,
    ): Promise<T> {
      if (used || name !== n.slot || options.mode !== 'shared') throw inactive();
      used = true;
      await check(options.signal);
      // ifAvailable cannot be combined with signal. Check cancellation explicitly before callback;
      // the original WriteSession owns abort/drain once its real native callback starts.
      return locks.request(n.member, { mode: 'exclusive', ifAvailable: true }, async (member) => {
        if (!member) throw inactive();
        return locks.request(n.slot, { mode: 'shared', ifAvailable: true }, async (slot) => {
          if (!slot) throw inactive();
          await check(options.signal);
          return callback(slot);
        });
      });
    },
  });
}
