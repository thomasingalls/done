/** Test-only read-only observation after the real app has locked. No semantic trust or app
 * permission comes from this syntax census; admission and cold app opening are separate checks. */
import { withPromotionSlot, withJoinedSlot } from '../../src/crdt/writeSession';
import { readPromotion } from '../../src/crdt/promotionRecord';
import { readJoinedAccount } from '../../src/crdt/joinedAccount';
import { claimScope } from '../../src/crdt/localGenesisRecord';
import { withRecoveryUnderPermit } from '../../src/crdt/custody';
import { captureScopedInboundReceiptSyntax } from '../../src/crdt/inboundRecord';
import { eraseVerified } from '../../src/crdt/verifiedRecords';
async function savedDigest() {
  const databases = (await indexedDB.databases())
    .map((d) => d.name!)
    .filter((n) => n === 'done.custody' || /^done\.[a-f0-9]{32}$/.test(n))
    .sort();
  const rows: unknown[] = [];
  for (const name of databases) {
    const db = await new Promise<IDBDatabase>((accept, reject) => {
      const q = indexedDB.open(name);
      q.onupgradeneeded = () => {
        q.transaction!.abort();
        reject(Error('Expected existing native database'));
      };
      q.onerror = () => reject(q.error);
      q.onsuccess = () => accept(q.result);
    });
    try {
      for (const store of Array.from(db.objectStoreNames).sort()) {
        rows.push(
          await new Promise((accept, reject) => {
            const tx = db.transaction(store, 'readonly'),
              object = tx.objectStore(store),
              keys = object.getAllKeys(),
              values = object.getAll();
            tx.oncomplete = () => accept([name, store, keys.result, values.result]);
            tx.onabort = () => reject(tx.error);
          }),
        );
      }
    } finally {
      db.close();
    }
  }
  const bytes = new TextEncoder().encode(JSON.stringify(rows));
  try {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (n) =>
      n.toString(16).padStart(2, '0'),
    ).join('');
  } finally {
    bytes.fill(0);
  }
}
export async function inspectNativeReceipts(slotId: string, code: string, joined: boolean) {
  const before = await savedDigest();
  const withSlot = joined ? withJoinedSlot : withPromotionSlot;
  const result = await withSlot(slotId, code, async (task) => {
    const state = joined
      ? await readJoinedAccount(task, slotId, code)
      : await readPromotion(task, slotId, code);
    const scope = claimScope(state.claim),
      marker = state.marker;
    if (!marker || marker.inboundReceiptVersion !== 1)
      throw Error('Expected authenticated current receipt floor');
    return withRecoveryUnderPermit(
      task,
      { ...scope, resolvePrincipal: () => scope.principalId },
      code,
      async (recovery) => {
        const receipts: {
          seq: number;
          kind: string;
          count: number;
          firstEntry: number;
          position: number;
          requestExpires: number;
          bytes: number;
        }[] = [];
        for (const row of recovery.records) {
          if (row.kind !== 'heads') continue;
          const syntax = captureScopedInboundReceiptSyntax(row.bytes, marker);
          if (!syntax) continue;
          try {
            const event = syntax.receipt;
            receipts.push(
              event.kind === 'page'
                ? {
                    seq: row.seq,
                    kind: 'page',
                    count: event.record.entryCount,
                    firstEntry: event.record.firstEntry,
                    position: event.record.firstPosition,
                    requestExpires: syntax.originals.request.expires,
                    bytes: row.bytes.length,
                  }
                : {
                    seq: row.seq,
                    kind: 'legacy',
                    count: 1,
                    firstEntry: event.record.entry ?? 0,
                    position: event.record.position,
                    requestExpires: syntax.originals.request.expires,
                    bytes: row.bytes.length,
                  },
            );
          } finally {
            eraseVerified(syntax);
          }
        }
        return {
          receipts,
          journalEntries: recovery.journal.length,
          floor: marker.inboundReceiptVersion,
        };
      },
      { allowSpoolCounter: true },
    );
  });
  return { ...result, readOnlyUnchanged: before === (await savedDigest()) };
}
