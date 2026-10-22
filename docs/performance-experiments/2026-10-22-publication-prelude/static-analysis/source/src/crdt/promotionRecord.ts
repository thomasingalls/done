import { authorityClaim, type AccountAuthorityRows } from './accountAuthorityInventory';
import {
  parseContentCheckpoint,
  type ContentCheckpoint,
} from '../../account-protocol/contentCheckpoint';
import { parseInstalledSuccessor, type InstalledSuccessor } from './accountSuccessor';
import { parseInstalledMembership, type InstalledMembership } from './accountMembership';
import { parseHandoff, type HandoffState } from './handoffRecord';
import { parseRetainedAdmission, type RetainedAdmission } from '../../account-protocol/admission';
/** Internal authenticated inventory of the single promotion carrier, retained at the stable interlock. */
import { parseGenesis, type GenesisCandidate } from '../../account-protocol/genesis';
import { parseAuthorityPin, type AuthorityPin } from '../../account-protocol/authority';
import {
  closed,
  parsePendingState,
  pendingBytes,
  type PendingState,
} from '../../account-protocol/preparation';
import { unhex } from '../../account-protocol/recovery';
import { type PromotionSource } from './promotionPreparation';
import {
  authenticateRecord,
  signRecord,
  parseRecord,
  recordEqual,
  recordKey,
  identity,
  SEAL_LIMIT,
  type CustodyRecord,
} from './custodyRecord';
import {
  openFactor,
  normalizeDeviceCode,
  utf8,
  guardedSubtle,
  hkdf,
  fields,
  hex,
  type Bytes,
  type SealedCredential,
} from './custodyCrypto';
import {
  claimScope,
  readLocalClaim,
  verifyLocalClaim,
  matchLocalCustody,
  slotCustodyRows,
  localClaimKey,
  type LocalClaim,
} from './localGenesisRecord';
import {
  storageUpgradeKey,
  checkStorageCompatibility,
  StorageCompatibilityError,
} from './storageCompatibility';
import { probeDatabase } from './startupStorage';
import { contentTransaction } from './contentDatabase';
import type { SessionTask } from './writeSession';
export interface PromotionRecord {
  v: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  kind: 'local-promotion';
  id: string;
  source: PromotionSource;
  claimMac: string;
  pin: AuthorityPin;
  account: PendingState;
  retryHash: string;
  custodyMac: string;
  sealReserved: number;
  credentialIds: [string, string];
  stage:
    | 'reserved'
    | 'prepared'
    | 'genesis-prepared'
    | 'admission-requested'
    | 'admission-offered'
    | 'admission-receipted'
    | 'handoff-prepared'
    | 'handoff-selected'
    | 'account-active'
    | 'account-capturing'
    | 'account-spooling'
    | 'account-delivering'
    | 'account-receiving';
  successor?: InstalledSuccessor;
  membership?: InstalledMembership;
  catchup?: ContentCheckpoint;
  /** Frozen raw content census while upgrading a local-only Account to source capture. */
  captureBootstrap?: string;
  handoff?: HandoffState;
  admission?: RetainedAdmission;
  genesis?: GenesisCandidate;
  credentials: [SealedCredential, SealedCredential] | null;
  mac: Bytes;
}
const id = (v: unknown) => {
  unhex(v, 16);
  return v as string;
};
export const parsePromotion = (input: unknown): PromotionRecord => {
  const r = closed(input, [
    'v',
    'kind',
    'id',
    'source',
    'claimMac',
    'pin',
    'account',
    'retryHash',
    'custodyMac',
    'sealReserved',
    'credentialIds',
    'stage',
    'credentials',
    'mac',
    ...((input as { v?: number })?.v === 6 && Object.hasOwn(input as object, 'captureBootstrap')
      ? ['captureBootstrap']
      : []),
    ...((input as { v?: number })?.v === 9 && Object.hasOwn(input as object, 'membership')
      ? ['membership']
      : []),
    ...([6, 7, 8, 9].includes((input as { v?: number })?.v ?? 0) &&
    Object.hasOwn(input as object, 'catchup')
      ? ['catchup']
      : []),
    ...([6, 7, 8, 9].includes((input as { v?: number })?.v ?? 0) &&
    Object.hasOwn(input as object, 'successor')
      ? ['successor']
      : []),
    ...([2, 3, 4, 5, 6, 7, 8, 9].includes((input as { v?: number })?.v ?? 0) ? ['genesis'] : []),
    ...([3, 4, 5, 6, 7, 8, 9].includes((input as { v?: number })?.v ?? 0) ? ['admission'] : []),
    ...([4, 5, 6, 7, 8, 9].includes((input as { v?: number })?.v ?? 0) ? ['handoff'] : []),
  ]);
  const s = closed(r['source'], [
    'slotId',
    'principalId',
    'workspaceId',
    'storeId',
    'rootId',
    'genesisIntentId',
    'generation',
  ]);
  if (
    typeof r['stage'] !== 'string' ||
    !(
      (r['v'] === 1 && ['reserved', 'prepared'].includes(String(r['stage']))) ||
      (r['v'] === 2 && r['stage'] === 'genesis-prepared') ||
      (r['v'] === 4 && ['handoff-prepared', 'handoff-selected'].includes(String(r['stage']))) ||
      (r['v'] === 5 && r['stage'] === 'account-active') ||
      (r['v'] === 6 && r['stage'] === 'account-capturing') ||
      (r['v'] === 7 && r['stage'] === 'account-spooling') ||
      (r['v'] === 8 && r['stage'] === 'account-delivering') ||
      (r['v'] === 9 && r['stage'] === 'account-receiving') ||
      (r['v'] === 3 &&
        ['admission-requested', 'admission-offered', 'admission-receipted'].includes(
          String(r['stage']),
        ))
    ) ||
    r['kind'] !== 'local-promotion' ||
    s['generation'] !== 1
  )
    throw Error('Unsupported promotion');
  const source = {
    slotId: identity(s['slotId']),
    principalId: id(s['principalId']),
    workspaceId: id(s['workspaceId']),
    storeId: id(s['storeId']),
    rootId: id(s['rootId']),
    genesisIntentId: id(s['genesisIntentId']),
    generation: 1,
  };
  const pin = parseAuthorityPin(r['pin']),
    account = parsePendingState(r['account']);
  if (
    account.status !== 'eligible' ||
    account.draft!.authRoot !== pin.authRoot ||
    account.draft!.principalId !== source.principalId ||
    account.draft!.workspaceId !== source.workspaceId
  )
    throw Error('Promotion context mismatch');
  for (const field of ['claimMac', 'retryHash', 'custodyMac']) unhex(r[field], 32);
  if (
    !Number.isSafeInteger(r['sealReserved']) ||
    (r['sealReserved'] as number) < 5 ||
    (r['sealReserved'] as number) >= SEAL_LIMIT
  )
    throw Error('Invalid promotion budget');
  if (!Array.isArray(r['credentialIds']) || r['credentialIds'].length !== 2)
    throw Error('Missing prepared credential identities');
  const credentialIds: [string, string] = [id(r['credentialIds'][0]), id(r['credentialIds'][1])];
  if (credentialIds[0] === credentialIds[1]) throw Error('Duplicate credential identity');
  let credentials: PromotionRecord['credentials'] = null;
  if (r['stage'] !== 'reserved') {
    if (!Array.isArray(r['credentials']) || r['credentials'].length !== 2)
      throw Error('Missing prepared credentials');
    credentials = Array.from(r['credentials']).map((input: unknown, i: number) => {
      const c = closed(input, ['role', 'id', 'publicKey', 'sealed']),
        e = closed(c['sealed'], ['v', 'nonce', 'ct']);
      const role = i === 0 ? 'wrapping' : 'signing';
      const bytes = (v: unknown, n: number): Bytes => {
        if (!(v instanceof Uint8Array) || v.length !== n) throw Error('Invalid sealed credential');
        return v.slice();
      };
      if (c['role'] !== role || c['id'] !== credentialIds[i] || e['v'] !== 2)
        throw Error('Prepared credential changed');
      return {
        role,
        id: credentialIds[i]!,
        publicKey: bytes(c['publicKey'], 32),
        sealed: { v: 2, nonce: bytes(e['nonce'], 12), ct: bytes(e['ct'], 48) },
      };
    }) as PromotionRecord['credentials'];
  } else if (r['credentials'] !== null) throw Error('Unexpected prepared keys');
  if (!(r['mac'] instanceof Uint8Array) || r['mac'].length !== 32)
    throw Error('Missing promotion authentication');
  if (Object.hasOwn(r, 'captureBootstrap')) {
    unhex(r['captureBootstrap'], 32);
    if (Object.hasOwn(r, 'successor') || Object.hasOwn(r, 'catchup'))
      throw Error('Capture bootstrap requires the original account epoch');
  }
  return {
    v: r['v'] as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
    ...([2, 3, 4, 5, 6, 7, 8, 9].includes(r['v'] as number)
      ? { genesis: parseGenesis(r['genesis']) }
      : {}),
    ...([4, 5, 6, 7, 8, 9].includes(r['v'] as number)
      ? { handoff: parseHandoff(r['handoff']) }
      : {}),
    ...([3, 4, 5, 6, 7, 8, 9].includes(r['v'] as number)
      ? {
          admission: parseRetainedAdmission(
            r['admission'],
            [4, 5, 6, 7, 8, 9].includes(r['v'] as number)
              ? 'admission-receipted'
              : (r['stage'] as string),
          ),
        }
      : {}),
    ...(Object.hasOwn(r, 'catchup') ? { catchup: parseContentCheckpoint(r['catchup']) } : {}),
    ...(Object.hasOwn(r, 'captureBootstrap')
      ? { captureBootstrap: r['captureBootstrap'] as string }
      : {}),
    ...(Object.hasOwn(r, 'membership')
      ? { membership: parseInstalledMembership(r['membership']) }
      : {}),
    ...(Object.hasOwn(r, 'successor')
      ? { successor: parseInstalledSuccessor(r['successor']) }
      : {}),
    kind: 'local-promotion',
    id: id(r['id']),
    source,
    claimMac: r['claimMac'] as string,
    pin,
    account,
    retryHash: r['retryHash'] as string,
    custodyMac: r['custodyMac'] as string,
    sealReserved: r['sealReserved'] as number,
    credentialIds,
    stage: r['stage'] as PromotionRecord['stage'],
    credentials,
    mac: r['mac'].slice(),
  };
};
export const promotionPayload = (r: PromotionRecord): Bytes =>
  utf8(
    JSON.stringify([
      'done/local-promotion/v1',
      r.v,
      r.kind,
      r.id,
      [
        r.source.slotId,
        r.source.principalId,
        r.source.workspaceId,
        r.source.storeId,
        r.source.rootId,
        r.source.genesisIntentId,
        r.source.generation,
      ],
      r.claimMac,
      [r.pin.v, r.pin.serviceId, r.pin.origin, r.pin.rpId, r.pin.authRoot],
      pendingBytes(r.account),
      r.retryHash,
      r.custodyMac,
      r.sealReserved,
      r.credentialIds,
      r.stage,
      r.credentials?.map((c) => [
        c.role,
        c.id,
        hex(c.publicKey),
        c.sealed.v,
        hex(c.sealed.nonce),
        hex(c.sealed.ct),
      ]) ?? null,
      ...(r.v >= 2 ? [parseGenesis(r.genesis)] : []),
      ...(r.v >= 3
        ? [parseRetainedAdmission(r.admission, r.v >= 4 ? 'admission-receipted' : r.stage)]
        : []),
      ...(r.v >= 4 ? [parseHandoff(r.handoff)] : []),
      ...(r.successor ? [parseInstalledSuccessor(r.successor)] : []),
      ...(r.catchup ? [parseContentCheckpoint(r.catchup)] : []),
      ...(r.membership ? [parseInstalledMembership(r.membership)] : []),
      ...(r.captureBootstrap ? [['capture-bootstrap', r.captureBootstrap]] : []),
    ]),
  );
