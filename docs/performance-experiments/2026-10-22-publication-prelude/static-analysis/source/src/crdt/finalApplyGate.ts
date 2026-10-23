/** Private scheduling permission, never a substitute for the complete authority verifier. */
import type { SessionTask } from './writeSession';

export type ImmediateReceiveAttempt = (authorize: (apply: () => void) => boolean) => boolean;

export const createFinalApplyGate = () => {
  // Identity tokens cannot wrap or be restored by an aborted operation.
  let version = {};
  const requests = new Set<object>();
  const invalidate = () => {
    version = {};
  };
  return {
    invalidate,
    request() {
      invalidate();
      const identity = {};
      requests.add(identity);
      const native = new Set<Promise<unknown>>();
      return {
        wrap(task: SessionTask): SessionTask {
          return {
            signal: task.signal,
            step: (effect) => task.step(effect),
            wait: (start) => {
              const work = task.wait(start);
              native.add(work);
              const settled = () => {
                native.delete(work);
              };
              void work.then(settled, settled);
              return work;
            },
          };
        },
        async settle() {
          // Even a rejected operation can leave tracked native work outstanding.
          while (native.size) await Promise.allSettled([...native]);
          requests.delete(identity);
        },
      };
    },
    async check(
      run: () => Promise<void>,
      attempt: ImmediateReceiveAttempt,
      assertContext: () => void,
    ): Promise<boolean> {
      const checked = run(); // Registers/invalidate synchronously, before capturing the stamp.
      const stamp = version;
      await checked; // Throws are refusals, never converted into scheduling misses.
      let available = true;
      try {
        return attempt((apply) => {
          if (!available) throw Error('Final receive permission was already consumed');
          available = false;
          assertContext();
          if (version !== stamp || requests.size) return false;
          apply();
          return true;
        });
      } finally {
        // Neither the permission nor the queue callback may survive this synchronous attempt.
        available = false;
      }
    },
  };
};
