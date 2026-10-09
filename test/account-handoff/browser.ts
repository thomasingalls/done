export * from '../account-admission/browser';
export { finishPromotionHandoff } from '../../src/crdt/promotionHandoff';
export { classifyAccountStartup } from '../../src/crdt/accountStartup';
export async function putSlot(slotId: string, value: unknown) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('done.slots');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('slots', 'readwrite');
      if (value === null) tx.objectStore('slots').delete(slotId);
      else tx.objectStore('slots').put(value);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
