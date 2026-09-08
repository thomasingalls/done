/** Cross-carrier preflight under an already granted slot permit. No authentication claim yet. */
import {
  CUSTODY_DB,
  CUSTODY_STORE,
  identity,
  parseRecord,
  recordKey,
  type CustodyScope,
} from './custodyRecord';
import { CONTENT_STORES, parseCounter, parseWitness } from './contentRecord';
import { contentTransaction } from './contentDatabase';
import { deriveStoreName } from './storeName';
import { journalPrefix } from './journalCodec';
import {
  probeDatabase,
  readRow,
  readScopedRows,
  checkLayout,
  journalCount,
} from './startupStorage';
import { StartupError, stopStartup } from './startupState';
import type { SessionTask } from './writeSession';
import type { Slot } from './slotIndex';

export interface StartupIdentity {
  readonly kind: 'local' | 'account';
  readonly principalId: string;
}
export interface StartupAuthority {
  readonly slotId: string;
  readonly workspaceId: string;
  /** Verify Local identity or Account binding, under this permit. A stored row alone is not authority. */
  resolveIdentity(
    task: SessionTask,
    slot: Readonly<Slot> | null,
  ): StartupIdentity | PromiseLike<StartupIdentity>;
}
export const captureStartupAuthority = (input: StartupAuthority): StartupAuthority => {
  identity(input.slotId);
  identity(input.workspaceId);
  if (typeof input.resolveIdentity !== 'function')
    throw TypeError('Startup requires an identity verifier.');
  return Object.freeze({
    slotId: input.slotId,
    workspaceId: input.workspaceId,
    resolveIdentity: input.resolveIdentity,
  });
};
export const parseSlot = (value: unknown, slotId: string): Slot | null => {
  if (value === undefined) return null;
  if (!value || typeof value !== 'object')
    return stopStartup('repair-required', 'invalid-slot-index');
  const v = value as Slot;
  if (
    !['id,status,stores,unlockBinding', 'id,local,status,stores,unlockBinding'].includes(
      Object.keys(v).sort().join(','),
    ) ||
    v.id !== slotId ||
    !['active', 'closed'].includes(v.status) ||
    !Array.isArray(v.stores) ||
    (v.unlockBinding !== null && typeof v.unlockBinding !== 'object')
  )
    return stopStartup('repair-required', 'invalid-slot-index');
  if (
    'local' in v &&
    (!v.local ||
      v.unlockBinding !== null ||
      Object.keys(v.local).sort().join(',') !== 'intentId,principalId,workspaceId' ||
      Object.values(v.local).some((s) => typeof s !== 'string' || !s))
  )
    stopStartup('repair-required', 'invalid-local-index');
  for (const entry of v.stores) {
    if (
      !entry ||
      Object.keys(entry).sort().join(',') !== 'dbName,principal,workspace' ||
      [entry.dbName, entry.principal, entry.workspace].some((v) => typeof v !== 'string' || !v)
    )
      return stopStartup('repair-required', 'invalid-store-routing');
  }
  return structuredClone(v);
};
export const contentCensus = (task: SessionTask, name: string) =>
  probeDatabase(task, name, async (db) => {
    if (db.objectStoreNames.contains('updates'))
      stopStartup('migration-required', 'legacy-content-layout');
    checkLayout(db, Object.fromEntries(CONTENT_STORES.map((name) => [name, null])));
    return task.wait(() =>
      contentTransaction<{ counter: unknown; records: number }>(
        db,
        task,
        [...CONTENT_STORES],
        'readonly',
        (tx, result, guard) => {
          const state = { counter: undefined as unknown, records: 0 };
          result(state);
          const meta = tx.objectStore('meta').openCursor();
          meta.onsuccess = () =>
            guard(() => {
              const cursor = meta.result;
              if (!cursor) return;
              if (cursor.key !== 'counter')
                stopStartup('repair-required', 'unknown-content-metadata');
              state.counter = cursor.value;
              cursor.continue();
            });
          for (const name of ['content', 'heads', 'outbound']) {
            const req = tx.objectStore(name).count();
            req.onsuccess = () =>
              guard(() => {
                state.records += req.result;
              });
          }
        },
      ),
    );
  });

