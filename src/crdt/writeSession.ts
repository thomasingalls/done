import { accountWorkerRuntime } from './accountWorkerRuntime';
/**
 * SC-03's slot-wide writer lifetime. This is a coordination capability, not
 * custody, admission, or a retirement census. Participating callers must keep
 * every effect behind step/write, await native work through wait, and register
 * cache cleanup. It cannot sandbox code that retains and uses raw keys itself.
 */
import { checkStorageCompatibility } from './storageCompatibility';
import { pageRuntimePorts } from './runtimePorts';

export type WriteSessionState = 'opening' | 'active' | 'closing' | 'closed' | 'failed';
export { WriteSessionError, slotPermitName, type WriteSessionRefusal } from './nativeCoordination';
import { WriteSessionError, slotPermitName } from './nativeCoordination';

type Synchronous<T> = T extends PromiseLike<unknown> ? never : T;

export interface SessionTask {
  readonly signal: AbortSignal;
  /** Check immediately before a synchronous effect; never put an await inside. */
  step<T>(effect: () => T & Synchronous<T>): T;
  /** Check before starting and after settling; retain the permit until it settles. */
  wait<T>(start: () => T | PromiseLike<T>): Promise<T>;
}

export interface WriteSession {
  readonly slotId: string;
  readonly lockName: string;
  readonly state: WriteSessionState;
  readonly signal: AbortSignal;
  /** Synchronous journal/admission entry point; no per-write lock request. */
  write<T>(effect: () => T & Synchronous<T>): T;
  /** Task authority expires when this operation settles, even if the session stays open. */
  run<T>(operation: (task: SessionTask) => T | PromiseLike<T>): Promise<T>;
  /** Immediately invalidates, then drains work, clears caches, and releases. Idempotent. */
  close(): Promise<void>;
}

export type WriteSessionOptions = {
  /** Cancellation applies while queued, during initialization and for the whole lifetime. */
  signal?: AbortSignal;
} & (
  | {
      /** Reread durable state/load keys on EVERY acquisition, under the permit. */
      initialize: (task: SessionTask) => void | PromiseLike<void>;
      /** Required with initialize; clear caches, including partial initialization. */
      dispose: () => void | PromiseLike<void>;
    }
  | { initialize?: never; dispose?: () => void | PromiseLike<void> }
);

const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

const inactive = () =>
  new WriteSessionError('inactive', 'This write capability is no longer live.');

