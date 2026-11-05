/** Read-only authentication and native row count; no semantic permission comes from this probe. */
import { withJoinedSlot } from '../../src/crdt/writeSession';
import { readJoinedAccount } from '../../src/crdt/joinedAccount';
import { localRoute } from '../../src/crdt/localGenesisStorage';
import { captureInboundReceiptVersion } from '../../src/crdt/inboundReceiptVersion';
export async function inspectInstallation(slotId: string, code: string) {
  return withJoinedSlot(slotId, code, async (task) => {
    const state = await readJoinedAccount(task, slotId, code),
      marker = state.marker;
    if (!marker) throw Error('Expected authenticated installation');
    const local = await localRoute(task, state.claim),
      name = local.stores[0]!.dbName,
      nativeRows = await task.wait(
        () =>
          new Promise<number>((accept, reject) => {
            const request = indexedDB.open(name);
            request.onupgradeneeded = () => {
              request.transaction!.abort();
              reject(Error('Expected existing native carrier'));
            };
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result,
                tx = db.transaction('content', 'readonly'),
                count = tx.objectStore('content').count();
              tx.oncomplete = () => {
                db.close();
                accept(count.result);
              };
              tx.onabort = () => {
                db.close();
                reject(tx.error);
              };
            };
          }),
      ),
      bytes = new TextEncoder().encode(JSON.stringify(marker.reading));
    try {
      return {
        phase: marker.phase,
        floor: marker.inboundReceiptVersion ?? null,
        readingFloor: captureInboundReceiptVersion(marker.reading).inboundReceiptVersion ?? null,
        readingDigest: Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
          (n) => n.toString(16).padStart(2, '0'),
        ).join(''),
        nativeRows,
      };
    } finally {
      bytes.fill(0);
    }
  });
}
