export * from '../account-sync/browser';
export { openOwnedAccountSendingWorkspace } from '../../src/crdt/accountSpool';
import { withPromotionSlot } from '../../src/crdt/writeSession';
import { readPromotion, withPromotionRoot } from '../../src/crdt/promotionRecord';
import { claimScope } from '../../src/crdt/localGenesisRecord';
import { openCredential, openEnvelope, random } from '../../src/crdt/custodyCrypto';
import { prepareAccountCustody } from '../../src/crdt/custody';
import { deriveStoreName } from '../../src/crdt/storeName';
import {
  decodeNetworkEnvelope,
  encodeNetworkEnvelope,
  envelopeSignatureMessage,
  sealNetworkEnvelope,
} from '../../account-protocol/envelope';
import { decodeSubmission, signSubmission } from '../../account-protocol/submission';
import { decodePositionResponse } from '../../account-protocol/positionDecision';

/** Deliberately faulty/branched synthetic device. No service key or decision is manufactured here. */
export async function authorCompetingRequest(
  slot: string,
  code: string,
  original: number[],
  kind: 'closed' | 'conflict',
  snapshot: number[],
  parentBytes?: number[],
) {
  return withPromotionSlot(slot, code, async (task) => {
    const v = await readPromotion(task, slot, code);
    return withPromotionRoot(task, v.claim, v.record, code, async (root, subtle) => {
      const scope = claimScope(v.claim),
        signer = await openCredential(scope, root, v.marker!.credentials![1], subtle),
        s = decodeSubmission(new Uint8Array(original)),
        e = decodeNetworkEnvelope(s.envelope);
      let envelope: Uint8Array<ArrayBuffer>;
      if (kind === 'closed') {
        e.gen = 2;
        e.sig = new Uint8Array(
          await subtle.sign('Ed25519', signer, envelopeSignatureMessage(e, e.nonce, e.digest)),
        );
        envelope = encodeNetworkEnvelope(e);
      } else {
        const kg = await openEnvelope(scope, root, v.record.envelope!, subtle);
        try {
          envelope = await sealNetworkEnvelope(
            { ...e, v: 2 },
            {
              actor_id: scope.principalId,
              actor_kind: 'human',
              updates: [new Uint8Array(snapshot)],
            },
            kg,
            signer,
            random(12),
            subtle,
          );
        } finally {
          kg.fill(0);
        }
      }
      const parsedParent = parentBytes ? decodePositionResponse(new Uint8Array(parentBytes)) : null;
      if (parsedParent && parsedParent.kind !== 'refused') throw Error('Expected issued refusal');
      return [
        ...(await signSubmission(
          { lineage: s.lineage, envelope, parent: parsedParent?.refusal ?? null },
          signer,
          subtle,
        )),
      ];
    });
  });
}

/** Read-only logical ledger and authenticated counter. Call only after closing the editor owner. */
export async function compositionCensus(slot: string, code: string) {
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
        const witness = await owner.carrier.spoolWitness(task),
          name = await deriveStoreName(scope.principalId, scope.workspaceId),
          db = await new Promise<IDBDatabase>((resolve, reject) => {
            const r = indexedDB.open(name);
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
          });
        try {
          const counter = await new Promise<unknown>((resolve, reject) => {
            const tx = db.transaction('meta'),
              q = tx.objectStore('meta').get('counter');
            tx.oncomplete = () => resolve(q.result);
            tx.onabort = () => reject(tx.error);
          });
          return JSON.parse(
            JSON.stringify(
              {
                rows: rows.map((r) => ({ ...r, bytes: [...r.bytes] })),
                witness,
                counter,
              },
              (_key, value) => (value instanceof Uint8Array ? [...value] : value),
            ),
          );
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
