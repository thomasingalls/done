/** Metadata-only exclusion. Never held while acquiring a workspace/slot permit. */
export const SETUP_DB = 'done.first-device-setup.v1';
export class SetupRetired extends Error {}
export const setupEpochKey = (slotId: string) => [slotId, 'removal-epoch-v1'];
export const isSetupEpoch = (
  value: unknown,
): value is { v: 1; kind: 'setup-removal-epoch'; slotId: string; epoch: string } => {
  const row = value as { v?: unknown; kind?: unknown; slotId?: unknown; epoch?: unknown } | null;
  return (
    !!row &&
    Object.keys(row).sort().join() === 'epoch,kind,slotId,v' &&
    row.v === 1 &&
    row.kind === 'setup-removal-epoch' &&
    typeof row.slotId === 'string' &&
    typeof row.epoch === 'string' &&
    /^[a-f0-9]{32}$/.test(row.epoch)
  );
};
export const withSetupMetadataLock = <T>(slotId: string, work: () => Promise<T>): Promise<T> => {
  if (globalThis.isSecureContext !== true || !navigator.locks)
    return Promise.reject(Error('Safe setup metadata coordination is unavailable'));
  return navigator.locks.request(
    'done/setup-metadata/' + JSON.stringify(slotId),
    { mode: 'exclusive' },
    work,
  );
};
export const openSetupDB = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(SETUP_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('attempt');
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
/** Refusal-only probe. Even an undefined/null retained marker blocks a metadata write. */
export async function assertSetupNotRemoved(slotId: string) {
  const db = await new Promise<IDBDatabase | null>((resolve, reject) => {
    let absent = false,
      abandoned = false;
    const request = indexedDB.open('done.custody');
    request.onupgradeneeded = () => {
      absent = true;
      request.transaction!.abort();
    };
    request.onerror = () => (absent ? resolve(null) : reject(request.error));
    request.onsuccess = () => {
      if (abandoned) request.result.close();
      else {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      }
    };
    request.onblocked = () => {
      abandoned = true;
      reject(Error('Removal state is busy'));
    };
  });
  if (!db) return;
  try {
    if (db.version !== 1 || [...db.objectStoreNames].join() !== 'entries')
      throw Error('Removal state has an unsupported layout');
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('entries'),
        request = tx.objectStore('entries').count([slotId, 'device-data-removal-v1']);
      tx.oncomplete = () =>
        request.result
          ? reject(new SetupRetired('This workspace was removed from this device'))
          : resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
/** Call under metadata exclusion before any erasure effect; survives explicit Start fresh. */
export async function invalidateSetupEpoch(slotId: string) {
  const db = await openSetupDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('attempt', 'readwrite', { durability: 'strict' });
      tx.objectStore('attempt').put(
        {
          v: 1,
          kind: 'setup-removal-epoch',
          slotId,
          epoch: Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
            n.toString(16).padStart(2, '0'),
          ).join(''),
        },
        setupEpochKey(slotId),
      );
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? Error('Setup retirement could not be retained'));
    });
  } finally {
    db.close();
  }
}
