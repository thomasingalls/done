/** Owner-local scheduling only. Readiness never grants a native or verification permission. */
export const WARM_AUDIT_INPUT_QUIET_MS = 1000;
export const WARM_AUDIT_FORCE_ROWS = 1024;
export const WARM_AUDIT_FORCE_POSITIONS = 1024;

/** Call only after the existing row/time rules make an audit due. Queue settlement wakes the
 * owner again, so ordinary foreground contention requires no extra polling timer. */
export function createWarmAuditStart(now: () => number = () => performance.now()) {
  const foreground = new Set<object>();
  let closed = false,
    clock: number | undefined,
    lastInput: number | undefined;
  const readClock = () => {
    const at = now();
    if (!Number.isFinite(at) || at < 0) throw Error('Invalid warm audit clock');
    // A clock discontinuity cannot expire a quiet period early or defer it indefinitely.
    if (clock !== undefined && at < clock && lastInput !== undefined) lastInput = at;
    clock = at;
    return at;
  };
  return Object.freeze({
    input() {
      if (!closed) lastInput = readClock();
    },
    /** Track queued as well as running foreground jobs. Settlement is idempotent. */
    foreground() {
      if (closed) return () => {};
      const token = {};
      foreground.add(token);
      return () => {
        foreground.delete(token);
      };
    },
    foregroundPending: () => !closed && foreground.size > 0,
    /** undefined means wait for queue settlement/close; zero means attempt under the old guards. */
    delay(pendingRows: number, pendingPositions = 0): number | undefined {
      if (closed) return;
      if (!Number.isSafeInteger(pendingRows) || pendingRows < 0)
        throw Error('Invalid warm audit pressure');
      if (!Number.isSafeInteger(pendingPositions) || pendingPositions < 0)
        throw Error('Invalid warm audit logical pressure');
      const at = readClock();
      if (pendingRows >= WARM_AUDIT_FORCE_ROWS || pendingPositions >= WARM_AUDIT_FORCE_POSITIONS)
        return 0;
      if (foreground.size) return;
      return lastInput === undefined
        ? 0
        : Math.max(0, WARM_AUDIT_INPUT_QUIET_MS - (at - lastInput));
    },
    close() {
      closed = true;
      foreground.clear();
      clock = lastInput = undefined;
    },
  });
}
