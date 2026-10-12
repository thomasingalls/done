import type { SessionTask } from './writeSession';

/** Discretionary maintenance yielded to queued input; never a storage/integrity refusal. */
export class MaintenanceInterrupted extends Error {
  override readonly name = 'MaintenanceInterrupted';
  constructor() {
    super('Content maintenance yielded to foreground work.');
  }
}

const maintenanceTasks = new WeakSet<SessionTask>();
export const isMaintenanceTask = (task: SessionTask): boolean => maintenanceTasks.has(task);

/** Keep the writer lifetime and native settlement ownership. Cancellation prevents the next
 * effect; it does not release admission while an earlier transaction or crypto job is in flight.
 * Yield only before starting async work, never inside an active IDB transaction callback. */
export function maintenanceTask(parent: SessionTask, interrupt?: AbortSignal): SessionTask {
  if (!interrupt) return parent;
  let yieldedAt = performance.now();
  const check = () => {
    if (interrupt.aborted) throw new MaintenanceInterrupted();
  };
  const task: SessionTask = {
    signal: parent.signal,
    step(effect) {
      parent.step(check);
      return parent.step(effect);
    },
    wait(start) {
      return parent.wait(async () => {
        parent.step(check);
        if (performance.now() - yieldedAt >= 8) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          yieldedAt = performance.now();
          parent.step(check);
        }
        // Return owned outputs to their existing cleanup scopes even if input arrives while
        // this operation is pending. The next step/wait checks cancellation before any effect.
        return start();
      });
    },
  };
  maintenanceTasks.add(task);
  return task;
}
