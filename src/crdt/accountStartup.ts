/** Private Account classification. No writer, network token or retained plaintext escapes this permit. */
import { parseAuthorityPin, pinBytes, type AuthorityPin } from '../../account-protocol/authority';
import { verifyReceipt, same } from '../../account-protocol/admission';
import { verifyBindingProof } from '../../account-protocol/slot';
import { checkpointAAD, generationInfo } from '../../account-protocol/genesis';
import { unhex } from '../../account-protocol/recovery';
import { withPromotionSlot, type SessionTask } from './writeSession';
import { readPromotion, withPromotionRoot } from './promotionRecord';
import { localCensus, localRoute } from './localGenesisStorage';
import { claimScope } from './localGenesisRecord';
import { withRecoveryUnderPermit } from './custody';
import { replayRecovery } from './admissionDocument';
import { openCredential, openEnvelope, hkdf, fields, hex } from './custodyCrypto';
import { openGeneration } from '../account/generationWrap';
import { Y, genesisCoverageParts, sameDocState, genesisCoverage, coversGenesis } from './yjs';
import { requireAccountAccess, type LocalPasskey } from './accountAccess';
import { handoffResult } from './promotionHandoff';
import type { Slot } from './slotIndex';
export interface AccountStartupOptions {
  slotId: string;
  code: string;
  pin: AuthorityPin;
  assertPasskey: LocalPasskey;
  signal?: AbortSignal;
}
export const captureAccountOptions = (input: AccountStartupOptions): AccountStartupOptions => ({
  ...input,
  pin: parseAuthorityPin(input.pin),
});
/** Internal verification under the actual lifetime; no raw key or plaintext survives this call. */
export async function verifyAccountUnderPermit(task: SessionTask, options: AccountStartupOptions) {
  const { claim, record, marker } = await readPromotion(task, options.slotId, options.code);
  if (
    !marker ||
    !(
      (marker.v === 4 && marker.stage === 'handoff-selected') ||
      (marker.v === 5 && marker.stage === 'account-active')
    )
  )
    throw Error('Account handoff needs resumption');
  if (hex(pinBytes(marker.pin)) !== hex(pinBytes(options.pin)))
    throw Error('Account authority pin changed');
  const scope = claimScope(claim),
    request = marker.admission!.request;
  if (!same(request.candidate, marker.genesis)) throw Error('Account candidate changed');
  const receipt = await task.wait(() =>
    verifyReceipt(marker.admission!.receipt, request, options.pin),
  );
  const proof = await task.wait(() =>
    verifyBindingProof(marker.handoff!.binding, request, receipt, options.pin),
  );
  const local = await localRoute(task, claim);
  const destination: Slot = {
    id: local.id,
    status: 'active',
    unlockBinding: proof.stored,
    account: {
      v: 1,
      promotionId: marker.id,
      requestDigest: receipt.offer.epoch.requestDigest,
      epochHead: receipt.offer.head,
    },
    stores: local.stores,
  };
  if (!same(marker.handoff!.destination, destination)) throw Error('Account destination changed');
  await localCensus(task, claim, options.code);
  await requireAccountAccess(task, proof, options.pin, options.assertPasskey);
  const current = await readPromotion(task, options.slotId, options.code);
  if (!same(current.marker, marker)) throw Error('Account owner changed during assertion');
  const census = await localCensus(task, claim, options.code);
  if (!same(census.slot, destination)) throw Error('Account index missing or changed');
  await withPromotionRoot(task, claim, record, options.code, async (root, subtle) => {
    const device = await openCredential(scope, root, marker.credentials![0], subtle);
    const key = await openEnvelope(scope, root, record.envelope!, subtle);
    try {
      const candidate = request.candidate,
        wrap = candidate.wraps[0]!;
      if (
        wrap.id !== marker.credentialIds[0] ||
        wrap.publicKey !== hex(marker.credentials![0].publicKey) ||
        candidate.signer !== marker.credentialIds[1] ||
        request.certification.members[0].sPub !== hex(marker.credentials![1].publicKey)
      )
        throw Error('Account recipient differs from custody');
      const opened = await openGeneration(
        wrap,
        device,
        unhex(wrap.publicKey, 32),
        generationInfo(candidate),
        subtle,
      );
      try {
        if (hex(opened) !== hex(key)) throw Error('Account generation wrap changed');
      } finally {
        opened.fill(0);
      }
      const cp = candidate.checkpoint;
      const cpKey = await hkdf(
        key,
        unhex(cp.salt, 16),
        fields('done/checkpoint/v1', scope.workspaceId),
        { name: 'AES-GCM', length: 256 },
        ['decrypt'],
        subtle,
      );
      const plaintext = new Uint8Array(
        await subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: unhex(cp.nonce, 12),
            additionalData: checkpointAAD(candidate),
          },
          cpKey,
          unhex(cp.ct, cp.ct.length / 2),
        ),
      );
      try {
        await withRecoveryUnderPermit(
          task,
          { ...scope, resolvePrincipal: () => scope.principalId },
          options.code,
          async (recovered) => {
            const doc = new Y.Doc({ gc: false }),
              checkpoint = new Y.Doc({ gc: false });
            try {
              replayRecovery(doc, recovered);
              Y.applyUpdate(checkpoint, plaintext);
              if (
                hex(genesisCoverage(checkpoint)) !== candidate.coverage.snapshot ||
                (marker.v === 4 ? !sameDocState(doc, checkpoint) : !coversGenesis(doc, checkpoint))
              )
                throw Error('Account checkpoint differs from retained source');
              const parts = genesisCoverageParts(checkpoint);
              await task.wait(() =>
                verifyReceipt(receipt, request, options.pin, {
                  sv: hex(parts.sv),
                  ds: hex(parts.ds),
                }),
              );
            } finally {
              doc.destroy();
              checkpoint.destroy();
            }
          },
        );
      } finally {
        plaintext.fill(0);
      }
    } finally {
      key.fill(0);
    }
  });
  return {
    claim,
    record,
    marker,
    account: Object.freeze({ ...handoffResult(destination), kind: 'account' as const }),
  };
}
export async function classifyAccountStartup(input: AccountStartupOptions) {
  const options = captureAccountOptions(input);
  return withPromotionSlot(
    options.slotId,
    options.code,
    async (task) => (await verifyAccountUnderPermit(task, options)).account,
    options.signal,
  );
}
