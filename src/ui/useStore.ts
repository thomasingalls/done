/**
 * Opens the local store once, for the lifetime of the app.
 *
 * The editor is not mounted until IndexedDB has been read back into the
 * document — mounting first would paint an empty document and then fill it,
 * which is both a flash and, if the user started typing into it, a merge they
 * did not ask for.
 */

import { useEffect, useState } from 'react';
import { openStore, type StoragePersistence, type Store } from '../crdt';

export interface StoreState {
  store: Store | null;
  storage: StoragePersistence;
  error: Error | null;
}

export const useStore = (): StoreState => {
  const [store, setStore] = useState<Store | null>(null);
  const [storage, setStorage] = useState<StoragePersistence>('unknown');
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let disposed = false;
    let opened: Store | null = null;

    void openStore({ onStoragePersistence: setStorage })
      .then((next) => {
        if (disposed) {
          next.destroy();
          return;
        }
        opened = next;
        setStore(next);
      })
      .catch((cause: unknown) => {
        if (!disposed) setError(cause instanceof Error ? cause : new Error(String(cause)));
      });

    return () => {
      disposed = true;
      opened?.destroy();
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return;
    void navigator.storage.persisted().then((granted) => {
      if (granted) setStorage('granted');
    });
  }, []);

  return { store, storage, error };
};
