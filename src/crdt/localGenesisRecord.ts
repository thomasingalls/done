/** Immutable Local identity anchor. The signed initial custody record also binds the entire creation plan. */
import {
  authenticateRecord,
  parseRecord,
  recordKey,
  CUSTODY_DB,
  CUSTODY_STORE,
  type CustodyRecord,
  type CustodyScope,
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
import { cleanupFields } from './legacyCleanupEncoding';
import { probeDatabase, checkLayout, readScopedRows, readScopedRowsBulk } from './startupStorage';
import { assertNoLocalClear } from './localClearState';
import { assertNoPreactiveImport } from './legacyImportState';
import { stopStartup } from './startupState';
import type { SessionTask } from './writeSession';

import {
  parseLegacyCleanup,
  cleanupPayload,
  type LegacyCleanupRecord,
} from './legacyCleanupRecord';

export const localClaimKey = (slotId: string): string[] => [slotId, 'local-genesis-v1'];
export interface LocalClaim {
  v: 1;
  initial: CustodyRecord;
  stage: 'custody' | 'content' | 'ready';
  mac: Bytes;
  sourceCleanup?: LegacyCleanupRecord;
  /** Authenticated provenance of an imported Local selection; absent for fresh genesis. */
  imported?: {
    policy: 'markdown-system-v1';
    recoveryDigest: string;
    sourceOrigin: string;
    sourceDigest: string;
    planDigest: string;
    createdAt: string;
    selectionMac: string;
  };
}
export const claimScope = (claim: LocalClaim): CustodyScope => ({
  slotId: claim.initial.slot_id,
  principalId: claim.initial.principal_id,
  workspaceId: claim.initial.workspace_id,
});
export const parseLocalClaim = (value: unknown, slotId: string): LocalClaim => {
  const v = value as LocalClaim | undefined;
  if (
    !v ||
    ![
      'initial,mac,stage,v',
      'imported,initial,mac,stage,v',
      'imported,initial,mac,sourceCleanup,stage,v',
    ].includes(Object.keys(v).sort().join(',')) ||
    v.v !== 1 ||
    !v.initial ||
    !['custody', 'content', 'ready'].includes(v.stage) ||
    !(v.mac instanceof Uint8Array) ||
    v.mac.length !== 32
  )
    return stopStartup('repair-required', 'invalid-local-claim');
  const scope = {
    slotId,
    principalId: v.initial.principal_id,
    workspaceId: v.initial.workspace_id,
  };
  const initial = parseRecord(v.initial, scope);
  if (
    initial.state !== 'creating' ||
    initial.seal_reserved !== 0 ||
    !/^[0-9a-f]{32}$/u.test(scope.principalId) ||
    !/^[0-9a-f]{32}$/u.test(scope.workspaceId)
  )
    stopStartup('repair-required', 'invalid-local-claim');
  if ('imported' in v) {
    const p = v.imported;
    if (
      !p ||
      v.stage !== 'ready' ||
      Object.keys(p).sort().join(',') !==
        'createdAt,planDigest,policy,recoveryDigest,selectionMac,sourceDigest,sourceOrigin' ||
      p.policy !== 'markdown-system-v1' ||
      [p.planDigest, p.recoveryDigest, p.sourceDigest, p.selectionMac].some(
        (x) => typeof x !== 'string' || !/^[a-f0-9]{64}$/u.test(x),
      ) ||
      typeof p.sourceOrigin !== 'string' ||
      p.sourceOrigin.length > 4096 ||
      typeof p.createdAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(p.createdAt) ||
      !Number.isFinite(Date.parse(p.createdAt))
    )
      stopStartup('repair-required', 'invalid-import-selection');
  }
  return {
    v: 1,
    initial,
    stage: v.stage,
    mac: v.mac.slice(),
    ...(v.imported ? { imported: { ...v.imported } } : {}),
    ...('sourceCleanup' in v ? { sourceCleanup: parseLegacyCleanup(v.sourceCleanup) } : {}),
  };
};
export const slotCustodyRows = (task: SessionTask, slotId: string) =>
  probeDatabase(task, CUSTODY_DB, async (db) => {
    checkLayout(db, { [CUSTODY_STORE]: null });
    // The measured bulk experiment remains opt-in; it did not shorten fresh authority reads.
    return import.meta.env?.['VITE_ACCOUNT_BULK_CUSTODY'] === '1'
      ? readScopedRowsBulk(task, db, CUSTODY_STORE, [slotId])
      : readScopedRows(task, db, CUSTODY_STORE, [slotId]);
  });
export const readLocalClaim = async (
  task: SessionTask,
  slotId: string,
): Promise<LocalClaim | null> => {
  await assertNoLocalClear(task, slotId);
  await assertNoPreactiveImport(task, slotId);
  const rows = (await slotCustodyRows(task, slotId)) ?? [];
  const row = rows.find((r) => indexedDB.cmp(r.key, localClaimKey(slotId)) === 0);
  return row ? parseLocalClaim(row.value, slotId) : null;
};
const claimAuthentication = async (
  task: SessionTask,
  claim: LocalClaim,
  code: string,
  signing: boolean,
): Promise<Bytes> => {
  let root: Bytes | undefined, factor: Bytes | undefined;
  try {
    const subtle = guardedSubtle(() => task.step(() => {}));
    try {
      factor = utf8(normalizeDeviceCode(code));
      await task.wait(async () => {
        root = await openFactor(claimScope(claim), factor!, claim.initial.seals[0], subtle);
      });
    } catch {
      task.step(() => {});
      stopStartup('unlock-failed', 'local-factor-wrong-or-claim-damaged');
    }
    await task.wait(() => authenticateRecord(root!, claim.initial, subtle));
    const key = await task.wait(() =>
      hkdf(
        root!,
        new Uint8Array(),
        fields(
          'done/local-genesis-metadata/v1',
          claim.initial.slot_id,
          claim.initial.principal_id,
          claim.initial.workspace_id,
          claim.initial.root_id,
        ),
        { name: 'HMAC', hash: 'SHA-256', length: 256 },
        ['sign', 'verify'],
        subtle,
      ),
    );
    const p = claim.imported;
    const selectionPayload = p
      ? fields(
          'done/local-import-selection/v1',
          hex(claim.initial.mac),
          claim.stage,
          JSON.stringify([
            p.policy,
            p.recoveryDigest,
            p.sourceOrigin,
            p.sourceDigest,
            p.planDigest,
            p.createdAt,
            p.selectionMac,
          ]),
        )
      : fields('done/local-genesis-progress/v1', hex(claim.initial.mac), claim.stage);
    const payload = claim.sourceCleanup
      ? cleanupFields(
          claim.sourceCleanup.v,
          'done/local-import-cleanup',
          hex(selectionPayload),
          cleanupPayload(claim.sourceCleanup),
        )
      : selectionPayload;
    if (signing) return new Uint8Array(await task.wait(() => subtle.sign('HMAC', key, payload)));
    if (!(await task.wait(() => subtle.verify('HMAC', key, claim.mac, payload))))
      stopStartup('repair-required', 'local-progress-authentication-failed');
    return claim.mac;
  } finally {
    root?.fill(0);
    factor?.fill(0);
  }
};
export const signLocalClaim = async (
  task: SessionTask,
  claim: LocalClaim,
  code: string,
): Promise<LocalClaim> => ({ ...claim, mac: await claimAuthentication(task, claim, code, true) });
export const verifyLocalClaim = async (
  task: SessionTask,
  claim: LocalClaim,
  code: string,
): Promise<void> => {
  await claimAuthentication(task, claim, code, false);
};
export const matchLocalCustody = (claim: LocalClaim, current: CustodyRecord): void => {
  const initial = claim.initial,
    intent = initial.creation_intent!;
  if (
    current.store_id !== intent.storeId ||
    current.root_id !== intent.rootId ||
    (current.state === 'creating'
      ? JSON.stringify(current.creation_intent) !== JSON.stringify(intent)
      : current.credentials![0].id !== intent.wrappingId ||
        current.credentials![1].id !== intent.signingId) ||
    indexedDB.cmp(recordKey(currentScope(current)), recordKey(claimScope(claim))) !== 0
  )
    stopStartup('repair-required', 'custody-differs-from-local-claim');
};
const currentScope = (r: CustodyRecord): CustodyScope => ({
  slotId: r.slot_id,
  principalId: r.principal_id,
  workspaceId: r.workspace_id,
});