const macKey = (root: Bytes, r: PromotionRecord, subtle: SubtleCrypto) =>
  hkdf(
    root,
    new Uint8Array(),
    fields(
      'done/local-promotion/v1',
      r.source.slotId,
      r.source.principalId,
      r.source.workspaceId,
      r.source.rootId,
    ),
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    ['sign', 'verify'],
    subtle,
  );
export const signPromotion = async (
  root: Bytes,
  r: PromotionRecord,
  subtle: SubtleCrypto,
): Promise<PromotionRecord> =>
  parsePromotion({
    ...r,
    mac: new Uint8Array(
      await subtle.sign('HMAC', await macKey(root, r, subtle), promotionPayload(r)),
    ),
  });
const sameBytes = (a: Bytes, b: Bytes): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);
export const equalPromotion = (a: PromotionRecord, b: PromotionRecord) => {
  if (!sameBytes(a.mac, b.mac)) return false;
  const aa = promotionPayload(a);
  let bb: Bytes | undefined;
  try {
    bb = promotionPayload(b);
    return sameBytes(aa, bb);
  } finally {
    aa.fill(0);
    bb?.fill(0);
  }
};
/** Retained encoding v1 stores one candidate. The signature reference is a locator, never authority.
 * Expand it before all existing parsing, MAC, request, receipt and semantic checks. */
