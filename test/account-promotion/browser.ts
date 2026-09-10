export * from '../account-authority/browser';
export { prepareLocalPromotion, abandonLocalPromotion } from '../../src/crdt/promotionOwner';
export { withRecoveryOwner } from '../../src/account/recoveryOwner';
export { withPromotionSlot } from '../../src/crdt/writeSession';
import { openCustodyDb, type CustodyScope } from '../../src/crdt/custodyRecord';
export async function rows() {
  const db = await openCustodyDb();
  try {
    return await new Promise<{ key: IDBValidKey; value: unknown }[]>((resolve, reject) => {
      const tx = db.transaction('entries'),
        s = tx.objectStore('entries'),
        keys = s.getAllKeys(),
        values = s.getAll();
      tx.oncomplete = () =>
        resolve(keys.result.map((key, i) => ({ key, value: values.result[i] })));
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function put(key: IDBValidKey, value: unknown) {
  const db = await openCustodyDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('entries', 'readwrite');
      tx.objectStore('entries').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function remove(key: IDBValidKey) {
  const db = await openCustodyDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('entries', 'readwrite');
      tx.objectStore('entries').delete(key);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function snapshot(scope: CustodyScope) {
  const all = await rows();
  const r = all.find(
    (x) =>
      JSON.stringify(x.key) ===
      JSON.stringify([scope.slotId, scope.principalId, scope.workspaceId]),
  )!.value;
  const marker = all.find(
    (x) => JSON.stringify(x.key) === JSON.stringify([scope.slotId, 'application-upgrade']),
  )?.value;
  return { record: r, marker };
}
import { withExclusiveSlot } from '../../src/crdt/writeSession';
import { readPromotion, withPromotionRoot, signRecord } from '../../src/crdt/promotionRecord';
import { deriveStoreName } from '../../src/crdt/storeName';
export async function budget(slotId: string, code: string, value: number) {
  await withExclusiveSlot(slotId, async (task) => {
    const s = await readPromotion(task, slotId, code);
    await withPromotionRoot(task, s.claim, s.record, code, async (root, subtle) => {
      const next = await signRecord(root, { ...s.record, seal_reserved: value }, subtle);
      await put([slotId, s.claim.initial.principal_id, s.claim.initial.workspace_id], next);
    });
  });
}
export async function removeCounter(scope: CustodyScope) {
  const name = await deriveStoreName(scope.principalId, scope.workspaceId);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').clear();
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
