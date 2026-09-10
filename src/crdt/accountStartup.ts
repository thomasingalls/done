/** Private Account classification. No writer, network token or retained plaintext escapes this permit. */
import { parseAuthorityPin, pinBytes, type AuthorityPin } from '../../account-protocol/authority';
import { verifyReceipt, same } from '../../account-protocol/admission';
import { verifyBindingProof } from '../../account-protocol/slot';
import { checkpointAAD, generationInfo } from '../../account-protocol/genesis';
import { unhex } from '../../account-protocol/recovery';
import { withPromotionSlot } from './writeSession';
import { readPromotion, withPromotionRoot } from './promotionRecord';
import { localCensus, localRoute } from './localGenesisStorage';
import { claimScope } from './localGenesisRecord';
import { withRecoveryUnderPermit } from './custody';
import { replayRecovery } from './admissionDocument';
import { openCredential, openEnvelope, hkdf, fields, hex } from './custodyCrypto';
import { openGeneration } from '../account/generationWrap';
import { Y, genesisCoverageParts, sameDocState, genesisCoverage } from './yjs';
import { requireAccountAccess, type LocalPasskey } from './accountAccess';
import { handoffResult, type HandoffReceipt } from './promotionHandoff';
import type { Slot } from './slotIndex';
export interface AccountStartupOptions {
  slotId: string;
  code: string;
  pin: AuthorityPin;
  assertPasskey: LocalPasskey;
  signal?: AbortSignal;
}
export async function classifyAccountStartup(
  input: AccountStartupOptions,
): Promise<Omit<HandoffReceipt, 'kind'> & { kind: 'account' }> {
  const options = { ...input, pin: parseAuthorityPin(input.pin) };
  return withPromotionSlot(
    options.slotId,
    options.code,
    async (task) => {
      const { claim, record, marker } = await readPromotion(task, options.slotId, options.code);
      if (marker?.v !== 4 || marker.stage !== 'handoff-selected')
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
      if (!same(marker.handoff!.destination, destination))
        throw Error('Account destination changed');
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
                    !sameDocState(doc, checkpoint) ||
                    hex(genesisCoverage(doc)) !== candidate.coverage.snapshot
                  )
                    throw Error('Account checkpoint differs from retained source');
                  const parts = genesisCoverageParts(doc);
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
      return Object.freeze({ ...handoffResult(destination), kind: 'account' as const });
    },
    options.signal,
  );
}
