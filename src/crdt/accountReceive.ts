import { accountTextMode } from './accountTextMode';
import { MaintenanceInterrupted, isMaintenanceTask } from './contentMaintenance';
import { collectReceivePages } from './receivePrefetch';
import type { Diagnostic } from '../../account-protocol/diagnostics';
import {
  RECEIVE_GROUP_LIMIT,
  packReceivePages,
  unpackReceivePages,
  receiveGroupFits,
} from './receiveGroup';
import { createReceiveSelection, unresolvedSelfSubmission } from './receiveSelection';
import { markAccountOpen } from './accountLedgerMetrics';
import type { OpenedRecord } from './contentRecord';
import { countLedgerWork } from './accountLedgerMetrics';
import { accountLedgerMode } from './accountLedgerMode';
import { accountBatchPolicy } from './accountBatchPolicy';
import { originalMembershipBoundaries } from './accountSuccessor';
import { createHistoryTransport, HistoryTransportUnavailable } from '../account/historyHttp';
import {
  historyExchangeMessage,
  HISTORY_EXCHANGE_REQUEST_LIFETIME_MS,
  parseHistoryExchange,
} from '../../account-protocol/historyExchange';
import { EMPTY_HISTORY_CHECKPOINT } from '../../account-protocol/historyCheckpoint';
import {
  HistoryInstallSizeError,
  checkpointAuthority,
  encodeHistoryInstall,
  decodeHistoryInstall,
  verifyHistoryInstall,
} from './historyInstall';
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
import { createVerifiedRecords, eraseVerified, copyRecords, sameBytes } from './verifiedRecords';
import { createVerificationMemo } from './verificationMemo';
import {
  extendAccountLedger,
  indexVerifiedLedger,
  sameAccountLedger,
  type AccountLedgerView,
} from './incrementalAccountLedger';
import { countLedger, measureLedger } from './accountLedgerMetrics';
import { createInboundCoverage } from './inboundLedger';
import { createEnvelopePreparation } from './accountEnvelopePreparation';
import { createDeliveryOperations, describeDelivery } from './accountDelivery';
import { publicationState } from './deliveryRecord';
import {
  advanceSelfReceive,
  advanceSelfReceiveCooperatively,
  requireSelfEnvelope,
  verifySyncState,
} from './accountSyncState';
import { createSyncScheduler, driveOutboundStep } from './accountSyncDriver';
import { networkLoginNeedsPasskey } from '../account/networkLogin';
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
  applyHistoryReceiveCuts,
  heldInboundContext,
  inspectInbound,
  inspectInboundCooperatively,
  verifyInboundLedger,
  contextAt,
  publisherContext,
  publisherState,
} from './inboundLedger';
import { verifySpoolWitness, verifySpool, extendSpoolWitness } from './spoolRecord';
import { verifyDelivery } from './deliveryRecord';
import {
  captureError,
  capturedSourcePresence,
  type CaptureRoute,
  type CapturedSourceIdentity,
} from './sourceCapture';
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

