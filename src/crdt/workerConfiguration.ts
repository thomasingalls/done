/** Advisory capability observations only. Original signed history/authority checks still decide work. */
export interface WorkerConfiguration {
  readonly sequence: number;
  readonly membershipContinuation: boolean;
}
const refused = () => Error('Worker capability observation changed');
export function createWorkerConfiguration(signal: AbortSignal) {
  let initialized = false,
    sequence = 0,
    membershipContinuation = false;
  const live = () => signal.throwIfAborted();
  return Object.freeze({
    initialize(value: boolean) {
      live();
      if (initialized || typeof value !== 'boolean') throw refused();
      initialized = true;
      membershipContinuation = value;
    },
    update(input: unknown) {
      live();
      if (
        !initialized ||
        !input ||
        typeof input !== 'object' ||
        Object.getPrototypeOf(input) !== Object.prototype
      )
        throw refused();
      const d = Object.getOwnPropertyDescriptors(input);
      if (
        Reflect.ownKeys(d).sort().join(',') !== 'membershipContinuation,sequence' ||
        Object.values(d).some((v) => !('value' in v))
      )
        throw refused();
      const v = input as WorkerConfiguration;
      if (
        !Number.isSafeInteger(v.sequence) ||
        v.sequence !== sequence + 1 ||
        typeof v.membershipContinuation !== 'boolean'
      )
        throw refused();
      sequence = v.sequence;
      membershipContinuation = v.membershipContinuation;
    },
    get value() {
      live();
      if (!initialized) throw refused();
      return membershipContinuation;
    },
  });
}
/** Capture endpoints in the caller; subscribe after Root creation, resample after the open is posted. */
export function forwardWorkerConfiguration(config: {
  signal: AbortSignal;
  read(): boolean | undefined;
  subscribe?: ((listener: () => void) => () => void) | undefined;
  send(value: WorkerConfiguration): Promise<unknown>;
  failed(): void;
}) {
  let closed = config.signal.aborted,
    started = false,
    sending = false,
    scheduled = false,
    sequence = 0;
  let pending: boolean | undefined,
    last: boolean | undefined,
    unsubscribe: (() => void) | undefined;
  let resolve!: () => void, reject!: (cause: unknown) => void;
  const ready = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  void ready.catch(() => {});
  const close = () => {
    if (closed) return;
    closed = true;
    pending = undefined;
    config.signal.removeEventListener('abort', close);
    try {
      unsubscribe?.();
    } catch {
      /* Presentation observer cleanup cannot replace native key cleanup. */
    }
    unsubscribe = undefined;
    reject(refused());
  };
  const schedule = () => {
    if (!closed && started && !sending && !scheduled && pending !== undefined) {
      scheduled = true;
      queueMicrotask(() => void drain());
    }
  };
  const drain = async () => {
    scheduled = false;
    if (closed || !started || sending || pending === undefined) return;
    const value = pending;
    pending = undefined;
    if (value === last) {
      schedule();
      return;
    }
    sending = true;
    try {
      if (!Number.isSafeInteger(++sequence)) throw refused();
      await config.send({ sequence, membershipContinuation: value });
      if (!closed) {
        last = value;
        resolve();
      }
    } catch (cause) {
      if (!closed) {
        close();
        config.failed();
      }
      reject(cause);
    } finally {
      sending = false;
      schedule();
    }
  };
  const observe = () => {
    if (closed) return;
    try {
      const value = config.read();
      if (value !== undefined && typeof value !== 'boolean') throw refused();
      pending = value === true;
      schedule();
    } catch (cause) {
      close();
      reject(cause);
      config.failed();
    }
  };
  if (closed) reject(refused());
  else {
    config.signal.addEventListener('abort', close, { once: true });
    try {
      const stop = config.subscribe?.(observe);
      if (config.subscribe && typeof stop !== 'function') throw refused();
      if (closed) {
        try {
          stop?.();
        } catch {
          /* advisory only */
        }
      } else unsubscribe = stop;
    } catch (cause) {
      close();
      reject(cause);
      config.failed();
    }
  }
  return Object.freeze({
    ready,
    close,
    start() {
      if (closed || started) throw refused();
      started = true;
      observe();
    },
  });
}
