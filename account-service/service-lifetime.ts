/** Keep durable ownership until every dispatched operation settles, even after client disconnect. */
import type { DevelopmentAccountHandler } from './development-http.ts';

export function ownAccountRequests(
  dispatch: DevelopmentAccountHandler,
  dispose: () => void | Promise<void>,
  stopNotifications: () => void,
) {
  const pending = new Set<Promise<void>>();
  let closing = false;
  let closed: Promise<void> | undefined;
  const handle: DevelopmentAccountHandler = (request, response, next) => {
    if (closing) {
      response.writeHead(503, { 'Cache-Control': 'no-store', Connection: 'close' }).end();
      return Promise.resolve();
    }
    const work = Promise.resolve()
      .then(() => dispatch(request, response, next))
      .catch(() => {
        if (!response.headersSent) response.writeHead(400);
        response.end();
      });
    pending.add(work);
    void work.then(
      () => pending.delete(work),
      () => pending.delete(work),
    );
    return work;
  };
  return Object.freeze({
    handle,
    get closing() {
      return closing;
    },
    close: () => {
      if (!closed) {
        closing = true;
        closed = (async () => {
          try {
            stopNotifications();
          } finally {
            await Promise.allSettled([...pending]);
            await dispose();
          }
        })();
      }
      return closed;
    },
  });
}
