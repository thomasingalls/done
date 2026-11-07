/** Scheduling only: native work keeps its original task, guards and storage queue.
 * Warm audits and read-only preparation take FIFO turns before entering that queue.
 * Foreground jobs never use this lane and may still interrupt either operation. */
export function createMaintenanceTurns(signal: AbortSignal) {
  let tail: Promise<void> = Promise.resolve();
  return Object.freeze({
    run<T>(start: () => Promise<T>): Promise<T> {
      const work = tail.then(() => {
        signal.throwIfAborted();
        return start();
      });
      // A refusal still belongs to its caller; it must not poison later scheduling.
      tail = work.then(
        () => {},
        () => {},
      );
      return work;
    },
    settled: () => tail,
  });
}
