import type { SessionTask } from './writeSession';

export type CpuCheckpoint = () => Promise<void> | undefined;
/** A target for splittable work, not a preemption guarantee for a native call or one Yjs apply. */
export function createCpuBudget(
  current: () => void,
  now: () => number = () => performance.now(),
  yieldTask: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 0)),
): CpuCheckpoint {
  let began = now();
  return () => {
    current();
    if (now() - began < 8) return;
    return yieldTask().then(() => {
      current();
      began = now();
    });
  };
}
const checkpoints = new WeakMap<SessionTask, CpuCheckpoint>();
export const cpuCheckpoint = (task: SessionTask): CpuCheckpoint | undefined =>
  checkpoints.get(task);
/** Serialized Account work may yield between operations. Never yield inside an IDB transaction. */
export function budgetedTask(parent: SessionTask): SessionTask {
  const checkpoint = createCpuBudget(() => parent.step(() => {}));
  const task: SessionTask = {
    signal: parent.signal,
    step: (effect) => parent.step(effect),
    wait: (start) =>
      parent.wait(async () => {
        const pause = checkpoint();
        if (pause) await pause;
        return start();
      }),
  };
  checkpoints.set(task, checkpoint);
  return task;
}
