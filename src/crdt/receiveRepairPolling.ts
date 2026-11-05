/** Scheduling evidence only; never authority, a cursor, or a retained page proof. */
const REPAIR_INTERVAL_MS = 1000;
const REPAIR_WINDOW_MS = 30000;
const MAX_PUBLISHERS = 128;

type Attempt = {
  context: object;
  publisher: string;
  quiet: boolean;
  hint: object;
};

/** One live slot owner. Only its successfully verified reads may complete a token. */
export function createReceiveRepairPolling(now: () => number = Date.now) {
  let context: object | undefined;
  let hint = {};
  let attempts = new WeakMap<object, Attempt>();
  const lastReads = new Map<string, object>();
  let until: number | undefined;
  let lastClock: number | undefined;
  let closed = false;
  const clear = () => {
    context = undefined;
    attempts = new WeakMap();
    lastReads.clear();
    until = undefined;
  };
  const clock = () => {
    const at = now();
    if (!Number.isFinite(at) || (lastClock !== undefined && at < lastClock)) clear();
    lastClock = Number.isFinite(at) ? at : undefined;
    return at;
  };
  return {
    capture(ownerContext: object, publisher: string, quiet: boolean): object | undefined {
      const at = clock();
      if (closed || !Number.isFinite(at)) return undefined;
      if (context !== ownerContext) {
        clear();
        context = ownerContext;
      }
      const token = {};
      attempts.set(token, { context: ownerContext, publisher, quiet, hint });
      return token;
    },
    completed(token: object | undefined, kind: string) {
      const at = clock();
      if (closed || !token || !Number.isFinite(at)) return;
      const held = attempts.get(token);
      attempts.delete(token);
      if (!held || held.context !== context || (kind !== 'received' && kind !== 'empty')) return;
      const previous = lastReads.get(held.publisher);
      // An opaque generation avoids a numeric hint counter overflowing. Date this read
      // from its request start: a hint during I/O must not disappear at completion.
      lastReads.delete(held.publisher);
      if (lastReads.size >= MAX_PUBLISHERS) lastReads.delete(lastReads.keys().next().value!);
      lastReads.set(held.publisher, held.hint);
      if (held.quiet && kind === 'received' && previous === held.hint && hint === held.hint)
        until = at + REPAIR_WINDOW_MS;
    },
    contentHint() {
      hint = {};
    },
    interval(idleInterval: number) {
      const at = clock();
      return !closed && Number.isFinite(at) && until !== undefined && at < until
        ? Math.min(idleInterval, REPAIR_INTERVAL_MS)
        : idleInterval;
    },
    invalidate() {
      clear();
      lastClock = undefined;
    },
    close() {
      closed = true;
      clear();
      lastClock = undefined;
    },
  };
}
