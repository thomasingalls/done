/** Pre-active import owner. No index selection, source mutation or default-app route. */
import { generateDeviceCode, normalizeDeviceCode, random, hex } from './custodyCrypto';
import { identity } from './custodyRecord';
import {
  createCustodyUnderPermit,
  checkContentUnderPermit,
  withPreactiveContentUnderPermit,
  CustodyError,
} from './custody';
import { withExclusiveSlot, type SessionTask } from './writeSession';
import { contentCensus } from './startupClassification';
import { deriveStoreName } from './storeName';
import { journalCount } from './startupStorage';
import { journalPrefix } from './journalCodec';
import { Y } from './yjs';
import {
  copyImportInput,
  prepareImportPlan,
  refuseImport,
  importCursor,
  encodeImportSlice,
  verifyImportedProjection,
  type LegacyImportInput,
  type ImportPlan,
} from './legacyImportPlan';
import {
  importScope,
  readImportClaim,
  verifyImportClaim,
  signImportClaim,
  importCensus,
  requireUnusedImportSlot,
  installImportClaim,
  advanceImportClaim,
  sameImportBinding,
  type ImportClaim,
} from './legacyImportRecord';
export { LegacyImportError } from './legacyImportPlan';
export type { LegacyImportInput } from './legacyImportPlan';
export interface LegacyImportProgress {
  readonly kind: 'pre-active';
  readonly scope: Readonly<ReturnType<typeof importScope>>;
  readonly storeId: string;
  readonly intentId: string;
  readonly committedSlices: number;
  readonly totalSlices: number;
  readonly stage: 'importing' | 'imported';
}
const authority = (claim: ImportClaim) => {
  const scope = importScope(claim);
  return {
    ...scope,
    resolvePrincipal: async (task: SessionTask) => {
      await importCensus(task, claim);
      return scope.principalId;
    },
  };
};
const budget = (value = 8) => {
  if (!Number.isSafeInteger(value) || value < 1 || value > 32)
    refuseImport('invalid-import-budget');
  return value;
};
const finishImport = async (
  task: SessionTask,
  initial: ImportClaim,
  code: string,
  plan: ImportPlan,
  slices: number,
): Promise<LegacyImportProgress> => {
  let claim = initial;
  await verifyImportClaim(task, claim, code);
  if (!sameImportBinding(claim.binding, plan.binding)) refuseImport('import-intent-mismatch');
  let census = await importCensus(task, claim);
  if (census.record.state === 'creating') {
    await createCustodyUnderPermit(
      task,
      authority(claim),
      code,
      {
        checkCreation: async () => {
          await importCensus(task, claim);
        },
      },
      'resume',
    );
    census = await importCensus(task, claim);
  }
  if (claim.stage === 'custody') claim = await advanceImportClaim(task, claim, code, 'content');
  if (claim.stage === 'content') {
    await checkContentUnderPermit(
      task,
      authority(claim),
      code,
      census.content?.state === 'ready'
        ? undefined
        : {
            intent: claim.initial.creation_intent!.id,
            checkCreation: async () => {
              await importCensus(task, claim);
            },
          },
    );
    claim = await advanceImportClaim(task, claim, code, 'importing');
  }
  const intent = claim.initial.creation_intent!.id;
  const committed = await withPreactiveContentUnderPermit(
    task,
    authority(claim),
    code,
    async (content) => {
      const rows = await content.loadRecords();
      const doc = new Y.Doc({ gc: false });
      let cursor = 0;
      try {
        for (const row of rows) {
          if (row.kind !== 'update' || cursor >= plan.actions.length)
            refuseImport('unexpected-import-record');
          Y.applyUpdate(doc, row.bytes);
          importCursor(doc, intent, plan, ++cursor);
        }
        if (claim.stage === 'imported' && cursor !== plan.actions.length)
          refuseImport('completed-import-missing-slices');
        const end = Math.min(cursor + slices, plan.actions.length);
        while (cursor < end) {
          const bytes = task.step(() =>
            encodeImportSlice(doc, plan, intent, claim.createdAt, cursor),
          );
          try {
            await content.appendBatch([{ kind: 'update', bytes }]);
          } finally {
            bytes.fill(0);
          }
          cursor++;
        }
        if (cursor === plan.actions.length) {
          // Verify freshly authenticated disk bytes, not the private document used to prepare writes.
          const committedRows = await content.loadRecords(),
            replay = new Y.Doc({ gc: false });
          try {
            if (committedRows.length !== cursor) refuseImport('import-committed-count-mismatch');
            for (const [i, row] of committedRows.entries()) {
              if (row.kind !== 'update') refuseImport('unexpected-import-record');
              Y.applyUpdate(replay, row.bytes);
              importCursor(replay, intent, plan, i + 1);
            }
            verifyImportedProjection(replay, plan, intent, claim.createdAt);
          } finally {
            committedRows.forEach((r) => r.bytes.fill(0));
            replay.destroy();
          }
        }
        return cursor;
      } finally {
        for (const row of rows) row.bytes.fill(0);
        doc.destroy();
      }
    },
  );
  if (committed === plan.actions.length && claim.stage !== 'imported')
    claim = await advanceImportClaim(task, claim, code, 'imported');
  return Object.freeze({
    kind: 'pre-active',
    scope: Object.freeze(importScope(claim)),
    storeId: claim.initial.store_id,
    intentId: intent,
    committedSlices: committed,
    totalSlices: plan.actions.length,
    stage: claim.stage as 'importing' | 'imported',
  });
};
export interface LegacyImportEnrollment {
  readonly displayCode: string | null;
  confirm(code: string): Promise<LegacyImportProgress>;
  cancel(): void;
}
export const beginLegacyImport = (
  slotId: string,
  input: LegacyImportInput,
  options: { signal?: AbortSignal; maxSlices?: number } = {},
): LegacyImportEnrollment => {
  identity(slotId);
  const slices = budget(options.maxSlices),
    captured = copyImportInput(input),
    external = options.signal,
    controller = new AbortController();
  let display: string | null = generateDeviceCode(),
    expected: string | null = normalizeDeviceCode(display),
    used = false;
  const erase = () => {
    display = null;
    expected = null;
    used = true;
  };
  const detach = () => external?.removeEventListener('abort', cancel);
  const cancel = () => {
    erase();
    captured.recovery.fill(0);
    controller.abort();
    detach();
  };
  external?.addEventListener('abort', cancel, { once: true });
  if (external?.aborted) cancel();
  return {
    get displayCode() {
      return display;
    },
    cancel,
    async confirm(code) {
      if (used || !expected)
        throw new CustodyError(
          'enrollment-closed',
          'Start a new ceremony or resume the winning import.',
        );
      let typed: string;
      try {
        typed = normalizeDeviceCode(code);
      } catch {
        throw new CustodyError('confirmation-required', 'Confirm the generated code.');
      }
      if (typed !== expected)
        throw new CustodyError('confirmation-required', 'Confirm the generated code.');
      erase();
      try {
        return await withExclusiveSlot(
          slotId,
          async (task) => {
            const plan = await prepareImportPlan(task, captured);
            await requireUnusedImportSlot(task, slotId);
            const scope = { slotId, principalId: hex(random(16)), workspaceId: hex(random(16)) };
            let claim!: ImportClaim;
            await createCustodyUnderPermit(
              task,
              { ...scope, resolvePrincipal: () => scope.principalId },
              typed,
              {
                checkCreation: async () => {
                  await requireUnusedImportSlot(task, slotId);
                  const name = await task.wait(() =>
                    deriveStoreName(scope.principalId, scope.workspaceId),
                  );
                  if ((await contentCensus(task, name)) || journalCount(task, journalPrefix(name)))
                    refuseImport('import-fresh-name-retains-content');
                },
              },
              'fresh',
              async (task, db, _scope, initial) => {
                claim = await signImportClaim(
                  task,
                  {
                    v: 1,
                    initial,
                    binding: plan.binding,
                    createdAt: new Date().toISOString(),
                    stage: 'custody',
                    mac: new Uint8Array(32),
                  },
                  typed,
                );
                await installImportClaim(task, db, claim);
              },
            );
            return finishImport(task, claim, typed, plan, slices);
          },
          { signal: controller.signal },
        );
      } finally {
        typed = '';
        captured.recovery.fill(0);
        detach();
      }
    },
  };
};
export const resumeLegacyImport = (
  slotId: string,
  code: string,
  input: LegacyImportInput,
  options: { signal?: AbortSignal; maxSlices?: number } = {},
): Promise<LegacyImportProgress> => {
  identity(slotId);
  const slices = budget(options.maxSlices),
    captured = copyImportInput(input);
  return withExclusiveSlot(
    slotId,
    async (task) => {
      const claim = await readImportClaim(task, slotId);
      if (!claim) refuseImport('import-claim-missing');
      await verifyImportClaim(task, claim, code);
      const plan = await prepareImportPlan(task, captured);
      return finishImport(task, claim, code, plan, slices);
    },
    { ...(options.signal ? { signal: options.signal } : {}) },
  ).finally(() => captured.recovery.fill(0));
};
