import { recordEqual, type CustodyRecord } from './custodyRecord';
import {
  rememberAccountTransition,
  clearAccountTransition,
} from '../account/accountTransitionNotice';
import {
  parseRemovalDiscoveryRequest,
  removalDiscoveryRequestMessage,
  verifyRemovalDiscoveryResponse,
} from '../../account-protocol/removalDiscovery';
import { openActiveRotation, eraseRotationKeys } from './rotationKeys';
import { ScopedTransport } from '../account/scopedTransport';
import { isAccountAccess, type AccountAccess } from '../account/accountHttp';
import {
  readJoinedAccount,
  joinedPayload,
  joinedKeys,
  joinedInitialGeneration,
  writeJoinedMembership,
} from './joinedAccount';
import {
  parseInstalledMembership,
  verifyInstalledMembership,
  type InstalledMembership,
} from './accountMembership';
import {
  parseMembershipChain,
  verifyMembershipChain,
  parseMembershipDiscoveryRequest,
  membershipDiscoveryRequestMessage,
  verifyMembershipDiscoveryResponse,
} from '../../account-protocol/membershipLocator';
import { privateDiscoveryPost } from '../account/privateDiscoveryHttp';
import {
  parseSuccessor,
  parseDiscoveryRequest,
  discoveryRequestMessage,
  verifyDiscoveryResponse,
} from '../../account-protocol/successor';
import {
  verifyAdmissionHistory,
  historyDevices,
  historyPublisher,
  historyAuthority,
  historyGeneration,
} from '../../account-protocol/admissionHistory';
import type { DeviceRoster } from '../account/deviceRoster';
import { verifyInstalledSuccessor, type InstalledSuccessor } from './accountSuccessor';
import { createVerifiedRecords } from './verifiedRecords';
import { createVerificationMemo } from './verificationMemo';
import { createInboundCoverage } from './inboundLedger';
import type { DeliveryState } from './deliveryRecord';
import type { InboundState } from './inboundLedger';
import { createEnvelopePreparation } from './accountEnvelopePreparation';
import { createDeliveryOperations, describeDelivery } from './accountDelivery';
import { publicationState } from './deliveryRecord';
import { requireSelfEnvelope, verifySyncState } from './accountSyncState';
import { createSyncScheduler, driveOutboundStep } from './accountSyncDriver';
import { startNotifications } from '../account/notifications';
import { createReceiveScheduler, driveReceiveStep } from './accountReceiveDriver';
import type { DriverGate } from './accountDriver';
/** Private receive owners. Authority and original-update promotion stay inside the held lifetime. */
import { openAccountCaptureOwner, type CaptureExtension } from './accountCapture';
import { captureAccountOptions, type AccountStartupOptions } from './accountStartup';
import {
  readPromotion,
  promotionPayload,
  withPromotionRoot,
  signPromotion,
  writePromotion,
} from './promotionRecord';
import { claimScope } from './localGenesisRecord';
import { same } from '../../account-protocol/admission';
import {
  encodeInboundRequest,
  inboundRequestMessage,
  decodeInboundRequest,
  decodeInboundPage,
} from '../../account-protocol/inboundTransport';
import {
  privateDeliveryPost,
  recordPrivateReceiveExpiry,
  recordPrivateTransportDiagnostic,
} from '../account/privateDeliveryHttp';
import { READ_PAGE_LIMIT } from '../../account-protocol/deliveryTransport';
import {
  hex,
  openCredential,
  openEnvelope,
  guardedSubtle,
  random,
  type Bytes,
} from './custodyCrypto';
import { verifyInboundPage, InboundError, type InboundContext } from './accountInbound';
import {
  heldInboundContext,
  inspectInbound,
  verifyInboundLedger,
  contextAt,
  publisherContext,
  publisherState,
} from './inboundLedger';
import { verifySpoolWitness, verifySpool, extendSpoolWitness } from './spoolRecord';
import { verifyDelivery } from './deliveryRecord';
import { captureError, type CaptureRoute } from './sourceCapture';
import type { SessionTask } from './writeSession';
import type { prepareAccountCustody } from './custody';
import {
  createAdmissionOwner,
  AdmissionError,
  MAX_PENDING_BYTES,
  type OwnedReceiveQueue,
} from './admissionQueue';
import { createAdmittedWorkspace } from './admittedWorkspace';
import type { AccountWorkspaceOptions } from './accountWorkspace';

