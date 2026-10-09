/** Private seeded migration orchestration. The host must independently exclude old executables.
 * No browser persistence, second progress record, automatic cutover or production exclusion claim. */
import { identity } from './custodyRecord';
import { withExclusiveSlot } from './writeSession';
import { captureLegacyExport } from './legacyExport';
import { inspectLegacySource } from './legacySource';
import { beginLegacyImport, resumeLegacyImport, type LegacyImportEnrollment } from './legacyImport';
import { selectLegacyImport } from './legacySelection';
import {
  cleanupLegacySource,
  verifyLegacyCleanup,
  type LegacyCleanupOptions,
} from './legacyCleanup';
import { openLocalWorkspace } from './localGenesis';
import { copyImportInput, prepareImportPlan, type LegacyImportInput } from './legacyImportPlan';
import { type WorkspaceOptions } from './admittedWorkspace';
import { inspectMigrationUnderPermit, refuseCoordinator } from './legacyCoordinatorState';
export { LegacyCoordinatorError, type MigrationInspection } from './legacyCoordinatorState';
export type MigrationAction = 'import' | 'select' | 'cleanup' | 'verify';

export const createLegacyCoordinator = (slotId: string, options: { signal?: AbortSignal } = {}) => {
  identity(slotId);
  const external = options.signal,
    controller = new AbortController(),
    signal = controller.signal;
  let state: 'active' | 'closing' | 'closed' = 'active';
  let active: Promise<unknown> | undefined, closing: Promise<void> | undefined;
  const ceremonies = new Set<() => void>();
  const guard = () => {
    if (state !== 'active' || signal.aborted) refuseCoordinator('migration-cancelled');
  };
  const run = <T>(operation: () => Promise<T>): Promise<T> => {
    guard();
    if (active) refuseCoordinator('migration-busy');
    const job = Promise.resolve().then(async () => {
      guard();
      const result = await operation();
      guard();
      return result;
    });
    active = job;
    void job.then(
      () => {
        active = undefined;
      },
      () => {
        active = undefined;
      },
    );
    return job;
  };
  const close = (): Promise<void> => {
    if (closing) return closing;
    state = 'closing';
    controller.abort();
    for (const cancel of ceremonies) cancel();
    ceremonies.clear();
    external?.removeEventListener('abort', onAbort);
    closing = Promise.resolve(active)
      .then(
        () => {},
        () => {},
      )
      .then(() => {
        state = 'closed';
      });
    return closing;
  };
  const onAbort = () => {
    void close();
  };
  external?.addEventListener('abort', onAbort, { once: true });
  if (external?.aborted) void close();
  const inspect = (code?: string, input?: LegacyImportInput) =>
    withExclusiveSlot(slotId, (task) => inspectMigrationUnderPermit(task, slotId, code, input), {
      signal,
    });
  // Copy before the first await, and erase our own copy on every path (including a busy/closed refusal).
  const withInput = <T>(
    input: LegacyImportInput | undefined,
    operation: (copy: LegacyImportInput) => Promise<T>,
  ) => {
    if (!input) refuseCoordinator('migration-recovery-input-required');
    const copy = copyImportInput(input);
    try {
      return run(() => operation(copy)).finally(() => copy.recovery.fill(0));
    } catch (error) {
      copy.recovery.fill(0);
      throw error;
    }
  };
  return {
    get state() {
      return state;
    },
    close,
    inspect(code?: string, input?: LegacyImportInput) {
      return input ? withInput(input, (copy) => inspect(code, copy)) : run(() => inspect(code));
    },
    capture() {
      return run(() =>
        withExclusiveSlot(
          slotId,
          async (task) => {
            if ((await inspectMigrationUnderPermit(task, slotId)).kind !== 'unused')
              refuseCoordinator('migration-capture-needs-unused-slot');
            return captureLegacyExport(task, { preview: 'markdown-v1' });
          },
          { signal },
        ),
      );
    },
    /** The seeded host saves and cold-verifies the packet before offering this ceremony. */
    enroll(input: LegacyImportInput, maxSlices = 8): LegacyImportEnrollment {
      guard();
      if (active || ceremonies.size) refuseCoordinator('migration-busy');
      const copy = copyImportInput(input);
      let ceremony: LegacyImportEnrollment;
      try {
        ceremony = beginLegacyImport(slotId, copy, { signal, maxSlices });
      } catch (error) {
        copy.recovery.fill(0);
        throw error;
      }
      const dispose = () => {
        ceremonies.delete(cancel);
        copy.recovery.fill(0);
      };
      const cancel = () => {
        ceremony.cancel();
        dispose();
      };
      ceremonies.add(cancel);
      return {
        get displayCode() {
          return ceremony.displayCode;
        },
        cancel,
        confirm(code) {
          return run(async () => {
            // Enrollment alone may mint. Resume never falls back here after losing a claim or route.
            await withExclusiveSlot(
              slotId,
              async (task) => {
                if ((await inspectMigrationUnderPermit(task, slotId)).kind !== 'unused')
                  refuseCoordinator('migration-enrollment-needs-unused-slot');
                const plan = await prepareImportPlan(task, copy);
                if (task.step(() => globalThis.location.origin) !== plan.binding.sourceOrigin)
                  refuseCoordinator('migration-source-origin-mismatch');
                const source = await inspectLegacySource(task);
                try {
                  if (
                    source.digest !== plan.binding.sourceDigest ||
                    source.dependencies !== 'complete'
                  )
                    refuseCoordinator('migration-source-changed');
                } finally {
                  source.updates.forEach((r) => r.bytes.fill(0));
                  source.journal.forEach((r) => r.bytes.fill(0));
                }
              },
              { signal },
            );
            guard();
            return ceremony.confirm(code);
          }).finally(cancel);
        },
      };
    },
    advance(
      action: MigrationAction,
      code: string,
      input?: LegacyImportInput,
      settings: {
        maxSlices?: number;
        onProgress?: LegacyCleanupOptions['onProgress'];
        workspace?: WorkspaceOptions;
      } = {},
    ) {
      const captured = {
        ...settings,
        workspace: settings.workspace
          ? { ...settings.workspace, identity: structuredClone(settings.workspace.identity) }
          : undefined,
      };
      return withInput(input, async (copy) => {
        if (!['import', 'select', 'cleanup', 'verify'].includes(action))
          refuseCoordinator('migration-unknown-action');
        const current = await inspect(code, copy);
        guard();
        if (action === 'import') {
          if (current.kind !== 'import' || current.stage === 'selecting')
            refuseCoordinator('migration-import-needs-preactive');
          return resumeLegacyImport(slotId, code, copy, {
            signal,
            ...(captured.maxSlices === undefined ? {} : { maxSlices: captured.maxSlices }),
          });
        }
        if (action === 'select') {
          if (
            !(
              current.kind === 'selected' ||
              (current.kind === 'import' &&
                (current.stage === 'imported' || current.stage === 'selecting'))
            )
          )
            refuseCoordinator('migration-selection-needs-imported');
          return selectLegacyImport(slotId, code, copy, { signal });
        }
        if (current.kind !== 'selected') refuseCoordinator('migration-cleanup-needs-selected');
        if (action === 'cleanup')
          return cleanupLegacySource(slotId, code, copy, {
            signal,
            ...(captured.onProgress ? { onProgress: captured.onProgress } : {}),
          });
        // This owner must reread terminal progress; a stale inspection cannot authorize more deletion.
        const receipt = await verifyLegacyCleanup(slotId, code, copy, { signal });
        guard();
        if (!captured.workspace) refuseCoordinator('migration-open-options-required');
        const opened = await openLocalWorkspace(slotId, code, { ...captured.workspace, signal });
        if (opened.kind !== 'ready') refuseCoordinator(`migration-open-${opened.reason}`);
        try {
          guard();
          return Object.freeze({ kind: 'migration-verified' as const, cleanup: receipt });
        } finally {
          await opened.workspace.close();
        }
      });
    },
  };
};
