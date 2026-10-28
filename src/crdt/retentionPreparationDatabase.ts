/** Deterministic auxiliary ownership; no credentials or cache validity is needed for removal. */
import { probeDatabase } from './startupStorage';
import type { SessionTask } from './writeSession';
export const preparationStoreName = (content: string) => {
  if (!/^done\.[0-9a-f]{32}$/.test(content)) throw Error('Invalid preparation database owner');
  return content + '.preparation-v1';
};
export async function removePreparationCache(
  task: SessionTask,
  content: string,
  blocked?: () => void,
) {
  const name = preparationStoreName(content);
  if ((await probeDatabase(task, name, async () => true)) === null) return;
  await task.wait(
    () =>
      new Promise<void>((resolve, reject) => {
        const r = task.step(() => indexedDB.deleteDatabase(name));
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
        r.onblocked = () => {
          try {
            blocked?.();
          } catch {
            /* progress has no deletion authority */
          }
        };
        // Destruction remains owned until settlement, including after cancellation.
      }),
  );
}
