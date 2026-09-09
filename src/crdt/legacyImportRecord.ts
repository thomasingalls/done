/** Factor-authenticated immutable input/identity binding and coarse import progress. */
import {
  authenticateRecord,
  recordEqual,
  CUSTODY_DB,
  CUSTODY_STORE,
  recordKey,
  type CustodyRecord,
} from './custodyRecord';
import {
  openFactor,
  normalizeDeviceCode,
  utf8,
  guardedSubtle,
  fields,
  hex,
  hkdf,
  type Bytes,
} from './custodyCrypto';
import {
  parseLocalClaim,
  claimScope,
  slotCustodyRows,
  matchLocalCustody,
} from './localGenesisRecord';
import { parseRecord } from './custodyRecord';
import { parseCounter, parseWitness } from './contentRecord';
import { probeDatabase, journalCount } from './startupStorage';
import { readLocalSlot } from './localGenesisStorage';
import { contentCensus } from './startupClassification';
import { contentTransaction } from './contentDatabase';
import { deriveStoreName } from './storeName';
import { journalPrefix } from './journalCodec';
import { assertNoLocalClear } from './localClearState';
import { importClaimKey } from './legacyImportState';
import { IMPORT_POLICY, refuseImport, type ImportBinding } from './legacyImportPlan';
import type { SessionTask } from './writeSession';
export interface ImportClaim {
  v: 1;
  initial: CustodyRecord;
  binding: ImportBinding;
  createdAt: string;
  stage: 'custody' | 'content' | 'importing' | 'imported';
  mac: Bytes;
}
export const importScope = (claim: ImportClaim) => claimScope({ ...claim, stage: 'custody' });
const bindingTuple = (b: ImportBinding) => [
  b.policy,
  b.recoveryDigest,
  b.sourceOrigin,
  b.sourceDigest,
  b.planDigest,
];
const payload = (c: ImportClaim) =>
  fields(
    'done/legacy-import-progress/v1',
    hex(c.initial.mac),
    JSON.stringify(bindingTuple(c.binding)),
    c.createdAt,
    c.stage,
  );
export const sameImportBinding = (a: ImportBinding, b: ImportBinding) =>
  JSON.stringify(bindingTuple(a)) === JSON.stringify(bindingTuple(b));
export const parseImportClaim = (value: unknown, slotId: string): ImportClaim => {
  const c = value as ImportClaim;
  if (
    !c ||
    Object.keys(c).sort().join(',') !== 'binding,createdAt,initial,mac,stage,v' ||
    c.v !== 1 ||
    !['custody', 'content', 'importing', 'imported'].includes(c.stage) ||
    typeof c.createdAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(c.createdAt) ||
    !Number.isFinite(Date.parse(c.createdAt)) ||
    !c.binding ||
    Object.keys(c.binding).sort().join(',') !==
      'planDigest,policy,recoveryDigest,sourceDigest,sourceOrigin' ||
    c.binding.policy !== IMPORT_POLICY ||
    [c.binding.planDigest, c.binding.recoveryDigest, c.binding.sourceDigest].some(
      (v) => typeof v !== 'string' || !/^[a-f0-9]{64}$/u.test(v),
    ) ||
    typeof c.binding.sourceOrigin !== 'string' ||
    c.binding.sourceOrigin.length > 4096
  )
    return refuseImport('invalid-import-claim');
  const local = parseLocalClaim({ v: 1, initial: c.initial, stage: 'custody', mac: c.mac }, slotId);
  return {
    v: 1,
    initial: local.initial,
    binding: { ...c.binding },
    createdAt: c.createdAt,
    stage: c.stage,
    mac: local.mac,
  };
};
export const readImportClaim = async (task: SessionTask, slotId: string) => {
  await assertNoLocalClear(task, slotId);
  const rows = (await slotCustodyRows(task, slotId)) ?? [];
  const row = rows.find((r) => indexedDB.cmp(r.key, importClaimKey(slotId)) === 0);
  return row ? parseImportClaim(row.value, slotId) : null;
};
const authenticate = async (
  task: SessionTask,
  claim: ImportClaim,
  code: string,
  sign: boolean,
): Promise<Bytes> => {
  let root: Bytes | undefined, factor: Bytes | undefined;
  try {
    const subtle = guardedSubtle(() => task.step(() => {}));
    try {
      factor = utf8(normalizeDeviceCode(code));
      await task.wait(async () => {
        root = await openFactor(importScope(claim), factor!, claim.initial.seals[0], subtle);
      });
    } catch {
      task.step(() => {});
      refuseImport('import-unlock-failed');
    }
    await task.wait(() => authenticateRecord(root!, claim.initial, subtle));
    const scope = importScope(claim);
    const key = await task.wait(() =>
      hkdf(
        root!,
        new Uint8Array(),
        fields(
          'done/legacy-import-metadata/v1',
          scope.slotId,
          scope.principalId,
          scope.workspaceId,
          claim.initial.root_id,
        ),
        { name: 'HMAC', hash: 'SHA-256', length: 256 },
        ['sign', 'verify'],
        subtle,
      ),
    );
    if (sign)
      return new Uint8Array(await task.wait(() => subtle.sign('HMAC', key, payload(claim))));
    if (!(await task.wait(() => subtle.verify('HMAC', key, claim.mac, payload(claim)))))
      refuseImport('import-claim-authentication-failed');
    return claim.mac;
  } finally {
    root?.fill(0);
    factor?.fill(0);
  }
};
export const signImportClaim = async (
  task: SessionTask,
  c: ImportClaim,
  code: string,
): Promise<ImportClaim> => ({ ...c, mac: await authenticate(task, c, code, true) });
export const verifyImportClaim = async (task: SessionTask, c: ImportClaim, code: string) => {
  await authenticate(task, c, code, false);
};
export const equalImportClaim = (a: ImportClaim, b: ImportClaim) =>
  recordEqual(a.initial, b.initial) &&
  hex(payload(a)) === hex(payload(b)) &&
  hex(a.mac) === hex(b.mac);

