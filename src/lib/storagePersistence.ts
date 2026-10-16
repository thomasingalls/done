export type StoragePersistence = 'granted' | 'denied' | 'unsupported' | 'unknown';

/** Ask whether the browser protects this origin's saved writing from automatic eviction. */
export const requestPersistentStorage = async (): Promise<StoragePersistence> => {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return 'unsupported';
  try {
    if (await navigator.storage.persisted?.()) return 'granted';
    return (await navigator.storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
};
