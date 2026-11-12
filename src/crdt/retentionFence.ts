/** Local reduction's fenced effects (a progress save, the final commit) start here (phase 546).
 * The Worker's single handoff slot can be held by a receive or another fenced operation; its busy
 * refusal comes before any effect, so this attempt yields and retries like other maintenance
 * interruptions instead of halting. Only that synchronous refusal is mapped: whatever happens
 * after the flight begins, and any other error, reaches the caller unchanged. */
import { MaintenanceInterrupted } from './contentMaintenance';
import { WorkspaceQueueBusy } from './workerWorkspaceQueues';
export function enterRetentionFence<T>(enter: () => Promise<T>): Promise<T> {
  try {
    return enter();
  } catch (cause) {
    // `other`, not queue priority: the retry keeps the conservative sixty-second clock.
    if (cause instanceof WorkspaceQueueBusy) throw new MaintenanceInterrupted([{ other: true }]);
    throw cause;
  }
}
