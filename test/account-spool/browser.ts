export * from '../account-capture/browser';
export { openOwnedAccountSpoolWorkspace } from '../../src/crdt/accountSpool';
export {
  inspectSpool,
  decodeSpoolEntry,
  encodeSpoolEntry,
  networkRoute,
} from '../../src/crdt/spoolRecord';
export { verifyNetworkEnvelope, openNetworkEnvelope } from '../../account-protocol/envelope';
import { readPromotion, withPromotionRoot } from '../../src/crdt/promotionRecord';
import { claimScope } from '../../src/crdt/localGenesisRecord';
import { openEnvelope, hkdf, fields, random } from '../../src/crdt/custodyCrypto';
import { decodeSpoolEntry, encodeSpoolEntry, inspectSpool } from '../../src/crdt/spoolRecord';
import {
  captureRoute,
  decodeSourceCapsule,
  encodeSourceCapsule,
  eraseCapsule,
} from '../../src/crdt/sourceCapture';
import { prepareAccountCustody } from '../../src/crdt/custody';
import { withPromotionSlot } from '../../src/crdt/writeSession';
import { deriveStoreName } from '../../src/crdt/storeName';
import { recordAAD } from '../../src/crdt/contentRecord';
// Deliberate authenticated-at-rest corruption outside the production write protocol.
export async function spoolFault(
  slotId: string,
  code: string,
  mode:
    | 'source-missing'
    | 'source-changed'
    | 'wire'
    | 'attempt'
    | 'envelope-missing'
    | 'ledger-missing',
) {
  await withPromotionSlot(slotId, code, async (task) => {
    const v = await readPromotion(task, slotId, code),
      scope = claimScope(v.claim),
      route = captureRoute(v.marker!);
    const owner = prepareAccountCustody(
      { ...scope, resolvePrincipal: () => scope.principalId },
      code,
      undefined,
      true,
    );
    try {
      await owner.initialize(task);
      const rows = await owner.carrier.load(task),
        state = inspectSpool(rows, route);
      try {
        const position = state.positions[0]!;
        const row = rows.find((r) =>
          mode.startsWith('source')
            ? r.kind === 'outbound' &&
              JSON.parse(new TextDecoder().decode(r.bytes))[0] === 'done/source-capture/v1' &&
              JSON.parse(new TextDecoder().decode(r.bytes))[2] === position.source.id
            : mode === 'attempt'
              ? r.kind === 'heads' && decodeSpoolEntry(r.bytes, route).type === 'attempt'
              : r.kind === 'outbound' &&
                JSON.parse(new TextDecoder().decode(r.bytes))[0] === 'done/account-spool/v1',
        )!;
        const name = await deriveStoreName(scope.principalId, scope.workspaceId);
        const content = await new Promise<IDBDatabase>((resolve, reject) => {
          const r = indexedDB.open(name);
          r.onerror = () => reject(r.error);
          r.onsuccess = () => resolve(r.result);
        });
        try {
          if (mode === 'ledger-missing')
            await new Promise<void>((resolve, reject) => {
              const tx = content.transaction(['heads', 'outbound'], 'readwrite');
              tx.objectStore('heads').clear();
              for (const r of rows)
                if (
                  r.kind === 'outbound' &&
                  JSON.parse(new TextDecoder().decode(r.bytes))[0] === 'done/account-spool/v1'
                )
                  tx.objectStore('outbound').delete(r.seq);
              tx.oncomplete = () => resolve();
              tx.onabort = () => reject(tx.error);
            });
          else if (mode === 'source-missing' || mode === 'envelope-missing')
            await new Promise<void>((resolve, reject) => {
              const tx = content.transaction('outbound', 'readwrite');
              tx.objectStore('outbound').delete(row.seq);
              tx.oncomplete = () => resolve();
              tx.onabort = () => reject(tx.error);
            });
          else
            await withPromotionRoot(task, v.claim, v.record, code, async (root, subtle) => {
              let bytes;
              if (mode === 'source-changed') {
                const c = decodeSourceCapsule(row.bytes, route);
                c.sources[0]!.actor = c.sources[0]!.actor === 'system' ? route.principal : 'system';
                c.sources[0]!.kind = c.sources[0]!.kind === 'system' ? 'human' : 'system';
                bytes = encodeSourceCapsule(c);
                eraseCapsule(c);
              } else {
                const entry = decodeSpoolEntry(row.bytes, route);
                if (entry.type === 'attempt') entry.attempt++;
                else if (entry.type === 'envelope')
                  entry.wire[entry.wire.length - 1] = entry.wire[entry.wire.length - 1]! ^ 1;
                bytes = encodeSpoolEntry(entry, route);
              }
              const kg = await openEnvelope(scope, root, v.record.envelope!, subtle);
              try {
                const key = await hkdf(
                  kg,
                  new Uint8Array(),
                  fields('done/store/v1', scope.workspaceId, v.record.store_id),
                  { name: 'AES-GCM', length: 256 },
                  ['encrypt'],
                  subtle,
                );
                const header = { v: 1 as const, seq: row.seq, gen: row.gen, kind: row.kind },
                  nonce = random(12),
                  ct = new Uint8Array(
                    await subtle.encrypt(
                      {
                        name: 'AES-GCM',
                        iv: nonce,
                        additionalData: recordAAD({ ...scope, storeId: v.record.store_id }, header),
                      },
                      key,
                      bytes,
                    ),
                  );
                await new Promise<void>((resolve, reject) => {
                  const tx = content.transaction(row.kind, 'readwrite');
                  tx.objectStore(row.kind).put({ ...header, nonce, ct }, row.seq);
                  tx.oncomplete = () => resolve();
                  tx.onabort = () => reject(tx.error);
                });
              } finally {
                kg.fill(0);
                bytes.fill(0);
              }
            });
        } finally {
          content.close();
        }
      } finally {
        for (const r of rows) r.bytes.fill(0);
      }
    } finally {
      owner.dispose();
    }
  });
}
