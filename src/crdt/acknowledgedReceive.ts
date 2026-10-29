/** Internal Worker handoff. The actual native task remains held through the Window apply reply. */
import type { SessionTask } from './writeSession';
export type AcknowledgedReceiveFinish = (apply: () => Promise<void>) => Promise<void>;
export function createAcknowledgedReceiveFinish(
  run: (operation: (task: SessionTask) => Promise<void>) => Promise<void>,
  check: (task: SessionTask) => Promise<void>,
  guard: () => void,
  applied: () => void,
  failed: () => void,
): AcknowledgedReceiveFinish {
  let pending = true;
  return (apply) => {
    if (!pending) return Promise.reject(Error('Worker receive handoff was already consumed'));
    pending = false;
    return run(async (task) => {
      await check(task);
      // wait retains the genuine task and checks cancellation after the asynchronous reply.
      // No async callback is ever put inside task.step, and no permission crosses the port.
      task.step(guard);
      await task.wait(apply);
      task.step(() => {
        guard();
        applied();
      });
    }).catch((cause) => {
      // A durable suffix with an uncertain application can resume only through cold replay.
      failed();
      throw cause;
    });
  };
}
