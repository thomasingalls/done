/** Refusal-only interlock. Absence continues to the existing carrier/authentication checks. */
import type { SessionTask } from './writeSession';

export class StorageCompatibilityError extends Error {
  override readonly name = 'StorageCompatibilityError';
  readonly code = 'app-update-required';
  constructor(message = 'This app cannot use the retained storage format or upgrade intent.') {
    super(message);
  }
}

// This location must remain stable across app, carrier and migration versions.
// A future authenticated migration owner must retain it before its first format-changing effect.
// This baseline reader understands NO populated interlock, including a claimed "ready" one.
export const storageUpgradeKey = (slotId: string): string[] => [slotId, 'application-upgrade'];

/**
 * Run after every shared/exclusive grant, before caller initialization. No marker is created or
 * removed here, and no marker contents authorize a read, write, migration, cleanup or rollback.
 * IDB opens cannot be cancelled: even a blocked open stays owned until its native result settles.
 */
export const checkStorageCompatibility = (task: SessionTask, slotId: string): Promise<void> =>
  task.wait(async () => {
    let db: IDBDatabase | null = null;
    try {
      await task.wait(async () => {
        db = await new Promise<IDBDatabase | null>((resolve, reject) => {
          let absent = false;
          const request = task.step(() => indexedDB.open('done.custody'));
          request.onupgradeneeded = () => {
            absent = true;
            request.transaction!.abort();
          };
          request.onerror = () => {
            if (absent && request.error?.name === 'AbortError') resolve(null);
            else reject(request.error ?? Error('Compatibility probe failed.'));
          };
          request.onsuccess = () => {
            request.result.onversionchange = () => request.result.close();
            resolve(request.result);
          };
        });
      });
      const retained = db as IDBDatabase | null;
      if (!retained) return;
      task.step(() => {
        if (retained.version !== 1) throw new StorageCompatibilityError();
        if (
          retained.objectStoreNames.length !== 1 ||
          !retained.objectStoreNames.contains('entries')
        )
          throw new StorageCompatibilityError();
      });
      const present = await task.wait(
        () =>
          new Promise<boolean>((resolve, reject) => {
            let count = 0;
            let failure: unknown;
            const tx = task.step(() => retained.transaction('entries', 'readonly'));
            const abort = () => {
              try {
                tx.abort();
              } catch {
                /* native settlement already won */
              }
            };
            task.signal.addEventListener('abort', abort, { once: true });
            const detach = () => task.signal.removeEventListener('abort', abort);
            tx.oncomplete = () => {
              detach();
              resolve(count !== 0);
            };
            tx.onabort = () => {
              detach();
              reject(failure ?? tx.error ?? Error('Compatibility read aborted.'));
            };
            try {
              const store = tx.objectStore('entries');
              if (store.keyPath !== null || store.autoIncrement || store.indexNames.length)
                throw new StorageCompatibilityError();
              // count, not get: even an undefined/null value is retained intent.
              const request = store.count(storageUpgradeKey(slotId));
              request.onsuccess = () => {
                count = request.result;
              };
            } catch (cause) {
              failure = cause;
              abort();
            }
          }),
      );
      if (present) throw new StorageCompatibilityError();
    } finally {
      (db as IDBDatabase | null)?.close();
    }
  });
