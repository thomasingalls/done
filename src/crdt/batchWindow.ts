/** Scheduling only. A deadline is never evidence of persistence or permission to send. */
export interface BatchTiming {
  readonly quietMs: number;
  readonly maxMs: number;
}
export function createBatchWindow(timing: BatchTiming, now: () => number) {
  if (
    !Number.isFinite(timing.quietMs) ||
    !Number.isFinite(timing.maxMs) ||
    timing.quietMs < 0 ||
    timing.maxMs < timing.quietMs
  )
    throw Error('Invalid batch timing');
  const { quietMs, maxMs } = timing;
  let first: number | undefined,
    due: number | undefined,
    closed = false;
  return {
    get due() {
      return due;
    },
    note() {
      if (closed) return;
      const at = now();
      first ??= at;
      due = Math.min(first + maxMs, at + quietMs);
    },
    close() {
      if (first !== undefined) {
        due = Math.min(due!, now());
        closed = true;
      }
    },
    clear() {
      first = due = undefined;
      closed = false;
    },
  };
}
