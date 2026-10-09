export * from '../account-admission/browser';
import { Y } from '../../src/crdt/yjs';
import { registerWorkspaceActor } from '../../src/crdt/actors';
import { openTree } from '../../src/crdt/doc';
import { openJournalSession } from '../../src/crdt/custody';
import type { CustodyScope } from '../../src/crdt/custodyRecord';
import { withPromotionSlot } from '../../src/crdt/writeSession';
import {
  readPromotion,
  withPromotionRoot,
  signPromotion,
  writePromotion,
} from '../../src/crdt/promotionRecord';
import { openCredential, hex } from '../../src/crdt/custodyCrypto';
import { claimScope } from '../../src/crdt/localGenesisRecord';
import {
  completionBodies,
  manifestMessage,
  semanticMessage,
  parseCompletion,
} from '../../account-protocol/admission';
export async function seedHistory(scope: CustodyScope, code: string, update: number[]) {
  const session = await openJournalSession(
    { ...scope, resolvePrincipal: () => scope.principalId },
    code,
  );
  const doc = new Y.Doc({ gc: false });
  try {
    Y.applyUpdate(doc, new Uint8Array(update));
    const actor = registerWorkspaceActor(doc, {
      id: scope.principalId,
      actor: { kind: 'human', name: 'Fixture', color: '#123456' },
      device: { id: 'test-device', name: 'fixture' },
    });
    openTree(doc, actor.origin);
    await session.appendBatch([
      { kind: 'update', bytes: new Uint8Array(Y.encodeStateAsUpdate(doc)) },
    ]);
  } finally {
    doc.destroy();
    await session.close();
  }
}
export async function readRetained(slotId: string, code: string) {
  return withPromotionSlot(
    slotId,
    code,
    async (task) => (await readPromotion(task, slotId, code)).marker?.stage,
  );
}
// A valid root MAC and certified signatures isolate client semantic checking from authentication.
export async function forgeOffered(slotId: string, code: string, kind: 'sv' | 'ds') {
  return withPromotionSlot(slotId, code, async (task) => {
    const { claim, record, marker } = await readPromotion(task, slotId, code);
    if (marker?.stage !== 'admission-offered') throw Error('Expected retained offer');
    await withPromotionRoot(task, claim, record, code, async (root, subtle) => {
      const retained = marker.admission!;
      const original = retained.completion!.manifest;
      const parts = { sv: original.sv, ds: original.ds };
      parts[kind] = '0100';
      const c = await completionBodies(retained.request, retained.offer!, parts);
      const signer = await openCredential(claimScope(claim), root, marker.credentials![1], subtle);
      const sign = async (b: Uint8Array<ArrayBuffer>) =>
        hex(new Uint8Array(await subtle.sign('Ed25519', signer, b)));
      c.manifest.signature = await sign(await manifestMessage(c.manifest));
      c.admission.signature = await sign(await semanticMessage(c.admission));
      const next = await signPromotion(
        root,
        { ...marker, admission: { ...retained, completion: c } },
        subtle,
      );
      await writePromotion(task, claim, record, record, marker, next);
    });
  });
}
export { parseCompletion };
export { verifyCompletion } from '../../account-protocol/admission';
