import { hasBaselineReader, hasBaselineVerifier } from './localBaselineMode';
import { authorityClaim, type AccountAuthorityRows } from './accountAuthorityInventory';
import { countLedgerWork, markAccountOpen } from './accountLedgerMetrics';
import {
  captureHandoffHistory,
  handoffHistoryPrefix,
  mergeHandoffHistory,
  replayHandoffStream,
} from './handoffHistory';
import { consumeRecoveryOpening } from '../account/recoveryOpening';
import {
  captureRecoveryReading,
  verifyRecoveryReading,
  openRecoveryReading,
  type RecoveryReading,
} from './recoveryReading';
import { recoveryCheckpointDigest } from '../../account-protocol/recoveryCommit';
/** Private certified-device activation. Physical Local custody and logical Account identity stay distinct. */
import { openActiveRotation, eraseRotationKeys } from './rotationKeys';
import { same, parseAdmissionRequest, parseReceipt } from '../../account-protocol/admission';
import { parseAuthorityPin } from '../../account-protocol/authority';
import { parseSuccessor } from '../../account-protocol/successor';
import {
  parseMembershipChain,
  verifyMembershipChain,
} from '../../account-protocol/membershipLocator';
import { membershipDeliveryHash } from '../../account-protocol/membershipDelivery';
import { verifyMembershipCheckpointAdmission } from '../../account-protocol/membershipCheckpoint';
import {
  captureMembershipReading,
  replayMembershipReading,
  eraseMembershipReading,
  verifyReplacementReading,
  membershipReadingBinding,
  membershipReadingHash,
  membershipReadingPrefix,
  type MembershipReading,
} from './membershipReading';
import {
  parseCertificationSuccessor,
  contentDeliveryHash,
} from '../../account-protocol/contentDelivery';
import {
  parseContentCheckpoint,
  verifyCheckpointAdmission,
  contentCheckpointHash,
  type CheckpointAuthority,
  type HistoryCheckpointAuthority,
} from '../../account-protocol/contentCheckpoint';
import {
  verifyCertificationHistory,
  historyPublisher,
  historyGeneration,
} from '../../account-protocol/admissionHistory';
import { closed } from '../../account-protocol/preparation';
import { unhex } from '../../account-protocol/recovery';
import {
  readLocalClaim,
  verifyLocalClaim,
  claimScope,
  matchLocalCustody,
  slotCustodyRows,
  localClaimKey,
} from './localGenesisRecord';
import { parseRecord, recordKey, recordEqual, type CustodyRecord } from './custodyRecord';
import { storageUpgradeKey } from './storageCompatibility';
import {
  captureInboundReceiptVersion,
  inboundReceiptVersionFields,
  withInboundReceiptScope,
  requireMonotonicInboundReceiptVersion,
  type InboundReceiptVersion,
} from './inboundReceiptVersion';
import { withPromotionRoot, signRecord } from './promotionRecord';
import { hex, utf8, hkdf, fields, openCredential, type Bytes } from './custodyCrypto';
import { contentTransaction } from './contentDatabase';
import { probeDatabase } from './startupStorage';
import { localCensus, localRoute, readLocalSlot } from './localGenesisStorage';
import { selectIndex } from './promotionHandoff';
import { prepareAccountCustody, withRecoveryUnderPermit } from './custody';
import { MAX_BATCH_BYTES, emptySpoolWitness } from './contentRecord';
import { openContentCheckpoint } from './contentCheckpoint';
import { type InboundContext } from './accountInbound';
import { inspectInbound, verifyInboundLedger } from './inboundLedger';
import { verifySpoolWitness, verifySpool, extendSpoolWitness } from './spoolRecord';
import { verifyDelivery } from './deliveryRecord';
import { verifySyncState } from './accountSyncState';
import { capturedRecovery, type CaptureRoute } from './sourceCapture';
import { replayRecovery } from './admissionDocument';
import { Y, coversGenesis, hasPendingUpdates } from './yjs';
import { requireAccountAccess } from './accountAccess';
import { withJoinedSlot, requireAccountFormatSessionTask, type SessionTask } from './writeSession';
import type { AccountStartupOptions } from './accountStartup';
import type { ContentReaderState } from '../account/contentReader';
import type { InstalledContentKey } from '../account/ceremonyVault';
import type { Slot } from './slotIndex';
import {
  parseInstalledMembership,
  installedMembershipHistory,
  verifyInstalledMembership,
  type InstalledMembership,
} from './accountMembership';

interface JoinedFields extends InboundReceiptVersion {
  kind: 'certified-account-device';
  slotId: string;
  claimMac: string;
  custodyMac: string;
  phase: 'installing' | 'active';
  key: InstalledContentKey;
  mac: string;
  membership?: InstalledMembership;
}
export type JoinedAuthority = HistoryCheckpointAuthority & {
  continuations: ReturnType<typeof parseMembershipChain>['continuations'];
};
type JoinedRecord = JoinedFields &
  (
    | { v: 1; authority: CheckpointAuthority; reading: ContentReaderState }
    | { v: 2; authority: JoinedAuthority; reading: MembershipReading }
    | { v: 3; authority: JoinedAuthority; reading: RecoveryReading }
  );
export const joinedBinding = (marker: JoinedRecord) =>
  marker.v === 3
    ? marker.reading.binding
    : marker.v === 2
      ? membershipReadingBinding(marker.reading)
      : marker.reading.checkpoint.binding;
