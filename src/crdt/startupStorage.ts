/** Known-name, read-only native probes. They never create or upgrade a database. */
import type { SessionTask } from './writeSession';
import { contentTransaction } from './contentDatabase';
import { journalPrefix } from './journalCodec';
import { stopStartup } from './startupState';

export const probeDatabase = <T>(
  task: SessionTask,
  name: string,
  read: (db: IDBDatabase) => Promise<T>,
): Promise<T | null> =>
  task.wait(async () => {
    const db = await new Promise<IDBDatabase | null>((resolve, reject) => {
      let absent = false,
        abandoned = false;
      const request = task.step(() => indexedDB.open(name));
      const cancel = () => {
        abandoned = true;
        reject(new DOMException('Startup read cancelled.', 'AbortError'));
      };
      task.signal.addEventListener('abort', cancel, { once: true });
      const detach = () => task.signal.removeEventListener('abort', cancel);
      request.onupgradeneeded = () => {
        absent = true;
        // Even a late completion after cancellation must not leave a new database behind.
        request.transaction!.abort();
      };
      request.onblocked = () => {
        abandoned = true;
        detach();
        reject(new Error('Startup database probe is blocked.'));
      };
      request.onerror = () => {
        detach();
        if (absent && !abandoned) resolve(null);
        else reject(request.error ?? new Error('Startup database probe failed.'));
      };
      request.onsuccess = () => {
        detach();
        if (abandoned || task.signal.aborted) {
          request.result.close();
          reject(new DOMException('Startup read cancelled.', 'AbortError'));
        } else {
          request.result.onversionchange = () => request.result.close();
          resolve(request.result);
        }
      };
    });
    if (!db) return null;
    try {
      return await task.wait(() => read(db));
    } finally {
      db.close();
    }
  });

export const checkLayout = (db: IDBDatabase, expected: Record<string, string | null>): void => {
  if (
    db.version !== 1 ||
    [...db.objectStoreNames].sort().join(',') !== Object.keys(expected).sort().join(',')
  )
    stopStartup('repair-required', 'unsupported-database-layout');
  const tx = db.transaction(Object.keys(expected), 'readonly');
  for (const [name, keyPath] of Object.entries(expected)) {
    const store = tx.objectStore(name);
    if (store.keyPath !== keyPath || store.autoIncrement || store.indexNames.length)
      stopStartup('repair-required', 'unsupported-object-store-layout');
  }
};

export const readRow = (
  task: SessionTask,
  db: IDBDatabase,
  store: string,
  key: IDBValidKey,
): Promise<unknown> =>
  task.wait(() =>
    contentTransaction<unknown>(db, task, [store], 'readonly', (tx, result, guard) => {
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => guard(() => result(req.result));
    }),
  );

export const readScopedRows = (
  task: SessionTask,
  db: IDBDatabase,
  store: string,
  prefix: string[],
) =>
  task.wait(() =>
    contentTransaction<{ key: IDBValidKey; value: unknown }[]>(
      db,
      task,
      [store],
      'readonly',
      (tx, result, guard) => {
        const rows: { key: IDBValidKey; value: unknown }[] = [];
        result(rows);
        // A prefix is smaller than every extension, including array-valued suffixes.
        const req = tx.objectStore(store).openCursor(IDBKeyRange.lowerBound(prefix));
        req.onsuccess = () =>
          guard(() => {
            const cursor = req.result;
            const key = cursor?.key;
            if (!cursor || !Array.isArray(key) || prefix.some((v, i) => key[i] !== v)) return;
            if (rows.length >= 32)
              stopStartup('repair-required', 'too-many-scoped-control-records');
            rows.push({ key: cursor.key, value: cursor.value });
            cursor.continue();
          });
      },
    ),
  );

/** Same complete scoped inventory as the cursor, bounded before values reach JavaScript. */
export const readScopedRowsBulk = (
  task: SessionTask,
  db: IDBDatabase,
  store: string,
  prefix: readonly string[],
) => {
  const scope = [...prefix];
  // An empty array prefix means all array keys; retain the cursor for that uncommon probe.
  if (!scope.length) return readScopedRows(task, db, store, scope);
  return task.wait(() =>
    contentTransaction<{ key: IDBValidKey; value: unknown }[]>(
      db,
      task,
      [store],
      'readonly',
      (tx, result, guard) => {
        // Advance the last STRING, not an appended suffix sentinel: every extension of
        // scope sorts below this bound, including arbitrarily nested array-valued suffixes.
        const upper = [...scope];
        upper[upper.length - 1] += '\0';
        const range = IDBKeyRange.bound(scope, upper, false, true),
          entries = tx.objectStore(store),
          keys = entries.getAllKeys(range, 33),
          values = entries.getAll(range, 32);
        let remaining = 2;
        const read = () =>
          guard(() => {
            if (--remaining) return;
            if (keys.result.length > 32)
              stopStartup('repair-required', 'too-many-scoped-control-records');
            if (
              keys.result.length !== values.result.length ||
              keys.result.some((key) => !Array.isArray(key) || scope.some((v, i) => key[i] !== v))
            )
              stopStartup('repair-required', 'scoped-control-read-mismatch');
            result(keys.result.map((key, i) => ({ key, value: values.result[i] })));
          });
        // Both requests share a native snapshot and settle through contentTransaction.
        // Never yield, authenticate, or release task ownership inside these callbacks.
        keys.onsuccess = read;
        values.onsuccess = read;
      },
    ),
  );
};

export const journalCount = (
  task: SessionTask,
  prefix: string,
  exclude: (key: string) => boolean = () => false,
): number =>
  task.step(() => {
    const storage = globalThis.localStorage;
    const keys = Object.keys(storage)
      .filter((key) => key.startsWith(prefix) && !exclude(key))
      .sort();
    for (const key of keys)
      if (storage.getItem(key) === null) throw Error('Journal changed during startup.');
    const after = Object.keys(storage)
      .filter((key) => key.startsWith(prefix) && !exclude(key))
      .sort();
    if (keys.length !== after.length || keys.some((k, i) => k !== after[i]))
      throw Error('Journal changed during startup.');
    return keys.length;
  });

/** The old `done` prefix contains modern `done.<hash>` prefixes. Their complete key grammars are disjoint. */
export const legacyJournalCount = (task: SessionTask): number =>
  journalCount(task, journalPrefix('done'), (key) =>
    /^done\.pending-update\.done\.[0-9a-f]{32}\.[0-9a-f]{32}\.[0-9a-f]{32}\.[0-9]{16}$/u.test(key),
  );
