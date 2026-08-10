/**
 * Local persistence (TRD §6.1).
 *
 * `y-indexeddb` supplies the durable local store. This adapter adds an explicit
 * transaction-complete boundary and a short-lived recovery journal around its
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
  /** Resolves once the on-disk state has been loaded and durably checkpointed. */
  whenSynced: Promise<void>;
  /** Resolves when every document update observed before this call has committed. */
  whenDurable: () => Promise<void>;
  destroy: () => void;
}

const UPDATES_STORE = 'updates';
const JOURNAL_VERSION = '1:';
const JOURNAL_PREFIX = 'done.pending-update.';

interface JournalEntry {
  key: string;
  value: string;
  update: Uint8Array;
}

const journalStorage = (): Storage | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    void localStorage.length;
    return localStorage;
  } catch {
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

const writeJournal = (storage: Storage | null, key: string, update: Uint8Array): string | null => {
  if (!storage) return null;
  const value = `${JOURNAL_VERSION}${toBase64(update)}`;
  try {
    storage.setItem(key, value);
    return value;
  } catch {
    return null;
  }
};

/** A write is durable at transaction completion, not at the request's success event. */
const persistUpdate = (database: IDBDatabase, update: Uint8Array): Promise<void> =>
  new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(UPDATES_STORE, 'readwrite', { durability: 'strict' });
    } catch {
      transaction = database.transaction(UPDATES_STORE, 'readwrite');
    }

    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error ?? new Error('IndexedDB persistence transaction aborted.')),
      { once: true },
    );
    transaction.addEventListener(
      'error',
      () => reject(transaction.error ?? new Error('IndexedDB persistence transaction failed.')),
      { once: true },
    );
    transaction.objectStore(UPDATES_STORE).add(update);
    transaction.commit?.();
  });

export const openLocalStore = (doc: YDoc, name: string = DB_NAME): LocalStore => {
  const provider = new IndexeddbPersistence(name, doc);
  // The upstream listener starts an add request but exposes no transaction-
  // complete boundary. The checkpoint below is intentionally redundant until
  // y-indexeddb compacts the log: it retains the upstream implementation while
  // giving this adapter a write whose transaction it can prove completed.

  const storage = journalStorage();
  const prefix = journalPrefix(name);
  const recovered = readJournal(storage, prefix).filter((entry) => {
    try {
      Y.applyUpdate(doc, entry.update, provider);
      return true;
    } catch {
      return false;
    }
  });
  const ownJournalKey = `${prefix}${newId()}`;
  let ownJournalValue: string | null = null;
  let pendingUpdate: Uint8Array | null = null;
  let revision = 0;
  let latestDurability: Promise<void> = Promise.resolve();

  const storeUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === provider) return;
    revision += 1;
    const observedRevision = revision;
    pendingUpdate = pendingUpdate ? Y.mergeUpdates([pendingUpdate, update]) : update.slice();
    const toStore = pendingUpdate;
    ownJournalValue = writeJournal(storage, ownJournalKey, toStore);

    const database = provider.db;
    if (!database) return;
    const durable = persistUpdate(database, toStore).then(() => {
      if (revision === observedRevision) {
        pendingUpdate = null;
        if (ownJournalValue) clearJournal(storage, ownJournalKey, ownJournalValue);
        ownJournalValue = null;
      }
    });
    latestDurability = durable;
    void durable.catch(() => {});
  };

  doc.on('update', storeUpdate);

  const whenSynced = provider.whenSynced.then(async () => {
    const database = provider.db;
    if (!database) throw new Error('IndexedDB opened without a database connection.');
    const observedRevision = revision;
    // This checkpoint both proves the initial transaction has completed and
    // makes every replayed journal update independently durable.
    await persistUpdate(database, Y.encodeStateAsUpdate(doc));
    for (const entry of recovered) clearJournal(storage, entry.key, entry.value);
    if (revision === observedRevision && pendingUpdate) {
      pendingUpdate = null;
      if (ownJournalValue) clearJournal(storage, ownJournalKey, ownJournalValue);
      ownJournalValue = null;
    }
  });
  latestDurability = whenSynced;

  return {
    provider,
    whenSynced,
    whenDurable: () => latestDurability,
    destroy: () => {
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