export const storePromotion = (input: PromotionRecord): unknown => {
  const r = parsePromotion(input);
  if (r.v < 3) return r;
  const admission = r.admission!,
    request = admission.request;
  if (JSON.stringify(r.genesis) !== JSON.stringify(request.candidate))
    throw Error('Retained admission candidate differs from genesis');
  return {
    ...r,
    retainedEncoding: 1,
    admission: {
      ...admission,
      request: {
        ...request,
        candidate: { v: 1, kind: 'genesis-reference', signature: r.genesis!.signature },
      },
    },
  };
};
const storedFields = (input: unknown, keys: string[]) => {
  if (
    !input ||
    typeof input !== 'object' ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    Reflect.ownKeys(input).some(
      (k) => typeof k !== 'string' || !('value' in Object.getOwnPropertyDescriptor(input, k)!),
    )
  )
    throw Error('Malformed retained promotion data');
  return closed(input, keys);
};
export const parseStoredPromotion = (input: unknown): PromotionRecord => {
  if (!input || typeof input !== 'object' || !Object.hasOwn(input, 'retainedEncoding'))
    return parsePromotion(input);
  const outer = storedFields(input, Object.keys(input));
  if (outer['retainedEncoding'] !== 1) throw Error('Unsupported retained promotion encoding');
  const r = { ...outer };
  delete r['retainedEncoding'];
  const admission = storedFields(r['admission'], ['request', 'offer', 'completion', 'receipt']);
  const request = storedFields(admission['request'], [
    'v',
    'candidate',
    'certification',
    'recovery',
    'originSignature',
  ]);
  const reference = storedFields(request['candidate'], ['v', 'kind', 'signature']);
  const genesis = parseGenesis(r['genesis']);
  if (
    reference['v'] !== 1 ||
    reference['kind'] !== 'genesis-reference' ||
    reference['signature'] !== genesis.signature
  )
    throw Error('Invalid retained genesis reference');
  return parsePromotion({
    ...r,
    genesis,
    admission: { ...admission, request: { ...request, candidate: genesis } },
  });
};
/** Internal key scope. All production callers erase their raw buffers before this task settles. */
export async function withPromotionRoot<T>(
  task: SessionTask,
  claim: LocalClaim,
  record: CustodyRecord,
  code: string,
  work: (root: Bytes, subtle: SubtleCrypto) => Promise<T>,
): Promise<T> {
  const subtle = guardedSubtle(() => task.step(() => {})),
    factor = utf8(normalizeDeviceCode(code));
  let root: Bytes | undefined;
  try {
    await task.wait(async () => {
      root = await openFactor(claimScope(claim), factor, claim.initial.seals[0], subtle);
    });
    await task.wait(() => authenticateRecord(root!, record, subtle));
    return await task.wait(() => work(root!, subtle));
  } finally {
    root?.fill(0);
    factor.fill(0);
  }
}
export async function readPromotion(task: SessionTask, slotId: string, code: string) {
  const claim = await readLocalClaim(task, slotId);
  return authenticatePromotionInventory(
    task,
    slotId,
    code,
    claim,
    (await slotCustodyRows(task, slotId)) ?? [],
  );
}
/** Internal owner check: authenticate the exact snapshot retained for unchanged-authority reuse. */
export function authenticatePromotionRows(
  task: SessionTask,
  slotId: string,
  code: string,
  rows: AccountAuthorityRows,
) {
  return authenticatePromotionInventory(task, slotId, code, authorityClaim(rows, slotId), rows);
}
async function authenticatePromotionInventory(
  task: SessionTask,
  slotId: string,
  code: string,
  claim: Awaited<ReturnType<typeof readLocalClaim>>,
  rows: AccountAuthorityRows,
) {
  if (!claim || claim.stage !== 'ready') throw Error('Promotion needs ready Local');
  await verifyLocalClaim(task, claim, code);
  const scope = claimScope(claim);
  const row = rows.find((r) => indexedDB.cmp(r.key, recordKey(scope)) === 0);
  const record = parseRecord(row?.value, scope);
  matchLocalCustody(claim, record);
  if (record.state !== 'protected') throw Error('Promotion needs protected custody');
  const retained = rows.find((r) => indexedDB.cmp(r.key, storageUpgradeKey(slotId)) === 0);
  const marker = retained ? parseStoredPromotion(retained.value) : null;
  await withPromotionRoot(task, claim, record, code, async (root, subtle) => {
    if (!marker) return;
    if (
      !(await subtle.verify(
        'HMAC',
        await macKey(root, marker, subtle),
        marker.mac,
        promotionPayload(marker),
      ))
    )
      throw Error('Promotion authentication failed');
    const s = marker.source,
      i = claim.initial.creation_intent!;
    if (
      s.slotId !== slotId ||
      s.principalId !== scope.principalId ||
      s.workspaceId !== scope.workspaceId ||
      s.storeId !== record.store_id ||
      s.rootId !== record.root_id ||
      s.genesisIntentId !== i.id ||
      s.generation !== record.envelope!.gen ||
      marker.claimMac !== hex(claim.mac) ||
      marker.custodyMac !== hex(record.mac) ||
      marker.sealReserved !== record.seal_reserved ||
      marker.credentialIds.some((id) => record.credentials!.some((c) => c.id === id))
    )
      throw Error('Promotion source or budget changed');
  });
  return { claim, record, marker };
}
/** Exclusive owner entry only. Unknown/malformed markers continue refusing. */
export async function checkPromotionCompatibility(task: SessionTask, slotId: string, code: string) {
  try {
    await checkStorageCompatibility(task, slotId);
  } catch (error) {
    if (!(error instanceof StorageCompatibilityError)) throw error;
    const state = await readPromotion(task, slotId, code);
    if (!state.marker) throw error;
  }
}
/** Atomic interlock + consumed seal reservation, or prepared-key commit, or authenticated removal.
 * No content, journal, Local claim/index, factor seal, or original credential is overwritten. */