class ReceiveAuthorityChanged extends AdmissionError {
  constructor() {
    super('receive-refused', 'Receive authority was superseded');
  }
}
class ReceiveRequestExpired extends AdmissionError {
  constructor() {
    super('receive-refused', 'Receive request expired before commit');
  }
}
async function openAccountReceiveOwner(
  input: AccountStartupOptions,
  principalId?: string,
  canReceive: () => boolean = () => true,
  composed = false,
  joined = false,
) {
  const options = captureAccountOptions(input);
  const verified = createVerifiedRecords<{
    delivery: DeliveryState;
    inbound: InboundState;
    census: ReturnType<typeof inspectInbound>;
  }>();
  // Keys are fixed; adoption clears every memo before swapping the durable authority context.
  const memo = createVerificationMemo(),
    coverage = createInboundCoverage();
  const inspectCensus = (records: Parameters<typeof inspectInbound>[0], route: CaptureRoute) =>
    verified.matches(records)
      ? verified.read(records, (v) => v.census)
      : inspectInbound(records, route, base);
  let installed: InstalledSuccessor | undefined;
  let membership: InstalledMembership | undefined,
    initialEpoch = 3;
  let base!: InboundContext, signer: CryptoKey | undefined, publicKey!: CryptoKey;
  let handoff = false,
    transition = '';
  let expectedPayload = '',
    expectedRecord: CustodyRecord,
    outstanding: Bytes | undefined;
  const subtleFor = (task: SessionTask) => guardedSubtle(() => task.step(() => {}));
  const lifetime = (task: SessionTask) => ({ assertCurrent: () => task.step(() => {}) });
  const assertCurrent = async (task: SessionTask) => {
    if (handoff) throw new ReceiveAuthorityChanged();
    if (joined) {
      const current = await readJoinedAccount(task, options.slotId, options.code);
      if (
        !current.marker ||
        hex(joinedPayload(current.marker)) !== expectedPayload ||
        !recordEqual(current.record, expectedRecord)
      )
        captureError('Certified device authority changed');
      return;
    }
    const current = await readPromotion(task, options.slotId, options.code);
    if (
      !current.marker ||
      hex(promotionPayload(current.marker)) !== expectedPayload ||
      !recordEqual(current.record, expectedRecord)
    )
      captureError('Inbound authority changed before commit');
  };
  const extension: CaptureExtension = {
    version: 9,
    sourceRecords: (records, route) => inspectCensus(records, route).delivery.spool.sourceRecords,
    async initialize(task, v) {
      expectedPayload = hex(promotionPayload({ ...v.marker, v: 9, stage: 'account-receiving' }));
      expectedRecord = v.record;
      installed = v.marker.successor;
      membership = v.marker.membership;
      await withPromotionRoot(task, v.claim, v.record, options.code, async (root, subtle) => {
        const kg = await openEnvelope(claimScope(v.claim), root, v.record.envelope!, subtle);
        let active: Awaited<ReturnType<typeof openActiveRotation>> = null;
        try {
          active = await openActiveRotation(
            claimScope(v.claim),
            root,
            v.record,
            subtle,
            v.marker.membership?.proofs,
          );
          base = await heldInboundContext(v.marker, active?.key ?? kg, subtle, v.route);
          if (active) base.retainedGenerationKeys = new Map([[1, kg], ...active.previous]);
          signer = await openCredential(
            claimScope(v.claim),
            root,
            v.marker.credentials![1],
            subtle,
          );
          publicKey = await subtle.importKey(
            'raw',
            v.marker.credentials![1].publicKey,
            'Ed25519',
            false,
            ['verify'],
          );
        } catch (e) {
          kg.fill(0);
          eraseRotationKeys(active);
          throw e;
        }
      });
    },
    async initializeJoined(task, v) {
      expectedPayload = hex(joinedPayload(v.marker!));
      expectedRecord = v.record;
      membership = v.marker!.membership;
      initialEpoch = v.marker!.v !== 1 ? v.marker!.reading.epoch : 3;
      await joinedKeys(task, v, options.code, async (kg, signing, verifying) => {
        const active = await withPromotionRoot(
          task,
          v.claim,
          v.record,
          options.code,
          (root, subtle) =>
            openActiveRotation(
              claimScope(v.claim),
              root,
              v.record,
              subtle,
              v.marker!.membership?.proofs,
            ),
        );
        base = {
          ...v.base,
          generationKey: active?.key ?? kg.slice(),
          retainedGenerationKeys: new Map(
            active ? [[joinedInitialGeneration(v.marker!), kg.slice()], ...active.previous] : [],
          ),
        };
        signer = signing;
        publicKey = verifying;
      });
    },
    activate: (task, owner) => owner.carrier.enableSpool(task),
    async validate(task, records, route, counter, view) {
      try {
        await verified.verify(
          records,
          view ?? {},
          async (records) => {
            const census = inspectInbound(records, route, base),
              subtle = subtleFor(task),
              reuse = { memo, current: () => task.step(() => {}) };
            await verifySpoolWitness(census.delivery.spool, counter, subtle, reuse);
            if (!joined)
              await verifyInstalledSuccessor(
                census.delivery.spool,
                route,
                installed,
                subtle,
                reuse,
                membership,
              );
            else if (membership)
              await verifyInstalledMembership(
                census.delivery.spool,
                route.history!,
                membership,
                initialEpoch,
                subtle,
                reuse,
              );
            await verifySpool(
              census.delivery.spool,
              route,
              new Map([
                ...(base.retainedGenerationKeys ?? []),
                [base.generation, base.generationKey],
              ]),
              publicKey,
              subtle,
              reuse,
            );
            const delivery = await verifyDelivery(
              census.delivery,
              route,
              base.authority,
              publicKey,
              subtle,
              reuse,
            );
            const inbound = await verifyInboundLedger(census, records, base, lifetime(task), {
              memo,
              coverage,
            });
            if (composed) verifySyncState(census.delivery, delivery, inbound);
            memo.retain(
              new Set([
                'admission-prefix',
                ...census.delivery.spool.positions.flatMap((p) => [
                  'spool:' + p.position,
                  'link:' + p.position,
                ]),
                ...census.delivery.spool.events.map((_, i) => 'witness:' + i),
                ...census.delivery.entries.map((e) => 'delivery:' + e.record.seq),
                ...census.entries.map((e) => 'inbound:' + e.record.seq),
              ]),
            );
            return { delivery, inbound, census };
          },
          () => task.step(() => {}),
        );
      } catch (e) {
        memo.clear();
        coverage.clear();
        throw e;
      }
    },
    dispose() {
      verified.clear();
      memo.clear();
      coverage.clear();
      base?.generationKey.fill(0);
      for (const key of base?.retainedGenerationKeys?.values() ?? []) key.fill(0);
      signer = undefined;
      outstanding?.fill(0);
      outstanding = undefined;
    },
  };
  // The actor comes from the authenticated marker, not application identity. This read happens under
  // openAccountCaptureOwner's exclusive permit; the source principal is checked by its startup verifier.
  const {
    account,
    carrier,
    runCaptureTask,
    runNetworkTask,
    listCaptures,
    installRoute,
    suspendCapture,
  } = await openAccountCaptureOwner(options, principalId, extension, joined);
  const scopedOwner =
    options.networkLogin && !account.detached
      ? new ScopedTransport(options.pin, carrier.signal)
      : undefined;
  const access = scopedOwner?.bind({
    login: options.networkLogin!,
    scope: {
      kind: 'workspace',
      workspaceId: base.authority.workspace,
      credentialId: base.reader.id,
    },
    sign: (message) =>
      runNetworkTask(async (task) =>
        hex(
          new Uint8Array(await task.wait(() => subtleFor(task).sign('Ed25519', signer!, message))),
        ),
      ),
  });
  const terminalAccess = scopedOwner?.bind({
    login: options.networkLogin!,
    scope: { kind: 'removal', workspaceId: base.authority.workspace, credentialId: base.reader.id },
    sign: (message) =>
      runNetworkTask(async (task) =>
        hex(
          new Uint8Array(await task.wait(() => subtleFor(task).sign('Ed25519', signer!, message))),
        ),
      ),
  });
  const state = async (
    task: SessionTask,
    owner: ReturnType<typeof prepareAccountCustody>,
    _route: CaptureRoute,
  ) => {
    await assertCurrent(task);
    const records = await owner.carrier.load(task);
    try {
      return task.step(() => verified.read(records, (v) => v.inbound));
    } finally {
      for (const r of records) r.bytes.fill(0);
    }
  };
  let nextPublisher = 0;
  const describe = (s: Awaited<ReturnType<typeof state>>) =>
    Object.freeze({
      state:
        s.conflict || [...(s.peers?.values() ?? [])].some((p) => p.conflict)
          ? ('conflict' as const)
          : ('ready' as const),
      receivedThrough:
        s.prefix.position +
        [...(s.peers?.values() ?? [])].reduce((n, p) => n + p.prefix.position, 0),
      link: s.prefix.link,
      observedThrough:
        s.prefix.observedThrough +
        [...(s.peers?.values() ?? [])].reduce((n, p) => n + p.prefix.observedThrough, 0),
    });
  const prepareRead = async (
    task: SessionTask,
    owner: ReturnType<typeof prepareAccountCustody>,
    route: CaptureRoute,
    after?: number,
  ) => {
    if (account.detached) throw Error('This local copy is detached from sync');
    const all = await state(task, owner, route);
    const publishers = base.history?.readers.map((r) => r.id) ?? [base.publisher.id];
    const publisher =
      after === undefined ? publishers[nextPublisher++ % publishers.length]! : base.publisher.id;
    const s = publisherState(all, base, publisher),
      cursor = after ?? s.prefix.position;
    if (s.conflict) throw Error('Inbound stream is conflicted');
    if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > s.prefix.position)
      throw Error('Invalid receive cursor');
    const r = {
      serviceId: base.service.id,
      origin: base.service.origin,
      workspace: base.authority.workspace,
      reader: base.reader.id,
      publisher,
      lineage: base.authority.lineage,
      head: base.authority.head,
      epoch: base.authority.tip,
      after: cursor,
      limit: 1,
      nonce: hex(task.step(() => random(32))),
      expires: Date.now() + 30000,
      signature: '00'.repeat(64),
    };
    r.signature = hex(
      new Uint8Array(
        await task.wait(() => subtleFor(task).sign('Ed25519', signer!, inboundRequestMessage(r))),
      ),
    );
    await assertCurrent(task);
    return task.step(() => {
      outstanding?.fill(0);
      outstanding = encodeInboundRequest(r);
      return outstanding.slice();
    });
  };
  // Prepare in order, wait under the same lifetime outside the storage tail, then let the
  // admission FIFO verify this exact request against fresh authority and prefix before commit.
  const fetchPage = async (operatorToken: AccountAccess) => {
    let request: Bytes | undefined,
      page: Bytes | null = null;
    let oversized = false;
    try {
      return await runNetworkTask(async (network) => {
        const query = (request = await runCaptureTask((task, owner, route) =>
          prepareRead(task, owner, route),
        ));
        await network.wait(async () => {
          page = canReceive()
            ? await privateDeliveryPost(
                options.pin,
                access ?? operatorToken,
                'read-v2',
                query,
                MAX_PENDING_BYTES,
                network.signal,
                (event) => {
                  recordPrivateTransportDiagnostic(event);
                  if (event.code === 'response-too-large') oversized = true;
                },
              )
            : null;
        });
        return network.step(() => ({ request: query, page, oversized }));
      });
    } catch (cause) {
      request?.fill(0);
      (page as Bytes | null)?.fill(0);
      throw cause;
    }
  };
  const api = Object.freeze({
    ...account,
    close: () => carrier.close(),
    status: () =>
      runCaptureTask(async (task, owner, route) => describe(await state(task, owner, route))),
    /** A single outstanding owner-signed request; retry old positions only against retained evidence. */
    prepareRead: (after?: number) =>
      runCaptureTask((task, owner, route) => prepareRead(task, owner, route, after)),
    receivePage: (
      input: Bytes,
      promote: (updates: readonly Bytes[]) => void = () => {},
      expectedRequest?: Bytes,
    ) => {
      if (account.detached) return Promise.reject(Error('This local copy is detached from sync'));
      if (!(input instanceof Uint8Array) || !input.length || input.length > READ_PAGE_LIMIT)
        return Promise.reject(new AdmissionError('receive-refused', 'Invalid receive page'));
      const page = input.slice();
      return runCaptureTask(async (task, owner, route) => {
        const s = await state(task, owner, route);
        if (s.conflict) throw new AdmissionError('receive-refused', 'Inbound stream is conflicted');
        if (expectedRequest && decodeInboundRequest(expectedRequest).epoch < base.authority.tip)
          throw new ReceiveAuthorityChanged();
        if (!outstanding)
          throw new AdmissionError('receive-refused', 'No outstanding receive request');
        if (expectedRequest && hex(expectedRequest) !== hex(outstanding))
          throw new AdmissionError('receive-refused', 'Receive request was superseded');
        const request = outstanding.slice();
        let result: Awaited<ReturnType<typeof verifyInboundPage>> | undefined;
        let committed = false;
        try {
          const r = decodeInboundRequest(request);
          if (publisherState(s, base, r.publisher).conflict)
            throw new AdmissionError('receive-refused', 'Inbound publisher is conflicted');
          // Own successful plaintext before wait's final lifetime check can reject it.
          try {
            await task.wait(async () => {
              result = await verifyInboundPage(
                contextAt(
                  publisherContext(base, r.publisher),
                  publisherState(s, base, r.publisher),
                  r.after,
                ),
                request,
                page,
                lifetime(task),
              );
            });
          } catch (cause) {
            task.step(() => {});
            throw new AdmissionError('receive-refused', String(cause), { cause });
          }
          if (!result) throw Error('Missing inbound verification result');
          if (!('record' in result))
            return task.step(() => {
              promote([]);
              return { kind: result!.kind, recorded: false, status: describe(s) };
            });
          if (composed && r.publisher === base.publisher.id && result.kind === 'received') {
            const rows = await owner.carrier.load(task);
            try {
              const census = inspectInbound(rows, route, base).delivery;
              const delivery = verified.read(rows).delivery;
              try {
                requireSelfEnvelope(
                  census,
                  result.position,
                  decodeInboundPage(page).entries[0]!.envelope,
                );
                verifySyncState(census, delivery, {
                  ...s,
                  prefix: { ...s.prefix, observedThrough: result.through },
                });
              } catch (cause) {
                // The local census already verified. A contradictory network candidate is refused
                // before persistence, not diagnosed as corruption of the existing Local workspace.
                throw new AdmissionError('receive-refused', 'Self-stream history differs', {
                  cause,
                });
              }
            } finally {
              for (const row of rows) row.bytes.fill(0);
            }
          }
          const evidence = result.record;
          const before = await owner.carrier.spoolWitness(task),
            after = await task.wait(() => extendSpoolWitness(before, evidence, subtleFor(task))),
            updates = result.kind === 'received' ? result.updates : [];
          await owner.carrier.appendInbound(
            task,
            [
              ...updates.map((bytes) => ({ kind: 'update' as const, bytes })),
              { kind: 'heads', bytes: result.record },
            ],
            {
              before,
              after,
              checkCommit: () => {
                if (r.expires <= Date.now()) throw new ReceiveRequestExpired();
              },
              beforeCommit: async () => {
                await assertCurrent(task);
                const current = await state(task, owner, route);
                if (JSON.stringify(describe(current)) !== JSON.stringify(describe(s)))
                  captureError('Inbound prefix changed before commit');
              },
            },
          );
          committed = true;
          const saved = await state(task, owner, route);
          return task.step(() => {
            // This is the sole content-to-editor handoff: after native commit AND authenticated readback.
            promote(updates);
            return { kind: result!.kind, recorded: true, status: describe(saved) };
          });
        } catch (cause) {
          // If durable receive succeeded but publication/readback did not, only cold replay may resume
          // editing. Never let a discarded pending suffix erase this now-durable dependency.
          if (committed) void carrier.close().catch(() => {});
          throw cause;
        } finally {
          request.fill(0);
          if (result && 'record' in result) result.record.fill(0);
          if (result?.kind === 'received') for (const b of result.updates) b.fill(0);
        }
      }).finally(() => page.fill(0));
    },
    compactContent: () => carrier.compactContent(),
  });
  const adoptSuccessor = (input: unknown, checkCommit?: () => void) => {
    // Closed, bounded copy before enqueueing; no caller-owned data crosses crypto or storage awaits.
    const artifact = parseSuccessor(input);
    if (!composed)
      return Promise.reject(Error('Successor installation requires the composed owner'));
    return runCaptureTask(async (task, owner, route) => {
      await assertCurrent(task);
      const current = await readPromotion(task, options.slotId, options.code),
        marker = current.marker!;
      task.step(() => checkCommit?.());
      if (marker.successor) {
        if (!same(marker.successor.artifact, artifact))
          throw Error('Installed successor cannot be replaced');
        return { epoch: 2 as const, head: artifact.head };
      }
      const records = await owner.carrier.load(task);
      let committed = false;
      try {
        const nextHistory = await task.wait(() =>
          verifyAdmissionHistory(
            artifact,
            {
              pin: marker.pin,
              request: marker.admission!.request,
              receipt: marker.admission!.receipt!,
            },
            { epoch: 1, head: base.authority.head },
          ),
        );
        const nextRoute: CaptureRoute = { ...route, epoch: 2, history: nextHistory },
          nextBase: InboundContext = {
            ...base,
            authority: nextHistory.current,
            history: nextHistory,
          },
          before = await owner.carrier.spoolWitness(task),
          successor = { artifact, before };
        // The existing view has already authenticated source coverage. Verify the proposed context
        // against the same retained bytes too, including any lost accepted response at the boundary.
        const census = inspectInbound(records, nextRoute, nextBase),
          subtle = subtleFor(task);
        try {
          await verifyInstalledSuccessor(census.delivery.spool, nextRoute, successor, subtle);
          await verifySpool(
            census.delivery.spool,
            nextRoute,
            new Map([
              ...(base.retainedGenerationKeys ?? []),
              [base.generation, base.generationKey],
            ]),
            publicKey,
            subtle,
          );
          const delivery = await verifyDelivery(
            census.delivery,
            nextRoute,
            nextBase.authority,
            publicKey,
            subtle,
          );
          const inbound = await verifyInboundLedger(census, records, nextBase, lifetime(task));
          verifySyncState(census.delivery, delivery, inbound);
        } catch (cause) {
          throw new AdmissionError('receive-refused', 'Successor does not match retained history', {
            cause,
          });
        }
        await withPromotionRoot(
          task,
          current.claim,
          current.record,
          options.code,
          async (root, subtle) => {
            const next = await signPromotion(root, { ...marker, successor }, subtle);
            await writePromotion(
              task,
              current.claim,
              current.record,
              current.record,
              marker,
              next,
              checkCommit,
            );
            committed = true;
            task.step(() => {
              // No await between installing the route and publishing its verification context.
              installRoute(task, nextRoute);
              base = nextBase;
              installed = successor;
              expectedPayload = hex(promotionPayload(next));
              verified.clear();
              memo.clear();
              coverage.clear();
              outstanding?.fill(0);
              outstanding = undefined;
            });
          },
        );
        await assertCurrent(task);
        const readback = await owner.carrier.load(task);
        for (const r of readback) r.bytes.fill(0);
        return task.step(() => ({ epoch: 2 as const, head: artifact.head }));
      } catch (cause) {
        if (committed) void carrier.close().catch(() => {});
        throw cause;
      } finally {
        for (const r of records) r.bytes.fill(0);
      }
    });
  };
  const adoptMembership = (input: unknown, checkCommit?: () => void) => {
    const proofs = parseMembershipChain(input);
    if (!composed)
      return Promise.reject(Error('Membership installation requires the composed owner'));
    return runCaptureTask(async (task, owner, route) => {
      await assertCurrent(task);
      if (!route.history || (route.epoch < 3 && base.generation < 2))
        throw Error('Membership needs a certified installation');
      task.step(() => checkCommit?.());
      const current = joined
        ? await readJoinedAccount(task, options.slotId, options.code)
        : await readPromotion(task, options.slotId, options.code);
      const anchor = joined
        ? (current as Awaited<ReturnType<typeof readJoinedAccount>>).marker!.authority.base
        : {
            pin: options.pin,
            request: (current as Awaited<ReturnType<typeof readPromotion>>).marker!.admission!
              .request,
            receipt: (current as Awaited<ReturnType<typeof readPromotion>>).marker!.admission!
              .receipt!,
          };
      const verifiedHistory = await task.wait(() => verifyMembershipChain(proofs, anchor)),
        history = historyPublisher(verifiedHistory.history, route.credential);
      historyAuthority(history, route.history.current);
      task.step(() => checkCommit?.());
      if (history.current.tip === route.epoch)
        return { epoch: route.epoch, head: history.current.head };
      if (historyGeneration(history) !== base.generation) {
        // A fully verified successor stops admission synchronously, before the first custody await.
        suspendCapture();
        handoff = true;
        try {
          const disposition = await (
            await import('./rotationObservation')
          ).retainObservedRotation(
            task,
            joined ? 'joined' : 'promotion',
            options.slotId,
            options.code,
            proofs,
          );
          transition = rememberAccountTransition(
            account.accountId,
            disposition === 'removed' ? 'removed' : 'changed',
          );
          return { epoch: history.current.tip, head: history.current.head };
        } finally {
          // Do not await release from inside its own storage/network task.
          void carrier.close().catch(() => {});
        }
      }
      if (history.current.tip < route.epoch) throw Error('Membership cannot regress');
      const records = await owner.carrier.load(task);
      let committed = false;
      try {
        const before = await owner.carrier.spoolWitness(task),
          nextMembership = parseInstalledMembership({
            v: 1,
            proofs,
            cuts: [
              ...(membership?.cuts ?? []),
              { epoch: history.current.tip, head: history.current.head, before },
            ],
          }),
          nextRoute = { ...route, epoch: history.current.tip, history },
          nextBase = { ...base, history, authority: history.current },
          census = inspectInbound(records, nextRoute, nextBase),
          subtle = subtleFor(task);
        await verifyInstalledMembership(
          census.delivery.spool,
          history,
          nextMembership,
          initialEpoch,
          subtle,
        );
        await verifySpool(
          census.delivery.spool,
          nextRoute,
          new Map([...(base.retainedGenerationKeys ?? []), [base.generation, base.generationKey]]),
          publicKey,
          subtle,
        );
        const delivery = await verifyDelivery(
            census.delivery,
            nextRoute,
            nextBase.authority,
            publicKey,
            subtle,
          ),
          inbound = await verifyInboundLedger(census, records, nextBase, lifetime(task));
        verifySyncState(census.delivery, delivery, inbound);
        // Persist only the current-membership carrier. The installation, key, checkpoint and index stay bound.
        if (joined) {
          const next = await writeJoinedMembership(
            task,
            current as Awaited<ReturnType<typeof readJoinedAccount>>,
            options.code,
            nextMembership,
            checkCommit,
          );
          committed = true;
          expectedPayload = hex(joinedPayload(next));
        } else {
          const state = current as Awaited<ReturnType<typeof readPromotion>>;
          await withPromotionRoot(
            task,
            state.claim,
            state.record,
            options.code,
            async (root, subtle) => {
              const next = await signPromotion(
                root,
                { ...state.marker!, membership: nextMembership },
                subtle,
              );
              await writePromotion(
                task,
                state.claim,
                state.record,
                state.record,
                state.marker!,
                next,
                checkCommit,
              );
              committed = true;
              expectedPayload = hex(promotionPayload(next));
            },
          );
        }
        task.step(() => {
          installRoute(task, nextRoute);
          base = nextBase;
          membership = nextMembership;
          verified.clear();
          memo.clear();
          coverage.clear();
          outstanding?.fill(0);
          outstanding = undefined;
        });
        await assertCurrent(task);
        const readback = await owner.carrier.load(task);
        for (const r of readback) r.bytes.fill(0);
        return task.step(() => ({ epoch: history.current.tip, head: history.current.head }));
      } catch (cause) {
        if (committed) void carrier.close().catch(() => {});
        throw cause;
      } finally {
        for (const r of records) r.bytes.fill(0);
      }
    });
  };
  let discoveryDue = 0,
    discoveryRevision = 0;
  let discoveryFlight:
    | Promise<{ kind: 'adopted' | 'unchanged' | 'unknown' | 'paused' }>
    | undefined;
  const refreshAuthority = (token: AccountAccess, force = false) => {
    if (discoveryFlight) return discoveryFlight;
    const work = runNetworkTask(async (network) => {
      if (account.detached) return { kind: 'paused' as const };
      if (!composed) throw Error('Discovery requires the composed owner');
      const continuation =
        typeof options.membershipContinuation === 'function'
          ? options.membershipContinuation()
          : options.membershipContinuation;
      if (
        (base.authority.tip === 2 && base.generation === 1) ||
        (base.authority.tip === 3 && !continuation) ||
        (!force && performance.now() < discoveryDue)
      )
        return { kind: 'unchanged' as const };
      if (!canReceive()) return { kind: 'paused' as const };
      const revision = discoveryRevision;
      if (base.authority.tip >= 3 || base.generation > 1) {
        const prepared = await runCaptureTask(async (task) => {
          await assertCurrent(task);
          const anchor = joined
            ? (await readJoinedAccount(task, options.slotId, options.code)).marker!.authority.base
            : await readPromotion(task, options.slotId, options.code).then(({ marker }) => ({
                pin: options.pin,
                request: marker!.admission!.request,
                receipt: marker!.admission!.receipt!,
              }));
          const request = parseMembershipDiscoveryRequest({
            v: 2,
            kind: 'membership-discovery-request',
            pin: options.pin,
            workspaceId: base.authority.workspace,
            lineageId: base.authority.lineage,
            credentialId: base.reader.id,
            epoch: base.authority.tip,
            head: base.authority.head,
            nonce: hex(task.step(() => random(32))),
            expiresAt: Date.now() + 30000,
            signature: '00'.repeat(64),
          });
          request.signature = hex(
            new Uint8Array(
              await task.wait(async () =>
                subtleFor(task).sign(
                  'Ed25519',
                  signer!,
                  await membershipDiscoveryRequestMessage(request),
                ),
              ),
            ),
          );
          await assertCurrent(task);
          return { request, anchor };
        });
        if (!canReceive()) return { kind: 'paused' as const };
        const response = await network.wait(() =>
          privateDiscoveryPost(options.pin, access ?? token, prepared.request, network.signal),
        );
        if (!response) {
          if (terminalAccess) {
            const request = await runCaptureTask(async (task) => {
              await assertCurrent(task);
              const r = parseRemovalDiscoveryRequest({
                v: 1,
                kind: 'removal-discovery-request',
                pin: options.pin,
                workspaceId: base.authority.workspace,
                lineageId: base.authority.lineage,
                credentialId: base.reader.id,
                nonce: hex(random(32)),
                expiresAt: Date.now() + 30000,
                signature: '00'.repeat(64),
              });
              r.signature = hex(
                new Uint8Array(
                  await task.wait(async () =>
                    subtleFor(task).sign(
                      'Ed25519',
                      signer!,
                      await removalDiscoveryRequestMessage(r),
                    ),
                  ),
                ),
              );
              return r;
            });
            const terminal = await network.wait(() =>
              privateDiscoveryPost(options.pin, terminalAccess, request, network.signal),
            );
            if (terminal) {
              const verified = await network.wait(() =>
                verifyRemovalDiscoveryResponse(terminal, request, prepared.anchor, Date.now()),
              );
              await adoptMembership(verified.proofs, () => {
                network.step(() => {});
                if (request.expiresAt <= Date.now()) throw new ReceiveRequestExpired();
              });
              return { kind: 'adopted' as const };
            }
          }
          return { kind: 'unknown' as const };
        }
        try {
          const answer = await network.wait(() =>
            verifyMembershipDiscoveryResponse(
              response,
              prepared.request,
              prepared.anchor,
              Date.now(),
            ),
          );
          const result = await adoptMembership(answer.response.proofs, () => {
            network.step(() => {});
            if (prepared.request.expiresAt <= Date.now()) throw new ReceiveRequestExpired();
          });
          discoveryDue = revision === discoveryRevision ? performance.now() + 5000 : 0;
          return {
            kind:
              result.head === prepared.request.head ? ('unchanged' as const) : ('adopted' as const),
          };
        } catch {
          network.step(() => {});
          recordPrivateTransportDiagnostic({
            operation: 'discovery',
            phase: 'verify',
            code: 'response-invalid',
          });
          return { kind: 'unknown' as const };
        }
      }
      const prepared = await runCaptureTask(async (task) => {
        await assertCurrent(task);
        const { marker } = await readPromotion(task, options.slotId, options.code);
        const request = parseDiscoveryRequest({
          v: 1,
          kind: 'authority-discovery-request',
          pin: options.pin,
          workspaceId: base.authority.workspace,
          lineageId: base.authority.lineage,
          credentialId: base.reader.id,
          epoch: base.authority.tip,
          head: base.authority.head,
          nonce: hex(task.step(() => random(32))),
          expiresAt: Date.now() + 30000,
          signature: '00'.repeat(64),
        });
        request.signature = hex(
          new Uint8Array(
            await task.wait(async () =>
              subtleFor(task).sign('Ed25519', signer!, await discoveryRequestMessage(request)),
            ),
          ),
        );
        await assertCurrent(task);
        return {
          request,
          first: {
            pin: options.pin,
            request: marker!.admission!.request,
            receipt: marker!.admission!.receipt!,
          },
        };
      });
      if (!canReceive()) return { kind: 'paused' as const };
      const response = await network.wait(() =>
        privateDiscoveryPost(options.pin, access ?? token, prepared.request, network.signal),
      );
      if (!response) return { kind: 'unknown' as const };
      try {
        const answer = await network.wait(() =>
          verifyDiscoveryResponse(response, prepared.request, prepared.first, Date.now()),
        );
        const checkCommit = () => {
          network.step(() => {});
          if (prepared.request.expiresAt <= Date.now())
            throw new AdmissionError(
              'receive-refused',
              'Authority discovery expired before installation',
            );
        };
        if (answer.successor) {
          await adoptSuccessor(answer.successor, checkCommit);
          return { kind: 'adopted' as const };
        }
        await runCaptureTask(async (task) => {
          await assertCurrent(task);
          task.step(() => {
            checkCommit();
            // Another owned adoption may have won while the HTTP call was in flight. Never regress it.
            if (!base.history && base.authority.head !== prepared.request.head)
              throw Error('Discovery anchor changed');
            discoveryDue = revision === discoveryRevision ? performance.now() + 5000 : 0;
          });
        });
        return { kind: 'unchanged' as const };
      } catch {
        network.step(() => {});
        recordPrivateTransportDiagnostic({
          operation: 'discovery',
          phase: 'verify',
          code: 'response-invalid',
        });
        return { kind: 'unknown' as const };
      }
    });
    discoveryFlight = work;
    const settled = () => {
      if (discoveryFlight === work) discoveryFlight = undefined;
    };
    void work.then(settled, settled);
    return work;
  };
  const createOutbound = (whenDurable: () => Promise<unknown>) => {
    if (account.detached) throw Error('This local copy is detached from sync');
    if (!composed) throw Error('Outbound composition was not opened');
    const inspect: NonNullable<Parameters<typeof createDeliveryOperations>[0]['inspect']> = (
      records,
      route,
    ) => inspectCensus(records, route).delivery;
    const checkPublication = async (
      task: SessionTask,
      owner: ReturnType<typeof prepareAccountCustody>,
      _route: CaptureRoute,
      currentRecords?: readonly import('./contentRecord').OpenedRecord[],
    ) => {
      await assertCurrent(task);
      const records = currentRecords ?? (await owner.carrier.load(task));
      try {
        const halted = verified.read(
          records,
          ({ inbound, delivery }) => !!inbound.conflict || publicationState(delivery) !== 'ready',
        );
        if (halted) throw Error('Publication is halted by retained evidence');
      } finally {
        if (!currentRecords) for (const r of records) r.bytes.fill(0);
      }
    };
    const delivery = createDeliveryOperations({
      ...(access ? { access } : {}),
      authority: () => base.authority,
      pin: () => options.pin,
      signer: () => signer!,
      publicKey: () => publicKey,
      assertCurrent,
      inspect,
      verified: (records) =>
        verified.read(records, ({ inbound, delivery }) => {
          if (inbound.conflict) throw Error('Publication halted by inbound conflict');
          return delivery;
        }),
      reuse: (task) => ({ memo, current: () => task.step(() => {}) }),
      network: runNetworkTask,
      canSubmit: canReceive,
      // withState validates the complete view (including inbound conflict) and current authority
      // before each operation. Network replies re-enter withState and obtain a fresh load.
      run: runCaptureTask,
    });
    return {
      ...delivery,
      deliveryStatus: () =>
        runCaptureTask(async (task, owner) => {
          const records = await owner.carrier.load(task);
          try {
            return verified.read(records, ({ inbound, delivery }) => ({
              ...describeDelivery(delivery),
              state: inbound.conflict ? ('conflict' as const) : publicationState(delivery),
            }));
          } finally {
            for (const row of records) row.bytes.fill(0);
          }
        }),
      ...createEnvelopePreparation({
        batchSources: true,
        key: () => base.generationKey,
        signer: () => signer!,
        whenDurable,
        checkPublication,
        inspect: (records, route) => inspect(records, route, base.authority).spool,
        run: runCaptureTask,
      }),
      spoolStatus: () =>
        runCaptureTask(async (task, owner, route) => {
          const records = await owner.carrier.load(task);
          try {
            const spool = inspect(records, route, base.authority).spool;
            return {
              attempts: spool.attempts,
              positions: spool.positions.map((p) => ({
                position: p.position,
                source: { ...p.source },
                ...(p.additional ? { additional: p.additional.map((s) => ({ ...s })) } : {}),
                attempts: [...p.attempts],
                persisted: !!p.wire,
              })),
            };
          } finally {
            for (const r of records) r.bytes.fill(0);
          }
        }),
    };
  };
  return {
    access,
    devices: Object.freeze({
      detached: account.detached,
      get transition() {
        return transition;
      },
      ...(access && !account.detached
        ? {
            remove: (target: string) =>
              runCaptureTask(async (task) => {
                await assertCurrent(task);
                if (
                  !base.history ||
                  target === base.reader.id ||
                  !historyDevices(base.history).some((d) => d.id === target)
                )
                  throw Error('Choose another saved device');
                suspendCapture();
                handoff = true;
                transition = rememberAccountTransition(account.accountId, 'removal-incomplete');
                try {
                  const { withRotationCustody } = await import('./rotationObservation');
                  const { openDeviceRemovalVault } = await import('../account/deviceRemovalVault');
                  const outcome = await withRotationCustody(
                    task,
                    joined ? 'joined' : 'promotion',
                    options.slotId,
                    options.code,
                    async ({ vault, source }) => {
                      const native = await openDeviceRemovalVault(
                        {
                          source,
                          participant: vault.participant,
                          rotation: vault,
                        },
                        target,
                        task.signal,
                      );
                      return native.advance(access);
                    },
                  );
                  transition = rememberAccountTransition(
                    account.accountId,
                    outcome === 'applying' ? 'removal-committed' : 'removal-pending',
                  );
                  return outcome;
                } finally {
                  void carrier.close().catch(() => {});
                }
              }),
          }
        : {}),
      read: () =>
        runCaptureTask(async (task) => {
          await assertCurrent(task);
          return task.step(() =>
            Object.freeze({
              epoch: base.authority.tip,
              generation: base.generation,
              detached: account.detached,
              currentDevice: base.reader.id,
              devices: base.history
                ? historyDevices(base.history)
                : Object.freeze([
                    Object.freeze({ id: base.reader.id, state: 'certified' as const }),
                  ]),
            }),
          );
        }),
    }) satisfies DeviceRoster,
    publisherCount: () => base.history?.readers.length ?? 1,
    api,
    account,
    carrier,
    listCaptures,
    fetchPage,
    createOutbound,
    adoptSuccessor,
    adoptMembership,
    refreshAuthority,
    resetDiscovery: () => {
      discoveryRevision++;
      discoveryDue = 0;
    },
  };
}

