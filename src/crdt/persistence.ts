/**
 * Local persistence (TRD §6.1).
 *
 * `y-indexeddb` is the durable local store and, for free, the cross-tab
 * channel — two tabs of the same origin observe each other's writes through
 * it, so nothing on the write path has to coordinate tabs.
 *
 * SQLite/OPFS (TRD §6.2) is a derived search index and belongs to Phase 4.
 * Nothing here is authoritative for anything but the Yjs document.
 */

import { IndexeddbPersistence, type YDoc } from './yjs';
import type { Origin } from './actors';

export const DB_NAME = 'done';

export type StoragePersistence = 'granted' | 'denied' | 'unsupported' | 'unknown';

export interface LocalStore {
  provider: IndexeddbPersistence;
  /** Resolves once the on-disk state has been loaded into the document. */
  whenSynced: Promise<void>;
  destroy: () => void;
}

export const openLocalStore = (doc: YDoc, name: string = DB_NAME): LocalStore => {
  const provider = new IndexeddbPersistence(name, doc);
  return {
    provider,
    whenSynced: provider.whenSynced.then(() => undefined),
    destroy: () => void provider.destroy(),
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