export interface ClassifiedWorkspace {
  readonly scope: Readonly<CustodyScope>;
  readonly storeId: string;
  readonly dbName: string;
}
export const classifyUnderPermit = async (
  task: SessionTask,
  authority: StartupAuthority,
): Promise<ClassifiedWorkspace> => {
  const slot = await probeDatabase(task, 'done.slots', async (db) => {
    checkLayout(db, { slots: 'id' });
    return parseSlot(await readRow(task, db, 'slots', authority.slotId), authority.slotId);
  });
  if (slot?.status === 'closed') stopStartup('slot-closed', 'slot-is-closed');
  let verified: StartupIdentity;
  try {
    verified = await task.wait(() =>
      authority.resolveIdentity(task, slot ? structuredClone(slot) : null),
    );
    identity(verified.principalId);
    if (
      slot?.local &&
      (verified.kind !== 'local' ||
        verified.principalId !== slot.local.principalId ||
        authority.workspaceId !== slot.local.workspaceId)
    )
      throw Error('Local identity differs from its recorded claim.');
    if (!['local', 'account'].includes(verified.kind)) throw Error('Unknown identity authority.');
    if (
      verified.kind === 'account' &&
      (!slot?.unlockBinding || slot.unlockBinding.binding.principalId !== verified.principalId)
    )
      throw Error('Account identity does not match its verified binding.');
    if (verified.kind === 'local' && slot?.unlockBinding !== null && slot !== null)
      throw Error('An Account binding cannot substitute for Local identity.');
  } catch (error) {
    task.step(() => {});
    throw error instanceof StartupError
      ? error
      : new StartupError({ kind: 'identity-required', reason: 'identity-not-verified' });
  }
  const scope = Object.freeze({
    slotId: authority.slotId,
    workspaceId: authority.workspaceId,
    principalId: verified.principalId,
  });
  const name = await task.wait(() => deriveStoreName(scope.principalId, scope.workspaceId));
  const routes =
    slot?.stores.filter(
      (s) => s.principal === scope.principalId && s.workspace === scope.workspaceId,
    ) ?? [];
  if (routes.length > 1) stopStartup('repair-required', 'ambiguous-store-routing');
  const route = routes[0];
  if (route?.dbName === 'done') stopStartup('migration-required', 'selected-legacy-route');
  if (route && route.dbName !== name) stopStartup('repair-required', 'store-routing-mismatch');
  const prefix = recordKey(scope);
  const rows =
    (await probeDatabase(task, CUSTODY_DB, async (db) => {
      checkLayout(db, { [CUSTODY_STORE]: null });
      return readScopedRows(task, db, CUSTODY_STORE, prefix);
    })) ?? [];
  let custody: unknown, witnessValue: unknown;
  for (const row of rows) {
    const key = row.key as IDBValidKey[];
    if (key.length === 3) custody = row.value;
    else if (key.length === 4 && key[3] === 'content-v1') witnessValue = row.value;
    else {
      // Refusal-only transition hints. No such row authorizes cleanup, resumption or creation.
      const state = (row.value as { state?: unknown } | null)?.state;
      if (state === 'clearing' || state === 'cleared') stopStartup(state, 'retained-clear-marker');
      if (state === 'migrating') stopStartup('migration-required', 'retained-migration-marker');
      stopStartup('repair-required', 'unsupported-scoped-control-record');
    }
  }
  const disk = await contentCensus(task, name);
  const journal = journalCount(task, journalPrefix(name));
  if (!route) {
    if (rows.length || disk || journal)
      stopStartup('repair-required', 'retained-material-without-index');
    const legacy = await probeDatabase(task, 'done', async () => true);
    if (legacy || journalCount(task, journalPrefix('done')))
      stopStartup('migration-required', 'unassigned-legacy-carrier');
    stopStartup('fresh', 'requested-carriers-absent');
  }
  if (custody === undefined) stopStartup('repair-required', 'indexed-custody-missing');
  const record = parseRecord(custody, scope);
  if (record.state === 'creating') {
    if (witnessValue !== undefined || disk || journal)
      stopStartup('repair-required', 'conflicting-custody-creation');
    stopStartup('creation-pending', 'custody-intent-needs-verified-resumption');
  }
  if (witnessValue === undefined) stopStartup('repair-required', 'content-witness-missing');
  const witness = parseWitness(witnessValue);
  const counter =
    disk?.counter === undefined
      ? null
      : parseCounter(
          disk.counter,
          { ...scope, storeId: record.store_id, rootId: record.root_id },
          witness.intent,
        );
  if (witness.state === 'creating') {
    if (
      journal ||
      disk?.records ||
      (counter && (counter.next_seq !== 1 || counter.active_gen !== 1))
    )
      stopStartup('repair-required', 'conflicting-content-creation');
    stopStartup('creation-pending', 'content-intent-needs-verified-resumption');
  }
  if (!disk || !counter) stopStartup('repair-required', 'initialized-content-missing');
  return Object.freeze({ scope, storeId: record.store_id, dbName: name });
};
