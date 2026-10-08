import type { NetworkLogin } from '../account/networkLogin';
import { heldCaptureRoute, verifyInstalledSuccessor } from './accountSuccessor';
import { openContentCheckpoint } from './contentCheckpoint';
import { heldInboundContext, inspectInbound, verifyInboundLedger } from './inboundLedger';
/** Private Account classification. No writer, network token or retained plaintext escapes this permit. */
import { inspectDelivery, verifyDelivery } from './deliveryRecord';
import { inspectSpool, verifySpool, verifySpoolWitness } from './spoolRecord';
import { capturedRecovery } from './sourceCapture';
import { parseAuthorityPin, pinBytes, type AuthorityPin } from '../../account-protocol/authority';
import { verifyReceipt, same } from '../../account-protocol/admission';
import { verifyBindingProof } from '../../account-protocol/slot';
import { openActiveRotation } from './rotationKeys';
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
  /** Staged session adapter; absent in the private-token host until route cutover. */
  networkLogin?: NetworkLogin;
  /** Private continuation host capability; retained continuation custody also enables discovery. */
  membershipContinuation?: boolean | (() => boolean);
}
export const captureAccountOptions = (input: AccountStartupOptions): AccountStartupOptions => ({
  ...input,
  pin: parseAuthorityPin(input.pin),
});
/** Internal verification under the actual lifetime; no raw key or plaintext survives this call. */
export async function verifyAccountUnderPermit(
  task: SessionTask,
  options: AccountStartupOptions,
  maxVersion = 8,
) {
  const detached = await (
    await import('./rotationObservation')
  ).resumeAccountRotation(task, 'promotion', options.slotId, options.code);
  const { claim, record, marker } = await readPromotion(task, options.slotId, options.code);
  if (
    !marker ||
    marker.v > maxVersion ||
    !(
      (marker.v === 4 && marker.stage === 'handoff-selected') ||
      (marker.v === 5 && marker.stage === 'account-active') ||
      (marker.v === 6 && marker.stage === 'account-capturing') ||
      (marker.v === 7 && marker.stage === 'account-spooling') ||
      (marker.v === 8 && marker.stage === 'account-delivering') ||
      (marker.v === 9 && marker.stage === 'account-receiving')
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
  if (options.networkLogin && !detached) {
    await withPromotionRoot(task, claim, record, options.code, (root) =>
      options.networkLogin!.initialize(task, root, record.root_id, proof),
    );
    await options.networkLogin.unlock(task, proof, options.assertPasskey);
  } else await requireAccountAccess(task, proof, options.pin, options.assertPasskey);
  const current = await readPromotion(task, options.slotId, options.code);
  if (!same(current.marker, marker)) throw Error('Account owner changed during assertion');
  const census = await localCensus(task, claim, options.code);
  if (!same(census.slot, destination)) throw Error('Account index missing or changed');
  const route = await task.wait(() => heldCaptureRoute(marker, record.active_rotation ? 2 : 1));
  await withPromotionRoot(task, claim, record, options.code, async (root, subtle) => {
    const device = await openCredential(scope, root, marker.credentials![0], subtle);
    const key = await openEnvelope(scope, root, record.envelope!, subtle);
    let active: Awaited<ReturnType<typeof openActiveRotation>> = null;
    try {
      active = await openActiveRotation(scope, root, record, subtle, route.history?.current.head);
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
        const authority = route.history?.current ?? {
          workspace: route.workspace,
          lineage: receipt.offer.epoch.lineageId,
          tip: receipt.offer.epoch.epoch,
          head: receipt.offer.head,
          acceptanceKey: receipt.offer.epoch.acceptancePublicKey,
        };
        const signer =
          marker.v >= 7
            ? await subtle.importKey('raw', marker.credentials![1].publicKey, 'Ed25519', false, [
                'verify',
              ])
            : undefined;
        const inbound =
          marker.v === 9
            ? await heldInboundContext(marker, active?.key ?? key, subtle, route)
            : undefined;
        if (inbound && active) inbound.retainedGenerationKeys = new Map([[1, key]]);
        await withRecoveryUnderPermit(
          task,
          { ...scope, resolvePrincipal: () => scope.principalId },
          options.code,
          async (recovered) => {
            const doc = new Y.Doc({ gc: false }),
              checkpoint = new Y.Doc({ gc: false });
            try {
              const spool =
                marker.v === 9
                  ? inspectInbound(recovered.records, route, inbound!).delivery.spool
                  : marker.v === 8
                    ? inspectDelivery(recovered.records, route, authority).spool
                    : marker.v === 7
                      ? inspectSpool(recovered.records, route)
                      : undefined;
              const recovery =
                marker.v >= 6
                  ? capturedRecovery(
                      { ...recovered, records: spool?.sourceRecords ?? recovered.records },
                      route,
                    )
                  : recovered;
              try {
                replayRecovery(doc, recovery);
              } finally {
                if (marker.v >= 6) for (const r of recovery.journal) r.bytes.fill(0);
              }
              Y.applyUpdate(checkpoint, plaintext);
              if (marker.catchup) {
                if (!marker.successor?.certification)
                  throw Error('Catch-up certification is missing');
                const catchup = await task.wait(() =>
                  openContentCheckpoint(marker.catchup, key, {
                    base: { pin: marker.pin, request, receipt },
                    successor: marker.successor!.artifact,
                    certification: marker.successor!.certification!,
                  }),
                );
                try {
                  if (!coversGenesis(doc, catchup)) throw Error('Account lost checkpoint content');
                } finally {
                  catchup.destroy();
                }
              }
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
          marker.v >= 7
            ? {
                allowSpoolCounter: true,
                validate: async (records, _task, counter) => {
                  const state =
                    marker.v === 9
                      ? inspectInbound(records, route, inbound!).delivery.spool
                      : marker.v === 8
                        ? inspectDelivery(records, route, authority).spool
                        : inspectSpool(records, route);
                  await verifySpoolWitness(state, counter, subtle);
                  if (detached)
                    await (
                      await import('./rotationObservation')
                    ).verifyDetachedPrefix(detached, state, subtle);
                  await verifyInstalledSuccessor(
                    state,
                    route,
                    marker.successor,
                    subtle,
                    undefined,
                    marker.membership,
                  );
                  if (marker.v === 9)
                    await verifyInboundLedger(
                      inspectInbound(records, route, inbound!),
                      records,
                      inbound!,
                      { assertCurrent: () => task.step(() => {}) },
                    );
                  await verifySpool(
                    state,
                    route,
                    active
                      ? new Map([
                          [1, key],
                          [2, active.key],
                        ])
                      : key,
                    signer!,
                    subtle,
                  );
                  if (marker.v >= 8)
                    await verifyDelivery(
                      marker.v === 9
                        ? inspectInbound(records, route, inbound!).delivery
                        : inspectDelivery(records, route, authority),
                      route,
                      authority,
                      signer!,
                      subtle,
                    );
                },
              }
            : undefined,
        );
      } finally {
        plaintext.fill(0);
      }
    } finally {
      key.fill(0);
      active?.key.fill(0);
    }
  });
  return {
    claim,
    record,
    marker,
    route,
    account: Object.freeze({
      ...handoffResult(destination),
      kind: 'account' as const,
      detached: !!detached,
    }),
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
