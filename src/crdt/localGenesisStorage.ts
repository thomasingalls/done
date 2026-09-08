/** Only the Local genesis owner calls these operations, under a slot permit. */
import { contentTransaction } from './contentDatabase';
import { parseSlot, contentCensus } from './startupClassification';
import { probeDatabase, checkLayout, readRow, journalCount } from './startupStorage';
import { journalPrefix } from './journalCodec';
import { deriveStoreName } from './storeName';
import { CUSTODY_STORE, parseRecord, recordKey, recordEqual } from './custodyRecord';
import { parseCounter, parseWitness } from './contentRecord';
import {
  localClaimKey,
  claimScope,
  matchLocalCustody,
  slotCustodyRows,
  type LocalClaim,
  signLocalClaim,
  readLocalClaim,
  parseLocalClaim,
} from './localGenesisRecord';
import { stopStartup } from './startupState';
import type { SessionTask } from './writeSession';
import type { Slot } from './slotIndex';

export const readLocalSlot = (task: SessionTask, slotId: string) =>
  probeDatabase(task, 'done.slots', async (db) => {
    checkLayout(db, { slots: 'id' });
    return parseSlot(await readRow(task, db, 'slots', slotId), slotId);
  });
export const requireFreshLocalSlot = async (task: SessionTask, slotId: string): Promise<void> => {
  const count = await probeDatabase(task, 'done.slots', async (db) => {
    checkLayout(db, { slots: 'id' });
    return contentTransaction<number>(db, task, ['slots'], 'readonly', (tx, result, guard) => {
      const r = tx.objectStore('slots').count(slotId);
      r.onsuccess = () => guard(() => result(r.result));
    });
  });
  if (await readLocalClaim(task, slotId))
    stopStartup('unlock-required', 'local-creation-already-won');
  if (count || (await slotCustodyRows(task, slotId))?.length)
    stopStartup('repair-required', 'local-slot-already-retains-material');
  if (
    (await probeDatabase(task, 'done', async () => true)) ||
    journalCount(task, journalPrefix('done'))
  )
    stopStartup('migration-required', 'unassigned-legacy-carrier');
};
export const localRoute = async (task: SessionTask, claim: LocalClaim): Promise<Slot> => {
  const scope = claimScope(claim),
    intentId = claim.initial.creation_intent!.id;
  return {
    id: scope.slotId,
    status: 'active',
    unlockBinding: null,
    local: { principalId: scope.principalId, workspaceId: scope.workspaceId, intentId },
    stores: [
      {
        principal: scope.principalId,
        workspace: scope.workspaceId,
        dbName: await task.wait(() => deriveStoreName(scope.principalId, scope.workspaceId)),
      },
    ],
  };
};
export const matchLocalRoute = async (
  task: SessionTask,
  claim: LocalClaim,
  slot: Slot,
): Promise<void> => {
  if (slot.status === 'closed') stopStartup('slot-closed', 'slot-is-closed');
  const expected = await localRoute(task, claim);
  if (
    slot.unlockBinding !== null ||
    !slot.local ||
    slot.local.principalId !== expected.local!.principalId ||
    slot.local.workspaceId !== expected.local!.workspaceId ||
    slot.local.intentId !== expected.local!.intentId ||
    slot.stores.length !== 1 ||
    Object.entries(expected.stores[0]!).some(
      ([k, v]) => slot.stores[0]![k as keyof Slot['stores'][number]] !== v,
    )
  )
    stopStartup('repair-required', 'index-differs-from-local-claim');
};
export const localCensus = async (task: SessionTask, claim: LocalClaim) => {
  const scope = claimScope(claim),
    rows = (await slotCustodyRows(task, scope.slotId)) ?? [];
  const key = recordKey(scope),
    intent = claim.initial.creation_intent!;
  let custody: unknown,
    witness: unknown,
    witnessPresent = false;
  for (const row of rows) {
    if (indexedDB.cmp(row.key, localClaimKey(scope.slotId)) === 0) continue;
    if (indexedDB.cmp(row.key, key) === 0) custody = row.value;
    else if (indexedDB.cmp(row.key, [...key, 'content-v1']) === 0) {
      witness = row.value;
      witnessPresent = true;
    } else stopStartup('repair-required', 'unknown-local-creation-carrier');
  }
  if (custody === undefined) stopStartup('repair-required', 'claimed-custody-missing');
  const record = parseRecord(custody, scope);
  if (claim.stage !== 'custody' && record.state !== 'protected')
    stopStartup('repair-required', 'local-custody-progress-regressed');
  matchLocalCustody(claim, record);
  const name = await task.wait(() => deriveStoreName(scope.principalId, scope.workspaceId));
  const disk = await contentCensus(task, name),
    journal = journalCount(task, journalPrefix(name));
  const content = witnessPresent ? parseWitness(witness) : null;
  if (claim.stage === 'custody' && content)
    stopStartup('repair-required', 'content-before-local-progress');
  if (claim.stage === 'ready' && content?.state !== 'ready')
    stopStartup('repair-required', 'ready-local-content-missing');
  if (content && content.intent !== intent.id)
    stopStartup('repair-required', 'content-intent-mismatch');
  if (
    (!content && (disk || journal)) ||
    (record.state === 'creating' && (content || disk || journal))
  )
    stopStartup('repair-required', 'contradictory-local-creation');
  const counter =
    disk?.counter === undefined
      ? null
      : parseCounter(
          disk.counter,
          { ...scope, storeId: intent.storeId, rootId: intent.rootId },
          intent.id,
        );
  if (content?.state === 'ready' && (!disk || !counter))
    stopStartup('repair-required', 'initialized-content-missing');
  if (
    content?.state !== 'ready' &&
    (journal ||
      disk?.records ||
      (counter && (counter.next_seq !== 1 || counter.reserved['1'] !== 0)))
  )
    stopStartup('repair-required', 'unfinished-content-has-writes');
  const slot = await readLocalSlot(task, scope.slotId);
  if (slot) {
    await matchLocalRoute(task, claim, slot);
    if (claim.stage !== 'ready' || record.state !== 'protected' || content?.state !== 'ready')
      stopStartup('repair-required', 'indexed-local-creation-incomplete');
  } else if (
    journal ||
    disk?.records ||
    (counter && (counter.next_seq !== 1 || counter.reserved['1'] !== 0))
  )
    stopStartup('repair-required', 'used-content-without-index');
  return { record, content, slot };
};

