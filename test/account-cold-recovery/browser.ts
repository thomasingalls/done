export * from '../account-receive/browser';
import { withRecoveryUnderPermit, prepareAccountCustody } from '../../src/crdt/custody';
import { withPromotionSlot } from '../../src/crdt/writeSession';
import { readPromotion, withPromotionRoot } from '../../src/crdt/promotionRecord';
import { claimScope } from '../../src/crdt/localGenesisRecord';
import { deriveStoreName } from '../../src/crdt/storeName';
import {
  counterPayload,
  recordAAD,
  recordStore,
  type OpenedRecord,
} from '../../src/crdt/contentRecord';
import { fields, hkdf, openEnvelope, random, hex } from '../../src/crdt/custodyCrypto';
import { captureRoute, makeSourceCapsule } from '../../src/crdt/sourceCapture';
import * as Y from 'yjs';

type Fault =
  | 'none'
  | 'missing'
  | 'ciphertext'
  | 'row'
  | 'counter'
  | 'counter-mac'
  | 'journal'
  | 'fail'
  | 'cancel';
const open = (name: string) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
const raw = <T>(
  db: IDBDatabase,
  store: string,
  change: (store: IDBObjectStore, done: (v: T) => void) => void,
) =>
  new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    let result: T;
    change(tx.objectStore(store), (v) => {
      result = v;
    });
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error);
  });

/** Disposable fixture: change the real carrier after the first validation, before recovery's load. */
export async function recoveryBoundary(slot: string, code: string, fault: Fault, reuse = true) {
  const controller = new AbortController(),
    observed: Uint8Array[] = [];
  let validations = 0,
    delivered = false,
    journal = 0,
    error = '',
    expected = '',
    firstCounter = 0,
    finalCounter = 0;
  try {
    await withPromotionSlot(
      slot,
      code,
      async (task) => {
        const v = await readPromotion(task, slot, code),
          scope = claimScope(v.claim),
          authority = { ...scope, resolvePrincipal: () => scope.principalId };
        await withRecoveryUnderPermit(
          task,
          authority,
          code,
          async (recovery) => {
            delivered = true;
            journal = recovery.journal.length;
            observed.push(
              ...recovery.records.map((r) => r.bytes),
              ...recovery.journal.map((r) => r.bytes),
            );
          },
          {
            allowSpoolCounter: true,
            ...(reuse ? { reuseOpened: true as const } : {}),
            validate: async (rows, _task, counter) => {
              validations++;
              observed.push(...rows.map((r) => r.bytes));
              const fingerprint = JSON.stringify(
                rows.map((r) => [r.kind, r.gen, r.seq, hex(r.bytes)]),
              );
              if (validations > 1 && fingerprint !== expected)
                throw Error('Semantic snapshot changed');
              finalCounter = counter.next_seq;
              if (validations !== 1) return;
              expected = fingerprint;
              firstCounter = counter.next_seq;
              if (fault === 'fail') throw Error('Validation refused');
              if (fault === 'cancel') {
                controller.abort();
                // Finish validation after cancellation; successful completion cannot revive recovery.
                await Promise.resolve();
                return;
              }
              if (fault === 'journal') {
                const writer = prepareAccountCustody(authority, code, undefined, true),
                  doc = new Y.Doc();
                try {
                  await writer.initialize(task);
                  doc.getText('recovery-boundary').insert(0, 'late journal source');
                  const bytes = makeSourceCapsule(captureRoute(v.marker!), [
                    {
                      actor: scope.principalId,
                      kind: 'human',
                      bytes: new Uint8Array(Y.encodeStateAsUpdate(doc)),
                    },
                  ]);
                  try {
                    if (writer.journal.append(bytes).status !== 'journalled')
                      throw Error('Fixture journal refused');
                  } finally {
                    bytes.fill(0);
                  }
                } finally {
                  writer.dispose();
                  doc.destroy();
                }
                return;
              }
              if (fault === 'none') return;
              const db = await open(await deriveStoreName(scope.principalId, scope.workspaceId));
              try {
                if (fault === 'missing') {
                  const target = rows[0]!;
                  await raw(db, recordStore(target.kind), (store) => {
                    store.delete(target.seq);
                  });
                } else if (fault === 'ciphertext' || fault === 'counter-mac') {
                  const store = fault === 'ciphertext' ? recordStore(rows[0]!.kind) : 'meta',
                    key = fault === 'ciphertext' ? rows[0]!.seq : 'counter';
                  await raw(db, store, (s) => {
                    const r = s.get(key);
                    r.onsuccess = () => {
                      const value = r.result;
                      if (fault === 'ciphertext') value.ct[0] ^= 1;
                      else value.mac[0] ^= 1;
                      s.put(value, key);
                    };
                  });
                } else {
                  await withPromotionRoot(task, v.claim, v.record, code, async (root, subtle) => {
                    const kg = await openEnvelope(scope, root, v.record.envelope!, subtle);
                    try {
                      if (fault === 'counter') {
                        const next = structuredClone(counter);
                        next.next_seq++;
                        next.reserved[String(next.active_gen)]!++;
                        const key = await hkdf(
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
                        next.mac = new Uint8Array(
                          await subtle.sign(
                            'HMAC',
                            key,
                            counterPayload(
                              { ...scope, storeId: v.record.store_id, rootId: v.record.root_id },
                              next,
                            ),
                          ),
                        );
                        await raw(db, 'meta', (s) => {
                          s.put(next, 'counter');
                        });
                      } else {
                        const target: OpenedRecord = rows[0]!,
                          key = await hkdf(
                            kg,
                            new Uint8Array(),
                            fields('done/store/v1', scope.workspaceId, v.record.store_id),
                            { name: 'AES-GCM', length: 256 },
                            ['encrypt'],
                            subtle,
                          ),
                          header = {
                            v: 1 as const,
                            kind: target.kind,
                            gen: target.gen,
                            seq: target.seq,
                          },
                          nonce = random(12),
                          bytes = target.bytes.slice();
                        try {
                          bytes[0] = bytes[0]! ^ 1;
                          const ct = new Uint8Array(
                            await subtle.encrypt(
                              {
                                name: 'AES-GCM',
                                iv: nonce,
                                additionalData: recordAAD(
                                  { ...scope, storeId: v.record.store_id },
                                  header,
                                ),
                              },
                              key,
                              bytes,
                            ),
                          );
                          await raw(db, recordStore(target.kind), (s) => {
                            s.put({ ...header, nonce, ct }, target.seq);
                          });
                        } finally {
                          bytes.fill(0);
                        }
                      }
                    } finally {
                      kg.fill(0);
                    }
                  });
                }
              } finally {
                db.close();
              }
            },
          },
        );
      },
      controller.signal,
    );
  } catch (e) {
    error = String(e);
  }
  return {
    validations,
    delivered,
    journal,
    error,
    firstCounter,
    finalCounter,
    erased: observed.length > 0 && observed.every((b) => b.every((x) => x === 0)),
  };
}
