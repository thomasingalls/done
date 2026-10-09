/** Exact scoped effects for the Local clear owner. No broad database or storage clearing. */
import { cleanupComplete } from './legacyCleanupRecord';
import { assertLegacySourceAbsent } from './legacyCleanupStorage';
import { CUSTODY_DB, CUSTODY_STORE, recordKey, parseRecord } from './custodyRecord';
import { parseWitness, parseCounter } from './contentRecord';
import { contentTransaction } from './contentDatabase';
import {
  localClaimKey,
  parseLocalClaim,
  matchLocalCustody,
  verifyLocalClaim,
} from './localGenesisRecord';
import { localRoute } from './localGenesisStorage';
import { parseSlot, contentCensus } from './startupClassification';
import { probeDatabase, readScopedRows, checkLayout } from './startupStorage';
import { journalPrefix } from './journalCodec';
import { stopStartup } from './startupState';
import { localClearKey, type LocalClearRecord, type LocalClearTarget } from './localClearState';
import type { SessionTask } from './writeSession';

type Row = { key: IDBValidKey; value: unknown };
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const isKey = (row: Row, key: IDBValidKey): boolean => indexedDB.cmp(row.key, key) === 0;
const scopeKey = (target: LocalClearTarget) => recordKey(target);
export const clearControlRows = async (task: SessionTask, slotId: string): Promise<Row[]> =>
  (await probeDatabase(task, CUSTODY_DB, async (db) => {
    checkLayout(db, { [CUSTODY_STORE]: null });
    return readScopedRows(task, db, CUSTODY_STORE, [slotId]);
  })) ?? [];
const indexRows = async (task: SessionTask, slotId: string): Promise<Row[]> =>
  (await probeDatabase(task, 'done.slots', async (db) => {
    checkLayout(db, { slots: 'id' });
    return contentTransaction<Row[]>(db, task, ['slots'], 'readonly', (tx, result, guard) => {
      const req = tx.objectStore('slots').openCursor(IDBKeyRange.only(slotId));
      req.onsuccess = () =>
        guard(() => result(req.result ? [{ key: slotId, value: req.result.value }] : []));
    });
  })) ?? [];
export const journalSnapshot = (
  task: SessionTask,
  target: LocalClearTarget,
): { key: string; value: string }[] =>
  task.step(() => {
    const storage = globalThis.localStorage,
      prefix = journalPrefix(target.dbName);
    const keys = Object.keys(storage)
      .filter((k) => k.startsWith(prefix))
      .sort();
    const rows = keys.map((key) => {
      const value = storage.getItem(key);
      if (value === null) stopStartup('repair-required', 'clear-journal-changed');
      return { key, value };
    });
    if (
      !same(
        keys,
        Object.keys(storage)
          .filter((k) => k.startsWith(prefix))
          .sort(),
      ) ||
      rows.some((r) => storage.getItem(r.key) !== r.value)
    )
      stopStartup('repair-required', 'clear-journal-changed');
    return rows;
  });
export const contentAbsent = async (task: SessionTask, target: LocalClearTarget): Promise<void> => {
  if (await probeDatabase(task, target.dbName, async () => true))
    stopStartup('repair-required', 'clear-content-reappeared');
};
export const journalAbsent = (task: SessionTask, target: LocalClearTarget): void => {
  if (journalSnapshot(task, target).length) stopStartup('repair-required', 'clear-journal-remains');
};
/** A queued native deletion cannot be cancelled. Keep the permit until it actually settles. */
export const deleteLocalContent = (
  task: SessionTask,
  target: LocalClearTarget,
  blocked: () => void,
): Promise<void> =>
  task.wait(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = task.step(() => indexedDB.deleteDatabase(target.dbName));
        req.onblocked = () => {
          if (!task.signal.aborted) blocked();
        };
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ?? Error('Local content deletion failed.'));
      }),
  );
export const removeLocalJournal = (task: SessionTask, target: LocalClearTarget): void => {
  const rows = journalSnapshot(task, target);
  for (const row of rows)
    task.step(() => {
      const storage = globalThis.localStorage;
      if (storage.getItem(row.key) !== row.value)
        stopStartup('repair-required', 'clear-journal-changed');
      storage.removeItem(row.key);
      if (storage.getItem(row.key) !== null)
        stopStartup('unavailable', 'clear-journal-removal-refused');
    });
  journalAbsent(task, target);
};

