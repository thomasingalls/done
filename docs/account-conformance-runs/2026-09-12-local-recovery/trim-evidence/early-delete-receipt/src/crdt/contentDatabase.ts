import { ContentError, CONTENT_STORES, corrupt } from './contentRecord';
import type { SessionTask } from './writeSession';

/** All native work is owned until completion/abort, including blocked/abandoned opens. */
export const openContentDb = (
  task: SessionTask,
  name: string,
  create: boolean,
): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    let abandoned = false,
      failure: unknown;
    const req = task.step(() => indexedDB.open(name, 1));
    req.onupgradeneeded = () => {
      try {
        task.step(() => {
          if (abandoned) throw new ContentError('storage-failed', 'Content open was abandoned.');
          if (!create)
            throw new ContentError(
              'missing-content',
              'Content is missing; ordinary open never initializes it.',
            );
          for (const store of CONTENT_STORES) req.result.createObjectStore(store);
        });
      } catch (cause) {
        failure = cause;
        req.transaction!.abort();
      }
    };
    req.onblocked = () => {
      abandoned = true;
      reject(new ContentError('storage-failed', 'The content database is blocked.'));
    };
    req.onerror = () =>
      reject(
        failure ??
          new ContentError('storage-failed', 'The content database could not open.', {
            cause: req.error,
          }),
      );
    req.onsuccess = () => {
      const db = req.result;
      if (abandoned || task.signal.aborted) {
        db.close();
        reject(new ContentError('storage-failed', 'Content open was cancelled.'));
        return;
      }
      try {
        task.step(() => {
          if ([...db.objectStoreNames].sort().join(',') !== [...CONTENT_STORES].sort().join(','))
            corrupt('Unknown content database layout.');
          const tx = db.transaction([...CONTENT_STORES], 'readonly');
          tx.oncomplete = () => resolve(db);
          tx.onabort = () => {
            db.close();
            reject(
              new ContentError('storage-failed', 'Content layout validation aborted.', {
                cause: tx.error,
              }),
            );
          };
          for (const name of CONTENT_STORES) {
            const store = tx.objectStore(name);
            if (store.keyPath !== null || store.autoIncrement || store.indexNames.length)
              corrupt('Unknown content object-store layout.');
          }
        });
        db.onversionchange = () => db.close();
      } catch (cause) {
        db.close();
        reject(cause);
      }
    };
  });

export const contentTransaction = <T>(
  db: IDBDatabase,
  task: SessionTask,
  stores: string[],
  mode: IDBTransactionMode,
  body: (
    tx: IDBTransaction,
    result: (value: T) => void,
    guard: (effect: () => void) => void,
  ) => void,
  durability: IDBTransactionDurability = 'relaxed',
): Promise<T> =>
  new Promise((resolve, reject) => {
    let value!: T, failure: unknown;
    const tx = task.step(() => db.transaction(stores, mode, { durability }));
    const abort = () => {
      try {
        tx.abort();
      } catch {
        /* already settled */
      }
    };
    const guard = (effect: () => void) => {
      try {
        task.step(effect);
      } catch (cause) {
        failure = cause;
        abort();
      }
    };
    task.signal.addEventListener('abort', abort, { once: true });
    const detach = () => task.signal.removeEventListener('abort', abort);
    tx.oncomplete = () => {
      detach();
      if (failure) reject(failure);
      else resolve(value);
    };
    tx.onabort = () => {
      detach();
      reject(
        failure ??
          new ContentError('storage-failed', 'The content transaction did not complete.', {
            cause: tx.error,
          }),
      );
    };
    guard(() => {
      // Check only after settlement handlers are installed: unsupported native work
      // must abort/drain before the enclosing lifecycle can release its permit.
      if (durability === 'strict') {
        try {
          if (tx.durability !== 'strict') throw Error('Strict durability unavailable');
        } catch (cause) {
          throw new ContentError('storage-failed', 'Strict transaction durability is required.', {
            cause,
          });
        }
      }
      body(
        tx,
        (result) => {
          value = result; if (mode === 'readwrite' && result === true) resolve(value);
        },
        guard,
      );
    });
  });
