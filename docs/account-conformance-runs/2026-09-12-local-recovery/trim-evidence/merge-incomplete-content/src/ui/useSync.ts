/**
 * React's view of sync.
 *
 * The controller is not the document, so this is an ordinary external store
 * rather than the derived-snapshot arrangement `useYjs.ts` needs: the state
 * object is rebuilt on change and kept stable between changes, which is exactly
 * what `useSyncExternalStore` wants.
 *
 * Nothing here is on the read or write path (TRD §7.1). The only component that
 * subscribes is the menu, and it is usually closed.
 */

import { useSyncExternalStore } from 'react';
import type { SyncController, SyncState } from '../crdt';

export const useSyncState = (sync: SyncController): SyncState =>
  useSyncExternalStore(
    sync.subscribe,
    () => sync.state,
    () => sync.state,
  );
