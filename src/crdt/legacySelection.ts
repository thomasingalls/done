/**
 * Preparatory Local selection. The host must exclude predecessor pages, workers and
 * transport for this entire operation. The current seeded harness supplies that
 * precondition; no production cutover route exposes this owner yet. Source equality
 * only detects observed change and never supplies exclusion or deletion authority.
 */
import { CUSTODY_DB, CUSTODY_STORE, identity } from './custodyRecord';
import { hex } from './custodyCrypto';
import { withExclusiveSlot, type SessionTask } from './writeSession';
import { withPreactiveContentUnderPermit } from './custody';
import { contentTransaction } from './contentDatabase';
import { probeDatabase } from './startupStorage';
import { inspectLegacySource } from './legacySource';
import { importClaimKey } from './legacyImportState';
import {
  readImportClaim,
  verifyImportClaim,
  importScope,
  importCensus,
  sameImportBinding,
  advanceImportClaim,
  parseImportClaim,
  equalImportClaim,
  type ImportClaim,
} from './legacyImportRecord';
import {
  copyImportInput,
  prepareImportPlan,
  importCursor,
  verifyImportedProjection,
  refuseImport,
  type LegacyImportInput,
  type ImportPlan,
} from './legacyImportPlan';
import {
  localClaimKey,
  readLocalClaim,
  verifyLocalClaim,
  signLocalClaim,
  claimScope,
  type LocalClaim,
} from './localGenesisRecord';
import { localCensus, installLocalIndex } from './localGenesisStorage';
import { Y } from './yjs';

export interface LegacySelectionReceipt {
  readonly kind: 'selected';
  readonly scope: Readonly<ReturnType<typeof importScope>>;
  readonly storeId: string;
  readonly intentId: string;
  /** Selection is complete; source cleanup has not run. */
  readonly sourceCleanup: 'pending';
}
const receipt = (claim: LocalClaim): LegacySelectionReceipt =>
  Object.freeze({
    kind: 'selected',
    scope: Object.freeze(claimScope(claim)),
    storeId: claim.initial.store_id,
    intentId: claim.initial.creation_intent!.id,
    sourceCleanup: 'pending',
  });
const checkSource = async (task: SessionTask, claim: ImportClaim) => {
  if (task.step(() => globalThis.location.origin) !== claim.binding.sourceOrigin)
    refuseImport('selection-source-origin-mismatch');
  const observed = await inspectLegacySource(task);
  try {
    if (observed.digest !== claim.binding.sourceDigest || observed.dependencies !== 'complete')
      refuseImport('selection-source-changed');
  } finally {
    observed.updates.forEach((row) => row.bytes.fill(0));
    observed.journal.forEach((row) => row.bytes.fill(0));
  }
};
/** Always opens/authenticates disk in a new owner and replays into a new document. */
const verifyDestination = async (
  task: SessionTask,
  claim: ImportClaim,
  code: string,
  plan: ImportPlan,
) => {
  const scope = importScope(claim),
    intent = claim.initial.creation_intent!.id;
  await withPreactiveContentUnderPermit(
    task,
    {
      ...scope,
      resolvePrincipal: async () => {
        await importCensus(task, claim);
        return scope.principalId;
      },
    },
    code,
    async (content) => {
      const rows = await content.loadRecords(),
        doc = new Y.Doc({ gc: false });
      try {
        if (rows.length !== plan.actions.length) refuseImport('selection-slices-missing');
        for (const [index, row] of rows.entries()) {
          if (row.kind !== 'update') refuseImport('unexpected-selection-record');
          task.step(() => Y.applyUpdate(doc, row.bytes));
          importCursor(doc, intent, plan, index + 1);
        }
        task.step(() => verifyImportedProjection(doc, plan, intent, claim.createdAt));
      } finally {
        rows.forEach((row) => row.bytes.fill(0));
        doc.destroy();
      }
    },
  );
};
/** Final custody transaction is the active decision. The index alone cannot authorize opening. */
const finishSelection = async (task: SessionTask, claim: ImportClaim, local: LocalClaim) => {
  const slotId = claim.initial.slot_id;
  const found = await probeDatabase(task, CUSTODY_DB, async (db) => {
    await contentTransaction<void>(db, task, [CUSTODY_STORE], 'readwrite', (tx, _result, guard) => {
      const store = tx.objectStore(CUSTODY_STORE),
        key = importClaimKey(slotId),
        req = store.get(key);
      req.onsuccess = () =>
        guard(() => {
          if (
            claim.stage !== 'selecting' ||
            !equalImportClaim(parseImportClaim(req.result, slotId), claim)
          )
            refuseImport('selection-intent-changed');
          // add and delete commit together. A duplicate Local claim aborts both.
          store.add(local, localClaimKey(slotId));
          store.delete(key);
        });
    });
    return true;
  });
  if (!found) refuseImport('selection-custody-missing');
};
export const selectLegacyImport = (
  slotId: string,
  code: string,
  input: LegacyImportInput,
  options: { signal?: AbortSignal } = {},
): Promise<LegacySelectionReceipt> => {
  identity(slotId);
  const captured = copyImportInput(input);
  return withExclusiveSlot(
    slotId,
    async (task) => {
      let claim = await readImportClaim(task, slotId);
      if (!claim) {
        // A completed selection may already have admitted new work or compacted its
        // import records. Authenticate its immutable provenance; never reimport or
        // compare the current document to the old payload on this path.
        const local = await readLocalClaim(task, slotId);
        if (!local?.imported) refuseImport('selection-claim-missing');
        await verifyLocalClaim(task, local, code);
        const plan = await prepareImportPlan(task, captured);
        if (!sameImportBinding(local.imported, plan.binding))
          refuseImport('import-intent-mismatch');
        const census = await localCensus(task, local);
        if (!census.slot) refuseImport('selected-index-missing');
        return receipt(local);
      }
      await verifyImportClaim(task, claim, code);
      if (claim.stage !== 'imported' && claim.stage !== 'selecting')
        refuseImport('import-not-complete');
      const plan = await prepareImportPlan(task, captured);
      if (!sameImportBinding(claim.binding, plan.binding)) refuseImport('import-intent-mismatch');
      await importCensus(task, claim);
      await checkSource(task, claim);
      await verifyDestination(task, claim, code, plan);
      if (claim.stage === 'imported')
        claim = await advanceImportClaim(task, claim, code, 'selecting');
      const local = await signLocalClaim(
        task,
        {
          v: 1,
          initial: claim.initial,
          stage: 'ready',
          mac: new Uint8Array(32),
          imported: { ...claim.binding, createdAt: claim.createdAt, selectionMac: hex(claim.mac) },
        },
        code,
      );
      const census = await importCensus(task, claim);
      if (!census.slot) await installLocalIndex(task, local);
      if (!(await importCensus(task, claim)).slot) refuseImport('selection-index-missing');
      await checkSource(task, claim);
      await finishSelection(task, claim, local);
      return receipt(local);
    },
    { ...(options.signal ? { signal: options.signal } : {}) },
  ).finally(() => captured.recovery.fill(0));
};
