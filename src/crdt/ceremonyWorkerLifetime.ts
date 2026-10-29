/** Native member supervision for startup/ceremony commands. Original operations own old-slot permits. */
import {
  captureTicket,
  cohortNames,
  requireNativeLocks,
  inactive,
  type AccountWorkerTicket,
} from './nativeCoordination';
const claimed = new Set<string>();
const roots = new WeakSet<object>();
const closedRoots = new WeakSet<object>();
const deferred = () => {
  let resolve!: () => void, reject!: (reason: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
export async function openCeremonyWorkerLifetime(input: AccountWorkerTicket) {
  if (typeof window !== 'undefined') throw inactive();
  const ticket = captureTicket(input),
    names = cohortNames(ticket.slotId, ticket.incarnation),
    locks = requireNativeLocks();
  if (claimed.has(names.member)) throw inactive();
  claimed.add(names.member);
  const stop = new AbortController(),
    ready = deferred(),
    release = deferred(),
    jobs = new Set<Promise<void>>(),
    cleanups = new Set<() => void | Promise<void>>();
  let state: 'opening' | 'active' | 'closing' | 'closed' | 'failed' = 'opening',
    closing: Promise<void> | undefined,
    cleanupFailure: unknown;
  const live = () => {
    if (stop.signal.aborted || !['opening', 'active'].includes(state)) throw inactive();
  };
  const check = async () => {
    live();
    const held = (await locks.query()).held ?? [];
    live();
    for (const [name, mode] of [
      [names.reservation, 'shared'],
      [names.anchor, 'exclusive'],
    ] as const)
      if (
        !held.some((v) => v.name === name && v.mode === mode && v.clientId === ticket.windowClient)
      )
        throw inactive();
  };
  const member = (async () => {
    await check();
    return locks.request(names.member, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
      if (!lock) throw inactive();
      await check();
      const own = ((await locks.query()).held ?? []).filter((v) => v.name === names.member);
      live();
      if (
        own.length !== 1 ||
        own[0]?.mode !== 'exclusive' ||
        !own[0].clientId ||
        own[0].clientId === ticket.windowClient
      )
        throw inactive();
      state = 'active';
      ready.resolve();
      await release.promise;
    });
  })();
  void member.catch(ready.reject);
  let windowEnd: Promise<unknown> | undefined;
  const close = () => {
    if (closing) return closing;
    const done = deferred();
    closing = done.promise;
    state = 'closing';
    stop.abort();
    void (async () => {
      try {
        for (const cleanup of cleanups) await cleanup();
        while (jobs.size) await Promise.all([...jobs]);
        await windowEnd;
        if (cleanupFailure) throw cleanupFailure;
        release.resolve();
        await member;
        cleanups.clear();
        state = 'closed';
        closedRoots.add(root);
        done.resolve();
      } catch (cause) {
        state = 'failed';
        done.reject(cause);
      }
    })();
    return closing;
  };
  try {
    await ready.promise;
    live();
  } catch (cause) {
    release.resolve();
    await member.catch(() => {});
    throw cause;
  }
  // A Window can disappear without sending a port message. Return from this actual native grant
  // before draining; Window cleanup also independently waits for our member release.
  windowEnd = locks
    .request(names.anchor, { mode: 'exclusive', signal: stop.signal }, () => {
      if (!stop.signal.aborted) void close().catch(() => {});
    })
    .catch(() => {
      if (!stop.signal.aborted) void close().catch(() => {});
    });
  const root = Object.freeze({
    ticket,
    signal: stop.signal,
    assertCurrent: live,
    beforeRelease(cleanup: () => void | Promise<void>) {
      live();
      cleanups.add(cleanup);
    },
    run<T>(operation: () => Promise<T>): Promise<T> {
      live();
      const settled = deferred();
      jobs.add(settled.promise);
      return (async () => {
        await check();
        const value = await operation();
        live();
        return value;
      })()
        .catch((cause: unknown) => {
          if (cause instanceof Error && 'code' in cause && cause.code === 'cleanup-failed') {
            cleanupFailure = cause;
            void close().catch(() => {});
          }
          throw cause;
        })
        .finally(() => {
          jobs.delete(settled.promise);
          settled.resolve();
        });
    },
    close,
  });
  roots.add(root);
  return root;
}
export function requireCeremonyWorkerLifetime(
  root: Awaited<ReturnType<typeof openCeremonyWorkerLifetime>>,
): void {
  if (!roots.has(root)) throw inactive();
  root.assertCurrent();
}

/** Only completed native cleanup, job drain and actual member release establish this fact. */
export function requireClosedCeremonyWorkerLifetime(
  root: Awaited<ReturnType<typeof openCeremonyWorkerLifetime>>,
): void {
  if (!roots.has(root) || !closedRoots.has(root)) throw inactive();
}
