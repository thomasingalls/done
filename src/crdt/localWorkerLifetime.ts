/** Native Local ownership. Keep SC-03 shared writers; never promote a ticket into a lock. */
import {
  captureTicket,
  cohortNames,
  localWorkerPinName,
  requireNativeLocks,
  inactive,
  cancelled,
  type AccountWorkerTicket,
} from './nativeCoordination';

const claimed = new Set<string>();
const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

/** Acquire the actual member and old-slot fence BEFORE the Window pins this native client. The
 * returned root alone cannot initialize keys: each original phase additionally checks that pin,
 * acquires its own real native shared permit and repeats its original compatibility/authority work.
 * No exclusive transition is supported inside this root. Close both realms and start it normally. */
export async function openLocalWorkerLifetime(input: AccountWorkerTicket, signal?: AbortSignal) {
  if (typeof window !== 'undefined') throw inactive();
  const ticket = captureTicket(input),
    locks = requireNativeLocks(),
    n = cohortNames(ticket.slotId, ticket.incarnation),
    stop = new AbortController(),
    ready = deferred<void>(),
    release = deferred<void>(),
    jobs = new Set<Promise<unknown>>(),
    cleanups = new Set<() => Promise<void>>();
  if (claimed.has(n.member)) throw inactive();
  claimed.add(n.member);
  let state: 'opening' | 'active' | 'closing' | 'closed' | 'failed' = 'opening',
    closing: Promise<void> | undefined,
    workerClient: string | undefined;
  const live = () => {
    if (stop.signal.aborted || (state !== 'opening' && state !== 'active')) throw inactive();
  };
  const windowHeld = (held: readonly LockInfo[]) => {
    for (const [name, mode] of [
      [n.reservation, 'shared'],
      [n.anchor, 'exclusive'],
      [n.slot, 'shared'],
    ] as const)
      if (
        !held.some((v) => v.name === name && v.mode === mode && v.clientId === ticket.windowClient)
      )
        throw inactive();
  };
  const check = async (pinned = true) => {
    live();
    const held = (await locks.query()).held ?? [];
    live();
    windowHeld(held);
    if (
      pinned &&
      (!workerClient ||
        !held.some(
          (v) =>
            v.name === localWorkerPinName(ticket, workerClient!) &&
            v.mode === 'exclusive' &&
            v.clientId === ticket.windowClient,
        ))
    )
      throw inactive();
  };
  const request = (async () => {
    await check(false);
    return locks.request(n.member, { mode: 'exclusive', ifAvailable: true }, async (member) => {
      if (!member) throw inactive();
      return locks.request(n.slot, { mode: 'shared', ifAvailable: true }, async (slot) => {
        if (!slot) throw inactive();
        await check(false);
        const held = (await locks.query()).held ?? [],
          members = held.filter((v) => v.name === n.member);
        live();
        workerClient = members[0]?.clientId;
        if (
          members.length !== 1 ||
          members[0]?.mode !== 'exclusive' ||
          !workerClient ||
          workerClient === ticket.windowClient ||
          !held.some((v) => v.name === n.slot && v.mode === 'shared' && v.clientId === workerClient)
        )
          throw inactive();
        state = 'active';
        ready.resolve();
        await release.promise;
      });
    });
  })();
  const close = (): Promise<void> => {
    if (closing) return closing;
    const done = deferred<void>();
    closing = done.promise;
    state = 'closing';
    stop.abort();
    void (async () => {
      try {
        for (const cleanup of cleanups) await cleanup();
        while (jobs.size) await Promise.all([...jobs]);
        release.resolve();
        await request;
        state = 'closed';
        signal?.removeEventListener('abort', cancel);
        done.resolve();
      } catch (cause) {
        // No cleanup acknowledgment can release a root with surviving native work or keys.
        state = 'failed';
        signal?.removeEventListener('abort', cancel);
        done.reject(cause);
      }
    })();
    return closing;
  };
  const cancel = () => {
    void close().catch(() => {});
  };
  signal?.addEventListener('abort', cancel, { once: true });
  void request.catch((cause) => {
    ready.reject(cause);
  });
  if (signal?.aborted) cancel();
  try {
    await ready.promise;
    live();
  } catch (cause) {
    release.resolve();
    await request.catch(() => {});
    signal?.removeEventListener('abort', cancel);
    if (signal?.aborted) throw cancelled();
    throw cause;
  }
  return Object.freeze({
    ticket,
    signal: stop.signal,
    assertCurrent: live,
    beforeRelease(cleanup: () => Promise<void>) {
      live();
      cleanups.add(cleanup);
    },
    /** The actual Lock passed to original WriteSession; no nested request queues behind an
     * exclusive transition already waiting for our root. Refuse instead of deadlocking. */
    async request<T>(
      name: string,
      options: { mode?: LockMode; signal?: AbortSignal },
      callback: (lock: Lock) => T | PromiseLike<T>,
    ): Promise<T> {
      live();
      if (name !== n.slot || options.mode !== 'shared') throw inactive();
      if (options.signal?.aborted) throw cancelled();
      const operation = (async () => {
        await check();
        return locks.request(n.slot, { mode: 'shared', ifAvailable: true }, async (slot) => {
          if (!slot) throw inactive();
          await check();
          if (options.signal?.aborted) throw cancelled();
          return callback(slot);
        });
      })();
      jobs.add(operation);
      try {
        return await operation;
      } finally {
        jobs.delete(operation);
      }
    },
    close,
  });
}
