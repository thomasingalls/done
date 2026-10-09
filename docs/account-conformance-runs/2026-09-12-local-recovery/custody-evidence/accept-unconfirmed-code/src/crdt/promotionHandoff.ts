/** Private index handoff. Both the retained provenance and encrypted content stay in place. */
import { parseBindingProof, verifyBindingProof } from '../../account-protocol/slot';
import { verifyReceipt, same } from '../../account-protocol/admission';
import {
  ownGenesisOptions,
  withVerifiedGenesis,
  type PrepareGenesisOptions,
} from './promotionGenesis';
import { withPromotionSlot, type SessionTask } from './writeSession';
import { signPromotion, writePromotion, readPromotion } from './promotionRecord';
import { localRoute, readLocalSlot } from './localGenesisStorage';
import { probeDatabase, checkLayout } from './startupStorage';
import { contentTransaction } from './contentDatabase';
import { parseSlot } from './startupClassification';
import { requireAccountAccess, type LocalPasskey } from './accountAccess';
import type { Slot } from './slotIndex';
import type { HandoffState } from './handoffRecord';
export interface HandoffOptions extends PrepareGenesisOptions {
  bindingTransport(input: { retryKey: string; requestDigest: string }): Promise<unknown>;
  assertPasskey: LocalPasskey;
}
export interface HandoffReceipt {
  kind: 'account-selected';
  slotId: string;
  accountId: string;
  principalId: string;
  workspaceId: string;
  dbName: string;
  epochHead: string;
}
export const handoffResult = (destination: Slot): HandoffReceipt =>
  Object.freeze({
    kind: 'account-selected',
    slotId: destination.id,
    accountId: destination.unlockBinding!.binding.accountId,
    principalId: destination.stores[0]!.principal,
    workspaceId: destination.stores[0]!.workspace,
    dbName: destination.stores[0]!.dbName,
    epochHead: destination.account!.epochHead,
  });
async function selectIndex(task: SessionTask, local: Slot, destination: Slot) {
  const found = await probeDatabase(task, 'done.slots', async (db) => {
    checkLayout(db, { slots: 'id' });
    await contentTransaction<void>(
      db,
      task,
      ['slots'],
      'readwrite',
      (tx, _result, guard) => {
        const store = tx.objectStore('slots'),
          req = store.get(local.id);
        req.onsuccess = () =>
          guard(() => {
            const current = parseSlot(req.result, local.id);
            if (same(current, destination)) return;
            if (!same(current, local)) throw Error('Handoff index compare changed');
            store.put(destination);
          });
      },
      'strict',
    );
    return true;
  });
  if (!found) throw Error('Handoff index missing');
}
export async function finishPromotionHandoff(input: HandoffOptions): Promise<HandoffReceipt> {
  const options = {
    ...ownGenesisOptions(input),
    bindingTransport: input.bindingTransport,
    assertPasskey: input.assertPasskey,
  };
  return withPromotionSlot(
    options.slotId,
    options.code,
    (task) =>
      withVerifiedGenesis(
        task,
        options,
        async (verified) => {
          const { claim, record, root, subtle, parts } = verified;
          let marker = verified.marker;
          const request = marker.admission!.request;
          const receipt = await task.wait(() =>
            verifyReceipt(marker.admission!.receipt, request, options.pin, parts),
          );
          const proof = await task.wait(() =>
            marker.v === 4
              ? Promise.resolve(parseBindingProof(marker.handoff!.binding))
              : options.bindingTransport({
                  retryKey: options.retryKey,
                  requestDigest: receipt.offer.epoch.requestDigest,
                }),
          );
          const binding = await task.wait(() =>
            verifyBindingProof(proof, request, receipt, options.pin),
          );
          await requireAccountAccess(task, binding, options.pin, options.assertPasskey);
          const local = await localRoute(task, claim);
          const destination: Slot = {
            id: local.id,
            status: 'active',
            unlockBinding: binding.stored,
            account: {
              v: 1,
              promotionId: marker.id,
              requestDigest: receipt.offer.epoch.requestDigest,
              epochHead: receipt.offer.head,
            },
            stores: local.stores,
          };
          const handoff: HandoffState = { binding, destination };
          if (marker.v === 4 && !same(marker.handoff, handoff))
            throw Error('Retained handoff changed');
          // Reauthenticate after the browser ceremony; no callback may substitute progress or identity.
          const current = await readPromotion(task, options.slotId, options.code);
          if (!current.marker || !same(current.marker, marker))
            throw Error('Handoff owner changed');
          if (marker.stage === 'handoff-selected') {
            if (!same(await readLocalSlot(task, local.id), destination))
              throw Error('Selected handoff index changed');
            return handoffResult(destination);
          }
          if (marker.v === 3) {
            const next = await signPromotion(
              root,
              { ...marker, v: 4, stage: 'handoff-prepared', handoff },
              subtle,
            );
            await writePromotion(task, claim, record, record, marker, next);
            marker = next;
          }
          await selectIndex(task, local, destination);
          const next = await signPromotion(root, { ...marker, stage: 'handoff-selected' }, subtle);
          await writePromotion(task, claim, record, record, marker, next);
          return handoffResult(destination);
        },
        async (marker) => {
          if (
            marker.v > 4 ||
            marker.v < 3 ||
            (marker.v === 3 && marker.stage !== 'admission-receipted')
          )
            throw Error('Handoff requires retained admission receipt');
        },
      ),
    options.signal,
  );
}