export async function writePromotion(
  task: SessionTask,
  claim: LocalClaim,
  old: CustodyRecord,
  next: CustodyRecord,
  expected: PromotionRecord | null,
  marker: PromotionRecord | null,
  checkCommit?: () => void,
) {
  const stored = marker ? task.step(() => storePromotion(marker)) : null;
  const found = await probeDatabase(task, 'done.custody', (db) =>
    contentTransaction(
      db,
      task,
      ['entries'],
      'readwrite',
      (tx, _result, guard) => {
        const store = tx.objectStore('entries'),
          requests = [
            store.get(localClaimKey(old.slot_id)),
            store.get(recordKey(claimScope(claim))),
            store.openCursor(IDBKeyRange.only(storageUpgradeKey(old.slot_id))),
          ];
        let remaining = 3;
        for (const req of requests)
          req.onsuccess = () =>
            guard(() => {
              if (--remaining) return;
              const currentClaim = requests[0]!.result as LocalClaim,
                current = parseRecord(requests[1]!.result, claimScope(claim)),
                cursor = requests[2]!.result as IDBCursorWithValue | null;
              if (
                !currentClaim ||
                hex(currentClaim.mac) !== hex(claim.mac) ||
                !recordEqual(current, old) ||
                (expected
                  ? !cursor || !equalPromotion(parseStoredPromotion(cursor.value), expected)
                  : !!cursor)
              )
                throw Error('Promotion compare changed');
              checkCommit?.();
              if (!recordEqual(old, next)) store.put(next, recordKey(claimScope(claim)));
              if (stored) store.put(stored, storageUpgradeKey(old.slot_id));
              else store.delete(storageUpgradeKey(old.slot_id));
            });
      },
      'strict',
    ).then(() => true),
  );
  if (!found) throw Error('Promotion custody disappeared');
}
export { signRecord };