export const joinedBaselineHash = (marker: JoinedRecord) =>
  marker.v === 3
    ? recoveryCheckpointDigest(marker.reading.checkpoint)
    : marker.v === 2
      ? membershipReadingHash(marker.reading)
      : contentCheckpointHash(marker.reading.checkpoint);
export const joinedInitialGeneration = (marker: JoinedRecord) =>
  marker.v === 3
    ? marker.reading.successor.epoch.generation
    : marker.reading.checkpoint.manifest.generation;
export const joinedBaselineHeads = (marker: JoinedRecord) =>
  marker.v === 3
    ? marker.reading.successor.epoch.intent.heads
    : marker.v === 2 && marker.reading.v === 3
      ? marker.reading.checkpoint.heads
      : marker.v === 1
        ? marker.reading.history?.checkpoint.heads
        : marker.v === 2 && marker.reading.v === 2
          ? marker.reading.history?.checkpoint.heads
          : undefined;
export const joinedKeyHash = (marker: JoinedRecord) =>
  marker.v === 3
    ? Promise.resolve(marker.reading.head)
    : marker.v === 2
      ? membershipDeliveryHash(laterCertification(marker).epoch.delivery)
      : contentDeliveryHash(marker.authority.certification.epoch.delivery);
export const joinedPayload = (r: JoinedRecord) => {
  inboundReceiptVersionFields(r);
  const { mac: _mac, ...payload } = r;
  return utf8(JSON.stringify(payload));
};
const macKey = (root: Bytes, slot: string, subtle: SubtleCrypto) =>
  hkdf(
    root,
    new Uint8Array(),
    fields('done/certified-account-device/v1', slot),
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    ['sign', 'verify'],
    subtle,
  );
