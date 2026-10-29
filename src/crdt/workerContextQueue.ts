/** Internal scheduling boundary, never a native proof. Operations still run their original checks. */
import type { OwnedReceiveQueue } from './admissionQueue';
export function createWorkerContextQueue(signal: AbortSignal) {
  let queue: OwnedReceiveQueue | undefined,
    bound = false,
    closed = signal.aborted;
  const live = () => {
    if (closed || signal.aborted) throw Error('Worker context queue is unavailable');
  };
  const close = () => {
    closed = true;
    queue = undefined;
    signal.removeEventListener('abort', close);
  };
  if (!closed) signal.addEventListener('abort', close, { once: true });
  return Object.freeze({
    bind(actual: OwnedReceiveQueue) {
      live();
      if (bound || typeof actual !== 'function') throw Error('Worker context queue already bound');
      bound = true;
      queue = actual;
    },
    run<T>(operation: () => Promise<T>): Promise<T> {
      live();
      if (!queue) throw Error('Worker context queue is not ready');
      // No closure, permit, private handoff or original result is serialized across the bridge.
      return queue(Uint8Array.of(1), async (_input, publish) => {
        live();
        const result = await operation();
        live();
        publish([]);
        return result;
      });
    },
  });
}
export type WorkerContextQueue = ReturnType<typeof createWorkerContextQueue>;
