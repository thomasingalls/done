import { deriveStoreName } from '../../src/crdt/storeName';
import { openAccountWorkerSession } from '../../src/crdt/accountWorkerClient';
import { createWindowAccountMirrorController } from '../../src/crdt/windowAccountMirror';

export { openAccountWorkerSession, createWindowAccountMirrorController };
(globalThis as any).WorkerReceiveHarness = {
  openAccountWorkerSession,
  createWindowAccountMirrorController,
  nativeRecords,
};

/** Read-only ciphertext observation of this disposable account; no native permit or trust is forged. */
async function nativeRecords(principalId: string, workspaceId: string) {
  const name = await deriveStoreName(principalId, workspaceId);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  try {
    const names = [...db.objectStoreNames];
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction(names, 'readonly');
      const result = names.map((store) => {
        const keys = tx.objectStore(store).getAllKeys();
        const values = tx.objectStore(store).getAll();
        return { store, keys, values };
      });
      tx.onabort = () => reject(tx.error);
      tx.oncomplete = () =>
        resolve(
          result.map(({ store, keys, values }) => ({
            store,
            keys: keys.result,
            values: values.result,
          })),
        );
    });
    return JSON.parse(
      JSON.stringify(rows, (_key, value) => (value instanceof Uint8Array ? [...value] : value)),
    );
  } finally {
    db.close();
  }
}
