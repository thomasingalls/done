export * from '../account-delivery/browser';
export { openOwnedAccountReceiveStore } from '../../src/crdt/accountReceive';
import { readPromotion, withPromotionRoot } from '../../src/crdt/promotionRecord';
import { withPromotionSlot } from '../../src/crdt/writeSession';
import { claimScope } from '../../src/crdt/localGenesisRecord';
import {
  openCredential,
  openEnvelope,
  random,
  hkdf,
  fields,
  hex,
} from '../../src/crdt/custodyCrypto';
import { sealNetworkEnvelope } from '../../account-protocol/envelope';
import { prepareAccountCustody } from '../../src/crdt/custody';
import { deriveStoreName } from '../../src/crdt/storeName';
import { recordAAD, counterPayload, emptySpoolWitness } from '../../src/crdt/contentRecord';
import { extendSpoolWitness } from '../../src/crdt/spoolRecord';
import { captureRoute } from '../../src/crdt/sourceCapture';
import { heldInboundContext, inspectInbound } from '../../src/crdt/inboundLedger';
import { storageUpgradeKey } from '../../src/crdt/storageCompatibility';
/** Disposable fixture only: sign authored remote frames with the actual admitted synthetic member. */
export async function fixtureInboundEnvelope(
  slot: string,
  code: string,
  position: number,
  updates: number[][],
) {
  return withPromotionSlot(slot, code, async (task) => {
    const v = await readPromotion(task, slot, code);
    return withPromotionRoot(task, v.claim, v.record, code, async (root, subtle) => {
      const scope = claimScope(v.claim),
        kg = await openEnvelope(scope, root, v.record.envelope!, subtle);
      try {
        const signer = await openCredential(scope, root, v.marker!.credentials![1], subtle);
        return [
          ...(await sealNetworkEnvelope(
            {
              v: 2,
              workspace_id: scope.workspaceId,
              credential_id: v.marker!.credentialIds[1],
              epoch: 1,
              gen: 1,
              seq: position,
            },
            {
              actor_id: scope.principalId,
              actor_kind: 'human',
              updates: updates.map((b) => new Uint8Array(b)),
            },
            kg,
            signer,
            random(12),
            subtle,
          )),
        ];
      } finally {
        kg.fill(0);
      }
    });
  });
}
export async function inboundCensus(
  slot: string,
  code: string,
  fault?: 'event' | 'last-event' | 'content' | 'ciphertext',
) {
  return withPromotionSlot(slot, code, async (task) => {
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
        const result = rows.map((r) => ({ ...r, bytes: [...r.bytes] }));
        if (fault) {
          const event = (fault === 'last-event' ? [...rows].reverse() : rows).find(
            (r) =>
              r.kind === 'heads' &&
              new TextDecoder().decode(r.bytes).startsWith('["done/account-inbound/v1"'),
          );
          if (!event) throw Error('Missing fixture event');
          const target =
            fault === 'content'
              ? rows.find((r) => r.kind === 'update' && r.seq === event.seq - 1)
              : event;
          if (!target) throw Error('Missing fixture content');
          const name = await deriveStoreName(scope.principalId, scope.workspaceId);
          const actual = await new Promise<IDBDatabase>((resolve, reject) => {
            const q = indexedDB.open(name);
            q.onerror = () => reject(q.error);
            q.onsuccess = () => resolve(q.result);
          });
          try {
            await new Promise<void>((resolve, reject) => {
              const store = target.kind === 'heads' ? 'heads' : 'content',
                tx = actual.transaction(store, 'readwrite'),
                s = tx.objectStore(store);
              if (fault === 'ciphertext') {
                const q = s.get(target.seq);
                q.onsuccess = () => {
                  const r = q.result;
                  r.ct[0] ^= 1;
                  s.put(r, target.seq);
                };
              } else s.delete(target.seq);
              tx.oncomplete = () => resolve();
              tx.onabort = () => reject(tx.error);
            });
          } finally {
            actual.close();
          }
        }
        return result;
      } finally {
        for (const r of rows) r.bytes.fill(0);
      }
    } finally {
      owner.dispose();
    }
  });
}

/** Deliberately reauthenticate corrupted local evidence in a disposable fixture. This models a carrier
 * whose native AEAD and completeness witness are valid while the retained service proof is not. */
