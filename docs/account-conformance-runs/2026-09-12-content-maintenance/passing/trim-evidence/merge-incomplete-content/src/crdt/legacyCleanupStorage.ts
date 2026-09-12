/** Exact source effects. The host must hold predecessor exclusion; these observations do not establish it. */
import { readLegacyLocal, readLegacyUpdates } from './legacySource';
import { hex } from './custodyCrypto';
import { probeDatabase } from './startupStorage';
import { contentTransaction } from './contentDatabase';
import { localClaimKey, parseLocalClaim, type LocalClaim } from './localGenesisRecord';
import { CUSTODY_DB, CUSTODY_STORE } from './custodyRecord';
import { stopStartup } from './startupState';
import type { SessionTask } from './writeSession';
import type { cleanupFingerprinter } from './legacyCleanupRecord';

export const cleanupRefuse = (reason: string): never => stopStartup('repair-required', reason);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export const requireSourceOrigin = (task: SessionTask, origin: string) => {
  if (task.step(() => globalThis.location.origin) !== origin)
    cleanupRefuse('cleanup-source-origin-mismatch');
};
export const assertLegacySourceAbsent = async (
  task: SessionTask,
  origin: string,
): Promise<void> => {
  requireSourceOrigin(task, origin);
  if (
    readLegacyLocal(task).length ||
    (await probeDatabase(task, 'done', async () => true)) ||
    readLegacyLocal(task).length
  )
    cleanupRefuse('cleanup-source-remains');
};
export type Fingerprinter = Awaited<ReturnType<typeof cleanupFingerprinter>>;
export const databaseFingerprint = async (task: SessionTask, fp: Fingerprinter) => {
  const rows = await readLegacyUpdates(task);
  try {
    return rows === null
      ? null
      : await fp.digest(
          'database',
          rows.map((r) => [r.key, hex(r.bytes)]),
        );
  } finally {
    rows?.forEach((r) => r.bytes.fill(0));
  }
};
export const cleanupCensus = async (
  task: SessionTask,
  claim: LocalClaim,
  fp: Fingerprinter,
  allowCurrentAbsent = true,
) => {
  const r = claim.sourceCleanup!;
  requireSourceOrigin(task, claim.imported!.sourceOrigin);
  const local = readLegacyLocal(task),
    disk = await databaseFingerprint(task, fp);
  // The current effect may have completed just before an interrupted progress commit.
  if (r.next === 0 ? disk !== null && disk !== r.databaseDigest : disk !== null)
    cleanupRefuse('cleanup-database-changed');
  if (local.some((e) => !r.entries.some((w) => w.key === e.key)))
    cleanupRefuse('cleanup-unknown-source-key');
  for (const [i, expected] of r.entries.entries()) {
    const actual = local.find((e) => e.key === expected.key),
      position = i + 1;
    if (position < r.next) {
      if (actual) cleanupRefuse('cleanup-source-reappeared');
    } else if (!actual) {
      if (position !== r.next || !allowCurrentAbsent) cleanupRefuse('cleanup-source-missing');
    } else if ((await fp.digest('local', [actual.key, actual.value])) !== expected.digest)
      cleanupRefuse('cleanup-source-value-changed');
  }
  if (!same(local, readLegacyLocal(task))) cleanupRefuse('cleanup-source-changed');
  return local;
};
export const removeLegacyEntry = (task: SessionTask, key: string, value: string | undefined) =>
  task.step(() => {
    const storage = globalThis.localStorage;
    if (storage.getItem(key) !== (value ?? null)) cleanupRefuse('cleanup-source-changed');
    if (value !== undefined) storage.removeItem(key);
    if (storage.getItem(key) !== null) cleanupRefuse('cleanup-removal-refused');
  });
/** A native delete cannot be cancelled. Its task keeps the lifecycle permit until success/error, including while blocked. */
export const deleteLegacyDatabase = (task: SessionTask, blocked: () => void): Promise<void> =>
  task.wait(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = task.step(() => indexedDB.deleteDatabase('done'));
        req.onblocked = () => {
          if (!task.signal.aborted) blocked();
        };
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ?? Error('Legacy database deletion failed.'));
      }),
  );
export const writeCleanupClaim = async (
  task: SessionTask,
  before: LocalClaim,
  next: LocalClaim,
) => {
  const slotId = before.initial.slot_id;
  const found = await probeDatabase(task, CUSTODY_DB, async (db) => {
    await contentTransaction<void>(db, task, [CUSTODY_STORE], 'readwrite', (tx, _result, guard) => {
      const store = tx.objectStore(CUSTODY_STORE),
        key = localClaimKey(slotId),
        req = store.get(key);
      req.onsuccess = () =>
        guard(() => {
          if (!same(parseLocalClaim(req.result, slotId), before))
            cleanupRefuse('cleanup-claim-changed');
          store.put(next, key);
        });
    });
    return true;
  });
  if (!found) cleanupRefuse('cleanup-custody-missing');
};