function parseJoined(input: unknown): JoinedRecord {
  const r = closed(input, [
    'v',
    'kind',
    'slotId',
    'claimMac',
    'custodyMac',
    'phase',
    'authority',
    'reading',
    'key',
    'mac',
    ...inboundReceiptVersionFields(input),
    ...(Object.hasOwn(input as object, 'membership') ? ['membership'] : []),
  ]);
  if (
    (r['v'] !== 1 && r['v'] !== 2 && r['v'] !== 3) ||
    r['kind'] !== 'certified-account-device' ||
    typeof r['slotId'] !== 'string' ||
    !['installing', 'active'].includes(String(r['phase']))
  )
    throw Error('Invalid certified device');
  if (Object.hasOwn(r, 'membership')) {
    if (r['phase'] !== 'active') throw Error('Uninstalled device cannot adopt membership');
    r['membership'] = parseInstalledMembership(r['membership']);
  }
  for (const field of ['claimMac', 'custodyMac', 'mac']) unhex(r[field], 32);
  const a = closed(
    r['authority'],
    r['v'] !== 1
      ? ['base', 'successor', 'certification', 'continuations']
      : ['base', 'successor', 'certification'],
  );
  const b = closed(a['base'], ['pin', 'request', 'receipt']);
  const base = {
    pin: parseAuthorityPin(b['pin']),
    request: parseAdmissionRequest(b['request']),
    receipt: parseReceipt(b['receipt']),
  };
  const key = closed(r['key'], ['sequence', 'ct']);
  if (!Number.isSafeInteger(key['sequence']) || (key['sequence'] as number) < 1)
    throw Error('Invalid installed key');
  unhex(key['ct'], 48);
  if (r['v'] === 3) {
    const proofs = parseMembershipChain({
        successor: a['successor'],
        certification: a['certification'],
        continuations: a['continuations'],
      }),
      reading = captureRecoveryReading(r['reading']);
    if (!same(proofs.continuations.at(-1), reading.successor))
      throw Error('Recovery installation history changed');
    return { ...(r as unknown as JoinedFields), v: 3, authority: { base, ...proofs }, reading };
  }
  if (r['v'] === 2) {
    const proofs = parseMembershipChain({
        successor: a['successor'],
        certification: a['certification'],
        continuations: a['continuations'],
      }),
      reading = captureMembershipReading(r['reading']),
      last = proofs.continuations.at(-1);
    if (
      !reading.admission ||
      last?.kind !== 'membership-certification' ||
      reading.head !== last.head ||
      reading.epoch !== last.epoch.epoch
    )
      throw Error('Incomplete later device installation');
    return { ...(r as unknown as JoinedFields), v: 2, authority: { base, ...proofs }, reading };
  }
  const reading = closed(r['reading'], [
    'checkpoint',
    'admission',
    'active',
    'events',
    'prefix',
    ...inboundReceiptVersionFields(r['reading']),
    ...((r['reading'] as { history?: unknown })?.history === undefined ? [] : ['history']),
  ]);
  if (
    reading['active'] !== true ||
    !reading['admission'] ||
    !Array.isArray(reading['events']) ||
    reading['events'].length > 4096 ||
    reading['events'].some((e) => typeof e !== 'string')
  )
    throw Error('Incomplete retained reader');
  return {
    ...(r as unknown as JoinedFields),
    v: 1,
    authority: {
      base,
      successor: parseSuccessor(a['successor']),
      certification: parseCertificationSuccessor(a['certification']),
    },
    reading: {
      ...(reading as unknown as ContentReaderState),
      checkpoint: parseContentCheckpoint(reading['checkpoint']),
      ...(reading['history'] === undefined
        ? {}
        : { history: captureHandoffHistory(reading['history']) }),
    },
  };
}
function laterCertification(marker: Extract<JoinedRecord, { v: 2 }>) {
  const last = marker.authority.continuations.at(-1);
  if (last?.kind !== 'membership-certification') throw Error('Later certification is missing');
  return last;
}
export async function readJoinedAccount(task: SessionTask, slotId: string, code: string) {
  const claim = await readLocalClaim(task, slotId);
  return authenticateJoinedAccountInventory(
    task,
    slotId,
    code,
    claim,
    (await slotCustodyRows(task, slotId)) ?? [],
  );
}
/** Internal owner check: authenticate the exact snapshot retained for unchanged-authority reuse. */
export function authenticateJoinedAccountRows(
  task: SessionTask,
  slotId: string,
  code: string,
  rows: AccountAuthorityRows,
) {
  return authenticateJoinedAccountInventory(task, slotId, code, authorityClaim(rows, slotId), rows);
}
async function authenticateJoinedAccountInventory(
  task: SessionTask,
  slotId: string,
  code: string,
  claim: Awaited<ReturnType<typeof readLocalClaim>>,
  rows: AccountAuthorityRows,
) {
  if (!claim || claim.stage !== 'ready') throw Error('Certified device needs ready custody');
  await verifyLocalClaim(task, claim, code);
  const scope = claimScope(claim);
  const record = parseRecord(
    rows.find((r) => indexedDB.cmp(r.key, recordKey(scope)) === 0)?.value,
    scope,
  );
  matchLocalCustody(claim, record);
  if (record.state !== 'protected') throw Error('Certified device needs protected custody');
  const row = rows.find((r) => indexedDB.cmp(r.key, storageUpgradeKey(slotId)) === 0);
  const marker = row ? parseJoined(row.value) : null;
  for (const row of rows)
    if (
      ![
        localClaimKey(slotId),
        recordKey(scope),
        [...recordKey(scope), 'content-v1'],
        storageUpgradeKey(slotId),
      ].some((k) => indexedDB.cmp(k, row.key) === 0)
    )
      throw Error('Unknown certified-device carrier');
  await withPromotionRoot(task, claim, record, code, async (root, subtle) => {
    if (
      marker &&
      (marker.slotId !== slotId ||
        marker.claimMac !== hex(claim.mac) ||
        marker.custodyMac !== hex(record.mac) ||
        !(await subtle.verify(
          'HMAC',
          await macKey(root, slotId, subtle),
          unhex(marker.mac, 32),
          joinedPayload(marker),
        )))
    )
      throw Error('Certified device authentication failed');
  });
  if (record.initial_account) {
    if (
      !marker ||
      !(marker.v === 3 || (marker.v === 2 && marker.reading.v === 3)) ||
      record.initial_account.generation !== joinedInitialGeneration(marker) ||
      record.initial_account.deliveryHash !== (await joinedKeyHash(marker)) ||
      !same(record.initial_account.key, marker.key)
    )
      throw Error('Initial account opener differs from certified installation');
  } else if (marker?.phase === 'active' && joinedInitialGeneration(marker) > 1)
    throw Error('Replacement account opener is missing');
  return { claim, record, marker };
}
export type JoinedState = Awaited<ReturnType<typeof readJoinedAccount>>;
async function writeJoined(
  task: SessionTask,
  state: JoinedState,
  next: JoinedRecord,
  record: CustodyRecord = state.record,
  check?: () => void,
) {
  requireMonotonicInboundReceiptVersion(state.marker, next);
  requireMonotonicInboundReceiptVersion(state.marker?.reading, next.reading);
  const found = await probeDatabase(task, 'done.custody', (db) =>
    contentTransaction(
      db,
      task,
      ['entries'],
      'readwrite',
      (tx, _result, guard) => {
        const store = tx.objectStore('entries'),
          scope = claimScope(state.claim);
        const requests = [
          store.get(localClaimKey(next.slotId)),
          store.get(recordKey(scope)),
          store.get(storageUpgradeKey(next.slotId)),
        ];
        let remaining = requests.length;
        for (const req of requests)
          req.onsuccess = () =>
            guard(() => {
              if (--remaining) return;
              if (
                hex(requests[0]!.result?.mac ?? new Uint8Array()) !== hex(state.claim.mac) ||
                !recordEqual(parseRecord(requests[1]!.result, scope), state.record) ||
                !same(requests[2]!.result ?? null, state.marker)
              )
                throw Error('Certified device compare changed');
              requireMonotonicInboundReceiptVersion(state.marker, next);
              requireMonotonicInboundReceiptVersion(state.marker?.reading, next.reading);
              check?.();
              if (!recordEqual(record, state.record)) store.put(record, recordKey(scope));
              store.put(next, storageUpgradeKey(next.slotId));
            });
      },
      'strict',
    ).then(() => true),
  );
  if (!found) throw Error('Certified device custody disappeared');
  state.marker = next;
  state.record = record;
}
async function signJoined(task: SessionTask, state: JoinedState, code: string, next: JoinedRecord) {
  return withPromotionRoot(task, state.claim, state.record, code, async (root, subtle) => ({
    ...next,
    mac: hex(
      new Uint8Array(
        await subtle.sign('HMAC', await macKey(root, next.slotId, subtle), joinedPayload(next)),
      ),
    ),
  }));
}
/** Internal post-authentication activation; the native CAS preserves all original custody and
 * retained reading. A locally supplied expected payload never replaces its fresh authentication. */
