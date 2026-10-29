/** Private coordination only. A joined worker must still perform ordinary Account authentication. */
import {
  cohortNames,
  localWorkerPinName,
  inactive,
  cancelled,
  type AccountWorkerTicket,
} from './nativeCoordination';
export type { AccountWorkerTicket } from './nativeCoordination';
export { createAccountWorkerJoin } from './accountWorkerJoin';
import { pageRuntimePorts } from './runtimePorts';

type Sync<T> = T extends PromiseLike<unknown> ? never : T;
export interface WindowAccountCohort {
  readonly ticket: AccountWorkerTicket;
  readonly kind: 'account' | 'local';
  readonly signal: AbortSignal;
  readonly state: 'active' | 'closing' | 'closed' | 'failed';
  /** Local composition only: pin the actual native Worker client before it may initialize keys. */
  bindLocalWorker(): Promise<void>;
  write<T>(effect: () => T & Sync<T>): T;
  beforeRelease(cleanup: () => void | Promise<void>): void;
  disposeWith(cleanup: () => void): void;
  close(): Promise<void>;
}
const windowOwners = new WeakSet<WindowAccountCohort>();
const pinnedLocalOwners = new WeakSet<WindowAccountCohort>();
/** Internal composition must use the actual coordinator, never a structurally similar object. */
export function requireWindowWorkerCohort(owner: WindowAccountCohort): void {
  if (!windowOwners.has(owner)) throw inactive();
  owner.write(() => {});
}
export function requireWindowAccountCohort(owner: WindowAccountCohort): void {
  requireWindowWorkerCohort(owner);
  if (owner.kind !== 'account') throw inactive();
}
export function requireWindowLocalCohort(owner: WindowAccountCohort): void {
  requireWindowWorkerCohort(owner);
  if (owner.kind !== 'local' || !pinnedLocalOwners.has(owner)) throw inactive();
}
const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
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
async function openWindowCohort(
  slotId: string,
  stopWorker: () => Promise<void>,
  signal?: AbortSignal,
  local = false,
): Promise<WindowAccountCohort> {
  if (typeof window === 'undefined' || typeof stopWorker !== 'function') throw inactive();
  const locks = pageRuntimePorts.lifetime.requireLocks();
  const incarnation = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const n = cohortNames(slotId, incarnation),
    opening = new AbortController(),
    stopped = new AbortController();
  const before = new Set<() => void | Promise<void>>(),
    disposers = new Set<() => void>();
  let reservation: Awaited<ReturnType<typeof hold>> | undefined,
    anchor: Awaited<ReturnType<typeof hold>> | undefined,
    endpoint: Awaited<ReturnType<typeof hold>> | undefined,
    pin: Awaited<ReturnType<typeof hold>> | undefined;
  let binding: Promise<void> | undefined;
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
    reservation = await hold(locks, n.reservation, local ? 'shared' : 'exclusive', opening.signal);
    anchor = await hold(locks, n.anchor, 'exclusive', opening.signal);
    if (!local) {
      const barrier = await hold(locks, n.slot, 'exclusive', opening.signal);
      await barrier.close();
    }
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
      kind: local ? 'local' : 'account',
      signal: stopped.signal,
      get state() {
        return state;
      },
      bindLocalWorker() {
        live();
        if (!local) throw inactive();
        if (binding) return binding;
        binding = (async () => {
          const held = (await locks.query()).held ?? [];
          live();
          const members = held.filter((v) => v.name === n.member);
          const workerClient = members[0]?.clientId;
          if (
            members.length !== 1 ||
            members[0]?.mode !== 'exclusive' ||
            !workerClient ||
            workerClient === ticket.windowClient ||
            !held.some(
              (v) => v.name === n.slot && v.mode === 'shared' && v.clientId === workerClient,
            )
          )
            throw inactive();
          pin = await hold(
            locks,
            localWorkerPinName(ticket, workerClient),
            'exclusive',
            opening.signal,
          );
          live();
          pinnedLocalOwners.add(owner!);
        })();
        return binding;
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
            await binding?.catch(() => {});
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
          await pin?.close();
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
    await pin?.close();
    await endpoint?.close();
    await anchor?.close();
    await reservation?.close();
    throw cause;
  }
}

/** Account still excludes all prior writers before publishing its Window endpoint. */
export const openWindowAccountCohort = (
  slotId: string,
  stopWorker: () => Promise<void>,
  signal?: AbortSignal,
) => openWindowCohort(slotId, stopWorker, signal);

/** Local preserves SC-03 shared writers, including old compatible Page owners. Both realms retain
 * actual old-slot shared fences. Native exclusive transitions still wait for complete key disposal. */
export const openWindowLocalCohort = (
  slotId: string,
  stopWorker: () => Promise<void>,
  signal?: AbortSignal,
) => openWindowCohort(slotId, stopWorker, signal, true);
