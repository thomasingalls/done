export * from '../account-sync/browser';
import { withPromotionSlot } from '../../src/crdt/writeSession';
import {
  readPromotion,
  signPromotion,
  withPromotionRoot,
  writePromotion,
} from '../../src/crdt/promotionRecord';
/** Closed-owner fixture inspection/faults only; never installed in the application. */
export const successorMarker = (slot: string, code: string) =>
  withPromotionSlot(slot, code, async (task) => (await readPromotion(task, slot, code)).marker);
export const changeSuccessorCut = (slot: string, code: string) =>
  withPromotionSlot(slot, code, async (task) => {
    const v = await readPromotion(task, slot, code);
    if (!v.marker?.successor) throw Error('Missing installed fixture');
    await withPromotionRoot(task, v.claim, v.record, code, async (root, subtle) => {
      const next = await signPromotion(
        root,
        {
          ...v.marker!,
          successor: { ...v.marker!.successor!, before: { events: 0, hash: '0'.repeat(64) } },
        },
        subtle,
      );
      await writePromotion(task, v.claim, v.record, v.record, v.marker, next);
    });
  });
export { parsePromotion, promotionPayload } from '../../src/crdt/promotionRecord';
/** Strip the authenticated child field without recomputing its MAC, as a storage attacker could. */
export async function stripSuccessor(slot: string) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('done.custody');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('entries', 'readwrite'),
        store = tx.objectStore('entries'),
        key = [slot, 'application-upgrade'];
      const req = store.get(key);
      req.onsuccess = () => {
        const value = req.result;
        if (!value?.successor) {
          tx.abort();
          return;
        }
        delete value.successor;
        store.put(value, key);
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? Error('Missing fault target'));
    });
  } finally {
    db.close();
  }
}