export async function acknowledgeJoinedInboundReceiptVersion(
  task: SessionTask,
  slotId: string,
  code: string,
  expectedPayload: Bytes,
  expectedRecord: CustodyRecord,
): Promise<JoinedRecord> {
  requireAccountFormatSessionTask(task, slotId);
  const state = await readJoinedAccount(task, slotId, code),
    marker = state.marker;
  if (!marker || marker.phase !== 'active')
    throw Error('Inbound receipt floor needs active certified custody');
  const payload = joinedPayload(marker);
  try {
    if (
      payload.length !== expectedPayload.length ||
      !payload.every((v, i) => v === expectedPayload[i]) ||
      !recordEqual(state.record, expectedRecord)
    )
      throw Error('Inbound receipt floor authority changed');
  } finally {
    payload.fill(0);
  }
  requireAccountFormatSessionTask(task, slotId);
  if (marker.inboundReceiptVersion === 1) return marker;
  const next = await signJoined(task, state, code, { ...marker, inboundReceiptVersion: 1 });
  await writeJoined(task, state, next, state.record, () =>
    requireAccountFormatSessionTask(task, slotId),
  );
  return next;
}
/** Approval writes must rebind the active joined marker in the same native transaction. */
export async function writeJoinedApproval(
  task: SessionTask,
  state: JoinedState,
  code: string,
  input: CustodyRecord,
  check?: () => void,
  channel: 'approval' | 'rotation' | 'history' = 'approval',
) {
  input = parseRecord(input, claimScope(state.claim));
  if (
    !state.marker ||
    state.marker.phase !== 'active' ||
    !recordEqual(input, {
      ...state.record,
      seal_reserved: input.seal_reserved,
      ...(input[channel] ? { [channel]: input[channel] } : {}),
      mac: input.mac,
    }) ||
    input.seal_reserved < state.record.seal_reserved
  )
    throw Error('Joined approval cannot change content custody');
  const next = await withPromotionRoot(task, state.claim, state.record, code, (root, subtle) =>
    signRecord(root, input, subtle),
  );
  const marker = await signJoined(task, state, code, {
    ...state.marker,
    custodyMac: hex(next.mac),
  });
  await writeJoined(task, state, marker, next, check);
}
/** Internal applying owner has verified exact successor coverage before this local commit. */
export async function writeJoinedRotation(
  task: SessionTask,
  state: JoinedState,
  code: string,
  record: CustodyRecord,
  membership: InstalledMembership,
  check?: () => void,
) {
  if (
    !record.rotation ||
    !record.active_rotation ||
    record.active_rotation !== membership.proofs.continuations.at(-1)?.head
  )
    throw Error('Rotation pointer differs from membership');
  const next = await withPromotionRoot(task, state.claim, state.record, code, (root, subtle) =>
    signRecord(root, record, subtle),
  );
  const marker = await signJoined(task, state, code, {
    ...state.marker!,
    membership: parseInstalledMembership(membership),
    custodyMac: hex(next.mac),
  });
  await writeJoined(task, state, marker, next, check);
}
/** Called only after the composed owner verifies the proposed authority against retained content. */
export async function writeJoinedMembership(
  task: SessionTask,
  state: JoinedState,
  code: string,
  input: InstalledMembership,
  check?: () => void,
) {
  if (state.marker?.phase !== 'active') throw Error('Membership needs active joined custody');
  const next = await signJoined(task, state, code, {
    ...state.marker,
    membership: parseInstalledMembership(input),
  });
  await writeJoined(task, state, next, state.record, check);
  return next;
}
export async function joinedKeys<T>(
  task: SessionTask,
  state: JoinedState,
  code: string,
  work: (key: Bytes, signer: CryptoKey, publicKey: CryptoKey) => Promise<T>,
  applying = false,
) {
  const marker = state.marker!;
  return withPromotionRoot(task, state.claim, state.record, code, async (root, subtle) => {
    if (!applying && state.record.rotation && !state.record.active_rotation)
      await openActiveRotation(claimScope(state.claim), root, state.record, subtle);
    if (marker.key.sequence > state.record.seal_reserved)
      throw Error('Installed key exceeds reservation');
    const iv = new Uint8Array(12);
    new DataView(iv.buffer).setBigUint64(4, BigInt(marker.key.sequence));
    const kg = new Uint8Array(
      await subtle.decrypt(
        {
          name: 'AES-GCM',
          iv,
          additionalData: fields(
            'done/installed-content-key/v1',
            marker.slotId,
            state.record.root_id,
            await joinedKeyHash(marker),
          ),
        },
        await hkdf(
          root,
          new Uint8Array(),
          fields('done/installed-content-key/v1', marker.slotId, state.record.root_id),
          { name: 'AES-GCM', length: 256 },
          ['decrypt'],
          subtle,
        ),
        unhex(marker.key.ct, 48),
      ),
    );
    try {
      return await work(
        kg,
        await openCredential(claimScope(state.claim), root, state.record.credentials![1], subtle),
        await subtle.importKey('raw', state.record.credentials![1].publicKey, 'Ed25519', false, [
          'verify',
        ]),
      );
    } finally {
      kg.fill(0);
    }
  });
}
export async function joinedContext(task: SessionTask, state: JoinedState, key: Bytes) {
  const marker = state.marker!,
    { authority: a } = marker;
  const original = await task.wait(() =>
    marker.v !== 1
      ? verifyMembershipChain(
          {
            successor: a.successor,
            certification: a.certification,
            continuations: marker.authority.continuations,
          },
          a.base,
        ).then((v) => v.history)
      : verifyCertificationHistory(a.certification, a.successor, a.base, {
          epoch: 3,
          head: marker.authority.certification.head,
        }),
  );
  const credential = state.record.credentials![1];
  const recipient =
    marker.v === 3
      ? {
          id: marker.reading.successor.epoch.intent.bootstrap.newCredentialId,
          wPub: marker.reading.successor.epoch.intent.bootstrap.newWPub,
        }
      : marker.v === 2
        ? laterCertification(marker).epoch.delivery.candidate.context.candidate
        : marker.authority.certification.epoch.delivery.candidate.context.candidate;
  if (
    credential.id !== recipient.id ||
    hex(state.record.credentials![0].publicKey) !== recipient.wPub
  )
    throw Error('Certified recipient differs from custody');
  const history = historyPublisher(original, credential.id);
  if (history.signingKey !== hex(credential.publicKey))
    throw Error('Certified signing key differs from custody');
  await task.wait<unknown>(() =>
    marker.v === 3
      ? verifyRecoveryReading(marker.reading, marker.authority, original, credential.id)
      : marker.v === 2
        ? marker.reading.v === 3
          ? verifyReplacementReading(marker.reading, marker.authority, original, {
              id: credential.id,
              sPub: history.signingKey,
            })
          : verifyMembershipCheckpointAdmission(
              marker.reading.admission,
              marker.reading.checkpoint,
              original,
            )
        : verifyCheckpointAdmission(
            marker.reading.admission,
            marker.reading.checkpoint,
            marker.authority,
          ),
  );
  const base: InboundContext = {
    ...captureInboundReceiptVersion(marker),
    baseline: { kind: 'content-checkpoint', id: await joinedBaselineHash(marker) },
    ...(joinedBaselineHeads(marker) ? { baselineHeads: joinedBaselineHeads(marker)! } : {}),
    service: { id: a.base.pin.serviceId, origin: a.base.pin.origin },
    authority: history.current,
    history,
    creatingCredential: credential.id,
    reader: { id: credential.id, publicKey: history.signingKey, active: true },
    publisher: {
      id: credential.id,
      publicKey: history.signingKey,
      principal: history.principal,
      system: true,
      active: true,
    },
    generation: joinedInitialGeneration(marker),
    generationKey: key,
    prefix:
      marker.v === 2
        ? membershipReadingPrefix(marker.reading, credential.id)
        : marker.v === 1
          ? handoffHistoryPrefix(marker.reading.history, credential.id)
          : { position: 0, link: '00'.repeat(32), observedThrough: 0 },
  };
  const route: CaptureRoute = {
    workspace: history.current.workspace,
    credential: credential.id,
    principal: history.principal,
    epoch: history.current.tip,
    generation: joinedInitialGeneration(marker),
    history,
  };
  return { base, route, original };
}
async function baseline(task: SessionTask, state: JoinedState, key: Bytes) {
  const marker = state.marker!,
    { base, route, original } = await joinedContext(task, state, key);
  if (marker.v === 3) {
    const doc = await task.wait(() =>
      openRecoveryReading(marker.reading, key, marker.authority, original, base.reader.id),
    );
    try {
      const initial = new Uint8Array(Y.encodeStateAsUpdate(doc));
      if (initial.length > MAX_BATCH_BYTES) {
        initial.fill(0);
        throw Error('Recovery checkpoint exceeds supported size');
      }
      return {
        doc,
        initial,
        events: [] as { record: Bytes; updates: readonly Bytes[] }[],
        base,
        route,
      };
    } catch (error) {
      doc.destroy();
      throw error;
    }
  }
  if (marker.v === 2) {
    const replay = await task.wait(() =>
      replayMembershipReading(
        marker.reading,
        marker.authority,
        original,
        { id: base.reader.id, sPub: base.reader.publicKey },
        key,
        { assertCurrent: () => task.step(() => {}) },
      ),
    );
    try {
      if (replay.pending) throw Error('Retained later reader is incomplete');
      if (replay.initial.length > MAX_BATCH_BYTES)
        throw Error(
          'This workspace cannot be opened here because its checkpoint exceeds the 4 MiB limit. Your saved approval and writing are retained.',
        );
      return { doc: replay.doc, initial: replay.initial, events: replay.records, base, route };
    } catch (cause) {
      eraseMembershipReading(replay);
      throw cause;
    }
  }
  const doc = await task.wait(() =>
    openContentCheckpoint(marker.reading.checkpoint, key, marker.authority),
  );
  const peer: InboundContext = {
    ...withInboundReceiptScope(base, marker.reading),
    history: original,
    creatingCredential: original.credential,
    publisher: { ...base.publisher, id: original.credential, publicKey: original.signingKey },
  };
  const events: { record: Bytes; updates: readonly Bytes[] }[] = [];
  let initial: Bytes | undefined;
  try {
    await task.wait(() => mergeHandoffHistory(doc, marker.reading.history, original, key));
    initial = new Uint8Array(Y.encodeStateAsUpdate(doc));
    // The ordinary content carrier bounds a single native batch. Refuse before installing a fence.
    if (initial.length > MAX_BATCH_BYTES)
      throw Error(
        'This workspace cannot be opened here because its checkpoint exceeds the 4 MiB limit. Your saved approval and writing are retained.',
      );
    const replay = await task.wait(() =>
      replayHandoffStream(doc, peer, marker.reading.events, marker.reading.history, {
        assertCurrent: () => task.step(() => {}),
      }),
    );
    Object.assign(peer, replay.context);
    events.push(...replay.records);
    if (!same(peer.prefix, marker.reading.prefix) || hasPendingUpdates(doc))
      throw Error('Retained reader is incomplete');
    return { doc, initial, events, base, route };
  } catch (e) {
    doc.destroy();
    initial?.fill(0);
    for (const e of events) {
      e.record.fill(0);
      for (const u of e.updates) u.fill(0);
    }
    throw e;
  }
}
const eraseBaseline = (b: Awaited<ReturnType<typeof baseline>>) => {
  b.doc.destroy();
  b.initial.fill(0);
  for (const e of b.events) {
    e.record.fill(0);
    for (const u of e.updates) u.fill(0);
  }
};
async function destination(task: SessionTask, state: JoinedState) {
  const local = await localRoute(task, state.claim),
    m = state.marker!,
    a = m.authority;
  const slot: Slot = {
    id: local.id,
    status: 'active',
    unlockBinding: joinedBinding(m).stored,
    account: {
      v: 1,
      promotionId: state.claim.initial.creation_intent!.id,
      requestDigest: a.base.receipt.offer.epoch.requestDigest,
      epochHead:
        m.v === 3
          ? m.reading.head
          : m.v === 2
            ? laterCertification(m).head
            : m.authority.certification.head,
    },
    stores: local.stores,
  };
  return { local, slot };
}
/** Called as the final operation of the old ceremony owner; subsequent opens use the new fence. */
export async function installJoinedAccount(
  task: SessionTask,
  slotId: string,
  code: string,
  input: { authority: CheckpointAuthority; reading: ContentReaderState; key: InstalledContentKey },
) {
  return installCertifiedAccount(task, slotId, code, { ...input, v: 1 });
}
export async function installMembershipAccount(
  task: SessionTask,
  slotId: string,
  code: string,
  input: { authority: JoinedAuthority; reading: MembershipReading; key: InstalledContentKey },
) {
  return installCertifiedAccount(task, slotId, code, { ...input, v: 2 });
}
export async function installRecoveryAccount(
  task: SessionTask,
  slotId: string,
  code: string,
  input: { authority: JoinedAuthority; reading: RecoveryReading; key: InstalledContentKey },
) {
  return installCertifiedAccount(task, slotId, code, { ...input, v: 3 });
}
async function installCertifiedAccount(
  task: SessionTask,
  slotId: string,
  code: string,
  input:
    | Pick<Extract<JoinedRecord, { v: 1 }>, 'v' | 'authority' | 'reading' | 'key'>
    | Pick<Extract<JoinedRecord, { v: 2 }>, 'v' | 'authority' | 'reading' | 'key'>
    | Pick<Extract<JoinedRecord, { v: 3 }>, 'v' | 'authority' | 'reading' | 'key'>,
) {
  input = structuredClone(input);
  const state = await readJoinedAccount(task, slotId, code);
  if (state.marker) throw Error('Certified device already installed');
  await localCensus(task, state.claim);
  const proposed = parseJoined({
    kind: 'certified-account-device',
    slotId,
    claimMac: hex(state.claim.mac),
    custodyMac: hex(state.record.mac),
    phase: 'installing',
    v: input.v,
    authority: input.authority,
    reading: input.reading,
    key: input.key,
    mac: '00'.repeat(32),
  });
  state.marker = proposed;
  await joinedKeys(task, state, code, async (kg) => {
    const b = await baseline(task, state, kg);
    const owner = prepareAccountCustody(
      { ...claimScope(state.claim), resolvePrincipal: () => state.claim.initial.principal_id },
      code,
    );
    try {
      await owner.initialize(task);
      const rows = await owner.carrier.load(task),
        journal = await owner.journal.readSnapshot(task);
      try {
        if (rows.length || journal.length)
          throw Error('Joining device has existing writing; refusing to replace it');
      } finally {
        for (const r of rows) r.bytes.fill(0);
        for (const r of journal) r.bytes.fill(0);
      }
    } finally {
      owner.dispose();
      eraseBaseline(b);
    }
  });
  state.marker = null;
  await writeJoined(task, state, await signJoined(task, state, code, proposed));
}
/** Restartable installation: each native prefix is rechecked against the immutable authenticated input. */
export async function verifyJoinedAccount(task: SessionTask, options: AccountStartupOptions) {
  const detached = await (
    await import('./rotationObservation')
  ).resumeAccountRotation(task, 'joined', options.slotId, options.code, options.networkLogin);
  const state = await readJoinedAccount(task, options.slotId, options.code);
  const savedMarker = state.marker;
  if (!savedMarker || !same(savedMarker.authority.base.pin, options.pin))
    throw Error('Certified device authority changed');
  return joinedKeys(task, state, options.code, async (kg, _signer, publicKey) => {
    let marker = savedMarker;
    const b = await baseline(task, state, kg);
    if (joinedInitialGeneration(marker) > 1 && !state.record.initial_account) {
      try {
        if (marker.phase !== 'installing' || marker.v === 1 || state.record.rotation)
          throw Error('Replacement initial generation cannot change active custody');
        const initial = {
          generation: joinedInitialGeneration(marker),
          deliveryHash: await joinedKeyHash(marker),
          key: marker.key,
        };
        const signed = await withPromotionRoot(
          task,
          state.claim,
          state.record,
          options.code,
          (root, subtle) => signRecord(root, { ...state.record, initial_account: initial }, subtle),
        );
        await writeJoined(
          task,
          state,
          await signJoined(task, state, options.code, { ...marker, custodyMac: hex(signed.mac) }),
          signed,
        );
        marker = state.marker!;
      } catch (cause) {
        eraseBaseline(b);
        throw cause;
      }
    }
    const initialGeneration = joinedInitialGeneration(marker);
    let active: Awaited<ReturnType<typeof openActiveRotation>> = null;
    try {
      active = await withPromotionRoot(
        task,
        state.claim,
        state.record,
        options.code,
        (root, subtle) =>
          openActiveRotation(
            claimScope(state.claim),
            root,
            state.record,
            subtle,
            marker.membership?.proofs,
          ),
      );
      const initialEpoch = b.route.epoch;
      if (marker.membership) {
        const history = await task.wait(() =>
          installedMembershipHistory(
            marker.membership!,
            marker.authority.base,
            b.route.history!,
            active?.generation ?? initialGeneration,
          ),
        );
        b.route = {
          ...b.route,
          epoch: history.current.tip,
          generation: historyGeneration(history),
          history,
        };
        b.base = {
          ...b.base,
          authority: history.current,
          generation: b.route.generation,
          history,
          generationKey: active?.key ?? kg,
          ...(active
            ? { retainedGenerationKeys: new Map([[initialGeneration, kg], ...active.previous]) }
            : {}),
        };
      }
      const recoveryOpening =
        options.recoveryOpening && marker.v === 3 && marker.phase === 'installing'
          ? { opening: options.recoveryOpening, successor: marker.reading.successor }
          : undefined;
      if (options.recoveryOpening && !recoveryOpening)
        throw Error('Recovery opening requires its new installation');
      if (options.networkLogin && !detached) {
        await withPromotionRoot(task, state.claim, state.record, options.code, (root) =>
          options.networkLogin!.initialize(task, root, state.record.root_id, joinedBinding(marker)),
        );
        await options.networkLogin.unlock(
          task,
          joinedBinding(marker),
          options.assertPasskey,
          recoveryOpening,
        );
      } else if (recoveryOpening)
        task.step(() =>
          consumeRecoveryOpening(
            recoveryOpening.opening,
            options.slotId,
            options.pin,
            joinedBinding(marker),
            recoveryOpening.successor,
          ),
        );
      else
        await requireAccountAccess(task, joinedBinding(marker), options.pin, options.assertPasskey);
      markAccountOpen('authorized');
      if (!same((await readJoinedAccount(task, options.slotId, options.code)).marker, marker))
        throw Error('Certified device changed during unlock');
      const scope = claimScope(state.claim),
        { local, slot } = await destination(task, state);
      if (marker.phase === 'installing') {
        const index = await readLocalSlot(task, options.slotId);
        if (!same(index, local) && !same(index, slot))
          throw Error('Certified device index changed');
        const owner = prepareAccountCustody(
          { ...scope, resolvePrincipal: () => scope.principalId },
          options.code,
          async (records, _task, counter) => {
            const census = inspectInbound(records, b.route, b.base);
            await verifySpoolWitness(census.delivery.spool, counter, crypto.subtle);
            await verifyInboundLedger(census, records, b.base, {
              assertCurrent: () => task.step(() => {}),
            });
          },
          true,
        );
        try {
          await owner.initialize(task, undefined, initialGeneration > 1);
          const journal = await owner.journal.readSnapshot(task);
          try {
            if (journal.length) throw Error('Unfinished device installation has journalled edits');
          } finally {
            for (const j of journal) j.bytes.fill(0);
          }
          let rows = await owner.carrier.load(task);
          try {
            if (!rows.length)
              await owner.carrier.append(task, [{ kind: 'update', bytes: b.initial }]);
            else if (rows[0]!.kind !== 'update' || hex(rows[0]!.bytes) !== hex(b.initial))
              throw Error('Installed checkpoint changed');
          } finally {
            for (const r of rows) r.bytes.fill(0);
          }
          await owner.carrier.enableSpool(task);
          rows = await owner.carrier.load(task);
          try {
            const expected = [
              { kind: 'update', bytes: b.initial },
              ...b.events.flatMap((e) => [
                ...e.updates.map((bytes) => ({ kind: 'update', bytes })),
                { kind: 'heads', bytes: e.record },
              ]),
            ];
            if (
              rows.length > expected.length ||
              rows.some(
                (r, i) => r.kind !== expected[i]!.kind || hex(r.bytes) !== hex(expected[i]!.bytes),
              )
            )
              throw Error('Unexpected content during device installation');
            let count = 1,
              before = emptySpoolWitness();
            for (const event of b.events) {
              const after = await extendSpoolWitness(before, event.record, crypto.subtle);
              const end = count + event.updates.length + 1;
              if (rows.length > count && rows.length < end)
                throw Error('Partial inbound installation');
              if (rows.length <= count)
                await owner.carrier.appendInbound(
                  task,
                  [
                    ...event.updates.map((bytes) => ({ kind: 'update' as const, bytes })),
                    { kind: 'heads', bytes: event.record },
                  ],
                  {
                    before,
                    after,
                    beforeCommit: async () => {
                      if (
                        !same(
                          (await readJoinedAccount(task, options.slotId, options.code)).marker,
                          state.marker,
                        )
                      )
                        throw Error('Certified installation changed');
                    },
                  },
                );
              before = after;
              count = end;
            }
          } finally {
            for (const r of rows) r.bytes.fill(0);
          }
        } finally {
          owner.dispose();
        }
        await selectIndex(task, local, slot);
        await writeJoined(
          task,
          state,
          await signJoined(task, state, options.code, { ...marker, phase: 'active' }),
        );
      }
      if (!same(await readLocalSlot(task, options.slotId), slot))
        throw Error('Certified device index is missing');
      await withRecoveryUnderPermit(
        task,
        { ...scope, resolvePrincipal: () => scope.principalId },
        options.code,
        async (recovered, baseline) => {
          const census =
            baseline?.ledger.census ?? inspectInbound(recovered.records, b.route, b.base);
          const recovery = capturedRecovery(
              { ...recovered, records: census.delivery.spool.sourceRecords },
              b.route,
            ),
            doc = new Y.Doc({ gc: false });
          try {
            replayRecovery(doc, recovery);
            if (!coversGenesis(doc, b.doc)) throw Error('Certified device lost its baseline');
          } finally {
            doc.destroy();
            for (const r of recovery.journal) r.bytes.fill(0);
          }
        },
        {
          allowSpoolCounter: true,
          reuseOpened: true,
          ...(hasBaselineVerifier()
            ? {
                ...(hasBaselineReader() ? { readBaseline: true as const } : {}),
                // The checked marker and its verifier-owned capabilities stay fixed during this recovery.
                exactBaselineReuse: true as const,
                baseline: async (
                  _task: SessionTask,
                  identity: import('./contentRecord').ContentIdentity,
                ) => {
                  const current = await readJoinedAccount(_task, options.slotId, options.code);
                  if (!same(current.marker, marker) || !recordEqual(current.record, state.record))
                    throw Error('Baseline opening authority changed');
                  return {
                    identity,
                    route: b.route,
                    inbound: b.base,
                    signer: publicKey,
                    installation: {
                      kind: 'joined' as const,
                      initialEpoch,
                      ...(marker.membership ? { membership: marker.membership } : {}),
                    },
                    assertCurrent: () => _task.step(() => {}),
                  };
                },
              }
            : {}),
          validate: async (records, _task, counter, _view, baseline) => {
            if (baseline) {
              if (detached)
                await (
                  await import('./rotationObservation')
                ).verifyRetainedDetachedPrefix(detached, baseline, crypto.subtle);
              return;
            }
            countLedgerWork('joinedStartupValidations');
            const census = inspectInbound(records, b.route, b.base);
            await verifySpoolWitness(census.delivery.spool, counter, crypto.subtle);
            await verifySpool(
              census.delivery.spool,
              b.route,
              active
                ? new Map([
                    [initialGeneration, kg],
                    [active.generation, active.key],
                    ...active.previous,
                  ])
                : new Map([[initialGeneration, kg]]),
              publicKey,
              crypto.subtle,
            );
            if (marker.membership)
              await verifyInstalledMembership(
                census.delivery.spool,
                b.route.history!,
                marker.membership,
                initialEpoch,
                crypto.subtle,
              );
            if (detached)
              await (
                await import('./rotationObservation')
              ).verifyDetachedPrefix(detached, census.delivery.spool, crypto.subtle);
            const delivery = await verifyDelivery(
              census.delivery,
              b.route,
              b.base.authority,
              publicKey,
              crypto.subtle,
            );
            const inbound = await verifyInboundLedger(census, records, b.base, {
              assertCurrent: () => task.step(() => {}),
            });
            verifySyncState(census.delivery, delivery, inbound);
          },
        },
      );
      return {
        ...state,
        route: b.route,
        base: { ...b.base, generationKey: new Uint8Array(), retainedGenerationKeys: new Map() },
        account: {
          kind: 'account' as const,
          detached: !!detached,
          slotId: options.slotId,
          accountId: slot.unlockBinding!.binding.accountId,
          principalId: b.route.principal,
          workspaceId: b.route.workspace,
          dbName: slot.stores[0]!.dbName,
          epochHead: b.base.authority.head,
        },
      };
    } finally {
      eraseBaseline(b);
      eraseRotationKeys(active);
    }
  });
}
export const hasJoinedAccount = (slotId: string, code: string, signal: AbortSignal) =>
  withJoinedSlot(
    slotId,
    code,
    async (task) => {
      const m = (await readJoinedAccount(task, slotId, code)).marker;
      return m
        ? {
            principalId: m.authority.base.request.candidate.principalId,
            workspaceId: m.authority.base.request.candidate.workspaceId,
          }
        : null;
    },
    signal,
  );
