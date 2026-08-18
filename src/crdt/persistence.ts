/**
 * Local persistence (TRD §6.1).
 *
 * `y-indexeddb` supplies the durable local store. This adapter adds an explicit
 * transaction-complete boundary and a short-lived crash journal around its
 * deliberately fire-and-forget write path.
 *
 * SQLite/OPFS (TRD §6.2) is a derived search index and belongs to Phase 4.
 * Nothing here is authoritative for anything but the Yjs document.
 */

import { fromBase64, toBase64 } from 'lib0/buffer';
import { newId } from '../lib/id';
import { IndexeddbPersistence, Y, type YDoc } from './yjs';
import type { Origin } from './actors';

export const DB_NAME = 'done';

export type StoragePersistence = 'granted' | 'denied' | 'unsupported' | 'unknown';

export interface LocalStore {
  provider: IndexeddbPersistence;
  /** Resolves once the on-disk state has been loaded into the document. */
  whenSynced: Promise<void>;
  /** Resolves when every document update observed before this call has committed. */
  whenDurable: () => Promise<void>;
  destroy: () => void;
}

export interface LocalStoreOptions {
  /** Reports a lost synchronous journal or a failed IndexedDB batch. */
  onPersistenceError?: (error: Error) => void;
}

const UPDATES_STORE = 'updates';
const JOURNAL_VERSION = '1:';
const JOURNAL_PREFIX = 'done.pending-update.';
const FLUSH_DELAY_MS = 250;

interface JournalEntry {
  key: string;
  value: string;
  update: Uint8Array;
}

interface PendingEntry {
  sequence: number;
  key: string | null;
  value: string | null;
  update: Uint8Array;
}

const errorWithCause = (message: string, cause?: unknown): Error => {
  const error = new Error(message);
  if (cause !== undefined) error.cause = cause;
  return error;
};

const journalStorage = (report: (error: Error) => void): Storage | null => {
  if (typeof localStorage === 'undefined') {
    report(new Error('Synchronous crash journal is unavailable.'));
    return null;
  }
  try {
    void localStorage.length;
    return localStorage;
  } catch (cause) {
    report(errorWithCause('Synchronous crash journal is unavailable.', cause));
    return null;
  }
};

const journalPrefix = (name: string): string => `${JOURNAL_PREFIX}${encodeURIComponent(name)}.`;

const readJournal = (storage: Storage | null, prefix: string): JournalEntry[] => {
  if (!storage) return [];
  const entries: JournalEntry[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const value = storage.getItem(key);
    if (!value?.startsWith(JOURNAL_VERSION)) continue;
    try {
      entries.push({ key, value, update: fromBase64(value.slice(JOURNAL_VERSION.length)) });
    } catch {
      // Leave an unreadable entry intact: silent deletion is the wrong failure mode for a WAL.
    }
  }
  return entries;
};

const clearJournal = (storage: Storage | null, key: string, expected: string): void => {
  if (!storage) return;
  try {
    if (storage.getItem(key) === expected) storage.removeItem(key);
  } catch {
    // A committed IndexedDB update is already safe; cleanup can wait for another open.
  }
};

const writeJournal = (storage: Storage, key: string, update: Uint8Array): JournalEntry => {
  try {
    const value = `${JOURNAL_VERSION}${toBase64(update)}`;
    storage.setItem(key, value);
    return { key, value, update: update.slice() };
  } catch (cause) {
    throw errorWithCause('Could not write the synchronous crash journal.', cause);
  }
};

/** A batch is durable at transaction completion, not at an add request's success event. */
const persistUpdates = (database: IDBDatabase, updates: readonly Uint8Array[]): Promise<void> =>
  new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(UPDATES_STORE, 'readwrite', { durability: 'relaxed' });
    } catch {
      transaction = database.transaction(UPDATES_STORE, 'readwrite');
    }

    transaction.addEventListener(
      'complete',
      () => {
        resolve();
      },
      { once: true },
    );
    transaction.addEventListener(
      'abort',
      () => {
        reject(transaction.error ?? new Error('IndexedDB persistence transaction failed.'));
      },
      { once: true },
    );
    transaction.addEventListener(
      'error',
      () => {
        reject(transaction.error ?? new Error('IndexedDB persistence transaction failed.'));
      },
      { once: true },
    );
    const store = transaction.objectStore(UPDATES_STORE);
    for (const update of updates) store.add(update);
    transaction.commit?.();
  });

