/** One acknowledged display update plus the latest replacement; no authority or native owner. */
import {
  WORKER_PENDING_CALLS,
  workerMessageBytes,
  eraseWorkerMessage,
  WorkerChannelError,
} from './workerChannel';
export function createAcknowledgedPresentation<T>(options: {
  signal: AbortSignal;
  send(input: { sequence: number; value: T }): Promise<unknown>;
  failed(cause: unknown): void;
}) {
  let closed = options.signal.aborted,
    sending = false,
    sequence = 0,
    version = 0,
    acknowledged = 0,
    pending: { version: number; value: T } | undefined;
  const waiters = new Set<{
    version: number;
    resolve: () => void;
    reject: (cause: unknown) => void;
  }>();
  const error = () => new WorkerChannelError('presentation-closed');
  const close = (cause: unknown = error()) => {
    if (closed) return;
    closed = true;
    eraseWorkerMessage(pending?.value);
    pending = undefined;
    options.signal.removeEventListener('abort', abort);
    for (const waiter of waiters) waiter.reject(cause);
    waiters.clear();
  };
  const abort = () => close();
  const drain = () => {
    if (closed || sending || !pending) return;
    const flight = pending;
    pending = undefined;
    sending = true;
    if (!Number.isSafeInteger(sequence + 1)) {
      close();
      options.failed(error());
      return;
    }
    void Promise.resolve()
      .then(() => {
        if (closed) throw error();
        return options.send({ sequence: ++sequence, value: flight.value });
      })
      .then(
        () => {
          if (closed) return;
          acknowledged = flight.version;
          for (const waiter of waiters)
            if (waiter.version <= acknowledged) {
              waiters.delete(waiter);
              waiter.resolve();
            }
        },
        (cause) => {
          if (!closed) {
            close(cause);
            options.failed(cause);
          }
        },
      )
      .finally(() => {
        eraseWorkerMessage(flight.value);
        sending = false;
        drain();
      });
  };
  if (!closed) options.signal.addEventListener('abort', abort, { once: true });
  return Object.freeze({
    publish(value: T) {
      if (closed) return;
      workerMessageBytes(value);
      const owned = structuredClone(value);
      if (!Number.isSafeInteger(version + 1)) {
        eraseWorkerMessage(owned);
        close();
        options.failed(error());
        return;
      }
      eraseWorkerMessage(pending?.value);
      pending = { version: ++version, value: owned };
      drain();
    },
    async flush() {
      if (closed || options.signal.aborted) throw error();
      if (acknowledged >= version) return;
      if (waiters.size >= WORKER_PENDING_CALLS)
        throw new WorkerChannelError('presentation-backlog');
      return new Promise<void>((resolve, reject) => waiters.add({ version, resolve, reject }));
    },
    close: () => close(),
  });
}
