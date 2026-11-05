/** State, crypto and native locks are nonvisual. Keep the existing fixture deadline,
 * await asynchronous predicates, and never rely on a renderer animation frame. */
export const CUSTODY_STATE_TIMEOUT_MS = 8000;
const POLL_MS = 50;
export async function waitCustodyState(page, predicate, argument) {
  let stopped = false,
    deadline,
    nextPoll,
    resumePoll;
  const expired = new Promise((_, reject) => {
    deadline = setTimeout(() => {
      stopped = true;
      const error = new Error(`Custody state did not settle within ${CUSTODY_STATE_TIMEOUT_MS}ms`);
      error.name = 'TimeoutError';
      reject(error);
    }, CUSTODY_STATE_TIMEOUT_MS);
  });
  const work = (async () => {
    while (!stopped) {
      const value = await page.evaluate(predicate, argument);
      if (stopped) return;
      if (value) return value;
      await new Promise((resolve) => {
        resumePoll = resolve;
        nextPoll = setTimeout(resolve, POLL_MS);
      });
    }
  })();
  try {
    return await Promise.race([work, expired]);
  } finally {
    stopped = true;
    clearTimeout(deadline);
    clearTimeout(nextPoll);
    resumePoll?.();
  }
}
