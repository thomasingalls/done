import { openWriteSession } from '../../src/crdt/writeSession';
import { createAcknowledgedReceiveFinish } from '../../src/crdt/acknowledgedReceive';
let session: Awaited<ReturnType<typeof openWriteSession>>;
let finish: ReturnType<typeof createAcknowledgedReceiveFinish>,
  reply: (() => void) | undefined,
  reject: ((cause: unknown) => void) | undefined,
  checks = 0,
  applied = 0,
  failures = 0;
self.addEventListener('message', async (e: MessageEvent) => {
  const { id, method } = e.data;
  try {
    let value: unknown;
    if (method === 'open') {
      session = await openWriteSession('acknowledged-task');
      finish = createAcknowledgedReceiveFinish(
        (fn) => session.run(fn),
        async (t) => {
          t.step(() => {
            checks++;
          });
        },
        () => {},
        () => applied++,
        () => failures++,
      );
    } else if (method === 'finish') {
      await finish(
        () =>
          new Promise<void>((yes, no) => {
            reply = yes;
            reject = no;
            self.postMessage({ kind: 'apply', state: { checks, applied, failures } });
          }),
      );
    } else if (method === 'ack') reply?.();
    else if (method === 'lost') reject?.(Error('disposable reply loss'));
    else if (method === 'close') await session.close();
    else if (method === 'state') value = { state: session.state, checks, applied, failures };
    else throw Error('Unknown test command');
    self.postMessage({ id, ok: true, value });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error) });
  }
});
