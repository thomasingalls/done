/** Explicit, credential-free removal of one installation's slot. No account deletion or revocation. */
import { CUSTODY_DB, CUSTODY_STORE, identity } from './custodyRecord';
import { contentTransaction } from './contentDatabase';
import { probeDatabase, readScopedRows, readRow } from './startupStorage';
import { deriveStoreName } from './storeName';
import { journalPrefix } from './journalCodec';
import { retireSlotWriters, withDeviceRemovalSlot, type SessionTask } from './writeSession';
import { stopStartup } from './startupState';
import { withSetupMetadataLock, invalidateSetupEpoch } from '../account/setupMetadata';
import { localClaimKey, parseLocalClaim } from './localGenesisRecord';
import { importClaimKey } from './legacyImportState';
import { cleanupComplete } from './legacyCleanupRecord';
import { assertLegacySourceAbsent } from './legacyCleanupStorage';
import { RECOVERY_PREPARATION_DB, retainedRecoveryKey } from '../account/setupRecoveryMetadata';

/** Refuse before erasure; the older plaintext source needs its verified exclusion/cleanup owner. */
export class LegacyRemovalRequired extends Error {
  constructor() {
    super(
      'Finish the verified legacy source cleanup before removing this workspace. Its saved data and cleanup progress have been kept.',
    );
  }
}
async function assertLegacyRemovalReady(task: SessionTask, slotId: string) {
  const rows = await probeDatabase(task, CUSTODY_DB, (db) =>
    readScopedRows(task, db, CUSTODY_STORE, [slotId]),
  );
  for (const row of rows ?? []) {
    if (indexedDB.cmp(row.key, importClaimKey(slotId)) === 0) throw new LegacyRemovalRequired();
    if (indexedDB.cmp(row.key, localClaimKey(slotId)) !== 0) continue;
    const claim = parseLocalClaim(row.value, slotId);
    if (claim.imported) {
      if (!cleanupComplete(claim.sourceCleanup)) throw new LegacyRemovalRequired();
      try {
        await assertLegacySourceAbsent(task, claim.imported.sourceOrigin);
      } catch {
        throw new LegacyRemovalRequired();
      }
    }
  }
}

