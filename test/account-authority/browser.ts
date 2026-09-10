export { inspectLocalPromotion } from '../../src/crdt/promotionPreparation';
export { beginLocalGenesis } from '../../src/crdt/localGenesis';
export { generateRecovery, confirmRecovery } from '../../src/account/recovery';
export { draftDigest } from '../../account-protocol/recovery';
export { withExclusiveSlot } from '../../src/crdt/writeSession';
import { openJournalSession } from '../../src/crdt/custody';
import type { CustodyScope } from '../../src/crdt/custodyRecord';
import { Y } from '../../src/crdt/yjs';
import { replayRecovery } from '../../src/crdt/admissionDocument';
export async function append(
  scope: CustodyScope,
  code: string,
  kind: 'journal' | 'disk' | 'pending' | 'heads',
) {
  const session = await openJournalSession(
    { ...scope, resolvePrincipal: () => scope.principalId },
    code,
  );
  const doc = new Y.Doc({ gc: false });
  try {
    const text = doc.getText('test');
    text.insert(0, 'written before promotion');
    const vector = Y.encodeStateVector(doc);
    text.insert(text.length, '; dependent suffix');
    const update = new Uint8Array(
      kind === 'pending' ? Y.encodeStateAsUpdate(doc, vector) : Y.encodeStateAsUpdate(doc),
    );
    if (kind === 'journal' || kind === 'pending') return session.appendLocal(update);
    return await session.appendBatch([
      { kind: kind === 'heads' ? 'heads' : 'update', bytes: update },
    ]);
  } finally {
    doc.destroy();
    await session.close();
  }
}
export async function readText(scope: CustodyScope, code: string) {
  const session = await openJournalSession(
      { ...scope, resolvePrincipal: () => scope.principalId },
      code,
    ),
    doc = new Y.Doc({ gc: false });
  try {
    replayRecovery(doc, await session.loadRecovery());
    return doc.getText('test').toString();
  } finally {
    doc.destroy();
    await session.close();
  }
}
/** Harness census only: production preflight never enumerates databases. */
export async function inventory() {
  const result: unknown[] = [];
  for (const entry of (await indexedDB.databases()).sort((a, b) =>
    a.name!.localeCompare(b.name!),
  )) {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(entry.name!);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      for (const store of [...db.objectStoreNames]) {
        result.push(
          await new Promise((resolve, reject) => {
            const tx = db.transaction(store),
              keys = tx.objectStore(store).getAllKeys(),
              values = tx.objectStore(store).getAll();
            tx.oncomplete = () => resolve([entry.name, store, keys.result, values.result]);
            tx.onabort = () => reject(tx.error);
          }),
        );
      }
    } finally {
      db.close();
    }
  }
  return JSON.stringify(
    [
      result,
      Object.fromEntries(
        Object.keys(localStorage)
          .sort()
          .map((key) => [key, localStorage.getItem(key)]),
      ),
    ],
    (_key, value) => (value instanceof Uint8Array ? [...value] : value),
  );
}

import { withExclusiveSlot } from '../../src/crdt/writeSession';
import { readLocalClaim, signLocalClaim, localClaimKey } from '../../src/crdt/localGenesisRecord';
import { openCustodyDb } from '../../src/crdt/custodyRecord';
import { contentTransaction } from '../../src/crdt/contentDatabase';
/** Synthetic authenticated imported-claim provenance; importer correctness has its separate campaign. */
export async function importedClaim(slotId: string, code: string) {
  await withExclusiveSlot(slotId, async (task) => {
    const claim = (await readLocalClaim(task, slotId))!;
    claim.imported = {
      policy: 'markdown-system-v1',
      recoveryDigest: 'ab'.repeat(32),
      sourceOrigin: location.origin,
      sourceDigest: 'bc'.repeat(32),
      planDigest: 'cd'.repeat(32),
      createdAt: '2026-09-10T00:00:00.000Z',
      selectionMac: 'de'.repeat(32),
    };
    const signed = await signLocalClaim(task, claim, code),
      db = await task.wait(() => openCustodyDb());
    try {
      await contentTransaction<void>(db, task, ['entries'], 'readwrite', (tx) => {
        tx.objectStore('entries').put(signed, localClaimKey(slotId));
      });
    } finally {
      db.close();
    }
  });
}
