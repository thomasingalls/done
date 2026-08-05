/**
 * A store and a workspace, without IndexedDB.
 *
 * Every movement operation takes a `Workspace` — the document, the acting
 * origin, the author and today's date — so the tests build one the same way the
 * app does rather than reaching past it.
 */

import { openStore, type Store, type Workspace } from '../src/crdt';

export const TODAY = '2026-08-05';

export interface Harness {
  store: Store;
  /** The human. Tracked by undo. */
  me: Workspace;
  /** The app acting on the human's behalf. Never tracked by undo. */
  system: Workspace;
  destroy: () => void;
}

export const harness = async (today: string = TODAY): Promise<Harness> => {
  const store = await openStore({ persist: false });

  const me: Workspace = {
    doc: store.doc,
    origin: store.actor.origin,
    systemOrigin: store.actor.systemOrigin,
    author: store.actor.id,
    today,
    undo: store.undo,
  };

  return {
    store,
    me,
    system: { ...me, origin: store.actor.systemOrigin },
    destroy: () => store.destroy(),
  };
};

/** The cap repair runs on a microtask, so tests that provoke it wait for one. */
export const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};