const ledgerMode = accountLedgerMode(import.meta.env?.['VITE_ACCOUNT_LEDGER']);

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
  const incremental = ledgerMode === 'incremental';
  const verified = createVerifiedRecords<AccountLedgerView>({
    ...(incremental && import.meta.env?.['VITE_ACCOUNT_RECORD_OWNERSHIP'] !== '0'
      ? { ownResults: true as const }
      : {}),
  });
  let verifiedCounter: import('./contentRecord').ContentCounter | undefined;
  let sinceAudit = 0,
    auditDue = false,
    auditDeferred = false;
  // Keys are fixed; adoption clears every memo before swapping the durable authority context.
  const memo = createVerificationMemo(),
    coverage = createInboundCoverage({
      incremental,
      direct: import.meta.env?.['VITE_ACCOUNT_DIRECT_COVERAGE'] !== '0',
    });
  const inspectCensus = <R>(
    records: Parameters<typeof inspectInbound>[0],
    route: CaptureRoute,
    select: (census: AccountLedgerView['census']) => R,
  ): R => {
    if (!incremental)
      return select(
        verified.matches(records)
          ? verified.read(records, (v) => v.census)
          : inspectInbound(records, route, base),
      );
    const projected = verified.readIfMatches(records, (v) => select(v.census));
    return projected ? projected.value : select(inspectInbound(records, route, base));
  };
  let installed: InstalledSuccessor | undefined;
  let membership: InstalledMembership | undefined,
    initialEpoch = 3;
  let base!: InboundContext, signer: CryptoKey | undefined, publicKey!: CryptoKey;
  let inheritedHistoryHash: string | undefined;
  let handoff = false,
    transition = '';
  let expectedPayload: Bytes = new Uint8Array(),
    expectedRecord: CustodyRecord,
    outstanding: Bytes | undefined;
  let outstandingGroup: Bytes[] = [];
  const subtleFor = (task: SessionTask) => guardedSubtle(() => task.step(() => {}));
  const lifetime = (task: SessionTask) => ({ assertCurrent: () => task.step(() => {}) });
  const assertCurrent = async (task: SessionTask) => {
    countLedgerWork('authorityChecks');
    if (handoff) throw new ReceiveAuthorityChanged();
    if (joined) {
      const current = await readJoinedAccount(task, options.slotId, options.code);
      if (
        !current.marker ||
        !sameBytes(joinedPayload(current.marker), expectedPayload) ||
        !recordEqual(current.record, expectedRecord)
      )
        captureError('Certified device authority changed');
      return;
    }
    const current = await readPromotion(task, options.slotId, options.code);
    if (
      !current.marker ||
      !sameBytes(promotionPayload(current.marker), expectedPayload) ||
      !recordEqual(current.record, expectedRecord)
    )
      captureError('Inbound authority changed before commit');
  };
  const extension: CaptureExtension = {
    version: 9,
    sourceRecords: (records, route) =>
      inspectCensus(records, route, (c) => c.delivery.spool.sourceRecords),
    ...(incremental
      ? {
          sourcePresence: (
            records: readonly OpenedRecord[],
            route: CaptureRoute,
            incoming: readonly CapturedSourceIdentity[],
          ) =>
            inspectCensus(records, route, (c) =>
              capturedSourcePresence(c.delivery.spool.sources, incoming),
            ),
        }
      : {}),
    async initialize(task, v) {
      expectedPayload = promotionPayload({ ...v.marker, v: 9, stage: 'account-receiving' });
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
      expectedPayload = joinedPayload(v.marker!);
      expectedRecord = v.record;
      membership = v.marker!.membership;
      inheritedHistoryHash =
        v.marker!.v === 3
          ? v.marker!.reading.successor.epoch.intent.historyCheckpoint
          : v.marker!.v === 2 && 'history' in v.marker!.reading.checkpoint
            ? v.marker!.reading.checkpoint.history?.checkpoint
            : undefined;
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
      const checkFull = async (
        records: import('./contentRecord').OpenedRecord[],
        audit = false,
      ): Promise<AccountLedgerView> => {
        const began = performance.now();
        countLedger('full');
        const isolated = audit ? createInboundCoverage() : undefined;
        const checking = (isolated ?? coverage).bind(records);
        // Cached crypto checks resolve in microtasks. A real maintenance budget is needed
        // between receipts so input can cancel before the next complete coverage proof.
        const checkpoint =
          audit && isMaintenanceTask(task) ? () => task.wait(() => Promise.resolve()) : undefined;
        try {
          const census = checkpoint
              ? await inspectInboundCooperatively(records, route, base, checkpoint)
              : inspectInbound(records, route, base),
            subtle = subtleFor(task),
            reuse = { memo, current: () => task.step(() => {}) };
          await checkpoint?.();
          await verifySpoolWitness(census.delivery.spool, counter, subtle, reuse);
          await checkpoint?.();
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
          await checkpoint?.();
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
          await checkpoint?.();
          const delivery = await verifyDelivery(
            census.delivery,
            route,
            base.authority,
            publicKey,
            subtle,
            reuse,
          );
          await checkpoint?.();
          const inbound = await verifyInboundLedger(census, records, base, lifetime(task), {
            memo,
            coverage: checking,
            ...(checkpoint ? { checkpoint } : {}),
          });
          if (composed) {
            const check = (updates: readonly Bytes[]) => checking.check(records, updates);
            if (checkpoint)
              await advanceSelfReceiveCooperatively(
                census.delivery,
                delivery,
                inbound,
                route,
                check,
                checkpoint,
              );
            else advanceSelfReceive(census.delivery, delivery, inbound, route, check);
          }
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
              ...census.installations.map((e) => 'history:' + e.record.seq),
            ]),
          );
          const result: AccountLedgerView = { delivery, inbound, census };
          if (incremental && !audit) {
            const indexes = await indexVerifiedLedger(result, records, route, counter, subtle);
            if (indexes) result.indexes = indexes;
          }
          return result;
        } finally {
          isolated?.clear();
          measureLedger('full', began);
        }
      };
      let validationComplete = false;
      try {
        await verified.verify(
          records,
          view ?? {},
          checkFull,
          () => task.step(() => {}),
          incremental
            ? async (previous, before, records) => {
                const began = performance.now();
                try {
                  const next = await extendAccountLedger(
                    previous,
                    before,
                    records,
                    route,
                    counter,
                    base,
                    publicKey,
                    subtleFor(task),
                    { memo, current: () => task.step(() => {}) },
                    () => coverage.prepare(records) === 'equivalent',
                  );
                  if (!next) return;
                  const checking = coverage.bind(records);
                  const inbound = await verifyInboundLedger(
                    next.census,
                    records,
                    base,
                    lifetime(task),
                    { memo, coverage: checking },
                    { state: previous.inbound, after: before.at(-1)?.seq ?? 0 },
                  );
                  if (composed)
                    advanceSelfReceive(
                      next.census.delivery,
                      next.delivery,
                      inbound,
                      route,
                      (updates) => checking.check(records, updates),
                      previous.delivery.acceptedThrough,
                    );
                  const result = { ...next, inbound };
                  sinceAudit += records.filter((r) => r.seq > (before.at(-1)?.seq ?? 0)).length;
                  auditDue ||=
                    import.meta.env?.['VITE_ACCOUNT_LEDGER_AUDIT'] === 'every' ||
                    (sinceAudit >= 1024 &&
                      records.some((r) => r.kind === 'state' && r.seq > (before.at(-1)?.seq ?? 0)));
                  return result;
                } finally {
                  measureLedger('incremental', began);
                }
              }
            : undefined,
        );
        validationComplete = true;
        verifiedCounter = structuredClone(counter);
        // Install only the fully authenticated delta before discretionary reference work.
        // A cancelled audit stays due, but must not migrate onto the next foreground edit.
        if (auditDue && (!auditDeferred || isMaintenanceTask(task))) {
          countLedger('audits');
          const auditRows = copyRecords(records),
            result = verified.read(records);
          let oracle;
          try {
            oracle = await checkFull(auditRows, true);
            task.step(() => {});
            if (!sameAccountLedger(result, oracle)) {
              countLedger('mismatches');
              console.error('done/account-ledger-reference-mismatch');
              captureError('Account ledger reference mismatch');
            }
            countLedger('auditCompletions');
            sinceAudit = 0;
            auditDue = auditDeferred = false;
          } catch (e) {
            if (e instanceof MaintenanceInterrupted) {
              auditDeferred = true;
              countLedger('auditInterruptions');
            }
            throw e;
          } finally {
            eraseVerified(oracle);
            eraseVerified(result);
            eraseVerified(auditRows);
          }
        }
      } catch (e) {
        if (validationComplete && e instanceof MaintenanceInterrupted) throw e;
        verified.clear();
        verifiedCounter = undefined;
        memo.clear();
        coverage.clear();
        throw e;
      }
    },
    dispose() {
      expectedPayload.fill(0);
      verifiedCounter = undefined;
      verified.clear();
      memo.clear();
      coverage.clear();
      base?.generationKey.fill(0);
      for (const key of base?.retainedGenerationKeys?.values() ?? []) key.fill(0);
      signer = undefined;
      outstanding?.fill(0);
      outstanding = undefined;
      for (const request of outstandingGroup) request.fill(0);
      outstandingGroup = [];
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
  const readState = async <R>(
    task: SessionTask,
    owner: ReturnType<typeof prepareAccountCustody>,
    select: (view: Readonly<AccountLedgerView>) => R,
  ) => {
    await assertCurrent(task);
    const records = await owner.carrier.load(task);
    try {
      return task.step(() => ({ value: verified.read(records, select) })).value;
    } finally {
      for (const r of records) r.bytes.fill(0);
    }
  };
  const state = async (
    task: SessionTask,
    owner: ReturnType<typeof prepareAccountCustody>,
    _route: CaptureRoute,
  ) => {
    return await readState(task, owner, (v) => v.inbound);
  };
  const receiveSelection = createReceiveSelection();
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
    _route: CaptureRoute,
    after?: number,
    grouped = false,
  ) => {
    if (account.detached) throw Error('This local copy is detached from sync');
    // The scheduling hint comes from the same fresh, authenticated load as the prefix.
    // A retained submission without a decision must still get its reconciliation read.
    const { inbound: all, pendingSelf } = await readState(task, owner, (v) => ({
      inbound: v.inbound,
      pendingSelf: unresolvedSelfSubmission(v.delivery),
    }));
    const publishers = base.history?.readers.map((r) => r.id) ?? [base.publisher.id];
    const publisher =
      after === undefined
        ? receiveSelection.next(
            publishers,
            composed ? { publisher: base.publisher.id, pending: pendingSelf } : undefined,
          )
        : base.publisher.id;
    const s = publisherState(all, base, publisher),
      cursor = after ?? s.prefix.position;
    if (s.conflict) throw Error('Inbound stream is conflicted');
    if (
      !Number.isSafeInteger(cursor) ||
      cursor < (s.startingPoint?.position ?? 0) ||
      cursor > s.prefix.position
    )
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
    const count =
      grouped && (!composed || publisher !== base.publisher.id)
        ? Math.min(
            RECEIVE_GROUP_LIMIT,
            receiveSelection.capacity(publisher),
            Math.max(1, s.prefix.observedThrough - cursor),
          )
        : 1;
    const requests: Bytes[] = [];
    try {
      for (let i = 0; i < count; i++) {
        const next = { ...r, after: cursor + i, nonce: hex(task.step(() => random(32))) };
        next.signature = hex(
          new Uint8Array(
            await task.wait(() =>
              subtleFor(task).sign('Ed25519', signer!, inboundRequestMessage(next)),
            ),
          ),
        );
        requests.push(encodeInboundRequest(next));
      }
      await assertCurrent(task);
      return task.step(() => {
        outstanding?.fill(0);
        for (const request of outstandingGroup) request.fill(0);
        outstandingGroup = requests;
        outstanding = requests[0]!;
        return outstanding.slice();
      });
    } catch (cause) {
      for (const request of requests) request.fill(0);
      throw cause;
    }
  };
  const prepareGroup = () =>
    runCaptureTask(async (task, owner, route) => {
      const first = await prepareRead(task, owner, route, undefined, true);
      first.fill(0);
      return outstandingGroup.map((r) => r.slice());
    });
  // Future cursors are only scheduling predictions through an authenticated observed tip.
  // The exact request set remains owned, and no prefix advances before ordered verification.
  const fetchPage = async (operatorToken: AccountAccess) => {
    let requests: Bytes[] = [],
      pages: Bytes[] = [];
    try {
      return await runNetworkTask(async (network) => {
        requests = await prepareGroup();
        const events: Diagnostic[][] = requests.map(() => []);
        let attempted = 0;
        await network.wait(async () => {
          const collected = await collectReceivePages(
            requests.length,
            network.signal,
            (index, signal, limit) =>
              canReceive()
                ? privateDeliveryPost(
                    options.pin,
                    access ?? operatorToken,
                    'read-v2',
                    requests[index]!,
                    limit,
                    signal,
                    (event) => {
                      events[index]!.push(event);
                    },
                  )
                : Promise.resolve(null),
            (page) => {
              // Unverified hints may shorten collection, never grant progress or authority.
              try {
                return decodeInboundPage(page).entries.length > 0;
              } catch {
                return false;
              }
            },
          );
          pages = collected.pages;
          attempted = collected.attempted;
        });
        // A speculative tail cannot overwrite the diagnostic for the attempted prefix.
        for (const observations of events.slice(0, attempted))
          for (const event of observations) recordPrivateTransportDiagnostic(event);
        return network.step(() => ({
          request: requests[0]!,
          page: pages[0] ?? null,
          requests,
          pages,
          oversized:
            !pages.length && events[0]!.some((event) => event.code === 'response-too-large'),
        }));
      });
    } catch (cause) {
      for (const request of requests) request.fill(0);
      for (const page of pages) page.fill(0);
      throw cause;
    }
  };
  // Network waits never hold the local writer tail. The request captures actual slot authority;
  // its evidence re-enters the admission FIFO and checks that authority again before persistence.
  let historyDue = 0;
  const fetchHistory = () =>
    runNetworkTask(async (network) => {
      if (!access || account.detached || !canReceive() || Date.now() < historyDue) return null;
      const prepared = await runCaptureTask(async (task, owner, route) => {
        const current = await state(task, owner, route);
        if (describe(current).state === 'conflict') throw Error('Inbound stream is conflicted');
        const authority = checkpointAuthority(base);
        const request = parseHistoryExchange({
          v: 1,
          kind: 'history-checkpoint-request',
          workspaceId: base.authority.workspace,
          lineageId: base.authority.lineage,
          epoch: base.authority.tip,
          head: base.authority.head,
          credentialId: base.reader.id,
          nonce: hex(random(32)),
          expiresAt: Date.now() + HISTORY_EXCHANGE_REQUEST_LIFETIME_MS,
          action: 'read',
          payload: 'catalog',
          signature: '00'.repeat(64),
        });
        const sign = async () =>
          hex(
            new Uint8Array(
              await task.wait(async () =>
                subtleFor(task).sign('Ed25519', signer!, await historyExchangeMessage(request)),
              ),
            ),
          );
        request.signature = await sign();
        return {
          authority,
          request,
          baseline: base.baseline.id,
          installed: current.installedHistory,
        };
      });
      const exchange = createHistoryTransport(prepared.authority, access, network.signal);
      const catalog = (await network.wait(() => exchange(prepared.request))).catalog;
      historyDue = Date.now() + 5000;
      if (prepared.installed) {
        if (
          catalog.sequence < prepared.installed.sequence ||
          (catalog.sequence === prepared.installed.sequence &&
            catalog.latest !== prepared.installed.hash)
        )
          return captureError('History catalog regressed or forked');
        if (catalog.latest === prepared.installed.hash && prepared.installed.receiveCuts)
          return null;
      }
      if (catalog.latest === EMPTY_HISTORY_CHECKPOINT || catalog.latest === inheritedHistoryHash)
        return null;
      const request = await runCaptureTask(async (task) => {
        await assertCurrent(task);
        if (prepared.request.head !== base.authority.head) throw new ReceiveAuthorityChanged();
        const r = parseHistoryExchange({
          ...prepared.request,
          payload: 'latest',
          nonce: hex(random(32)),
          expiresAt: Date.now() + HISTORY_EXCHANGE_REQUEST_LIFETIME_MS,
        });
        r.signature = hex(
          new Uint8Array(
            await task.wait(async () =>
              subtleFor(task).sign('Ed25519', signer!, await historyExchangeMessage(r)),
            ),
          ),
        );
        return r;
      });
      const page = await network.wait(() => exchange(request));
      if (
        !page.checkpoint ||
        !page.admission ||
        page.catalog.sequence < catalog.sequence ||
        (page.catalog.sequence === catalog.sequence && page.catalog.latest !== catalog.latest)
      )
        return captureError('Admitted history changed during reading');
      return encodeHistoryInstall({
        version: 2,
        baseline: prepared.baseline,
        workspace: request.workspaceId,
        lineage: request.lineageId,
        epoch: request.epoch,
        head: request.head,
        reader: request.credentialId,
        checkpoint: page.checkpoint,
        admission: page.admission,
      });
    });
  const installHistory = (input: Bytes, promote: (updates: readonly Bytes[]) => void) => {
    const bytes = input.slice();
    return runCaptureTask(async (task, owner, route) => {
      let result: Awaited<ReturnType<typeof verifyHistoryInstall>> | undefined,
        committed = false;
      try {
        const current = await state(task, owner, route);
        try {
          const event = decodeHistoryInstall(bytes);
          if (event.epoch !== base.authority.tip || event.head !== base.authority.head)
            throw new ReceiveAuthorityChanged();
          if (describe(current).state === 'conflict') throw Error('Inbound stream is conflicted');
          // Own plaintext before task.wait's final lifetime check may reject it.
          await task.wait(async () => {
            result = await verifyHistoryInstall(
              base,
              bytes,
              current.installedHistory,
              lifetime(task),
            );
          });
          if (result!.heads) {
            const rows = await owner.carrier.load(task);
            try {
              const census = inspectInbound(rows, route, base);
              await applyHistoryReceiveCuts(current, base, census, result!.heads);
              verifySyncState(
                census.delivery,
                verified.read(rows, (v) => v.delivery),
                current,
              );
            } finally {
              for (const row of rows) row.bytes.fill(0);
            }
          }
        } catch (cause) {
          throw new AdmissionError('receive-refused', 'History snapshot could not be installed', {
            cause,
          });
        }
        const before = await owner.carrier.spoolWitness(task),
          after = await task.wait(() => extendSpoolWitness(before, bytes, subtleFor(task)));
        await owner.carrier.appendInbound(
          task,
          [
            { kind: 'update', bytes: result!.update },
            { kind: 'heads', bytes },
          ],
          {
            before,
            after,
            beforeCommit: async () => {
              await assertCurrent(task);
              const next = await state(task, owner, route);
              if (!same(next.installedHistory ?? null, current.installedHistory ?? null))
                throw Error('History installation changed before commit');
            },
          },
        );
        committed = true;
        await state(task, owner, route);
        return task.step(() => {
          promote([result!.update]);
          return { kind: 'installed' as const };
        });
      } catch (cause) {
        if (committed) void carrier.close().catch(() => {});
        throw cause;
      } finally {
        result?.update.fill(0);
      }
    }).finally(() => bytes.fill(0));
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
      selfOnly = false,
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
          if (selfOnly && (!composed || r.publisher !== base.publisher.id))
            throw new AdmissionError(
              'receive-refused',
              'Self receipt requires the owned publisher',
            );
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
              const delivery = verified.read(rows, (v) => v.delivery);
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
          if (selfOnly) {
            // This body is only a reconciliation read after an unknown submit outcome. Its
            // exact originals are already local; persist the signed decision through delivery,
            // outside this storage task, rather than writing/promoting a second content copy.
            return {
              kind: result.kind,
              recorded: false,
              status: describe(s),
              selfDecision: {
                position: result.position,
                proof: decodeInboundPage(page).entries[0]!.proof.slice(),
              },
            };
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
  const receiveGroup = (
    inputs: readonly Bytes[],
    expected: readonly Bytes[],
    promote: (updates: readonly Bytes[]) => void = () => {},
  ) => {
    if (
      account.detached ||
      inputs.length < 2 ||
      inputs.length > RECEIVE_GROUP_LIMIT ||
      expected.length !== inputs.length ||
      inputs.some((b) => !(b instanceof Uint8Array) || !b.length) ||
      inputs.reduce((n, b) => n + 4 + b.length, 0) > MAX_PENDING_BYTES ||
      expected.some((b) => !(b instanceof Uint8Array) || !b.length || b.length > 4096)
    )
      return Promise.reject(new AdmissionError('receive-refused', 'Invalid receive group'));
    const pages = inputs.map((b) => b.slice()),
      requests = expected.map((b) => b.slice());
    return runCaptureTask(async (task, owner, route) => {
      const s = await state(task, owner, route);
      const first = decodeInboundRequest(requests[0]!);
      if (first.epoch < base.authority.tip) throw new ReceiveAuthorityChanged();
      if (composed && first.publisher === base.publisher.id)
        throw new AdmissionError('receive-refused', 'Own reconciliation must remain single-entry');
      const peer = publisherState(s, base, first.publisher);
      if (s.conflict || peer.conflict || first.after !== peer.prefix.position)
        throw new AdmissionError('receive-refused', 'Inbound group prefix changed');
      for (let i = 0; i < requests.length; i++) {
        if (!outstandingGroup[i] || !sameBytes(requests[i]!, outstandingGroup[i]!))
          throw new AdmissionError('receive-refused', 'Receive request was superseded');
        const r = decodeInboundRequest(requests[i]!);
        if (
          r.publisher !== first.publisher ||
          r.epoch !== first.epoch ||
          r.after !== first.after + i
        )
          throw new AdmissionError('receive-refused', 'Receive group is not contiguous');
      }
      const context = { ...publisherContext(base, first.publisher), prefix: { ...peer.prefix } };
      const results: Awaited<ReturnType<typeof verifyInboundPage>>[] = [];
      const writes: import('./contentRecord').ContentInput[] = [];
      const updates: Bytes[] = [];
      let committed = false,
        bytes = 0;
      try {
        for (let i = 0; i < pages.length; i++) {
          let result: Awaited<ReturnType<typeof verifyInboundPage>> | undefined;
          try {
            await task.wait(async () => {
              result = await verifyInboundPage(context, requests[i]!, pages[i]!, lifetime(task));
              // Retain ownership before the final lifetime check can reject.
              results.push(result);
            });
          } catch (cause) {
            task.step(() => {});
            throw new AdmissionError('receive-refused', String(cause), { cause });
          }
          if (!result) throw Error('Missing inbound verification result');
          if (result.kind === 'empty') break;
          if (result.kind !== 'received')
            throw new AdmissionError('receive-refused', 'Unexpected grouped receive result');
          const size = result.record.length + result.updates.reduce((n, b) => n + b.length, 0);
          if (!receiveGroupFits(bytes + size, writes.length + result.updates.length + 1)) {
            // The single-receipt verifier has already enforced its individual bounds.
            // Keep only the fitting prefix; this valid tail is fetched again later.
            result.record.fill(0);
            for (const update of result.updates) update.fill(0);
            results.pop();
            break;
          }
          bytes += size;
          writes.push(...result.updates.map((b) => ({ kind: 'update' as const, bytes: b })), {
            kind: 'heads',
            bytes: result.record,
          });
          updates.push(...result.updates);
          context.prefix = {
            position: result.position,
            link: result.link,
            observedThrough: result.through,
          };
        }
        const kinds = results.map((r) => r.kind);
        if (!writes.length)
          return task.step(() => {
            promote([]);
            return { kind: 'empty' as const, recorded: false, status: describe(s), kinds };
          });
        const before = await owner.carrier.spoolWitness(task);
        let after = before;
        for (const result of results)
          if ('record' in result)
            after = await task.wait(() =>
              extendSpoolWitness(after, result.record, subtleFor(task)),
            );
        await owner.carrier.appendInbound(task, writes, {
          before,
          after,
          checkCommit: () => {
            if (
              requests
                .slice(0, results.length)
                .some((r) => decodeInboundRequest(r).expires <= Date.now())
            )
              throw new ReceiveRequestExpired();
          },
          beforeCommit: async () => {
            const current = await state(task, owner, route);
            if (JSON.stringify(describe(current)) !== JSON.stringify(describe(s)))
              captureError('Inbound prefix changed before commit');
          },
        });
        committed = true;
        const saved = await state(task, owner, route);
        return task.step(() => {
          promote(updates);
          return { kind: 'received' as const, recorded: true, status: describe(saved), kinds };
        });
      } catch (cause) {
        if (committed) void carrier.close().catch(() => {});
        throw cause;
      } finally {
        for (const result of results) {
          if ('record' in result) result.record.fill(0);
          if (result.kind === 'received') for (const b of result.updates) b.fill(0);
        }
      }
    }).finally(() => {
      for (const b of [...pages, ...requests]) b.fill(0);
    });
  };
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
              receiveSelection.reset();
              expectedPayload = promotionPayload(next);
              verifiedCounter = undefined;
              sinceAudit = 0;
              auditDue = auditDeferred = false;
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
      historyAuthority(history, route.history?.current ?? base.authority);
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
      if (!route.history || (route.epoch < 3 && base.generation < 2))
        throw Error('Membership needs a certified installation');
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
          joined ? initialEpoch : originalMembershipBoundaries(installed),
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
          expectedPayload = joinedPayload(next);
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
              expectedPayload = promotionPayload(next);
            },
          );
        }
        task.step(() => {
          installRoute(task, nextRoute);
          base = nextBase;
          membership = nextMembership;
          receiveSelection.reset();
          verifiedCounter = undefined;
          sinceAudit = 0;
          auditDue = auditDeferred = false;
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
  const discoverTerminal = async (
    network: SessionTask,
    anchor: Parameters<typeof verifyMembershipChain>[1],
  ) => {
    if (!terminalAccess) return { kind: 'unknown' as const };
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
            subtleFor(task).sign('Ed25519', signer!, await removalDiscoveryRequestMessage(r)),
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
        verifyRemovalDiscoveryResponse(terminal, request, anchor, Date.now()),
      );
      await adoptMembership(verified.proofs, () => {
        network.step(() => {});
        if (request.expiresAt <= Date.now()) throw new ReceiveRequestExpired();
      });
      return { kind: 'adopted' as const };
    }
    return { kind: 'unknown' as const };
  };
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
          return discoverTerminal(network, prepared.anchor);
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
      if (!response) return discoverTerminal(network, prepared.first);
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
    ) => inspectCensus(records, route, (c) => c.delivery);
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
      ...(incremental
        ? {
            selectVerified: (records, select) =>
              verified.read(records, ({ inbound, delivery }) => {
                if (inbound.conflict) throw Error('Publication halted by inbound conflict');
                return select(delivery);
              }),
            verifyProposed: async (
              rows: readonly import('./contentRecord').OpenedRecord[],
              proposed: import('./contentRecord').OpenedRecord[],
              route: CaptureRoute,
              task: SessionTask,
              after: import('./contentRecord').SpoolWitness,
            ) => {
              if (!verifiedCounter) return false;
              const prior = verified.read(rows);
              let candidate;
              const existing = new Set(rows),
                added = proposed
                  .filter((r) => !existing.has(r))
                  .map((r) => ({ ...r, bytes: r.bytes.slice() }));
              const owned = proposed.map((r) => (existing.has(r) ? r : added.shift()!));
              try {
                candidate = await extendAccountLedger(
                  prior,
                  rows,
                  owned,
                  route,
                  { ...verifiedCounter, v: 2, spool: after },
                  base,
                  publicKey,
                  subtleFor(task),
                  { memo, current: () => task.step(() => {}) },
                );
                return !!candidate;
              } finally {
                eraseVerified(prior);
                eraseVerified(candidate);
                // Erase copied proposals even when extension throws before returning a candidate.
                for (const row of owned) if (!existing.has(row)) row.bytes.fill(0);
              }
            },
          }
        : {}),
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
              receivedThrough: describe(inbound).receivedThrough,
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
        inspect: (records, route) => inspectCensus(records, route, (c) => c.delivery.spool),
        run: runCaptureTask,
      }),
      spoolStatus: () =>
        runCaptureTask(async (task, owner, route) => {
          const records = await owner.carrier.load(task);
          try {
            return inspectCensus(records, route, ({ delivery: { spool } }) => ({
              attempts: spool.attempts,
              positions: spool.positions.map((p) => ({
                position: p.position,
                source: p.source,
                ...(p.additional ? { additional: p.additional } : {}),
                attempts: p.attempts,
                persisted: !!p.wire,
              })),
            }));
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
            history: (command: import('../account/historyMaintenance').HistoryMaintenanceCommand) =>
              runCaptureTask(async (task) => {
                await assertCurrent(task);
                const refreshCustody = async () => {
                  try {
                    // History owns only its encrypted progress and shared seal reservations. Refresh
                    // the live custody fence after both success and an interrupted reservation.
                    const current = joined
                      ? await readJoinedAccount(task, options.slotId, options.code)
                      : await readPromotion(task, options.slotId, options.code);
                    const record = current.record;
                    const expected = {
                      ...expectedRecord,
                      seal_reserved: record.seal_reserved,
                      ...(record.history ? { history: record.history } : {}),
                      mac: record.mac,
                    };
                    const oldPayload = joined
                      ? joinedPayload({
                          ...(current as Awaited<ReturnType<typeof readJoinedAccount>>).marker!,
                          custodyMac: hex(expectedRecord.mac),
                        })
                      : promotionPayload({
                          ...(current as Awaited<ReturnType<typeof readPromotion>>).marker!,
                          custodyMac: hex(expectedRecord.mac),
                          sealReserved: expectedRecord.seal_reserved,
                        });
                    if (
                      !recordEqual(record, expected) ||
                      record.seal_reserved < expectedRecord.seal_reserved ||
                      !sameBytes(oldPayload, expectedPayload)
                    ) {
                      throw Error('Account custody changed during history maintenance');
                    }
                    expectedRecord = record;
                    expectedPayload = joined
                      ? joinedPayload(
                          (current as Awaited<ReturnType<typeof readJoinedAccount>>).marker!,
                        )
                      : promotionPayload(
                          (current as Awaited<ReturnType<typeof readPromotion>>).marker!,
                        );
                  } catch (cause) {
                    handoff = true;
                    void carrier.close().catch(() => {});
                    throw cause;
                  }
                };
                try {
                  const { runNativeHistoryMaintenance } = await import('./historyOwner');
                  return await runNativeHistoryMaintenance(
                    {
                      task,
                      kind: joined ? 'joined' : 'promotion',
                      slotId: options.slotId,
                      code: options.code,
                    },
                    command,
                    access,
                  );
                } finally {
                  await refreshCustody();
                }
              }),
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
    isSelfRequest: (request: Bytes) =>
      composed && decodeInboundRequest(request).publisher === base.publisher.id,
    api,
    account,
    carrier,
    listCaptures,
    fetchPage,
    prepareGroup,
    receiveGroup,
    completedRead: (request: Bytes, kind: string) => {
      const publisher = decodeInboundRequest(request).publisher;
      receiveSelection.completed(
        base.history?.readers.map((r) => r.id) ?? [base.publisher.id],
        publisher,
        kind === 'received',
        composed && publisher === base.publisher.id && (kind === 'received' || kind === 'empty'),
      );
    },
    fetchHistory,
    installHistory,
    createOutbound,
    adoptSuccessor,
    adoptMembership,
    refreshAuthority,
    resetDiscovery: () => {
      discoveryRevision++;
      discoveryDue = 0;
      historyDue = 0;
    },
  };
}

/** Storage-only surface retained for independent conformance and preparation. */
export async function openOwnedAccountReceiveStore(input: AccountStartupOptions) {
  const { api, prepareGroup, receiveGroup } = await openAccountReceiveOwner(input);
  return Object.freeze({
    ...api,
    prepareGroup,
    receiveGroup: (pages: readonly Bytes[], requests: readonly Bytes[]) =>
      receiveGroup(pages, requests),
    receivePage: (bytes: Bytes) => api.receivePage(bytes),
  });
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
    completedRead,
    isSelfRequest,
    api,
    account,
    carrier,
    listCaptures,
    fetchPage,
    receiveGroup,
    fetchHistory,
    installHistory,
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
  markAccountOpen('owner');
  operatorToken = access ?? operatorToken;
  let enqueue!: OwnedReceiveQueue;
  const batching = accountBatchPolicy(import.meta.env?.['VITE_ACCOUNT_BATCH']);
  try {
    const workspace = await createAdmittedWorkspace(
      (config) =>
        createAdmissionOwner(
          carrier,
          {
            ...config,
            ...(batching.localFlush ? { flushBatch: batching.localFlush } : {}),
            ...(batching.publication ? { publishReceivePage: true } : {}),
          },
          (receive) => {
            enqueue = receive;
          },
        ),
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
      ledgerMode === 'incremental'
        ? accountTextMode(import.meta.env?.['VITE_ACCOUNT_TEXT_ADMISSION'])
        : 'reference',
    );
    if (options.signal?.aborted || workspace.status.state !== 'active') {
      await workspace.close();
      throw Error('Account opening was cancelled');
    }
    markAccountOpen('editor');
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
    const receiveHistory = async () => {
      let bytes: Bytes | null = null;
      try {
        bytes = await fetchHistory();
        if (!bytes) return false;
        await enqueue(bytes, (evidence, promote) => installHistory(evidence, promote));
        return true;
      } finally {
        bytes?.fill(0);
      }
    };
    const receivePage = (bytes: Bytes, request?: Bytes) => {
      try {
        return enqueue(bytes, (page, promote) => api.receivePage(page, promote, request));
      } catch (cause) {
        return Promise.reject(cause);
      }
    };
    const outbound =
      composed && !account.detached ? createOutbound(() => workspace.whenDurable()) : undefined;
    let flight: Promise<unknown> | undefined;
    carrier.beforeRelease?.(async () => {
      await flight?.catch(() => {});
    });
    const receiveNext = (operatorToken: AccountAccess) => {
      if (carrier.signal.aborted)
        return Promise.reject(new AdmissionError('inactive-session', 'Receive owner is closed'));
      if (flight) return Promise.resolve({ kind: 'busy' as const });
      const work = (async () => {
        const { request, page, requests, pages, oversized } = await fetchPage(operatorToken);
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
            if (outbound && isSelfRequest(request)) {
              // No remote dependency is introduced by our own stream. Even an empty self
              // check must not occupy the editor admission FIFO while verifying its reply.
              const received = await api.receivePage(page, undefined, request, true);
              if ('selfDecision' in received && received.selfDecision) {
                const { position, proof } = received.selfDecision;
                try {
                  const decision = await outbound.recordResponse(position, proof);
                  // A verified page does not prove the delivery owner retained its decision.
                  // Duplicates may be unrecorded but accepted; a declined decision must stop
                  // this receive attempt rather than become an unexplained network backoff.
                  if (decision.kind === 'unknown' || decision.kind === 'blocked')
                    return {
                      kind: 'rejected' as const,
                      reason: 'self-decision-refused' as const,
                      recorded: false,
                    };
                } finally {
                  proof.fill(0);
                }
              }
              completedRead(request, received.kind);
              return { kind: received.kind, recorded: false };
            }
            if (pages.length > 1) {
              const packed = packReceivePages(pages);
              try {
                const received = await enqueue(packed, (input, promote) =>
                  receiveGroup(unpackReceivePages(input), requests.slice(0, pages.length), promote),
                );
                for (let i = 0; i < received.kinds.length; i++)
                  completedRead(requests[i]!, received.kinds[i]!);
                return received;
              } finally {
                packed.fill(0);
              }
            }
            const received = await receivePage(page, request);
            completedRead(request, received.kind);
            return received;
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
          for (const r of requests) r.fill(0);
          for (const p of pages) p.fill(0);
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
    if (outbound) {
      let notifications: ReturnType<typeof startNotifications> | undefined;
      let notificationHealthy = false;
      let unsubscribe: (() => void) | undefined, unsubscribeLocal: (() => void) | undefined;
      let unsubscribeLogin: (() => void) | undefined;
      const flushOnHide = () => {
        if (carrier.signal.aborted) return;
        scheduler.wake('flush');
        // Best effort only. Suspension/lock can cancel all async work; admitted source
        // frames already have synchronous journal custody and resume on reopening.
        void workspace.whenDurable().then(
          // Input already queued when hiding can be admitted during the barrier. Close
          // its window too; lock still cancels the owner without waiting for this work.
          () => scheduler.wake('flush'),
          () => {},
        );
      };
      const visibility = () => {
        if (globalThis.document?.visibilityState === 'hidden') flushOnHide();
      };
      const online = () => {
          resetDiscovery();
          scheduler.wake('online');
        },
        offline = () => scheduler.wake('gate');
      const scheduler = createSyncScheduler({
        signal: carrier.signal,
        gate: () => {
          const state = gate();
          return state === 'ready' && networkLoginNeedsPasskey(options.networkLogin?.getSnapshot())
            ? 'sign-in-required'
            : state;
        },
        receiveInterval: () => (notificationHealthy ? 60000 + Math.random() * 5000 : 5000),
        ...(batching.publication ? { publicationBatch: batching.publication } : {}),
        send: (beforeNewEnvelope) =>
          driveOutboundStep(outbound, operatorToken ?? '', gate, beforeNewEnvelope),
        receive: async () => {
          const authority = await refreshAuthority(operatorToken ?? '');
          if (authority.kind === 'adopted') scheduler.wake('authority');
          if (authority.kind === 'unknown' || authority.kind === 'paused') {
            const state = await api.status();
            return { kind: authority.kind, receivedThrough: state.receivedThrough };
          }
          try {
            if (await receiveHistory()) {
              const state = await api.status();
              return { kind: 'progress', receivedThrough: state.receivedThrough };
            }
          } catch (cause) {
            if (
              cause instanceof HistoryInstallSizeError ||
              (cause instanceof AdmissionError && cause.cause instanceof HistoryInstallSizeError)
            ) {
              const state = await api.status();
              return {
                kind: 'blocked',
                reason: 'inbound-size',
                receivedThrough: state.receivedThrough,
              };
            }
            if (
              cause instanceof HistoryTransportUnavailable ||
              cause instanceof ReceiveAuthorityChanged ||
              (cause instanceof AdmissionError && cause.cause instanceof ReceiveAuthorityChanged)
            ) {
              const state = await api.status();
              return { kind: 'unknown', receivedThrough: state.receivedThrough };
            }
            throw cause;
          }
          // One hint concerns the workspace, not a particular publisher. Sweep every
          // eligible stream before choosing the slow idle repair interval.
          for (let remaining = publisherCount(); ; remaining--) {
            const step = await driveReceiveStep(result, operatorToken ?? '', gate);
            if (step.kind !== 'idle') return step;
            if (remaining <= 1) {
              return step;
            }
          }
        },
        detach() {
          notifications?.close();
          operatorToken = undefined;
          unsubscribe?.();
          unsubscribeLocal?.();
          unsubscribeLogin?.();
          globalThis.document?.removeEventListener('visibilitychange', visibility);
          globalThis.removeEventListener?.('pagehide', flushOnHide, true);
          globalThis.removeEventListener?.('online', online);
          globalThis.removeEventListener?.('offline', offline);
        },
      });
      try {
        let previousGate = gate();
        unsubscribeLogin = options.networkLogin?.subscribe(() => {
          // A completed login resumes work without requiring a subscription handshake or
          // clearing another lane's integrity halt. Login itself never prompts on this path.
          scheduler.wake(options.networkLogin?.getSnapshot() === 'remembered' ? 'online' : 'gate');
        });
        unsubscribeLocal = workspace.outgoing((bytes) => {
          bytes.fill(0);
          scheduler.wake('local');
        });
        if (batching.publication) {
          globalThis.document?.addEventListener('visibilitychange', visibility);
          globalThis.addEventListener?.('pagehide', flushOnHide, true);
        }
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
            wake: (event) => {
              if (event !== 'content') resetDiscovery();
              // A fresh subscription handshake proves renewed reachability. Content
              // hints alone never override a failed operation's retry clock.
              scheduler.wake(event === 'ready' ? 'online' : 'remote');
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
