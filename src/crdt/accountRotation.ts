import { hasBaselineReader, hasBaselineVerifier } from './localBaselineMode';
import { captureInboundReceiptVersion } from './inboundReceiptVersion';
import { eraseVerified } from './verifiedRecords';
import { originalMembershipBoundaries } from './accountSuccessor';
/** Resume a verified removal under the caller's exclusive slot permit. Old openers and the apply
 * record remain after local activation; checkpoint admission/retirement is a separate obligation. */
import {
  readPromotion,
  withPromotionRoot,
  signPromotion,
  writePromotion,
  signRecord,
} from './promotionRecord';
import {
  readJoinedAccount,
  joinedKeys,
  joinedInitialGeneration,
  joinedBaselineHash,
  joinedBaselineHeads,
  writeJoinedApproval,
  writeJoinedRotation,
} from './joinedAccount';
import { claimScope } from './localGenesisRecord';
import { openActiveRotation, eraseRotationKeys } from './rotationKeys';
import { createApprovalVault } from '../account/approvalVault';
import { parseNativeRemoval } from '../account/deviceRemovalVault';
import { parseInstalledMembership, verifyInstalledMembership } from './accountMembership';
import { verifyMembershipChain } from '../../account-protocol/membershipLocator';
import {
  historyAuthority,
  historyPublisher,
  historyMembership,
  historyGeneration,
} from '../../account-protocol/admissionHistory';
import {
  resolveRotationOutcome,
  verifyRotationRequest,
  verifyRemovalPreparationRequest,
  verifyRemovalPreparation,
  removalPreparationMatchesRequest,
} from '../../account-protocol/rotation';
import { generationInfo } from '../../account-protocol/genesis';
import { same } from '../../account-protocol/admission';
import { digest } from '../../account-protocol/recovery';
import { fields, hex, hkdf, random, openEnvelope, type Bytes } from './custodyCrypto';
import { createContentOwner, type ContentCrypto } from './contentStore';
import { recordAAD, type StoredRecord, type ContentCounter } from './contentRecord';
import { recordEqual } from './custodyRecord';
import { inspectInbound, verifyInboundLedger } from './inboundLedger';
import { verifySpool, verifySpoolWitness } from './spoolRecord';
import { verifyDelivery } from './deliveryRecord';
import { verifySyncState } from './accountSyncState';
import { createJournalOwner, eraseJournalSnapshot } from './journalStore';
import { deriveJournalKey } from './journalCodec';
import { persistRotationJournal } from './rotationCapture';
import { deriveStoreName } from './storeName';
import { probeDatabase } from './startupStorage';
import { contentTransaction } from './contentDatabase';
import type { SessionTask } from './writeSession';
import type { InboundContext } from './accountInbound';
import type { CaptureRoute } from './sourceCapture';

