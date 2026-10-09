/** Read-only migration discovery. Authenticated metadata is not a content-recovery receipt. */
import { identity } from './custodyRecord';
import { readLocalClear } from './localClearState';
import { importClaimKey } from './legacyImportState';
import {
  parseImportClaim,
  verifyImportClaim,
  importCensus,
  sameImportBinding,
} from './legacyImportRecord';
import {
  localClaimKey,
  parseLocalClaim,
  verifyLocalClaim,
  slotCustodyRows,
} from './localGenesisRecord';
import { localCensus, readLocalSlot } from './localGenesisStorage';
import { cleanupComplete } from './legacyCleanupRecord';
import { prepareImportPlan, type LegacyImportInput } from './legacyImportPlan';
import type { SessionTask } from './writeSession';

export class LegacyCoordinatorError extends Error {
  override readonly name = 'LegacyCoordinatorError';
  constructor(readonly reason: string) {
    super(reason);
  }
}
export function refuseCoordinator(reason: string): never {
  throw new LegacyCoordinatorError(reason);
}
export type MigrationInspection =
  | { readonly kind: 'unused' }
  | { readonly kind: 'owner-required'; readonly owner: 'clear' | 'local' | 'account' | 'closed' }
  | { readonly kind: 'unlock-required'; readonly owner: 'import' | 'selected' }
  | {
      readonly kind: 'import' | 'selected';
      readonly stage: 'custody' | 'content' | 'importing' | 'imported' | 'selecting' | 'ready';
      readonly storeId: string;
      readonly intentId: string;
      readonly input: 'required' | 'verified';
      readonly cleanup: 'pending' | 'partial' | 'terminal';
    };

export const inspectMigrationUnderPermit = async (
  task: SessionTask,
  slotId: string,
  code?: string,
  input?: LegacyImportInput,
): Promise<MigrationInspection> => {
  identity(slotId);
  // Refusal first, including after clear has removed custody. This does not authenticate a clear receipt.
  if (await readLocalClear(task, slotId)) return { kind: 'owner-required', owner: 'clear' };
  const rows = (await slotCustodyRows(task, slotId)) ?? [];
  const row = (key: IDBValidKey) => rows.find((r) => indexedDB.cmp(r.key, key) === 0);
  const imported = row(importClaimKey(slotId)),
    local = row(localClaimKey(slotId));
  if (imported && local) refuseCoordinator('migration-conflicting-claims');
  const slot = await readLocalSlot(task, slotId);
  if (slot?.status === 'closed') return { kind: 'owner-required', owner: 'closed' };
  if (slot?.unlockBinding) {
    if (imported || local) refuseCoordinator('migration-conflicting-identity');
    return { kind: 'owner-required', owner: 'account' };
  }
  if (!imported && !local) {
    if (rows.length || slot) refuseCoordinator('migration-unclaimed-material');
    return { kind: 'unused' };
  }
  const claim = imported
    ? parseImportClaim(imported.value, slotId)
    : parseLocalClaim(local!.value, slotId);
  if (!imported && !('imported' in claim && claim.imported))
    return { kind: 'owner-required', owner: 'local' };
  if (code === undefined)
    return { kind: 'unlock-required', owner: imported ? 'import' : 'selected' };
  if (imported) {
    const c = parseImportClaim(imported.value, slotId);
    await verifyImportClaim(task, c, code);
    await importCensus(task, c);
  } else {
    const c = parseLocalClaim(local!.value, slotId);
    await verifyLocalClaim(task, c, code);
    if (c.stage !== 'ready' || !(await localCensus(task, c)).slot)
      refuseCoordinator('migration-selected-route-missing');
  }
  if (input) {
    const plan = await prepareImportPlan(task, input);
    const binding = 'binding' in claim ? claim.binding : claim.imported!;
    if (!sameImportBinding(binding, plan.binding)) refuseCoordinator('migration-input-mismatch');
    if (task.step(() => globalThis.location.origin) !== binding.sourceOrigin)
      refuseCoordinator('migration-source-origin-mismatch');
  }
  const cleanup = 'sourceCleanup' in claim ? claim.sourceCleanup : undefined;
  return Object.freeze({
    kind: imported ? 'import' : 'selected',
    stage: claim.stage,
    storeId: claim.initial.store_id,
    intentId: claim.initial.creation_intent!.id,
    input: input ? 'verified' : 'required',
    cleanup: cleanupComplete(cleanup) ? 'terminal' : cleanup ? 'partial' : 'pending',
  });
};
