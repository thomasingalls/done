export * from '../account-handoff/browser';
export { openOwnedAccountWorkspace } from '../../src/crdt/accountWorkspace';
export { openAccountJournalSession } from '../../src/crdt/accountJournal';
export { Y, coversGenesis } from '../../src/crdt/yjs';
export { slotPermitName } from '../../src/crdt/writeSession';
import { readPromotion, withPromotionRoot } from '../../src/crdt/promotionRecord';
import { openEnvelope, hkdf, fields } from '../../src/crdt/custodyCrypto';
import { counterPayload, type ContentCounter } from '../../src/crdt/contentRecord';
import { claimScope } from '../../src/crdt/localGenesisRecord';
import { deriveStoreName } from '../../src/crdt/storeName';
// Deliberate out-of-protocol storage faults; no production owner accepts this access path.
export async function contentFault(slotId: string, code: string, kind: 'erase' | 'generation') {
  const task = {
    signal: new AbortController().signal,
    step: <T>(f: () => T) => f(),
    wait: async <T>(f: () => T | PromiseLike<T>) => f(),
  };
  const state = await readPromotion(task, slotId, code),
    scope = claimScope(state.claim);
  const name = await deriveStoreName(scope.principalId, scope.workspaceId);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    if (kind === 'erase') {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('content', 'readwrite');
        tx.objectStore('content').clear();
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      return;
    }
    const counter = await new Promise<ContentCounter>((resolve, reject) => {
      const tx = db.transaction('meta');
      const r = tx.objectStore('meta').get('counter');
      tx.oncomplete = () => resolve(r.result);
      tx.onabort = () => reject(tx.error);
    });
    await withPromotionRoot(task, state.claim, state.record, code, async (root, subtle) => {
      const key = await openEnvelope(scope, root, state.record.envelope!, subtle);
      try {
        const metadata = await hkdf(
          key,
          new Uint8Array(),
          fields(
            'done/content-metadata/v1',
            scope.slotId,
            scope.principalId,
            scope.workspaceId,
            state.record.store_id,
          ),
          { name: 'HMAC', hash: 'SHA-256', length: 256 },
          ['sign'],
          subtle,
        );
        counter.active_gen = 2;
        counter.reserved['2'] = 0;
        counter.mac = new Uint8Array(
          await subtle.sign(
            'HMAC',
            metadata,
            counterPayload(
              { ...scope, storeId: state.record.store_id, rootId: state.record.root_id },
              counter,
            ),
          ),
        );
      } finally {
        key.fill(0);
      }
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put(counter, 'counter');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
