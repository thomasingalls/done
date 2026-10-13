/** Synthetic history construction only. All measured operations use the real owner. */
import { withPromotionSlot } from '../../../../src/crdt/writeSession';
import { readPromotion, withPromotionRoot } from '../../../../src/crdt/promotionRecord';
import { claimScope } from '../../../../src/crdt/localGenesisRecord';
import { openEnvelope, openCredential, random } from '../../../../src/crdt/custodyCrypto';
import { sealNetworkEnvelope } from '../../../../account-protocol/envelope';
import { Y } from '../../../../src/crdt/yjs';
import { newCard, registerCard, ensureDay, collectionOf } from '../../../../src/crdt/days';
export async function envelopes(slot: string, code: string, snapshot: number[], count: number) {
  const doc = new Y.Doc({ gc: false });
  Y.applyUpdate(doc, new Uint8Array(snapshot));
  doc.clientID = 811301;
  let update = new Uint8Array();
  doc.on('update', (b) => { update = b; });
  doc.transact(() => {
    const day = ensureDay(doc, undefined, '2026-09-10');
    for (let n = 0; n < 118; n++) {
      const id = 'depth-card-' + n;
      registerCard(doc, id, newCard(('Project '+n+': Review the notes and follow up. ').repeat(10), 'system', {
        id, origin: 'master', createdAt: '2026-09-10T00:00:00Z',
      }), { date: '2026-09-10', section: 'next' });
      collectionOf(day, 'next')!.push([id]);
    }
    doc.getText('master').insert(0, '# Goals\n\n' + 'Review project notes and plan the next steps.\n'.repeat(273));
  });
  const workspace = update.slice();
  doc.getText('master').insert(0, 'r');
  const covered = update.slice();
  doc.destroy();
  return withPromotionSlot(slot, code, async task => {
    const v = await readPromotion(task, slot, code);
    return withPromotionRoot(task, v.claim, v.record, code, async (root, subtle) => {
      const scope = claimScope(v.claim), kg = await openEnvelope(scope, root, v.record.envelope!, subtle);
      try {
        const signer = await openCredential(scope, root, v.marker!.credentials![1], subtle);
        const wires: number[][] = [];
        for (let position = 1; position <= count; position++) wires.push([...(await sealNetworkEnvelope({
          v: 2, workspace_id: scope.workspaceId, credential_id: v.marker!.credentialIds[1]!,
          epoch: 1, gen: 1, seq: position,
        }, { actor_id: scope.principalId, actor_kind: 'human', updates: position === 1 ? [workspace, covered] : [covered] }, kg, signer, random(12), subtle))]);
        return wires;
      } finally { kg.fill(0); }
    });
  });
}
