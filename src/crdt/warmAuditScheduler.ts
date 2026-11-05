import {
  createWarmAuditStart,
  WARM_AUDIT_FORCE_ROWS,
  WARM_AUDIT_FORCE_POSITIONS,
} from './warmAuditStart';

export type WarmAuditOutcome = boolean | 'deferred';

/** One owner timer over existing native work. The queue-head predicate is scheduling only;
 * run must retain every native, semantic, interruption and lifecycle guard. */
export function createWarmAuditScheduler(options: {
  signal: AbortSignal;
  due(): boolean;
  delay(): number;
  pendingRows(): number;
  pendingPositions?(): number;
  run(mayStart: () => boolean): Promise<WarmAuditOutcome>;
}) {
  const policy = createWarmAuditStart();
  let timer: ReturnType<typeof setTimeout> | undefined,
    active = false,
    continuing = false,
    closed = false;
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const mayStart = () =>
    !closed &&
    !options.signal.aborted &&
    policy.delay(options.pendingRows(), options.pendingPositions?.() ?? 0) === 0;
  const refresh = () => {
    if (closed || active || options.signal.aborted) return;
    cancel();
    const rows = options.pendingRows(),
      positions = options.pendingPositions?.() ?? 0,
      quiet = policy.delay(rows, positions);
    if (quiet === undefined) return; // Actual foreground settlement will wake this owner.
    const due =
      continuing ||
      options.due() ||
      rows >= WARM_AUDIT_FORCE_ROWS ||
      positions >= WARM_AUDIT_FORCE_POSITIONS;
    timer = setTimeout(start, Math.max(quiet, due ? 0 : options.delay()));
  };
  const start = () => {
    timer = undefined;
    if (closed || active || options.signal.aborted) return;
    const rows = options.pendingRows(),
      positions = options.pendingPositions?.() ?? 0;
    if (
      policy.delay(rows, positions) !== 0 ||
      (!continuing &&
        !options.due() &&
        rows < WARM_AUDIT_FORCE_ROWS &&
        positions < WARM_AUDIT_FORCE_POSITIONS)
    ) {
      refresh();
      return;
    }
    active = true;
    void (async () => {
      try {
        const result = await options.run(mayStart);
        if (result !== 'deferred') continuing = !result;
      } catch {
        // Native owner handling still decides refusal/closure. As before, interruption
        // leaves the existing due rule to schedule the next attempt.
        continuing = false;
      } finally {
        active = false;
        refresh();
      }
    })();
  };
  const close = () => {
    if (closed) return;
    closed = true;
    cancel();
    policy.close();
    options.signal.removeEventListener('abort', close);
  };
  options.signal.addEventListener('abort', close, { once: true });
  if (options.signal.aborted) close();
  else refresh();
  return Object.freeze({
    refresh,
    input() {
      policy.input();
      refresh();
    },
    /** Caller settles only after the actual native work and its owned cleanup drain. */
    foreground() {
      const settle = policy.foreground();
      refresh();
      return () => {
        settle();
        refresh();
      };
    },
    close,
  });
}