export const removalKey = (slotId: string) => [slotId, 'device-data-removal-v1'];
interface Removal {
  v: 1;
  kind: 'device-data-removal';
  slotId: string;
  databases: string[];
  phase: 'content' | 'journal' | 'metadata' | 'removed';
}
function parse(value: unknown, slotId: string): Removal {
  const r = value as Removal;
  if (
    !r ||
    Object.keys(r).sort().join() !== 'databases,kind,phase,slotId,v' ||
    r.v !== 1 ||
    r.kind !== 'device-data-removal' ||
    r.slotId !== slotId ||
    !['content', 'journal', 'metadata', 'removed'].includes(r.phase) ||
    !Array.isArray(r.databases) ||
    r.databases.some((n) => typeof n !== 'string' || !/^done\.[a-f0-9]{32}$/.test(n))
  )
    stopStartup('repair-required', 'invalid-device-removal');
  return r;
}
export async function readDeviceRemoval(task: SessionTask, slotId: string) {
  const result = await probeDatabase(task, CUSTODY_DB, async (db) => ({
    value: await readRow(task, db, CUSTODY_STORE, removalKey(slotId)),
  }));
  return !result || result.value === undefined ? null : parse(result.value, slotId);
}
export async function assertNoDeviceRemoval(task: SessionTask, slotId: string) {
  const r = await readDeviceRemoval(task, slotId);
  if (r) stopStartup(r.phase === 'removed' ? 'cleared' : 'clearing', 'device-data-removal');
}
async function save(task: SessionTask, r: Removal) {
  const found = await probeDatabase(task, CUSTODY_DB, (db) =>
    contentTransaction<void>(
      db,
      task,
      [CUSTODY_STORE],
      'readwrite',
      (tx) => {
        tx.objectStore(CUSTODY_STORE).put(r, removalKey(r.slotId));
      },
      'strict',
    ),
  );
  if (found === null) throw Error('Removal metadata is missing');
}
async function slots(
  task: SessionTask,
): Promise<{ id: string; stores: { principal: string; workspace: string; dbName: string }[] }[]> {
  return (
    (await probeDatabase(task, 'done.slots', (db) =>
      contentTransaction(db, task, ['slots'], 'readonly', (tx, result, guard) => {
        const r = tx.objectStore('slots').getAll();
        r.onsuccess = () => guard(() => result(r.result));
      }),
    )) ?? []
  );
}
async function refuseShared(task: SessionTask, r: Removal) {
  const all = await slots(task);
  if (all.some((s) => s.id !== r.slotId && s.stores?.some((s) => r.databases.includes(s.dbName))))
    throw Error('Another saved workspace references this data');
}
export async function removeDeviceData(slotId: string, progress?: (message: string) => void) {
  identity(slotId);
  progress?.(
    'Closing this workspace in other tabs. If this waits, close those tabs to finish removal.',
  );
  retireSlotWriters(slotId);
  await withDeviceRemovalSlot(slotId, (task) =>
    task.wait(() =>
      withSetupMetadataLock(slotId, async () => {
        await assertLegacyRemovalReady(task, slotId);
        let r = await readDeviceRemoval(task, slotId);
        if (!r) {
          const names = new Set<string>(),
            all = await slots(task),
            slot = all.find((s) => s.id === slotId);
          for (const s of slot?.stores ?? []) {
            const expected = await task.wait(() => deriveStoreName(s.principal, s.workspace));
            if (s.dbName !== expected) throw Error('Saved workspace routing is inconsistent');
            names.add(expected);
          }
          const rows = await probeDatabase(task, CUSTODY_DB, (db) =>
            readScopedRows(task, db, CUSTODY_STORE, [slotId]),
          );
          for (const row of rows ?? []) {
            const value = row.value as {
              slot_id?: string;
              principal_id?: string;
              workspace_id?: string;
            };
            if (
              value?.slot_id === slotId &&
              typeof value.principal_id === 'string' &&
              typeof value.workspace_id === 'string'
            )
              names.add(
                await task.wait(() => deriveStoreName(value.principal_id!, value.workspace_id!)),
              );
          }
          if (!rows?.length && !slot) throw Error('No saved data was found for this workspace');
          r = {
            v: 1,
            kind: 'device-data-removal',
            slotId,
            databases: [...names].sort(),
            phase: 'content',
          };
          await refuseShared(task, r);
          await save(task, r);
        }
        await refuseShared(task, r);
        await task.wait(() => invalidateSetupEpoch(slotId));
        if (r.phase === 'content') {
          progress?.('Removing encrypted local data…');
          for (const name of r.databases)
            await task.wait(
              () =>
                new Promise<void>((resolve, reject) => {
                  const request = indexedDB.deleteDatabase(name);
                  request.onblocked = () =>
                    progress?.('Close other tabs using this workspace to finish removal.');
                  request.onsuccess = () => resolve();
                  request.onerror = () => reject(request.error);
                }),
            );
          r = { ...r, phase: 'journal' };
          await save(task, r);
        }
        if (r.phase === 'journal') {
          task.step(() => {
            const prefixes = r!.databases.map(journalPrefix);
            for (const key of Object.keys(localStorage))
              if (prefixes.some((prefix) => key.startsWith(prefix))) localStorage.removeItem(key);
          });
          r = { ...r, phase: 'metadata' };
          await save(task, r);
        }
        if (r.phase === 'metadata') {
          // Keep the intent until every independent metadata carrier has completed.
          const selected = (await probeDatabase(task, 'done.first-device-setup.v1', async (db) =>
            readRow(task, db, 'attempt', slotId === 'local' ? 'current' : slotId),
          )) as
            | { slotId?: unknown; retryKey?: unknown; view?: { accountId?: unknown } }
            | null
            | undefined;
          const accountId = selected?.slotId === slotId ? selected.view?.accountId : undefined;
          const retryKey = selected?.slotId === slotId ? selected.retryKey : undefined;
          const hasOwner = typeof accountId === 'string' && typeof retryKey === 'string';
          await probeDatabase(task, RECOVERY_PREPARATION_DB, (db) =>
            contentTransaction<void>(db, task, ['progress'], 'readwrite', (tx, _result, guard) => {
              const cursor = tx.objectStore('progress').openCursor();
              cursor.onsuccess = () =>
                guard(() => {
                  const row = cursor.result;
                  if (!row) return;
                  const ownCurrent =
                    row.key === `slot:${slotId}` ||
                    (slotId === 'local' &&
                      row.key === 'pending' &&
                      hasOwner &&
                      row.value?.accountId === accountId &&
                      row.value?.retryKey === retryKey);
                  const ownRetained =
                    hasOwner &&
                    indexedDB.cmp(
                      row.key,
                      retainedRecoveryKey(accountId as string, retryKey as string),
                    ) === 0;
                  if (ownCurrent || ownRetained) row.delete();
                  row.continue();
                });
            }),
          );
          await probeDatabase(task, 'done.first-device-setup.v1', (db) =>
            contentTransaction<void>(db, task, ['attempt'], 'readwrite', (tx) => {
              tx.objectStore('attempt').delete(slotId === 'local' ? 'current' : slotId);
            }),
          );
          await probeDatabase(task, 'done.slots', (db) =>
            contentTransaction<void>(db, task, ['slots'], 'readwrite', (tx) => {
              tx.objectStore('slots').delete(slotId);
            }),
          );
          await probeDatabase(task, 'done.account-login.v1', (db) =>
            contentTransaction<void>(
              db,
              task,
              ['slots', 'outbox'],
              'readwrite',
              (tx, _result, guard) => {
                tx.objectStore('slots').delete(slotId);
                const cursor = tx.objectStore('outbox').openCursor();
                cursor.onsuccess = () =>
                  guard(() => {
                    const row = cursor.result;
                    if (!row) return;
                    if (typeof row.key === 'string') {
                      let key: unknown;
                      try {
                        key = JSON.parse(row.key);
                      } catch {
                        /* unrelated outbox record */
                      }
                      if (Array.isArray(key) && key[0] === slotId) row.delete();
                    }
                    row.continue();
                  });
              },
            ),
          );
          task.step(() => {
            for (const key of Object.keys(localStorage)) {
              if (key.startsWith('done.pending-device.') && localStorage.getItem(key) === slotId)
                localStorage.removeItem(key);
              if (key === 'done.lost-recovery.' + slotId) localStorage.removeItem(key);
            }
          });
          r = { ...r, phase: 'removed' };
          await probeDatabase(task, CUSTODY_DB, (db) =>
            contentTransaction<void>(
              db,
              task,
              [CUSTODY_STORE],
              'readwrite',
              (tx, _result, guard) => {
                const store = tx.objectStore(CUSTODY_STORE),
                  cursor = store.openCursor(IDBKeyRange.lowerBound([slotId]));
                cursor.onsuccess = () =>
                  guard(() => {
                    const row = cursor.result;
                    if (row && Array.isArray(row.key) && row.key[0] === slotId) {
                      row.delete();
                      row.continue();
                    } else store.put(r, removalKey(slotId));
                  });
              },
              'strict',
            ),
          );
        }
      }),
    ),
  );
}
/** Explicit Start fresh acknowledgement. Never called by startup merely because data is absent. */
export async function acknowledgeLocalRemoval(slotId: string) {
  await withDeviceRemovalSlot(slotId, (task) =>
    task.wait(() =>
      withSetupMetadataLock(slotId, async () => {
        const r = await readDeviceRemoval(task, slotId);
        if (!r || r.phase !== 'removed') throw Error('Local removal is unfinished');
        const rows = await probeDatabase(task, CUSTODY_DB, (db) =>
          readScopedRows(task, db, CUSTODY_STORE, [slotId]),
        );
        if (rows?.length !== 1 || (await slots(task)).some((s) => s.id === slotId))
          throw Error('Removed workspace still has metadata');
        for (const name of r.databases)
          if (await probeDatabase(task, name, async () => true))
            throw Error('Removed content reappeared');
        await task.wait(() => invalidateSetupEpoch(slotId));
        await probeDatabase(task, CUSTODY_DB, (db) =>
          contentTransaction<void>(db, task, [CUSTODY_STORE], 'readwrite', (tx) => {
            tx.objectStore(CUSTODY_STORE).delete(removalKey(slotId));
          }),
        );
      }),
    ),
  );
}