async function acquire(
  slotId: string,
  mode: LockMode,
  options: WriteSessionOptions,
  compatibility = checkStorageCompatibility,
  workerJoin?: NonNullable<ReturnType<typeof accountWorkerRuntime>>['join'],
): Promise<WriteSession> {
  const name = slotPermitName(slotId);
  let locks: LockManager;
  try {
    locks = pageRuntimePorts.lifetime.requireLocks();
  } catch (cause) {
    throw new WriteSessionError('unsupported', 'This runtime cannot coordinate safe writes.', {
      cause,
    });
  }
  const { initialize, dispose, signal } = options;
  if (initialize && !dispose)
    throw new WriteSessionError('invalid-options', 'Initialization requires a cleanup callback.');
  if (signal?.aborted)
    throw new WriteSessionError('cancelled', 'Writer acquisition was cancelled.');

  const ready = deferred<WriteSession>();
  const held = deferred<void>();
  const stopped = new AbortController();
  const jobs = new Set<Promise<void>>();
  let state: WriteSessionState = 'opening';
  let granted = false;
  let closing: Promise<void> | undefined;
  let request: Promise<unknown>;

  const assertLive = (initializing = false): void => {
    if (workerJoin) accountWorkerRuntime(slotId)!.assertCurrent();
    if (state !== 'active' && !(initializing && state === 'opening')) throw inactive();
  };

  // Register before invoking caller code, including reentrant close/abort handlers.
  const track = <T>(start: () => T | PromiseLike<T>): Promise<T> => {
    const done = deferred<void>();
    jobs.add(done.promise);
    const result = Promise.resolve().then(start);
    const settle = () => {
      jobs.delete(done.promise);
      done.resolve();
    };
    void result.then(settle, settle);
    return result;
  };

  const task = <T>(operation: (scope: SessionTask) => T | PromiseLike<T>, initializing = false) => {
    assertLive(initializing);
    let live = true;
    const guard = () => {
      assertLive(initializing);
      if (!live) throw inactive();
    };
    const result = track(async () => {
      try {
        guard();
        const value = await operation({
          signal: stopped.signal,
          step: (effect) => {
            guard();
            return effect();
          },
          wait: (start) => {
            guard();
            return track(async () => {
              guard();
              const value = await start();
              guard();
              return value;
            });
          },
        });
        guard();
        return value;
      } finally {
        live = false;
      }
    });
    return result;
  };

  const drain = async () => {
    while (jobs.size) await Promise.all([...jobs]);
  };
  const detach = () => {
    signal?.removeEventListener('abort', cancel);
    stopPageHide();
    stopRetirement();
  };
  const close = (): Promise<void> => {
    if (closing) return closing;
    const done = deferred<void>();
    closing = done.promise;
    // State changes before abort dispatch: a synchronous abort listener cannot write.
    state = 'closing';
    stopped.abort();
    void (async () => {
      try {
        await drain();
        if (granted) await dispose?.();
        held.resolve();
        // A cancelled queued request never owned a permit or initialized keys.
        await request.catch((error: unknown) => {
          if (granted) throw error;
        });
        state = 'closed';
        detach();
        done.resolve();
      } catch (cause) {
        // Cleanup failure is not evidence that cached capabilities are gone.
        // Keep the native callback pending; only context death can release it.
        state = 'failed';
        detach();
        done.reject(
          new WriteSessionError('cleanup-failed', 'Cleanup failed; permit retained.', { cause }),
        );
      }
    })();
    return closing;
  };
  const cancel = () => {
    void close().catch(() => {});
  };
  const stopRetirement =
    mode === 'shared' ? pageRuntimePorts.lifetime.onRetirement(slotId, cancel) : () => {};
  const session: WriteSession = {
    slotId,
    lockName: name,
    get state() {
      return state;
    },
    signal: stopped.signal,
    write: (effect) => {
      assertLive();
      // Synchronous effects cannot interleave with another task on this thread.
      return effect();
    },
    run: (operation) => {
      try {
        return task(operation);
      } catch (error) {
        return Promise.reject(error);
      }
    },
    close,
  };

  signal?.addEventListener('abort', cancel, { once: true });
  // A BFCache restoration must reacquire and reload, never resurrect this capability.
  // Freeze alone is not pagehide: a frozen writer continues holding its permit.
  const stopPageHide = pageRuntimePorts.lifetime.onPageHide(cancel);
  try {
    request = (workerJoin ?? locks).request(name, { mode, signal: stopped.signal }, async () => {
      granted = true;
      try {
        await task(async (scope) => {
          await compatibility(scope, slotId);
          scope.step(() => {});
          await initialize?.(scope);
        }, true);
        assertLive(true);
        state = 'active';
        ready.resolve(session);
      } catch (cause) {
        // Do not await close inside the lock callback: close waits for its release.
        void close().then(
          () => ready.reject(cause),
          (cleanup) =>
            ready.reject(
              new AggregateError([cause, cleanup], 'Initialization and cleanup failed.'),
            ),
        );
      }
      await held.promise;
    });
    void request.catch((cause: unknown) => {
      if (granted) cancel();
      detach();
      ready.reject(
        new WriteSessionError(
          stopped.signal.aborted ? 'cancelled' : 'unsupported',
          'Writer permit acquisition failed.',
          { cause },
        ),
      );
    });
  } catch (cause) {
    detach();
    throw new WriteSessionError('unsupported', 'Writer permit acquisition failed.', { cause });
  }
  return ready.promise;
}

export const openWriteSession = (
  slotId: string,
  options: WriteSessionOptions = {},
): Promise<WriteSession> => acquire(slotId, 'shared', options);

/** Ask participating tabs to close; never steal a permit or retire a frozen writer's keys. */
export function retireSlotWriters(slotId: string) {
  pageRuntimePorts.lifetime.requestRetirement(slotId);
}

/** Cooperative retirement also reaches coordinators which are between slot-owned operations. */
export function onSlotRetirement(slotId: string, retire: () => void): () => void {
  return pageRuntimePorts.lifetime.onRetirement(slotId, retire);
}

