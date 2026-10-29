/** Internal Worker handoff. The actual native task remains held through the Window apply reply. */
import type { SessionTask } from './writeSession';
export type AcknowledgedReceiveFinish = (apply: () => Promise<void>) => Promise<void>;
export interface ContextualReceiveFinish<T> {
  (apply: () => Promise<void>): Promise<void>;
  withContext(apply: (context: T) => Promise<void>): Promise<void>;
}
export function createAcknowledgedReceiveFinish<T = never>(
  run: (
    operation: (task: SessionTask, context?: () => Promise<T>) => Promise<void>,
  ) => Promise<void>,
  check: (task: SessionTask) => Promise<void>,
  guard: () => void,
  applied: () => void,
  failed: () => void,
  context?: { dispose(value: T): void },
): ContextualReceiveFinish<T> {
  let pending = true;
  const claim = (effect: (task: SessionTask, read?: () => Promise<T>) => Promise<void>) => {
    if (!pending) return Promise.reject(Error('Worker receive handoff was already consumed'));
    pending = false;
    return run(async (task, read) => {
      await check(task);
      task.step(guard);
      await effect(task, read);
      task.step(() => {
        guard();
        applied();
      });
    }).catch((cause) => {
      // A durable suffix with uncertain application resumes only through cold replay.
      failed();
      throw cause;
    });
  };
  const finish: ContextualReceiveFinish<T> = (apply) =>
    claim(async (task) => {
      await task.wait(apply);
    });
  finish.withContext = (apply) =>
    claim(async (task, read) => {
      if (!read || !context) throw Error('Worker receive context is unavailable');
      let value: T | undefined;
      try {
        // Own the returned key copies before wait's final lifetime check can reject.
        await task.wait(async () => {
          value = await read();
        });
        task.step(guard);
        await task.wait(() => apply(value!));
      } finally {
        if (value !== undefined) context.dispose(value);
      }
    });
  return Object.freeze(finish);
}