/** Atomic uniqueness claim and first factor-sealed custody. Neither can survive alone. */
export const installLocalClaim = async (
  task: SessionTask,
  db: IDBDatabase,
  claim: LocalClaim,
): Promise<void> => {
  const scope = claimScope(claim);
  await task.wait(() =>
    contentTransaction<void>(db, task, [CUSTODY_STORE], 'readwrite', (tx, _result, guard) => {
      const store = tx.objectStore(CUSTODY_STORE),
        req = store.openCursor(IDBKeyRange.lowerBound([scope.slotId]));
      req.onsuccess = () =>
        guard(() => {
          const row = req.result;
          if (row && Array.isArray(row.key) && row.key[0] === scope.slotId)
            stopStartup('repair-required', 'local-claim-already-exists');
          store.add(claim, localClaimKey(scope.slotId));
          store.add(claim.initial, recordKey(scope));
        });
    }),
  );
};

export const installLocalIndex = async (task: SessionTask, claim: LocalClaim): Promise<void> => {
  const slot = await localRoute(task, claim);
  let db: IDBDatabase | undefined;
  try {
    await task.wait(async () => {
      db = await new Promise<IDBDatabase>((resolve, reject) => {
        let abandoned = false;
        const req = task.step(() => indexedDB.open('done.slots', 1));
        req.onupgradeneeded = () => {
          try {
            task.step(() => {
              if (abandoned) throw Error('Abandoned index open');
              req.result.createObjectStore('slots', { keyPath: 'id' });
            });
          } catch {
            req.transaction!.abort();
          }
        };
        req.onblocked = () => {
          abandoned = true;
          reject(Error('Index open blocked'));
        };
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          if (abandoned || task.signal.aborted) {
            req.result.close();
            reject(Error('Index open cancelled'));
          } else resolve(req.result);
        };
      });
    });
    checkLayout(db!, { slots: 'id' });
    await task.wait(() =>
      contentTransaction<void>(db!, task, ['slots'], 'readwrite', (tx) => {
        // add is intentional: a competing/closed/different row is never overwritten.
        tx.objectStore('slots').add(slot);
      }),
    );
  } finally {
    db?.close();
  }
};

/** Authenticated monotone progress survives loss of later databases/rows. */
export const advanceLocalClaim = async (
  task: SessionTask,
  claim: LocalClaim,
  code: string,
  stage: LocalClaim['stage'],
): Promise<LocalClaim> => {
  if (
    !(
      (claim.stage === 'custody' && stage === 'content') ||
      (claim.stage === 'content' && stage === 'ready')
    )
  )
    stopStartup('repair-required', 'invalid-local-progress-transition');
  const next = await signLocalClaim(task, { ...claim, stage }, code);
  await probeDatabase(task, 'done.custody', async (db) => {
    await contentTransaction<void>(db, task, [CUSTODY_STORE], 'readwrite', (tx, _result, guard) => {
      const store = tx.objectStore(CUSTODY_STORE),
        key = localClaimKey(claim.initial.slot_id),
        req = store.get(key);
      req.onsuccess = () =>
        guard(() => {
          const current = parseLocalClaim(req.result, claim.initial.slot_id);
          if (
            !current ||
            current.stage !== claim.stage ||
            !recordEqual(current.initial, claim.initial) ||
            !current.mac.every((b, i) => b === claim.mac[i])
          )
            stopStartup('repair-required', 'local-progress-changed');
          store.put(next, key);
        });
    });
    return true;
  }).then((found) => {
    if (!found) stopStartup('repair-required', 'local-claim-disappeared');
  });
  return next;
};
