/**
 * Assembles the local store: document tree, actor, undo, awareness, persistence,
 * sync, and the one thing the app does to itself on every write — the membership
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
import { daysMap, repairCardMemberships, SECTIONS } from './days';
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
   * operations — compaction, the membership repair, bulk moves — are excluded
   * by construction rather than by remembering to exclude them.
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
 * Membership, repaired after the fact (TRD §4.2, and see
 * `repairCardMemberships`).
 *
 * A card's identity is spread across three roots — the registry, the canonical
 * location, and a day's ordered array — and concurrency can leave them
 * disagreeing in both directions: an array holding an id whose location says
 * somewhere else, and a located card no array holds. Neither is a mistake
 * anybody made, and neither can be refused at the write path, so it is repaired
 * here.
 *
 * The three-item cap is **not** among the things repaired. It is a rule about
 * adding, enforced where adding happens; a Next that grew past three because
 * two devices filled it while apart is kept as it is (PRD §3).
 *
 * Deferred to a microtask rather than run inside the observer, so the repair is
 * its own transaction with its own (system) origin rather than an addition to
 * whatever transaction happened to trip it.
 */
const watchMemberships = (doc: YDoc, context: ActorContext): (() => void) => {
  const map = daysMap(doc);
  let queued = false;

  const observer = (events: { path: (string | number)[] }[]): void => {
    // Only membership can leave the three roots disagreeing. Card *text* lives
    // in the canonical registry and does not reach this observer at all.
    const membership = events.some((event) => {
      const field = event.path[1];
      // A change to the days map itself: a day arrived, which is a membership
      // change in every sense that matters here.
      return typeof field !== 'string' || SECTIONS.some((section) => section === field);
    });
    if (!membership || queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      repairCardMemberships(doc, context.systemOrigin);
    });
  };

  map.observeDeep(observer);
  return () => map.unobserveDeep(observer);
};

/**
 * Asynchronous on purpose, for two independent reasons. The second is the one
 * that would still hold if the first were ever solved another way, so removing
 * the `await` needs both answered.
 *
 * 1. Persisted state must be applied *before* the actor roster and `meta` are
 *    initialised, or every reload would re-register the local actor against a
 *    document that already knows it and overwrite the stored name and colour
 *    with fresh defaults.
 * 2. **No transport may be constructed until the disk read has landed**
 *    (TRD §6.1). A socket opened against a document that is still empty hands
 *    the relay and every other replica an empty document, and they converge on
 *    it — sync propagates the loss instead of repairing it. This is the most
 *    common data-loss report against Yjs in production, and the reason
 *    `createSync` is at the bottom of this function rather than the top.
 *    Asserted in `test/sync.test.ts`, "load before connect".
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

  const stopWatchingMemberships = watchMemberships(doc, actor);
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
      stopWatchingMemberships();
      stopPersistenceRequest();
      sync.destroy();
      undo.destroy();
      awareness.destroy();
      local?.destroy();
      doc.destroy();
    },
  };
};
