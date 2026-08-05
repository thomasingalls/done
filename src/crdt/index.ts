/**
 * Assembles the local store: document tree, actor, undo, awareness, persistence.
 *
 * There is no sync provider here and no place to put one that the read or
 * write path awaits (TRD §7.1). Phase 3 adds one behind the `SyncProvider`
 * interface; deleting it again must leave a working app.
 */

import { Awareness, createDoc, createUndoManager, type YDoc, type YUndoManager } from './yjs';
import { resolveActor, type ActorContext } from './actors';
import { openTree, type DocumentTree } from './doc';
import {
  openLocalStore,
  requestPersistenceOnFirstWrite,
  type LocalStore,
  type StoragePersistence,
} from './persistence';

export * from './yjs';
export * from './actors';
export * from './doc';
export * from './persistence';

export interface Store extends DocumentTree {
  actor: ActorContext;
  awareness: Awareness;
  /**
   * Scoped to the local human's origin (TRD §4.8). System-actor operations —
   * compaction, import, bulk moves — are excluded by construction rather than
   * by remembering to exclude them.
   */
  undo: YUndoManager;
  local: LocalStore | null;
  destroy: () => void;
}

export interface OpenStoreOptions {
  doc?: YDoc;
  dbName?: string;
  /** Off for tests that have no business touching IndexedDB. */
  persist?: boolean;
  onStoragePersistence?: (status: StoragePersistence) => void;
}

/**
 * Asynchronous on purpose: persisted state must be applied *before* the actor
 * roster and `meta` are initialised, or every reload would re-register the
 * local actor against a document that already knows it and overwrite the
 * stored name and colour with fresh defaults.
 */
export const openStore = async (options: OpenStoreOptions = {}): Promise<Store> => {
  const doc = options.doc ?? createDoc();

  const local = options.persist === false ? null : openLocalStore(doc, options.dbName);
  if (local) await local.whenSynced;

  const actor = resolveActor(doc, doc.getMap('meta'));
  const tree = openTree(doc, actor.systemOrigin);

  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', {
    name: actor.actor.name,
    color: actor.actor.color,
    colorLight: `${actor.actor.color}33`,
  });

  const undo = createUndoManager(tree.master, new Set([actor.origin]));

  const stopPersistenceRequest = options.onStoragePersistence
    ? requestPersistenceOnFirstWrite(doc, actor.origin, options.onStoragePersistence)
    : () => {};

  return {
    ...tree,
    actor,
    awareness,
    undo,
    local,
    destroy: () => {
      stopPersistenceRequest();
      undo.destroy();
      awareness.destroy();
      local?.destroy();
      doc.destroy();
    },
  };
};
