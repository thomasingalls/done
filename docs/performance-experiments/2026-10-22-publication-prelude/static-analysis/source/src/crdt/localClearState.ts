/** Durable Local clear metadata. A structural observation can refuse open; only authentication permits cleanup. */
import { CUSTODY_DB, CUSTODY_STORE, identity } from './custodyRecord';
import { probeDatabase, checkLayout, readRow } from './startupStorage';
import { stopStartup } from './startupState';
import type { Bytes } from './custodyCrypto';
import type { SessionTask } from './writeSession';
import { assertNoDeviceRemoval } from './deviceDataRemoval';

export const localClearKey = (slotId: string): string[] => [slotId, 'local-clear-v1'];
export const CLEAR_STAGES = ['content', 'journal', 'custody', 'index', 'cleared'] as const;
export type LocalClearStage = (typeof CLEAR_STAGES)[number];
export interface LocalClearTarget {
  readonly slotId: string;
  readonly principalId: string;
  readonly workspaceId: string;
  readonly storeId: string;
  readonly rootId: string;
  readonly genesisIntentId: string;
  readonly dbName: string;
  readonly legacySourceOrigin?: string;
}
export interface LocalClearRecord {
  v: 1;
  kind: 'local-clear';
  intentId: string;
  target: LocalClearTarget;
  stage: LocalClearStage;
  salt: Bytes;
  mac: Bytes;
}
const id = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[0-9a-f]{32}$/u.test(value))
    stopStartup('repair-required', 'invalid-clear-identity');
  return value;
};
export const captureClearTarget = (input: LocalClearTarget): LocalClearTarget => {
  if (
    !input ||
    ![
      'dbName,genesisIntentId,principalId,rootId,slotId,storeId,workspaceId',
      'dbName,genesisIntentId,legacySourceOrigin,principalId,rootId,slotId,storeId,workspaceId',
    ].includes(Object.keys(input).sort().join(','))
  )
    stopStartup('repair-required', 'invalid-clear-target');
  const target = {
    slotId: identity(input.slotId),
    principalId: id(input.principalId),
    workspaceId: id(input.workspaceId),
    storeId: id(input.storeId),
    rootId: id(input.rootId),
    genesisIntentId: id(input.genesisIntentId),
    dbName: input.dbName,
    ...('legacySourceOrigin' in input ? { legacySourceOrigin: input.legacySourceOrigin } : {}),
  };
  if (typeof target.dbName !== 'string' || !/^done\.[0-9a-f]{32}$/u.test(target.dbName))
    stopStartup('repair-required', 'invalid-clear-database');
  if (
    'legacySourceOrigin' in target &&
    (typeof target.legacySourceOrigin !== 'string' || target.legacySourceOrigin.length > 4096)
  )
    stopStartup('repair-required', 'invalid-clear-source-origin');
  return Object.freeze(target);
};
export const parseLocalClear = (value: unknown, slotId: string): LocalClearRecord => {
  const v = value as LocalClearRecord | undefined;
  if (
    !v ||
    Object.keys(v).sort().join(',') !== 'intentId,kind,mac,salt,stage,target,v' ||
    v.v !== 1 ||
    v.kind !== 'local-clear' ||
    !CLEAR_STAGES.includes(v.stage) ||
    !(v.mac instanceof Uint8Array) ||
    v.mac.length !== 32 ||
    !(v.salt instanceof Uint8Array) ||
    v.salt.length !== 16
  )
    stopStartup('repair-required', 'invalid-local-clear-record');
  const target = captureClearTarget(v.target);
  if (target.slotId !== slotId) stopStartup('repair-required', 'clear-slot-mismatch');
  return {
    v: 1,
    kind: 'local-clear',
    intentId: id(v.intentId),
    target,
    stage: v.stage,
    salt: v.salt.slice(),
    mac: v.mac.slice(),
  };
};
export const readLocalClear = async (
  task: SessionTask,
  slotId: string,
): Promise<LocalClearRecord | null> => {
  const result = await probeDatabase(task, CUSTODY_DB, async (db) => {
    checkLayout(db, { [CUSTODY_STORE]: null });
    return { value: await readRow(task, db, CUSTODY_STORE, localClearKey(slotId)) };
  });
  return !result || result.value === undefined ? null : parseLocalClear(result.value, slotId);
};
/** Every participating opener/creator calls this after its permit is granted and before key selection. */
export const assertNoLocalClear = async (task: SessionTask, slotId: string): Promise<void> => {
  await assertNoDeviceRemoval(task, slotId);
  const record = await readLocalClear(task, slotId);
  if (record)
    stopStartup(
      record.stage === 'cleared' ? 'cleared' : 'clearing',
      'local-clear-blocks-normal-use',
    );
};