export const requireUnusedImportSlot = async (task: SessionTask, slotId: string) => {
  await assertNoLocalClear(task, slotId);
  if ((await readLocalSlot(task, slotId)) || (await slotCustodyRows(task, slotId))?.length)
    refuseImport('import-destination-retains-material');
};
export const importCensus = async (task: SessionTask, claim: ImportClaim) => {
  const scope = importScope(claim),
    key = recordKey(scope),
    intent = claim.initial.creation_intent!;
  await assertNoLocalClear(task, scope.slotId);
  if (await readLocalSlot(task, scope.slotId)) refuseImport('import-destination-indexed');
  let custody: unknown,
    witness: unknown,
    seen = false;
  for (const row of (await slotCustodyRows(task, scope.slotId)) ?? []) {
    if (indexedDB.cmp(row.key, importClaimKey(scope.slotId)) === 0) {
      if (!equalImportClaim(parseImportClaim(row.value, scope.slotId), claim))
        refuseImport('import-claim-changed');
      seen = true;
    } else if (indexedDB.cmp(row.key, key) === 0) custody = row.value;
    else if (indexedDB.cmp(row.key, [...key, 'content-v1']) === 0) witness = row.value;
    else refuseImport('unknown-import-carrier');
  }
  if (!seen || custody === undefined) refuseImport('import-custody-missing');
  const record = parseRecord(custody, scope);
  matchLocalCustody({ ...claim, stage: 'custody' }, record);
  if (claim.stage !== 'custody' && record.state !== 'protected')
    refuseImport('import-custody-regressed');
  const content = witness === undefined ? null : parseWitness(witness);
  const name = await task.wait(() => deriveStoreName(scope.principalId, scope.workspaceId));
  const disk = await contentCensus(task, name),
    journal = journalCount(task, journalPrefix(name));
  if (journal) refuseImport('unexpected-import-journal');
  if (claim.stage === 'custody' && (content || disk)) refuseImport('import-content-before-intent');
  if (!content && disk) refuseImport('import-content-without-witness');
  if (content && content.intent !== intent.id) refuseImport('import-content-intent-mismatch');
  const counter =
    disk?.counter === undefined
      ? null
      : parseCounter(
          disk.counter,
          { ...scope, storeId: intent.storeId, rootId: intent.rootId },
          intent.id,
        );
  if (
    (content?.state === 'ready' && !counter) ||
    (['importing', 'imported'].includes(claim.stage) && content?.state !== 'ready')
  )
    refuseImport('import-content-missing');
  if (
    (claim.stage === 'custody' || claim.stage === 'content') &&
    (disk?.records || (counter && (counter.next_seq !== 1 || counter.reserved['1'] !== 0)))
  )
    refuseImport('import-writes-before-progress');
  return { record, content };
};
export const installImportClaim = async (
  task: SessionTask,
  db: IDBDatabase,
  claim: ImportClaim,
) => {
  const scope = importScope(claim);
  await task.wait(() =>
    contentTransaction<void>(db, task, [CUSTODY_STORE], 'readwrite', (tx, _result, guard) => {
      const store = tx.objectStore(CUSTODY_STORE),
        req = store.openCursor(IDBKeyRange.lowerBound([scope.slotId]));
      req.onsuccess = () =>
        guard(() => {
          if (req.result && Array.isArray(req.result.key) && req.result.key[0] === scope.slotId)
            refuseImport('import-claim-already-exists');
          store.add(claim, importClaimKey(scope.slotId));
          store.add(claim.initial, recordKey(scope));
        });
    }),
  );
};
export const advanceImportClaim = async (
  task: SessionTask,
  claim: ImportClaim,
  code: string,
  stage: ImportClaim['stage'],
) => {
  const stages = ['custody', 'content', 'importing', 'imported'];
  if (stages.indexOf(stage) !== stages.indexOf(claim.stage) + 1)
    refuseImport('invalid-import-transition');
  const next = await signImportClaim(task, { ...claim, stage }, code);
  const found = await probeDatabase(task, CUSTODY_DB, async (db) => {
    await contentTransaction<void>(db, task, [CUSTODY_STORE], 'readwrite', (tx, _result, guard) => {
      const store = tx.objectStore(CUSTODY_STORE),
        key = importClaimKey(claim.initial.slot_id),
        req = store.get(key);
      req.onsuccess = () =>
        guard(() => {
          if (!equalImportClaim(parseImportClaim(req.result, claim.initial.slot_id), claim))
            refuseImport('import-progress-changed');
          store.put(next, key);
        });
    });
    return true;
  });
  if (!found) refuseImport('import-claim-missing');
  return next;
};