export async function rewriteInboundEvidence(
  slot: string,
  code: string,
  mode: 'page' | 'baseline',
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
        await withPromotionRoot(task, v.claim, v.record, code, async (root, subtle) => {
          const kg = await openEnvelope(scope, root, v.record.envelope!, subtle);
          try {
            const row = rows.find(
              (r) =>
                r.kind === 'heads' &&
                new TextDecoder().decode(r.bytes).startsWith('["done/account-inbound/v1"'),
            )!;
            const event = JSON.parse(new TextDecoder().decode(row.bytes));
            if (mode === 'baseline') event[2] = 'ab'.repeat(32);
            else {
              const page = JSON.parse(
                new TextDecoder().decode(
                  Uint8Array.from(event[12].match(/../g), (x: string) => parseInt(x, 16)),
                ),
              );
              page[6] = '00'.repeat(64);
              event[12] = hex(new TextEncoder().encode(JSON.stringify(page)));
            }
            row.bytes.fill(0);
            row.bytes = new TextEncoder().encode(JSON.stringify(event));
            const base = await heldInboundContext(v.marker!, kg, subtle),
              census = inspectInbound(rows, captureRoute(v.marker!), base);
            let witness = emptySpoolWitness();
            for (const b of census.delivery.spool.events)
              witness = await extendSpoolWitness(witness, b, subtle);
            const key = await hkdf(
              kg,
              new Uint8Array(),
              fields('done/store/v1', scope.workspaceId, v.record.store_id),
              { name: 'AES-GCM', length: 256 },
              ['encrypt'],
              subtle,
            );
            const metadata = await hkdf(
              kg,
              new Uint8Array(),
              fields(
                'done/content-metadata/v1',
                scope.slotId,
                scope.principalId,
                scope.workspaceId,
                v.record.store_id,
              ),
              { name: 'HMAC', hash: 'SHA-256', length: 256 },
              ['sign'],
              subtle,
            );
            const header = { v: 1 as const, seq: row.seq, gen: row.gen, kind: row.kind },
              nonce = random(12);
            const ct = new Uint8Array(
              await subtle.encrypt(
                {
                  name: 'AES-GCM',
                  iv: nonce,
                  additionalData: recordAAD({ ...scope, storeId: v.record.store_id }, header),
                },
                key,
                row.bytes,
              ),
            );
            const name = await deriveStoreName(scope.principalId, scope.workspaceId),
              db = await new Promise<IDBDatabase>((resolve, reject) => {
                const q = indexedDB.open(name);
                q.onsuccess = () => resolve(q.result);
                q.onerror = () => reject(q.error);
              });
            try {
              const counter = await new Promise<any>((resolve, reject) => {
                const q = db.transaction('meta').objectStore('meta').get('counter');
                q.onsuccess = () => resolve(q.result);
                q.onerror = () => reject(q.error);
              });
              counter.spool = witness;
              counter.mac = new Uint8Array(
                await subtle.sign(
                  'HMAC',
                  metadata,
                  counterPayload(
                    { ...scope, storeId: v.record.store_id, rootId: v.record.root_id },
                    counter,
                  ),
                ),
              );
              await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(['meta', 'heads'], 'readwrite');
                tx.objectStore('meta').put(counter, 'counter');
                tx.objectStore('heads').put({ ...header, nonce, ct }, row.seq);
                tx.oncomplete = () => resolve();
                tx.onabort = () => reject(tx.error);
              });
            } finally {
              db.close();
            }
          } finally {
            kg.fill(0);
          }
        });
      } finally {
        for (const r of rows) r.bytes.fill(0);
      }
    } finally {
      owner.dispose();
    }
  });
}

let savedFence: unknown;
/** Out-of-protocol test mutation, deliberately outside the held lifetime permit. */
export async function changeReceiveFence(slot: string, restore = false) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const q = indexedDB.open('done.custody');
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('entries', 'readwrite'),
        s = tx.objectStore('entries'),
        key = storageUpgradeKey(slot),
        q = s.get(key);
      q.onsuccess = () => {
        if (restore) s.put(savedFence, key);
        else {
          savedFence = structuredClone(q.result);
          const v = q.result;
          v.mac[0] ^= 1;
          s.put(v, key);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
