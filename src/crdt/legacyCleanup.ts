/** Preparatory source cleanup. Only the seeded host currently establishes old-writer exclusion.
 * No default application route exposes this owner. A digest or caller assertion is not exclusion. */
import { identity } from './custodyRecord';
import { random, hex } from './custodyCrypto';
import { withExclusiveSlot, type SessionTask } from './writeSession';
import { withRecoveryUnderPermit } from './custody';
import {
  readLocalClaim,
  verifyLocalClaim,
  signLocalClaim,
  claimScope,
  type LocalClaim,
} from './localGenesisRecord';
import { localCensus } from './localGenesisStorage';
import { inspectLegacySource } from './legacySource';
import {
  copyImportInput,
  prepareImportPlan,
  importReceiptKey,
  type LegacyImportInput,
  type ImportPlan,
} from './legacyImportPlan';
import { sameImportBinding } from './legacyImportRecord';
import {
  parseLegacyCleanup,
  cleanupComplete,
  cleanupFingerprinter,
  type LegacyCleanupRecord,
} from './legacyCleanupRecord';
import {
  cleanupCensus,
  cleanupRefuse,
  writeCleanupClaim,
  databaseFingerprint,
  deleteLegacyDatabase,
  removeLegacyEntry,
  requireSourceOrigin,
} from './legacyCleanupStorage';
import { Y, hasPendingUpdates } from './yjs';
import { replayRecovery } from './admissionDocument';

export interface LegacyCleanupOptions {
  signal?: AbortSignal;
  /** Observation only; never authorizes an effect. */
  onProgress?(progress: Readonly<{ next: number; total: number; blocked: boolean }>): void;
}
export interface LegacyCleanupReceipt {
  kind: 'source-cleaned';
  scope: Readonly<ReturnType<typeof claimScope>>;
  storeId: string;
  intentId: string;
  sourceDigest: string;
}
const verifySelectedRecovery = async (
  task: SessionTask,
  claim: LocalClaim,
  code: string,
  plan: ImportPlan,
) => {
  const scope = claimScope(claim);
  await withRecoveryUnderPermit(
    task,
    {
      ...scope,
      resolvePrincipal: async () => {
        if (!(await localCensus(task, claim)).slot) cleanupRefuse('cleanup-selected-route-missing');
        return scope.principalId;
      },
    },
    code,
    async (recovery) => {
      const doc = new Y.Doc({ gc: false });
      try {
        task.step(() => replayRecovery(doc, recovery));
        if (hasPendingUpdates(doc)) cleanupRefuse('cleanup-destination-pending');
        const meta = doc.getMap('meta');
        // Retain every coupled import receipt after subsequent edits/compaction. Current text may legitimately differ.
        for (let n = 1; n <= plan.actions.length; n++) {
          if (
            JSON.stringify(meta.get(importReceiptKey(n))) !==
            JSON.stringify([claim.initial.creation_intent!.id, plan.binding.planDigest, n])
          )
            cleanupRefuse('cleanup-import-coverage-missing');
        }
      } finally {
        doc.destroy();
      }
    },
  );
};
export const cleanupLegacySource = (
  slotId: string,
  code: string,
  input: LegacyImportInput,
  options: LegacyCleanupOptions = {},
): Promise<LegacyCleanupReceipt> => {
  identity(slotId);
  const captured = copyImportInput(input),
    settings = { ...options };
  return withExclusiveSlot(
    slotId,
    async (task) => {
      let claim = await readLocalClaim(task, slotId);
      if (!claim?.imported || claim.stage !== 'ready')
        return cleanupRefuse('cleanup-needs-selected-import');
      await verifyLocalClaim(task, claim, code);
      requireSourceOrigin(task, claim.imported.sourceOrigin);
      const plan = await prepareImportPlan(task, captured);
      if (!sameImportBinding(claim.imported, plan.binding)) cleanupRefuse('cleanup-input-mismatch');
      await verifySelectedRecovery(task, claim, code, plan);
      const intentId = claim.sourceCleanup?.intentId ?? hex(random(16)),
        fp = await cleanupFingerprinter(task, claim, code, intentId, claim.sourceCleanup?.v ?? 2);
      try {
        if (!claim.sourceCleanup) {
          const source = await inspectLegacySource(task);
          let manifest: LegacyCleanupRecord;
          try {
            if (source.digest !== claim.imported.sourceDigest || source.dependencies !== 'complete')
              cleanupRefuse('cleanup-source-changed');
            // Journal first within localStorage; ancillary names/credentials follow it. No values are persisted.
            const entries = [];
            for (const e of [...source.journal, ...source.ancillary])
              entries.push({ key: e.key, digest: await fp.digest('local', [e.key, e.value]) });
            manifest = {
              v: 2,
              intentId,
              databaseDigest: await databaseFingerprint(task, fp),
              entries,
              next: 0,
            };
          } finally {
            source.updates.forEach((r) => r.bytes.fill(0));
            source.journal.forEach((r) => r.bytes.fill(0));
          }
          const next = await signLocalClaim(
            task,
            { ...claim, sourceCleanup: parseLegacyCleanup(manifest) },
            code,
          );
          // Initial authorization requires the whole selected source, even if intent persistence is interrupted.
          const again = await inspectLegacySource(task);
          try {
            if (again.digest !== claim.imported.sourceDigest)
              cleanupRefuse('cleanup-source-changed');
          } finally {
            again.updates.forEach((r) => r.bytes.fill(0));
            again.journal.forEach((r) => r.bytes.fill(0));
          }
          await writeCleanupClaim(task, claim, next);
          claim = next;
        }
        while (true) {
          const r = claim.sourceCleanup!;
          const notify = (blocked = false) => {
            try {
              settings.onProgress?.(
                Object.freeze({ next: r.next, total: r.entries.length + 1, blocked }),
              );
            } catch {
              /* Observation cannot change cleanup. */
            }
          };
          notify();
          const local = await cleanupCensus(task, claim, fp);
          if (cleanupComplete(r))
            return Object.freeze({
              kind: 'source-cleaned',
              scope: Object.freeze(claimScope(claim)),
              storeId: claim.initial.store_id,
              intentId,
              sourceDigest: claim.imported!.sourceDigest,
            });
          if (r.next === 0) await deleteLegacyDatabase(task, () => notify(true));
          else {
            const key = r.entries[r.next - 1]!.key;
            removeLegacyEntry(task, key, local.find((e) => e.key === key)?.value);
          }
          const next = await signLocalClaim(
            task,
            { ...claim, sourceCleanup: { ...r, next: r.next + 1 } },
            code,
          );
          // Assert the effect is absent before crediting its completion, and detect any other source mutation.
          await cleanupCensus(task, next, fp, false);
          await writeCleanupClaim(task, claim, next);
          claim = next;
        }
      } finally {
        fp.dispose();
      }
    },
    settings.signal ? { signal: settings.signal } : {},
  ).finally(() => captured.recovery.fill(0));
};