/** Validate only layouts/identity here: explicit deletion may remove damaged ciphertext in the bound namespace. */
export const clearCensus = async (task: SessionTask, record: LocalClearRecord, code: string) => {
  const t = record.target,
    key = scopeKey(t),
    rows = await clearControlRows(task, t.slotId);
  const control = rows.find((row) => isKey(row, localClearKey(t.slotId)));
  if (!control || !same(control.value, record))
    stopStartup('repair-required', 'clear-intent-changed');
  if (t.legacySourceOrigin !== undefined)
    await assertLegacySourceAbsent(task, t.legacySourceOrigin);
  const retained = rows.filter((row) => row !== control);
  for (const row of retained)
    if (![localClaimKey(t.slotId), key, [...key, 'content-v1']].some((k) => isKey(row, k)))
      stopStartup('repair-required', 'clear-unknown-custody-reference');
  let expectedSlot: unknown;
  if (record.stage === 'index' || record.stage === 'cleared') {
    if (retained.length) stopStartup('repair-required', 'clear-custody-reappeared');
  } else {
    const initial = retained.find((row) => isKey(row, localClaimKey(t.slotId)));
    if (!initial) stopStartup('repair-required', 'clear-genesis-claim-missing');
    const claim = parseLocalClaim(initial.value, t.slotId);
    await verifyLocalClaim(task, claim, code);
    if (
      claim.imported
        ? !cleanupComplete(claim.sourceCleanup) ||
          t.legacySourceOrigin !== claim.imported.sourceOrigin
        : t.legacySourceOrigin !== undefined
    )
      stopStartup('repair-required', 'clear-source-cleanup-mismatch');
    if (
      claim.stage !== 'ready' ||
      claim.initial.principal_id !== t.principalId ||
      claim.initial.workspace_id !== t.workspaceId ||
      claim.initial.store_id !== t.storeId ||
      claim.initial.root_id !== t.rootId ||
      claim.initial.creation_intent!.id !== t.genesisIntentId
    )
      stopStartup('repair-required', 'clear-genesis-target-mismatch');
    const custody = retained.find((row) => isKey(row, key)),
      witness = retained.find((row) => isKey(row, [...key, 'content-v1']));
    if (!custody || !witness) stopStartup('repair-required', 'clear-required-custody-missing');
    const live = parseRecord(custody.value, t);
    matchLocalCustody(claim, live);
    const content = parseWitness(witness.value);
    if (
      live.state !== 'protected' ||
      content.state !== 'ready' ||
      content.intent !== t.genesisIntentId
    )
      stopStartup('repair-required', 'clear-carrier-identity-mismatch');
    expectedSlot = await localRoute(task, claim);
  }
  const slots = await indexRows(task, t.slotId);
  if (slots.length) {
    const slot = parseSlot(slots[0]!.value, t.slotId);
    if (!slot) stopStartup('repair-required', 'clear-invalid-index-row');
    // Initial authorization accepts only the active Local route. Later phases retain that exact shape.
    const expected = expectedSlot ?? {
      id: t.slotId,
      status: 'active',
      unlockBinding: null,
      local: {
        principalId: t.principalId,
        workspaceId: t.workspaceId,
        intentId: t.genesisIntentId,
      },
      stores: [{ principal: t.principalId, workspace: t.workspaceId, dbName: t.dbName }],
    };
    if (!same(slot, expected) || record.stage === 'cleared')
      stopStartup('repair-required', 'clear-index-changed');
  } else if (!['index', 'cleared'].includes(record.stage))
    stopStartup('repair-required', 'clear-index-missing');
  if (record.stage === 'content') {
    // Absence can mean a completed native deletion whose progress write was interrupted.
    // A surviving database must still have the bound layout and counter; never delete a replacement.
    const disk = await contentCensus(task, t.dbName);
    if (disk) parseCounter(disk.counter, t, t.genesisIntentId);
  } else await contentAbsent(task, t);
  if (['custody', 'index', 'cleared'].includes(record.stage)) journalAbsent(task, t);
  return { rows, retained, slots };
};

/** Compare the exact scoped snapshot in the mutating transaction; unknown/changed records are never swept. */
export const writeClearProgress = async (
  task: SessionTask,
  rows: Row[],
  next: LocalClearRecord,
  remove: Row[] = [],
): Promise<void> => {
  const found = await probeDatabase(task, CUSTODY_DB, async (db) => {
    checkLayout(db, { [CUSTODY_STORE]: null });
    await contentTransaction<void>(db, task, [CUSTODY_STORE], 'readwrite', (tx, _result, guard) => {
      const store = tx.objectStore(CUSTODY_STORE),
        current: Row[] = [],
        prefix = [next.target.slotId];
      const req = store.openCursor(IDBKeyRange.lowerBound(prefix));
      req.onsuccess = () =>
        guard(() => {
          const c = req.result;
          if (c && Array.isArray(c.key) && c.key[0] === prefix[0]) {
            if (current.length >= 32) stopStartup('repair-required', 'clear-too-many-controls');
            current.push({ key: c.key, value: c.value });
            c.continue();
            return;
          }
          if (!same(current, rows))
            stopStartup('repair-required', 'clear-control-snapshot-changed');
          const key = localClearKey(next.target.slotId);
          if (rows.some((row) => isKey(row, key))) store.put(next, key);
          else store.add(next, key);
          for (const row of remove) {
            if (!rows.some((r) => same(r, row)) || isKey(row, key))
              stopStartup('repair-required', 'clear-invalid-removal');
            store.delete(row.key);
          }
        });
    });
    return true;
  });
  if (!found) stopStartup('repair-required', 'clear-control-database-missing');
};
export const removeLocalIndex = async (
  task: SessionTask,
  target: LocalClearTarget,
  expected: Row[],
): Promise<void> => {
  const found = await probeDatabase(task, 'done.slots', async (db) => {
    checkLayout(db, { slots: 'id' });
    await contentTransaction<void>(db, task, ['slots'], 'readwrite', (tx, _result, guard) => {
      const store = tx.objectStore('slots'),
        req = store.openCursor(IDBKeyRange.only(target.slotId));
      req.onsuccess = () =>
        guard(() => {
          const current = req.result ? [{ key: target.slotId, value: req.result.value }] : [];
          if (!same(current, expected))
            stopStartup('repair-required', 'clear-index-snapshot-changed');
          if (current.length) store.delete(target.slotId);
        });
    });
    return true;
  });
  if (!found && expected.length) stopStartup('repair-required', 'clear-index-disappeared');
};