export const openLocalStore = (
  doc: YDoc,
  name: string = DB_NAME,
  options: LocalStoreOptions = {},
): LocalStore => {
  const provider = new IndexeddbPersistence(name, doc);
  const reportPersistenceError = (error: Error): void => options.onPersistenceError?.(error);
  const storage = journalStorage(reportPersistenceError);
  const prefix = journalPrefix(name);
  const recovered = readJournal(storage, prefix).filter((entry) => {
    try {
      Y.applyUpdate(doc, entry.update, provider);
      return true;
    } catch {
      return false;
    }
  });
  const journalSession = newId();
  const whenSynced = provider.whenSynced.then(() => {});
  let nextJournalKey = 0;
  let observedSequence = 0;
  let durableSequence = 0;
  let destroyed = false;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let activeFlush: Promise<void> | null = null;
  const pending: PendingEntry[] = recovered.map((entry) => ({
    sequence: ++observedSequence,
    key: entry.key,
    value: entry.value,
    update: entry.update,
  }));

  const scheduleFlush = (): void => {
    if (destroyed || flushTimer !== null || pending.length === 0) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const target = observedSequence;
      void flushThrough(target).catch(() => {});
    }, FLUSH_DELAY_MS);
  };

  const startFlush = (): Promise<void> => {
    if (activeFlush) return activeFlush;
    const batch = pending.splice(0);
    if (batch.length === 0) return Promise.resolve();

    let completed = false;
    const flush = whenSynced
      .then(() => {
        const database = provider.db;
        if (!database) throw new Error('IndexedDB opened without a database connection.');
        return persistUpdates(
          database,
          batch.map((entry) => entry.update),
        );
      })
      .then(() => {
        completed = true;
        durableSequence = batch.at(-1)?.sequence ?? durableSequence;
        for (const entry of batch) {
          if (entry.key !== null && entry.value !== null) {
            clearJournal(storage, entry.key, entry.value);
          }
        }
      })
      .catch((cause: unknown) => {
        pending.unshift(...batch);
        const error =
          cause instanceof Error ? cause : errorWithCause('IndexedDB persistence failed.', cause);
        reportPersistenceError(error);
        throw error;
      })
      .finally(() => {
        if (activeFlush === flush) activeFlush = null;
        // Deliberately do not re-arm the timer after failure. Quota and connection
        // errors are often persistent, so an automatic retry would become a hot
        // loop. The journal stays intact until a later update, `whenDurable()`, or
        // the next open provides an explicit retry boundary.
        if (completed && pending.length > 0) scheduleFlush();
      });
    activeFlush = flush;
    void flush.catch(() => {});
    return flush;
  };

  async function flushThrough(target: number): Promise<void> {
    await whenSynced;
    if (durableSequence >= target) return;
    await (activeFlush ?? startFlush());
    return flushThrough(target);
  }

  const storeUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === provider) return;
    const sequence = ++observedSequence;
    let journal: JournalEntry | null = null;
    if (storage) {
      try {
        journal = writeJournal(storage, `${prefix}${journalSession}.${nextJournalKey++}`, update);
      } catch (cause) {
        reportPersistenceError(
          cause instanceof Error
            ? cause
            : errorWithCause('Could not write the synchronous crash journal.', cause),
        );
      }
    }
    pending.push({
      sequence,
      key: journal?.key ?? null,
      value: journal?.value ?? null,
      update: journal?.update ?? update.slice(),
    });
    scheduleFlush();
  };

  doc.on('update', storeUpdate);
  scheduleFlush();

  return {
    provider,
    whenSynced,
    whenDurable: () => {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      return flushThrough(observedSequence);
    },
    destroy: () => {
      destroyed = true;
      if (flushTimer !== null) clearTimeout(flushTimer);
      flushTimer = null;
      doc.off('update', storeUpdate);
      void provider.destroy();
    },
  };
};

/**
 * A local-first app that can be silently evicted should say so, so the result
 * is reported rather than swallowed (TRD §6.1, §10.5).
 */
export const requestPersistentStorage = async (): Promise<StoragePersistence> => {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return 'unsupported';
  try {
    if (await navigator.storage.persisted()) return 'granted';
    return (await navigator.storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
};

/**
 * Asks for durable storage on the first write the human makes, not at start-up.
 * Chrome weighs engagement when deciding, and a document the user has actually
 * typed into is a stronger case than a document they have merely opened.
 */
export const requestPersistenceOnFirstWrite = (
  doc: YDoc,
  humanOrigin: Origin,
  report: (status: StoragePersistence) => void,
): (() => void) => {
  let done = false;
  const onUpdate = (_update: Uint8Array, origin: unknown): void => {
    // By actor rather than by object identity: the editor's writes carry the
    // binding's own origin object, stamped with this actor (see
    // `claimEditorOrigin`), so it is the actor that identifies them.
    const actor = (origin as Partial<Origin> | null)?.actor;
    if (done || actor !== humanOrigin.actor) return;
    done = true;
    doc.off('update', onUpdate);
    void requestPersistentStorage().then(report);
  };
  doc.on('update', onUpdate);
  return () => {
    if (!done) doc.off('update', onUpdate);
  };
};