/** Deletion needs coordination, never permission to decrypt or bypass an ordinary opening check. */
export async function withDeviceRemovalSlot<T>(
  slotId: string,
  operation: (task: SessionTask) => Promise<T>,
  options: Pick<WriteSessionOptions, 'signal'> = {},
) {
  const session = await acquire(slotId, 'exclusive', options, async () => {});
  try {
    return await session.run(operation);
  } finally {
    await session.close();
  }
}

/**
 * Close the initiating shared session FIRST. There is no upgrade or lock stealing.
 * Read transition state/census inside operation, after this exclusive acquisition.
 * This barrier alone does not authorize clear, activation or opener retirement.
 */
export const withExclusiveSlot = async <T>(
  slotId: string,
  operation: (task: SessionTask) => T | PromiseLike<T>,
  options: WriteSessionOptions = {},
): Promise<T> => {
  const session = await acquire(slotId, 'exclusive', options);
  try {
    return await session.run(operation);
  } finally {
    await session.close();
  }
};

/** Private promotion owner: exclusive acquisition authenticates any retained interlock with the
 * mandatory factor. Ordinary shared/exclusive callers retain the refusal-only compatibility gate. */
export const withPromotionSlot = async <T>(
  slotId: string,
  code: string,
  operation: (task: SessionTask) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> => {
  const session = await acquire(
    slotId,
    'exclusive',
    signal ? { signal } : {},
    async (task, slot) => {
      const { checkPromotionCompatibility } = await task.wait(() => import('./promotionRecord'));
      await checkPromotionCompatibility(task, slot, code);
    },
  );
  try {
    return await session.run(operation);
  } finally {
    await session.close();
  }
};

const workerSessionOptions = (
  slotId: string,
  options: WriteSessionOptions,
): WriteSessionOptions => {
  const worker = accountWorkerRuntime(slotId);
  return worker
    ? {
        ...options,
        signal: options.signal ? AbortSignal.any([options.signal, worker.signal]) : worker.signal,
      }
    : options;
};

/** Internal Account lifetime: exclusive through activation, editing and disposal. The caller must
 * verify selected/active progress, pinned binding and fresh passkey inside initialize. */
export const openAccountWriteSession = (
  slotId: string,
  code: string,
  options: WriteSessionOptions & { initialize: NonNullable<WriteSessionOptions['initialize']> },
): Promise<WriteSession> =>
  acquire(
    slotId,
    accountWorkerRuntime(slotId) ? 'shared' : 'exclusive',
    workerSessionOptions(slotId, options),
    async (task, slot) => {
      const { checkPromotionCompatibility, readPromotion } = await task.wait(
        () => import('./promotionRecord'),
      );
      await checkPromotionCompatibility(task, slot, code);
      const { marker } = await readPromotion(task, slot, code);
      if (
        !marker ||
        !(
          (marker.v === 4 && marker.stage === 'handoff-selected') ||
          (marker.v === 5 && marker.stage === 'account-active') ||
          (marker.v === 6 && marker.stage === 'account-capturing') ||
          (marker.v === 7 && marker.stage === 'account-spooling') ||
          (marker.v === 8 && marker.stage === 'account-delivering') ||
          (marker.v === 9 && marker.stage === 'account-receiving')
        )
      )
        throw Error('Account handoff needs resumption');
    },
    accountWorkerRuntime(slotId)?.join,
  );

/** Private joined-device lifetime. The new interlock refuses every older writer. */
export const openJoinedWriteSession = (
  slotId: string,
  code: string,
  options: WriteSessionOptions,
): Promise<WriteSession> =>
  acquire(
    slotId,
    accountWorkerRuntime(slotId) ? 'shared' : 'exclusive',
    workerSessionOptions(slotId, options),
    async (task, slot) => {
      const { readJoinedAccount } = await task.wait(() => import('./joinedAccount'));
      await readJoinedAccount(task, slot, code);
    },
    accountWorkerRuntime(slotId)?.join,
  );
export async function withJoinedSlot<T>(
  slotId: string,
  code: string,
  work: (task: SessionTask) => Promise<T>,
  signal?: AbortSignal,
) {
  const owner = await openJoinedWriteSession(slotId, code, signal ? { signal } : {});
  try {
    return await owner.run(work);
  } finally {
    await owner.close();
  }
}
