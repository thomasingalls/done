/** Private coordination only. A joined worker must still perform ordinary Account authentication. */
import { cohortNames, inactive, cancelled, type AccountWorkerTicket } from './nativeCoordination';
export type { AccountWorkerTicket } from './nativeCoordination';
export { createAccountWorkerJoin } from './accountWorkerJoin';
import { pageRuntimePorts } from './runtimePorts';

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
  const n = cohortNames(slotId, incarnation),
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
