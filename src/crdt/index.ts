/**
 * Assembles the local store: document tree, actor, undo, awareness, persistence,
 * sync, and the one thing the app does to itself on every write — the cap
 * repair.
 *
 * The sync controller is constructed unconditionally and constructs *nothing*
 * unless an endpoint has been configured (TRD §7.1). Nothing below awaits it,
 * and nothing below reads its state: the store is the same store whether the
 * relay is reachable, unreachable, or has never been heard of.
 */

import { Awareness, createDoc, createUndoManager, type YDoc, type YUndoManager } from './yjs';
import { resolveActor, type ActorContext } from './actors';
import { openTree, readSettings, type DocumentTree, type Settings } from './doc';
import { daysMap, listDays, repairCardMemberships, SECTIONS } from './days';
import { enforceCap } from './moves';
import { createSync, type SyncController, type SyncOptions } from './sync';
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
export * from './sync';

export interface Store extends DocumentTree {
  actor: ActorContext;
  awareness: Awareness;
  /**
   * Scoped to the local human's origin (TRD §4.8), across every root. Undo
   * follows the actor rather than the surface: a card move and a line of the
   * master list are one history because one person made both. System-actor
   * operations — compaction, the cap repair, bulk moves — are excluded by
   * construction rather than by remembering to exclude them.
   */
  undo: YUndoManager;
  local: LocalStore | null;
  /**
   * Disabled unless an endpoint has been configured, which is the state it is
   * in for every test in the suite (TRD §11, "sync-absent").
   */
  sync: SyncController;
  settings: Settings;
  destroy: () => void;
}

export interface OpenStoreOptions {
  doc?: YDoc;
  dbName?: string;
  /** Off for tests that have no business touching IndexedDB. */
  persist?: boolean;
  onStoragePersistence?: (status: StoragePersistence) => void;
  /** Injected by tests; the default opens a real websocket when configured. */
  openWebsocket?: SyncOptions['open'];
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
    repairCardMemberships(doc, context.systemOrigin);
    for (const date of dates) enforceCap(doc, context.systemOrigin, date);
  };

  const observer = (events: { path: (string | number)[] }[]): void => {
    for (const event of events) {
      const date = event.path[0];
      const field = event.path[1];
      // Only membership can move the cap. Card *text* lives in the canonical
      // registry and does not reach this observer at all.
      if (typeof field === 'string' && !SECTIONS.some((section) => section === field)) continue;
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
  repairCardMemberships(doc, actor.systemOrigin);

  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', {
    name: actor.actor.name,
    color: actor.actor.color,
    colorLight: `${actor.actor.color}33`,
  });
  // Ephemeral, like everything in awareness, which is what lets a device
  // announce itself without its identity entering the synced document
  // (TRD §4.8). It is what the other end reads for "last synced from ⟨device⟩".
  awareness.setLocalStateField('device', { id: actor.device.id, name: actor.device.name });

  const undo = createUndoManager(
    [
      tree.master,
      tree.days,
      tree.cards as unknown as typeof tree.days,
      tree.cardLocations as unknown as typeof tree.days,
    ],
    new Set([actor.origin]),
  );

  const stopWatchingCap = watchCap(doc, actor);
  const stopPersistenceRequest = options.onStoragePersistence
    ? requestPersistenceOnFirstWrite(doc, actor.origin, options.onStoragePersistence)
    : () => {};

  const sync = createSync({
    doc,
    awareness,
    ...(options.openWebsocket ? { open: options.openWebsocket } : {}),
  });

  return {
    ...tree,
    actor,
    awareness,
    undo,
    local,
    sync,
    settings: readSettings(tree.meta),
    destroy: () => {
      stopWatchingCap();
      stopPersistenceRequest();
      sync.destroy();
      undo.destroy();
      awareness.destroy();
      local?.destroy();
      doc.destroy();
    },
  };
};
