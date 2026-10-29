/** Coordination/storage state is independent of rendering. Await async predicates on the host,
 * retain the caller's existing deadline, and never treat a Promise object as successful evidence. */
export async function waitForState(page, predicate, arg, timeoutMs) {
  if (typeof predicate !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new TypeError('State observation requires a predicate and positive finite deadline.');
  const deadline = performance.now() + timeoutMs;
  const expired = () => {
    const error = new Error('Native state observation timed out after ' + timeoutMs + 'ms.');
    error.name = 'TimeoutError';
    return error;
  };
  for (;;) {
    const remaining = deadline - performance.now();
    if (remaining <= 0) throw expired();
    let timer;
    let value;
    try {
      value = await Promise.race([
        // Page.evaluate awaits the actual predicate result; waitForFunction accepts a truthy Promise.
        Promise.resolve().then(() => page.evaluate(predicate, arg)),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(expired()), remaining);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    if (performance.now() >= deadline) throw expired();
    if (value) return value;
    const left = deadline - performance.now();
    if (left <= 0) throw expired();
    await new Promise((resolve) => setTimeout(resolve, Math.min(25, left)));
  }
}
