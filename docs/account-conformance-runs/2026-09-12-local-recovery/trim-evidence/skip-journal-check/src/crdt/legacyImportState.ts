/** A retained import claim can refuse ordinary access; only its authenticated owner may resume it. */
import { CUSTODY_DB, CUSTODY_STORE } from './custodyRecord';
import { probeDatabase, checkLayout, readScopedRows } from './startupStorage';
import { stopStartup } from './startupState';
import type { SessionTask } from './writeSession';
export const importClaimKey = (slotId: string) => [slotId, 'legacy-import-v1'];
export const assertNoPreactiveImport = async (task: SessionTask, slotId: string) => {
  const found = await probeDatabase(task, CUSTODY_DB, async (db) => {
    checkLayout(db, { [CUSTODY_STORE]: null });
    const rows = await readScopedRows(task, db, CUSTODY_STORE, [slotId]);
    return rows.some((row) => indexedDB.cmp(row.key, importClaimKey(slotId)) === 0);
  });
  if (found) stopStartup('migration-required', 'pre-active-import-needs-owner');
};
