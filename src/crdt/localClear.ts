/** Explicit Local-only destructive action. The host confirms deletion of the returned immutable target. */
import { identity } from './custodyRecord';
import { random, hex } from './custodyCrypto';
import { openWriteSession, withExclusiveSlot, type SessionTask } from './writeSession';
import { readLocalClaim, verifyLocalClaim, claimScope } from './localGenesisRecord';
import { localCensus, localRoute } from './localGenesisStorage';
import {
  captureClearTarget,
  readLocalClear,
  type LocalClearRecord,
  type LocalClearTarget,
  type LocalClearStage,
} from './localClearState';
import { clearAuthenticator } from './localClearCrypto';
import {
  clearControlRows,
  clearCensus,
  writeClearProgress,
  deleteLocalContent,
  removeLocalJournal,
  removeLocalIndex,
} from './localClearStorage';
import { stopStartup } from './startupState';
export type { LocalClearTarget } from './localClearState';

export interface LocalClearOptions {
  signal?: AbortSignal;
  /** Observation only; a blocked native delete remains pending and retains the permit. */
  onProgress?(progress: Readonly<{ stage: LocalClearStage; blocked: boolean }>): void;
}
export interface LocalClearReceipt {
  readonly kind: 'cleared';
  readonly target: LocalClearTarget;
}
const notify = (options: LocalClearOptions, stage: LocalClearStage, blocked = false) => {
  try {
    options.onProgress?.(Object.freeze({ stage, blocked }));
  } catch {
    /* Observers cannot change cleanup. */
  }
};
const freshTarget = async (
  task: SessionTask,
  slotId: string,
  code: string,
): Promise<LocalClearTarget> => {
  const claim = await readLocalClaim(task, slotId);
  if (!claim) stopStartup('identity-required', 'clear-needs-verified-local-genesis');
  await verifyLocalClaim(task, claim, code);
  if (claim.imported) stopStartup('migration-required', 'import-source-cleanup-needs-owner');
  const census = await localCensus(task, claim);
  if (claim.stage !== 'ready' || !census.slot)
    stopStartup('creation-pending', 'finish-local-genesis-before-clear');
  const scope = claimScope(claim),
    route = await localRoute(task, claim);
  return captureClearTarget({
    ...scope,
    storeId: claim.initial.store_id,
    rootId: claim.initial.root_id,
    genesisIntentId: claim.initial.creation_intent!.id,
    dbName: route.stores[0]!.dbName,
  });
};
/** Read-only target for a host's explicit Local deletion confirmation; the action revalidates after its exclusive grant. */
export const prepareLocalClear = async (
  slotId: string,
  code: string,
  options: { signal?: AbortSignal } = {},
): Promise<LocalClearTarget> => {
  identity(slotId);
  const session = await openWriteSession(slotId, { ...options });
  try {
    return await session.run((task) => freshTarget(task, slotId, code));
  } finally {
    await session.close();
  }
};
const finish = async (
  task: SessionTask,
  initial: LocalClearRecord,
  code: string,
  options: LocalClearOptions,
): Promise<LocalClearReceipt> => {
  let record = initial;
  const auth = await clearAuthenticator(task, record, code);
  try {
    await auth.verify(record);
    while (true) {
      const snapshot = await clearCensus(task, record, code);
      notify(options, record.stage);
      if (record.stage === 'cleared')
        return Object.freeze({ kind: 'cleared', target: record.target });
      let next: LocalClearStage;
      if (record.stage === 'content') {
        await deleteLocalContent(task, record.target, () => notify(options, 'content', true));
        next = 'journal';
      } else if (record.stage === 'journal') {
        removeLocalJournal(task, record.target);
        next = 'custody';
      } else if (record.stage === 'custody') next = 'index';
      else {
        await removeLocalIndex(task, record.target, snapshot.slots);
        next = 'cleared';
      }
      const signed = await auth.sign({ ...record, stage: next });
      // Removing every opener and advancing to index happen in the same custody transaction.
      await writeClearProgress(
        task,
        snapshot.rows,
        signed,
        record.stage === 'custody' ? snapshot.retained : [],
      );
      record = signed;
    }
  } finally {
    auth.dispose();
  }
};
export const clearLocalWorkspace = async (
  input: LocalClearTarget,
  code: string,
  options: LocalClearOptions = {},
): Promise<LocalClearReceipt> => {
  const target = captureClearTarget(input),
    captured = { ...options };
  return withExclusiveSlot(
    target.slotId,
    async (task) => {
      let record = await readLocalClear(task, target.slotId);
      if (record) {
        if (JSON.stringify(record.target) !== JSON.stringify(target))
          stopStartup('repair-required', 'clear-target-changed');
      } else {
        const current = await freshTarget(task, target.slotId, code);
        if (JSON.stringify(current) !== JSON.stringify(target))
          stopStartup('repair-required', 'clear-target-changed');
        const rows = await clearControlRows(task, target.slotId);
        record = {
          v: 1,
          kind: 'local-clear',
          intentId: hex(random(16)),
          target,
          stage: 'content',
          salt: random(16),
          mac: new Uint8Array(32),
        };
        const auth = await clearAuthenticator(task, record, code);
        try {
          record = await auth.sign(record);
        } finally {
          auth.dispose();
        }
        await writeClearProgress(task, rows, record);
      }
      return finish(task, record, code, captured);
    },
    captured.signal ? { signal: captured.signal } : {},
  );
};
export const resumeLocalClear = (
  slotId: string,
  code: string,
  options: LocalClearOptions = {},
): Promise<LocalClearReceipt> => {
  identity(slotId);
  const captured = { ...options };
  return withExclusiveSlot(
    slotId,
    async (task) => {
      const record = await readLocalClear(task, slotId);
      if (!record) stopStartup('repair-required', 'clear-intent-missing');
      return finish(task, record, code, captured);
    },
    captured.signal ? { signal: captured.signal } : {},
  );
};
