export * from '../account-decisions/browser';
export { openOwnedAccountDeliveryWorkspace } from '../../src/crdt/accountSpool';
export * from '../../src/crdt/deliveryRecord';
import { readPromotion } from '../../src/crdt/promotionRecord';
import { withPromotionSlot } from '../../src/crdt/writeSession';
import { claimScope } from '../../src/crdt/localGenesisRecord';
import { prepareAccountCustody } from '../../src/crdt/custody';
import { deriveStoreName } from '../../src/crdt/storeName';
/** Deliberate row deletion outside the protocol, in a disposable fixture only. */
export async function removeDeliveryRow(
  slot: string,
  code: string,
  kind: 'response' | 'submission',
) {
  await withPromotionSlot(slot, code, async (task) => {
    const v = await readPromotion(task, slot, code),
      scope = claimScope(v.claim),
      owner = prepareAccountCustody(
        { ...scope, resolvePrincipal: () => scope.principalId },
        code,
        undefined,
        true,
      );
    try {
      await owner.initialize(task);
      const rows = await owner.carrier.load(task);
      try {
        const found = rows.find((r) => {
          if (r.kind !== 'heads' && r.kind !== 'outbound') return false;
          const value = JSON.parse(new TextDecoder().decode(r.bytes));
          return value[0] === 'done/account-delivery/v1' && value[9] === kind;
        });
        if (!found) throw Error('Missing fault target');
        const awaitName = await deriveStoreName(scope.principalId, scope.workspaceId);
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const r = indexedDB.open(awaitName);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        try {
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(found.kind, 'readwrite');
            tx.objectStore(found.kind).delete(found.seq);
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error);
          });
        } finally {
          db.close();
        }
      } finally {
        for (const r of rows) r.bytes.fill(0);
      }
    } finally {
      owner.dispose();
    }
  });
}
