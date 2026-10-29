/** Read-only preparation observation. It never installs a synchronous Worker journal view. */
import { MaintenanceInterrupted } from './contentMaintenance';
import { eraseJournalSnapshot, type ObservedEntry } from './journalStore';
import type { SessionTask } from './writeSession';
export async function withPreparationJournalObservation<T>(
  task: SessionTask,
  journal: { readSnapshot(task: SessionTask): Promise<ObservedEntry[]> },
  operation: (check: () => void) => Promise<T>,
): Promise<T> {
  const observed = await journal.readSnapshot(task);
  let active = true;
  const check = () =>
    task.step(() => {
      if (!active || observed.length) throw new MaintenanceInterrupted();
    });
  try {
    check();
    return await operation(check);
  } finally {
    active = false;
    eraseJournalSnapshot(observed);
  }
}