/** Storage-only surface retained for independent conformance and preparation. */
export async function openOwnedAccountReceiveStore(input: AccountStartupOptions) {
  const { api } = await openAccountReceiveOwner(input);
  return Object.freeze({ ...api, receivePage: (bytes: Bytes) => api.receivePage(bytes) });
}

async function openReceivingWorkspace(
  input: AccountWorkspaceOptions,
  operatorToken?: AccountAccess,
  composed = false,
  joined = false,
) {
  const driven = operatorToken !== undefined;
  if (driven && !isAccountAccess(operatorToken)) throw Error('Invalid private operator token');
  let gate: () => DriverGate = () => 'closed';
  const options = {
    ...captureAccountOptions(input),
    identity: structuredClone(input.identity),
    today: input.today,
  };
  const {
    access,
    devices,
    publisherCount,
    api,
    account,
    carrier,
    listCaptures,
    fetchPage,
    createOutbound,
    adoptSuccessor,
    adoptMembership,
    refreshAuthority,
    resetDiscovery,
  } = await openAccountReceiveOwner(
    options,
    options.identity.id,
    () => !driven || gate() === 'ready',
    composed,
    joined,
  );
  operatorToken = access ?? operatorToken;
  let enqueue!: OwnedReceiveQueue;
  try {
    const workspace = await createAdmittedWorkspace(
      (config) =>
        createAdmissionOwner(carrier, config, (receive) => {
          enqueue = receive;
        }),
      {
        identity: options.identity,
        captureSources: true,
        suppressEmptySources: true,
        validateReceive: () => {
          throw Error('Use the owned signed-page receiver');
        },
        ...(options.today ? { today: options.today } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      },
    );
    if (options.signal?.aborted || workspace.status.state !== 'active') {
      await workspace.close();
      throw Error('Account opening was cancelled');
    }
    gate = () => {
      if (
        carrier.signal.aborted ||
        carrier.state !== 'active' ||
        !['active', 'blocked'].includes(workspace.status.state)
      )
        return 'closed';
      if (workspace.status.state !== 'active' || workspace.status.pressure !== null)
        return 'local-storage';
      return globalThis.navigator?.onLine === false ? 'offline' : 'ready';
    };
    const receivePage = (bytes: Bytes, request?: Bytes) => {
      try {
        return enqueue(bytes, (page, promote) => api.receivePage(page, promote, request));
      } catch (cause) {
        return Promise.reject(cause);
      }
    };
    let flight: Promise<unknown> | undefined;
    carrier.beforeRelease?.(async () => {
      await flight?.catch(() => {});
    });
    const receiveNext = (operatorToken: AccountAccess) => {
      if (carrier.signal.aborted)
        return Promise.reject(new AdmissionError('inactive-session', 'Receive owner is closed'));
      if (flight) return Promise.resolve({ kind: 'busy' as const });
      const work = (async () => {
        const { request, page, oversized } = await fetchPage(operatorToken);
        try {
          if (carrier.signal.aborted)
            throw new AdmissionError('inactive-session', 'Receive owner is closed');
          if (oversized)
            return {
              kind: 'rejected' as const,
              reason: 'response-too-large' as const,
              recorded: false,
            };
          if (!page) return { kind: 'unknown' as const, recorded: false };
          // Only the ordered owner may verify, persist and publish this exact request's page.
          try {
            return await receivePage(page, request);
          } catch (cause) {
            if (cause instanceof ReceiveAuthorityChanged)
              return { kind: 'unknown' as const, recorded: false };
            // An expiry is transient too. Invalid signatures, scope, prefix, or owner
            // still reject and preserve the scheduler's diagnostic halt.
            if (
              cause instanceof ReceiveRequestExpired ||
              (cause instanceof AdmissionError &&
                cause.cause instanceof InboundError &&
                cause.cause.reason === 'expired')
            ) {
              recordPrivateReceiveExpiry(
                cause instanceof ReceiveRequestExpired ? 'commit' : 'verify',
              );
              return { kind: 'expired' as const, recorded: false };
            }
            if (
              cause instanceof AdmissionError &&
              cause.cause instanceof InboundError &&
              cause.cause.reason === 'size'
            ) {
              recordPrivateTransportDiagnostic({
                operation: 'read-v2',
                phase: 'verify',
                code: 'inbound-size',
              });
              return {
                kind: 'rejected' as const,
                reason: 'inbound-size' as const,
                recorded: false,
              };
            }
            throw cause;
          }
        } finally {
          request.fill(0);
          page?.fill(0);
        }
      })();
      flight = work;
      const settled = () => {
        if (flight === work) flight = undefined;
      };
      void work.then(settled, settled);
      return work;
    };
    const result = Object.freeze({
      ...account,
      kind: 'ready' as const,
      devices,
      workspace,
      receiveStatus: api.status,
      prepareRead: api.prepareRead,
      receivePage: (bytes: Bytes) => receivePage(bytes),
      receiveNext,
      compactContent: async () => {
        await workspace.whenDurable();
        return carrier.compactContent();
      },
      listCaptures,
    });
    if (composed && !account.detached) {
      const outbound = createOutbound(() => workspace.whenDurable());
      let notifications: ReturnType<typeof startNotifications> | undefined;
      let notificationHealthy = false;
      let unsubscribe: (() => void) | undefined, unsubscribeLocal: (() => void) | undefined;
      const online = () => {
          resetDiscovery();
          scheduler.wake('online');
        },
        offline = () => scheduler.wake('gate');
      const scheduler = createSyncScheduler({
        signal: carrier.signal,
        gate,
        receiveInterval: () => (notificationHealthy ? 60000 + Math.random() * 5000 : 5000),
        send: () => driveOutboundStep(outbound, operatorToken ?? '', gate),
        receive: async () => {
          const authority = await refreshAuthority(operatorToken ?? '');
          if (authority.kind === 'adopted') scheduler.wake('authority');
          if (authority.kind === 'unknown' || authority.kind === 'paused') {
            const state = await api.status();
            return { kind: authority.kind, receivedThrough: state.receivedThrough };
          }
          // One hint concerns the workspace, not a particular publisher. Sweep every
          // eligible stream before choosing the slow idle repair interval.
          for (let remaining = publisherCount(); ; remaining--) {
            const step = await driveReceiveStep(result, operatorToken ?? '', gate);
            if (step.kind !== 'idle' || remaining <= 1) return step;
          }
        },
        detach() {
          notifications?.close();
          operatorToken = undefined;
          unsubscribe?.();
          unsubscribeLocal?.();
          globalThis.removeEventListener?.('online', online);
          globalThis.removeEventListener?.('offline', offline);
        },
      });
      try {
        let previousGate = gate();
        unsubscribeLocal = workspace.outgoing((bytes) => {
          bytes.fill(0);
          scheduler.wake('local');
        });
        unsubscribe = workspace.onStatus(() => {
          const current = gate();
          if (current !== previousGate) {
            previousGate = current;
            scheduler.wake('gate');
          }
        });
        globalThis.addEventListener?.('online', online);
        globalThis.addEventListener?.('offline', offline);
        if (!carrier.beforeRelease) throw Error('Missing composed driver cleanup ownership');
        carrier.beforeRelease(scheduler.dispose);
        if (access) {
          notifications = startNotifications({
            signal: carrier.signal,
            open: (signal) => access.openNotifications(signal),
            wake: () => {
              resetDiscovery();
              scheduler.wake('remote');
            },
            health: (healthy) => {
              notificationHealthy = healthy;
              if (!healthy) scheduler.wake('remote');
            },
          });
          carrier.beforeRelease(notifications.dispose);
        }
        scheduler.wake('start');
      } catch (cause) {
        await scheduler.dispose();
        throw cause;
      }
      return Object.freeze({
        ...result,
        outbound,
        sync: scheduler.runtime,
        receiver: undefined,
        refreshAuthority: async () => {
          const result = await refreshAuthority(operatorToken ?? '', true);
          if (result.kind === 'adopted') scheduler.wake('authority');
          return result;
        },
        adoptSuccessor: async (input: unknown) => {
          const result = await adoptSuccessor(input);
          scheduler.runtime.retry('send');
          scheduler.runtime.retry('receive');
          return result;
        },
        adoptMembership: async (input: unknown) => {
          const result = await adoptMembership(input);
          scheduler.runtime.retry('send');
          scheduler.runtime.retry('receive');
          return result;
        },
      });
    }
    if (!driven || account.detached)
      return Object.freeze({
        ...result,
        receiver: undefined,
        sync: undefined,
        outbound: undefined,
      });
    let unsubscribe: (() => void) | undefined;
    const online = () => scheduler.wake('online'),
      offline = () => scheduler.wake('gate');
    const scheduler = createReceiveScheduler({
      signal: carrier.signal,
      gate,
      step: () => driveReceiveStep(result, operatorToken ?? '', gate),
      detach() {
        operatorToken = undefined;
        unsubscribe?.();
        globalThis.removeEventListener?.('online', online);
        globalThis.removeEventListener?.('offline', offline);
      },
    });
    try {
      let previousGate = gate();
      unsubscribe = workspace.onStatus(() => {
        const current = gate();
        if (current !== previousGate) {
          previousGate = current;
          scheduler.wake('gate');
        }
      });
      globalThis.addEventListener?.('online', online);
      globalThis.addEventListener?.('offline', offline);
      if (!carrier.beforeRelease) throw Error('Missing receive driver cleanup ownership');
      carrier.beforeRelease(scheduler.dispose);
      scheduler.wake('start');
    } catch (cause) {
      await scheduler.dispose();
      throw cause;
    }
    return {
      ...result,
      sync: undefined,
      outbound: undefined,
      receiver: Object.freeze({
        get status() {
          return scheduler.status();
        },
        retry: () => scheduler.wake('retry'),
        onStatus: scheduler.onStatus,
      }),
    };
  } catch (cause) {
    await carrier.close();
    throw cause;
  }
}

/** Private manual v9 editor/receive surface, without automatic network work. */
export const openOwnedReceivingAccountWorkspace = (input: AccountWorkspaceOptions) =>
  openReceivingWorkspace(input);
/** Private polling receiver. Raw request/page operations remain internal to this composition. */
export async function openOwnedPollingAccountWorkspace(
  input: AccountWorkspaceOptions,
  operatorToken: AccountAccess,
) {
  if (!isAccountAccess(operatorToken)) throw Error('Private operator token required');
  const result = await openReceivingWorkspace(input, operatorToken);
  if (!result.receiver) throw Error('Missing receive polling ownership');
  const { prepareRead: _prepare, receivePage: _receive, receiveNext: _next, ...owned } = result;
  return Object.freeze({ ...owned, receiver: result.receiver });
}

/** One durable owner for this certified publisher and all eligible inbound streams. */
export async function openOwnedSyncingAccountWorkspace(
  input: AccountWorkspaceOptions,
  operatorToken: AccountAccess,
  joined = false,
) {
  if (!isAccountAccess(operatorToken)) throw Error('Private operator token required');
  const result = await openReceivingWorkspace(input, operatorToken, true, joined);
  if ((!result.sync || !result.outbound) && !result.detached)
    throw Error('Missing outbound composition');
  clearAccountTransition(result.accountId);
  const {
    prepareRead: _prepare,
    receivePage: _receive,
    receiveNext: _next,
    outbound,
    receiver: _receiver,
    ...owned
  } = result;
  return Object.freeze({
    ...owned,
    adoptMembership: (input: unknown) => {
      if (!('adoptMembership' in result))
        return Promise.reject(Error('Detached copy cannot adopt membership'));
      return result.adoptMembership(input);
    },
    deliveryStatus: () => {
      if (!outbound) throw Error('Detached copy has no delivery driver');
      return outbound.deliveryStatus();
    },
    spoolStatus: () => {
      if (!outbound) throw Error('Detached copy has no outbound spool');
      return outbound.spoolStatus();
    },
  });
}
