/**
 * Assembles the local store: document tree, actor, undo, awareness, persistence,
 * and the one thing the app does to itself on every write — the cap repair.
 *
 * There is no sync provider here and no place to put one that the read or
 * write path awaits (TRD §7.1). Phase 3 adds one behind the `SyncProvider`
 * interface; deleting it again must leave a working app.
 */

import { Awareness, createDoc, createUndoManager, type YDoc, type YUndoManager } from './yjs';
import { resolveActor, type ActorContext } from './actors';
import { openTree, readSettings, type DocumentTree, type Settings } from './doc';
import { daysMap, listDays } from './days';
import { enforceCap } from './moves';
import {
  openLocalStore,
  requestPersistenceOnFirstWrite,
  type LocalStore,
  type StoragePersistence,
} from './persistence';

export * from './yjs';
export * from './actors';
export * from './doc';
export * from './days';
export * from './freeze';
export * from './moves';
export * from './serialize';
export * from './compaction';
export * from './export';
export * from './persistence';

export interface Store extends DocumentTree {
  actor: ActorContext;
  awareness: Awareness;
  /**
   * Scoped to the local human's origin (TRD §4.8), across both roots. Undo
   * follows the actor rather than the surface: a card move and a line of
   * journal are one history because one person made both. System-actor
   * operations — compaction, the cap repair, bulk moves — are excluded by
   * construction rather than by remembering to exclude them.
   */
  undo: YUndoManager;
  local: LocalStore | null;
  settings: Settings;
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
 * The cap, repaired after the fact (TRD §11, and see `enforceCap`).
 *
 * Every write path refuses to exceed three, which covers paste, multi-line
 * insert and drag at the point of the mistake. Two devices each inserting a
 * third card while apart is not a mistake anyone made and still converges to
 * four, so it is caught here instead. Undo is the other way in: re-inserting a
 * card the user had moved out is a legal undo of a legal operation.
 *
 * Deferred to a microtask rather than run inside the observer, so the repair is
 * its own transaction with its own (system) origin rather than an addition to
 * whatever transaction happened to trip it.
 */
const watchCap = (doc: YDoc, context: ActorContext): (() => void) => {
  const map = daysMap(doc);
  let queued = false;
  let sweep = false;
  const pending = new Set<string>();

  const flush = (): void => {
    queued = false;
    const dates = sweep ? listDays(doc) : [...pending];
    pending.clear();
    sweep = false;
    for (const date of dates) enforceCap(doc, context.systemOrigin, date);
  };

  const observer = (events: { path: (string | number)[] }[]): void => {
    for (const event of events) {
      const date = event.path[0];
      // A change to the days map itself: a day arrived, so there is no path to
      // read a date out of. Rare enough to be worth a full pass.
      if (typeof date === 'string') pending.add(date);
      else sweep = true;
    }
    if (queued) return;
    queued = true;
    queueMicrotask(flush);
  };

  map.observeDeep(observer);
  return () => map.unobserveDeep(observer);
};

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

  const undo = createUndoManager([tree.master, tree.days], new Set([actor.origin]));

  const stopWatchingCap = watchCap(doc, actor);
  const stopPersistenceRequest = options.onStoragePersistence
    ? requestPersistenceOnFirstWrite(doc, actor.origin, options.onStoragePersistence)
    : () => {};

  return {
    ...tree,
    actor,
    awareness,
    undo,
    local,
    settings: readSettings(tree.meta),
    destroy: () => {
      stopWatchingCap();
      stopPersistenceRequest();
      undo.destroy();
      awareness.destroy();
      local?.destroy();
      doc.destroy();
    },
  };
};