export async function activateAccountRotation(
  task: SessionTask,
  kind: 'promotion' | 'joined',
  slotId: string,
  code: string,
) {
  const original = kind === 'promotion' ? await readPromotion(task, slotId, code) : null;
  const joined = kind === 'joined' ? await readJoinedAccount(task, slotId, code) : null;
  const state = (original ?? joined)!;
  let record = state.record;
  let marker = original?.marker;
  const scope = claimScope(state.claim);
  if (
    !record.rotation ||
    (original && marker?.v !== 9) ||
    (joined && joined.marker?.phase !== 'active')
  )
    throw Error('Native account rotation is not ready');
  const base = original
    ? {
        pin: marker!.pin,
        request: marker!.admission!.request,
        receipt: marker!.admission!.receipt!,
      }
    : joined!.marker!.authority.base;
  const existingMembership = original ? marker!.membership : joined!.marker!.membership;
  const credentials = original ? marker!.credentials! : record.credentials!;
  return withPromotionRoot(task, state.claim, record, code, async (root, subtle) => {
    const commit = async (next: typeof record, check?: () => void) => {
      if (original) {
        next = await signRecord(root, next, subtle);
        const nextMarker = await signPromotion(
          root,
          { ...marker!, custodyMac: hex(next.mac), sealReserved: next.seal_reserved },
          subtle,
        );
        await writePromotion(task, state.claim, record, next, marker!, nextMarker, check);
        marker = nextMarker;
        record = next;
      } else {
        await writeJoinedApproval(task, joined!, code, next, check, 'rotation');
        record = joined!.record;
      }
    };
    const vault = await createApprovalVault({
      channel: 'rotation',
      slotId,
      scope,
      root,
      subtle,
      credentials,
      record: () => record,
      commit,
    });
    const progress = parseNativeRemoval(await vault.load());
    if (!progress.successor || !progress.key)
      throw Error('Removal outcome and opener must be retained before activation');
    const parent = await verifyMembershipChain(progress.parent, base);
    const proof = progress.successor;
    const proofs = { ...progress.parent, continuations: [...progress.parent.continuations, proof] };
    const verified = await verifyMembershipChain(proofs, base);
    const history = historyPublisher(verified.history, credentials[1].id);
    const predecessorGeneration = historyGeneration(parent.history),
      generation = historyGeneration(history);
    if (
      generation !== predecessorGeneration + 1 ||
      history.finalization ||
      progress.recipient !== credentials[1].id ||
      !same(proof.epoch.rotation.payload.excluded, [progress.target])
    )
      throw Error('Unsupported local rotation');
    if (progress.progress) {
      const p = progress.progress,
        membership = historyMembership(parent.history);
      await verifyRemovalPreparationRequest(p.request, membership);
      if (p.request.actorId !== credentials[1].id || p.request.targetId !== progress.target)
        throw Error('Retained removal owner changed');
      if (p.preparation) {
        await verifyRemovalPreparation(p.preparation, membership);
        if (!removalPreparationMatchesRequest(p.request, p.preparation))
          throw Error('Retained preparation changed');
      }
      if (p.rotation) {
        if (!same(p.rotation.preparation, p.preparation)) throw Error('Retained rotation changed');
        const intent = await verifyRotationRequest(p.rotation, membership, base.request.recovery);
        if (
          (p.outcome && !same(p.outcome, proof.epoch.outcome)) ||
          (await resolveRotationOutcome(proof.epoch.outcome, intent)).kind === 'pending'
        )
          throw Error('Unverified rotation outcome');
      } else if (p.outcome) throw Error('Outcome has no intent');
    }
    if (existingMembership) {
      const held = await verifyMembershipChain(existingMembership.proofs, base);
      if (held.history.current.tip <= history.current.tip)
        historyAuthority(history, held.history.current);
      else {
        historyAuthority(held.history, history.current);
        if (record.active_rotation !== proof.head || historyGeneration(held.history) !== generation)
          throw Error('Unactivated rotation precedes installed membership');
      }
    }
    const completed = record.active_rotation === proof.head;
    if (
      !completed &&
      predecessorGeneration > 1 &&
      progress.previous?.at(-1)?.head !== record.active_rotation
    )
      throw Error('Active predecessor differs from retained openers');
    return vault.withInstalledKey(progress.key, proof.head, async (successor) => {
      const self = proof.epoch.rotation.payload.wraps.find(
        (w) => w.credentialId === credentials[1].id,
      );
      if (!self) throw Error('Missing successor self wrap');
      const reopened = await vault.openWrap(
        self,
        generationInfo({
          workspaceId: history.current.workspace,
          lineageId: history.current.lineage,
          authRoot: base.pin.authRoot,
          generation,
        }),
      );
      try {
        if (hex(reopened) !== hex(successor)) throw Error('Installed successor key changed');
      } finally {
        reopened.fill(0);
      }
      if (completed) {
        if (!existingMembership) throw Error('Active membership differs from rotation');
        return { generation, head: proof.head };
      }
      const local = await openEnvelope(scope, root, record.envelope!, subtle);
      let network: Bytes | undefined;
      let carrier: ReturnType<typeof createContentOwner> | undefined;
      let journal: ReturnType<typeof createJournalOwner> | undefined;
      let active: Awaited<ReturnType<typeof openActiveRotation>> = null;
      const journalKeys = new Map<number, Bytes>();
      try {
        network = original
          ? local.slice()
          : await joinedKeys(task, joined!, code, async (key) => key.slice(), true);
        if (record.active_rotation)
          active = await openActiveRotation(scope, root, record, subtle, progress.parent);
        const initialGeneration = joined ? joinedInitialGeneration(joined.marker!) : 1;
        if ((active?.generation ?? initialGeneration) !== predecessorGeneration)
          throw Error('Active predecessor generation changed');
        const historicalKeys = new Map<number, Bytes>([
          [initialGeneration, network],
          ...(active?.previous ?? []),
        ]);
        if (active) historicalKeys.set(active.generation, active.key);
        const route: CaptureRoute = {
          workspace: history.current.workspace,
          principal: history.principal,
          credential: credentials[1].id,
          epoch: history.current.tip,
          generation,
          history,
        };
        const context: InboundContext = {
          ...captureInboundReceiptVersion(original ? marker : joined!.marker),
          baseline: original
            ? {
                kind: 'promotion-genesis',
                id: await digest(new TextEncoder().encode(JSON.stringify(base.receipt))),
              }
            : {
                kind: 'content-checkpoint',
                id: await joinedBaselineHash(joined!.marker!),
              },
          ...(joined?.marker && joinedBaselineHeads(joined.marker)
            ? { baselineHeads: joinedBaselineHeads(joined.marker)! }
            : {}),
          service: { id: base.pin.serviceId, origin: base.pin.origin },
          authority: history.current,
          history,
          creatingCredential: credentials[1].id,
          reader: { id: credentials[1].id, publicKey: history.signingKey, active: true },
          publisher: {
            id: credentials[1].id,
            publicKey: history.signingKey,
            principal: history.principal,
            system: true,
            active: true,
          },
          generation,
          generationKey: successor,
          retainedGenerationKeys: historicalKeys,
          prefix: { position: 0, link: '00'.repeat(32), observedThrough: 0 },
        };
        const publicKey = await subtle.importKey(
          'raw',
          credentials[1].publicKey,
          'Ed25519',
          false,
          ['verify'],
        );
        const identity = { ...scope, storeId: record.store_id, rootId: record.root_id };
        const stores = new Map(
          await Promise.all(
            [
              ...new Map<number, Bytes>([...historicalKeys, [1, local], [generation, successor]]),
            ].map(
              async ([g, key]) =>
                [
                  g as number,
                  await hkdf(
                    key as Bytes,
                    new Uint8Array(),
                    fields('done/store/v1', scope.workspaceId, record.store_id),
                    { name: 'AES-GCM', length: 256 },
                    ['encrypt', 'decrypt'],
                    subtle,
                  ),
                ] as const,
            ),
          ),
        );
        // Existing metadata stays independently authenticated by its retained predecessor opener.
        const metadata = await hkdf(
          local,
          new Uint8Array(),
          fields(
            'done/content-metadata/v1',
            slotId,
            scope.principalId,
            scope.workspaceId,
            record.store_id,
          ),
          { name: 'HMAC', hash: 'SHA-256', length: 256 },
          ['sign', 'verify'],
          subtle,
        );
        const open = async (r: StoredRecord) => {
          const key = stores.get(r.gen);
          if (!key) throw Error('Unknown local generation');
          return new Uint8Array(
            await subtle.decrypt(
              { name: 'AES-GCM', iv: r.nonce, additionalData: recordAAD(identity, r) },
              key,
              r.ct,
            ),
          );
        };
        const seal = async (h: Omit<StoredRecord, 'nonce' | 'ct'>, bytes: Bytes) => {
          const nonce = random(12);
          return {
            ...h,
            nonce,
            ct: new Uint8Array(
              await subtle.encrypt(
                { name: 'AES-GCM', iv: nonce, additionalData: recordAAD(identity, h) },
                stores.get(h.gen)!,
                bytes,
              ),
            ),
          };
        };
        const installedMembership = (counter: ContentCounter) => {
          if (counter.v !== 2) throw Error('Rotation requires Account witness');
          return parseInstalledMembership({
            v: 1,
            proofs,
            cuts:
              existingMembership?.proofs.continuations.at(-1)?.head === proof.head
                ? existingMembership.cuts
                : [
                    ...(existingMembership?.cuts ?? []),
                    {
                      epoch: history.current.tip,
                      head: history.current.head,
                      before: counter.spool,
                    },
                  ],
          });
        };
        const initialEpoch = joined
          ? joined.marker!.v !== 1
            ? joined.marker!.reading.epoch
            : 3
          : 1;
        const fresh = async () => {
          const current = original
            ? await readPromotion(task, slotId, code)
            : await readJoinedAccount(task, slotId, code);
          if (
            !recordEqual(current.record, record) ||
            !same(current.marker, original ? marker : joined!.marker)
          )
            throw Error('Rotation custody changed');
        };
        const crypt: ContentCrypto = {
          allowSpoolCounter: true,
          ...(hasBaselineVerifier()
            ? {
                reuseOpened: true as const,
                ...(hasBaselineReader() ? { readBaseline: true as const } : {}),
                baseline: async (
                  _task: SessionTask,
                  identity: import('./contentRecord').ContentIdentity,
                  counter: ContentCounter,
                ) => {
                  await fresh();
                  return {
                    identity,
                    route,
                    inbound: context,
                    signer: publicKey,
                    installation: original
                      ? {
                          kind: 'original' as const,
                          ...(marker!.successor ? { successor: marker!.successor } : {}),
                          membership: installedMembership(counter),
                        }
                      : {
                          kind: 'joined' as const,
                          initialEpoch,
                          membership: installedMembership(counter),
                        },
                    assertCurrent: () => task.step(() => {}),
                  };
                },
              }
            : {}),
          open: (_t, r) => open(r),
          seal: (_t, h, b) => seal(h, b),
          sign: async (_t, b) => new Uint8Array(await subtle.sign('HMAC', metadata, b)),
          verify: (_t, b, mac) => subtle.verify('HMAC', metadata, mac, b),
          validate: async (records, _t, counter, _view, baseline) => {
            if (baseline) return;
            const census = inspectInbound(records, route, context);
            await verifySpoolWitness(census.delivery.spool, counter, subtle);
            await verifySpool(
              census.delivery.spool,
              route,
              new Map([...historicalKeys, [generation, successor]]),
              publicKey,
              subtle,
            );
            const delivery = await verifyDelivery(
              census.delivery,
              route,
              context.authority,
              publicKey,
              subtle,
            );
            const inbound = await verifyInboundLedger(census, records, context, {
              assertCurrent: () => task.step(() => {}),
            });
            verifySyncState(census.delivery, delivery, inbound);
          },
        };
        const name = await deriveStoreName(scope.principalId, scope.workspaceId);
        const diskGeneration = await probeDatabase(task, name, (db) =>
          contentTransaction<number>(db, task, ['meta'], 'readonly', (tx, result) => {
            const r = tx.objectStore('meta').get('counter');
            r.onsuccess = () => result(r.result?.active_gen);
          }),
        );
        if (diskGeneration !== predecessorGeneration && diskGeneration !== generation)
          throw Error('Unknown rotation carrier generation');
        carrier = createContentOwner(identity, diskGeneration, crypt);
        await carrier.initialize(task);
        for (const [g, key] of new Map([...historicalKeys, [1, local]]))
          journalKeys.set(g, await deriveJournalKey(key, scope.workspaceId, subtle));
        journal = createJournalOwner(
          identity,
          name,
          predecessorGeneration,
          journalKeys.get(predecessorGeneration)!,
          new Map([...journalKeys].filter(([g]) => g !== predecessorGeneration)),
          () => carrier?.journalBinding(),
        );
        const checkJournal = () => {
          const entries = journal!.snapshot();
          try {
            if (entries.length) throw Error('Rotation journal coverage is incomplete');
          } finally {
            eraseJournalSnapshot(entries);
          }
        };
        if (diskGeneration === predecessorGeneration) {
          const entries = await journal.readSnapshot(task);
          try {
            await journal.flush(task, entries, (t, values) =>
              persistRotationJournal(
                t,
                carrier!,
                route,
                record.store_id,
                (records) => inspectInbound(records, route, context).delivery.spool.sourceRecords,
                values,
              ),
            );
          } finally {
            eraseJournalSnapshot(entries);
          }
        }
        checkJournal();
        const before = await carrier.spoolWitness(task);
        const membership = parseInstalledMembership({
          v: 1,
          proofs,
          cuts:
            existingMembership?.proofs.continuations.at(-1)?.head === proof.head
              ? existingMembership.cuts
              : [
                  ...(existingMembership?.cuts ?? []),
                  { epoch: history.current.tip, head: history.current.head, before },
                ],
        });
        const loaded = await carrier.loadAccount(task);
        try {
          if (loaded.kind === 'complete')
            await verifyInstalledMembership(
              inspectInbound(loaded.records, route, context).delivery.spool,
              history,
              membership,
              joined
                ? joined.marker!.v !== 1
                  ? joined.marker!.reading.epoch
                  : 3
                : originalMembershipBoundaries(original!.marker!.successor),
              subtle,
            );
        } finally {
          eraseVerified(loaded);
        }
        if (diskGeneration === predecessorGeneration) {
          await carrier.rotate(task, {
            generation,
            reserve: vault.reserveSeals,
            seal,
            open,
            checkJournal,
          });
          carrier.dispose();
          carrier = createContentOwner(identity, generation, crypt);
          await carrier.initialize(task);
        }
        if (!completed) {
          const next = { ...record, active_rotation: proof.head };
          if (original) {
            const signed = await signRecord(root, next, subtle);
            const nextMarker = await signPromotion(
              root,
              {
                ...marker!,
                membership,
                custodyMac: hex(signed.mac),
                sealReserved: signed.seal_reserved,
              },
              subtle,
            );
            await writePromotion(
              task,
              state.claim,
              record,
              signed,
              marker!,
              nextMarker,
              checkJournal,
            );
          } else await writeJoinedRotation(task, joined!, code, next, membership, checkJournal);
        } else if (!same(existingMembership, membership))
          throw Error('Active rotation membership changed');
        return { generation, head: proof.head };
      } finally {
        carrier?.dispose();
        journal?.dispose();
        for (const key of journalKeys.values()) key.fill(0);
        eraseRotationKeys(active);
        network?.fill(0);
        local.fill(0);
      }
    });
  });
}
