/** Private certified-device activation. Physical Local custody and logical Account identity stay distinct. */
import { same, parseAdmissionRequest, parseReceipt } from '../../account-protocol/admission';
import { parseAuthorityPin } from '../../account-protocol/authority';
import { parseSuccessor } from '../../account-protocol/successor';
import {
  parseCertificationSuccessor,
  contentDeliveryHash,
} from '../../account-protocol/contentDelivery';
import {
  parseContentCheckpoint,
  verifyCheckpointAdmission,
  contentCheckpointHash,
  type CheckpointAuthority,
} from '../../account-protocol/contentCheckpoint';
import {
  verifyCertificationHistory,
  historyPublisher,
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
import { parseRecord, recordKey, recordEqual } from './custodyRecord';
import { storageUpgradeKey } from './storageCompatibility';
import { withPromotionRoot } from './promotionRecord';
import { hex, utf8, hkdf, fields, openCredential, type Bytes } from './custodyCrypto';
import { contentTransaction } from './contentDatabase';
import { probeDatabase } from './startupStorage';
import { localCensus, localRoute, readLocalSlot } from './localGenesisStorage';
import { selectIndex } from './promotionHandoff';
import { prepareAccountCustody, withRecoveryUnderPermit } from './custody';
import { MAX_BATCH_BYTES, emptySpoolWitness } from './contentRecord';
import { openContentCheckpoint } from './contentCheckpoint';
import { verifyStoredInbound, type InboundContext } from './accountInbound';
import { inspectInbound, verifyInboundLedger } from './inboundLedger';
import { verifySpoolWitness, verifySpool, extendSpoolWitness } from './spoolRecord';
import { verifyDelivery } from './deliveryRecord';
import { verifySyncState } from './accountSyncState';
import { capturedRecovery, type CaptureRoute } from './sourceCapture';
import { replayRecovery } from './admissionDocument';
import { Y, coversGenesis, hasPendingUpdates } from './yjs';
import { requireAccountAccess } from './accountAccess';
import { withJoinedSlot, type SessionTask } from './writeSession';
import type { AccountStartupOptions } from './accountStartup';
import type { ContentReaderState } from '../account/contentReader';
import type { InstalledContentKey } from '../account/ceremonyVault';
import type { Slot } from './slotIndex';

interface JoinedRecord {
  v: 1;
  kind: 'certified-account-device';
  slotId: string;
  claimMac: string;
  custodyMac: string;
  phase: 'installing' | 'active';
  authority: CheckpointAuthority;
  reading: ContentReaderState;
  key: InstalledContentKey;
  mac: string;
}
export const joinedPayload = (r: JoinedRecord) => {
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
  ]);
  if (
    r['v'] !== 1 ||
    r['kind'] !== 'certified-account-device' ||
    typeof r['slotId'] !== 'string' ||
    !['installing', 'active'].includes(String(r['phase']))
  )
    throw Error('Invalid certified device');
  for (const field of ['claimMac', 'custodyMac', 'mac']) unhex(r[field], 32);
  const a = closed(r['authority'], ['base', 'successor', 'certification']);
  const b = closed(a['base'], ['pin', 'request', 'receipt']);
  const reading = closed(r['reading'], ['checkpoint', 'admission', 'active', 'events', 'prefix']);
  if (
    reading['active'] !== true ||
    !reading['admission'] ||
    !Array.isArray(reading['events']) ||
    reading['events'].length > 4096 ||
    reading['events'].some((e) => typeof e !== 'string')
  )
    throw Error('Incomplete retained reader');
  const key = closed(r['key'], ['sequence', 'ct']);
  if (!Number.isSafeInteger(key['sequence']) || (key['sequence'] as number) < 1)
    throw Error('Invalid installed key');
  unhex(key['ct'], 48);
  return {
    ...(r as unknown as JoinedRecord),
    authority: {
      base: {
        pin: parseAuthorityPin(b['pin']),
        request: parseAdmissionRequest(b['request']),
        receipt: parseReceipt(b['receipt']),
      },
      successor: parseSuccessor(a['successor']),
      certification: parseCertificationSuccessor(a['certification']),
    },
    reading: {
      ...(reading as unknown as ContentReaderState),
      checkpoint: parseContentCheckpoint(reading['checkpoint']),
    },
  };
}
export async function readJoinedAccount(task: SessionTask, slotId: string, code: string) {
  const claim = await readLocalClaim(task, slotId);
  if (!claim || claim.stage !== 'ready') throw Error('Certified device needs ready custody');
  await verifyLocalClaim(task, claim, code);
  const scope = claimScope(claim),
    rows = (await slotCustodyRows(task, slotId)) ?? [];
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
  return { claim, record, marker };
}
export type JoinedState = Awaited<ReturnType<typeof readJoinedAccount>>;
async function writeJoined(task: SessionTask, state: JoinedState, next: JoinedRecord) {
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
              store.put(next, storageUpgradeKey(next.slotId));
            });
      },
      'strict',
    ).then(() => true),
  );
  if (!found) throw Error('Certified device custody disappeared');
  state.marker = next;
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
export async function joinedKeys<T>(
  task: SessionTask,
  state: JoinedState,
  code: string,
  work: (key: Bytes, signer: CryptoKey, publicKey: CryptoKey) => Promise<T>,
) {
  const marker = state.marker!;
  return withPromotionRoot(task, state.claim, state.record, code, async (root, subtle) => {
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
            await contentDeliveryHash(marker.authority.certification.epoch.delivery),
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
async function joinedContext(task: SessionTask, state: JoinedState, key: Bytes) {
  const { authority: a, reading } = state.marker!;
  const original = await task.wait(() =>
    verifyCertificationHistory(a.certification, a.successor, a.base, {
      epoch: 3,
      head: a.certification.head,
    }),
  );
  const credential = state.record.credentials![1];
  if (credential.id !== a.certification.epoch.delivery.candidate.context.candidate.id)
    throw Error('Certified recipient differs from custody');
  const history = historyPublisher(original, credential.id);
  if (history.signingKey !== hex(credential.publicKey))
    throw Error('Certified signing key differs from custody');
  await task.wait(() => verifyCheckpointAdmission(reading.admission, reading.checkpoint, a));
  const base: InboundContext = {
    baseline: { kind: 'content-checkpoint', id: await contentCheckpointHash(reading.checkpoint) },
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
    generation: 1,
    generationKey: key,
    prefix: { position: 0, link: '00'.repeat(32), observedThrough: 0 },
  };
  const route: CaptureRoute = {
    workspace: history.current.workspace,
    credential: credential.id,
    principal: history.principal,
    epoch: 3,
    generation: 1,
    history,
  };
  return { base, route, original };
}
async function baseline(task: SessionTask, state: JoinedState, key: Bytes) {
  const marker = state.marker!,
    { base, route, original } = await joinedContext(task, state, key);
  const doc = await task.wait(() =>
    openContentCheckpoint(marker.reading.checkpoint, key, marker.authority),
  );
  const peer: InboundContext = {
    ...base,
    history: original,
    creatingCredential: original.credential,
    publisher: { ...base.publisher, id: original.credential, publicKey: original.signingKey },
  };
  const events: { record: Bytes; updates: readonly Bytes[] }[] = [];
  let initial: Bytes | undefined;
  try {
    initial = new Uint8Array(Y.encodeStateAsUpdate(doc));
    // The ordinary content carrier bounds a single native batch. Refuse before installing a fence.
    if (initial.length > MAX_BATCH_BYTES)
      throw Error(
        'This preview cannot yet activate a checkpoint larger than 4 MiB. Your saved approval and writing are retained.',
      );
    for (const wire of marker.reading.events) {
      const bytes = unhex(wire, wire.length / 2);
      try {
        const result = await verifyStoredInbound(peer, bytes, {
          assertCurrent: () => task.step(() => {}),
        });
        if (result.kind !== 'received') throw Error('Invalid retained reader event');
        for (const u of result.updates) Y.applyUpdate(doc, u);
        peer.prefix = {
          position: result.position,
          link: result.link,
          observedThrough: result.through,
        };
        events.push({ record: result.record, updates: result.updates });
      } finally {
        bytes.fill(0);
      }
    }
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
    unlockBinding: m.reading.checkpoint.binding.stored,
    account: {
      v: 1,
      promotionId: state.claim.initial.creation_intent!.id,
      requestDigest: a.base.receipt.offer.epoch.requestDigest,
      epochHead: a.certification.head,
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
  const state = await readJoinedAccount(task, slotId, code);
  if (state.marker) throw Error('Certified device already installed');
  await localCensus(task, state.claim);
  const proposed = parseJoined({
    v: 1,
    kind: 'certified-account-device',
    slotId,
    claimMac: hex(state.claim.mac),
    custodyMac: hex(state.record.mac),
    phase: 'installing',
    ...structuredClone(input),
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
  const state = await readJoinedAccount(task, options.slotId, options.code),
    marker = state.marker;
  if (!marker || !same(marker.authority.base.pin, options.pin))
    throw Error('Certified device authority changed');
  return joinedKeys(task, state, options.code, async (kg, _signer, publicKey) => {
    const b = await baseline(task, state, kg);
    try {
      if (options.networkLogin) {
        await withPromotionRoot(task, state.claim, state.record, options.code, (root) =>
          options.networkLogin!.initialize(
            task,
            root,
            state.record.root_id,
            marker.reading.checkpoint.binding,
          ),
        );
        await options.networkLogin.unlock(
          task,
          marker.reading.checkpoint.binding,
          options.assertPasskey,
        );
      } else
        await requireAccountAccess(
          task,
          marker.reading.checkpoint.binding,
          options.pin,
          options.assertPasskey,
        );
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
          await owner.initialize(task);
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
        async (recovered) => {
          const census = inspectInbound(recovered.records, b.route, b.base);
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
          validate: async (records, _task, counter) => {
            const census = inspectInbound(records, b.route, b.base);
            await verifySpoolWitness(census.delivery.spool, counter, crypto.subtle);
            await verifySpool(census.delivery.spool, b.route, kg, publicKey, crypto.subtle);
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
        base: { ...b.base, generationKey: new Uint8Array() },
        account: {
          kind: 'account' as const,
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
