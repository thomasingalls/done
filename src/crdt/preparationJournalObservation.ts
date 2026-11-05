/** Read-only preparation observation. It never installs a synchronous Worker journal view. */
import { MaintenanceInterrupted, addMaintenanceInterruptionConditions } from './contentMaintenance';
import { eraseJournalSnapshot, type ObservedEntry } from './journalStore';
import type { SessionTask } from './writeSession';
export async function withPreparationJournalObservation<T>(
  task: SessionTask,
  journal: { readSnapshot(task: SessionTask): Promise<ObservedEntry[]> },
  operation: (check: () => void) => Promise<T>,
): Promise<T> {
  const observed = await journal.readSnapshot(task);
  let active = true;
  const check = () => {
    const conditions = { journal: observed.length > 0, other: !active };
    try {
      task.step(() => {
        if (!active || observed.length) throw new MaintenanceInterrupted([conditions]);
      });
    } catch (cause) {
      if (cause instanceof MaintenanceInterrupted)
        addMaintenanceInterruptionConditions(cause, conditions);
      throw cause;
    }
  };
  try {
    check();
    return await operation(check);
  } finally {
    active = false;
    eraseJournalSnapshot(observed);
  }
}
