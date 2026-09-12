/** Factor-derived progress authentication remains verifiable after all content openers have been removed. */
import {
  fields,
  hex,
  hkdf,
  normalizeDeviceCode,
  utf8,
  guardedSubtle,
  type Bytes,
} from './custodyCrypto';
import { deriveStoreName } from './storeName';
import { stopStartup } from './startupState';
import type { SessionTask } from './writeSession';
import type { LocalClearRecord } from './localClearState';

const baseClearPayload = (r: LocalClearRecord): Bytes =>
  fields(
    'done/local-clear-progress/v1',
    r.intentId,
    r.target.slotId,
    r.target.principalId,
    r.target.workspaceId,
    r.target.storeId,
    r.target.rootId,
    r.target.genesisIntentId,
    r.target.dbName,
    hex(r.salt),
    r.stage,
  );
export const clearPayload = (r: LocalClearRecord): Bytes =>
  r.target.legacySourceOrigin !== undefined
    ? fields('done/local-import-clear/v1', hex(baseClearPayload(r)), r.target.legacySourceOrigin)
    : baseClearPayload(r);
export const equalClear = (a: LocalClearRecord, b: LocalClearRecord): boolean =>
  hex(clearPayload(a)) === hex(clearPayload(b)) && hex(a.mac) === hex(b.mac);
export const clearAuthenticator = async (task: SessionTask, r: LocalClearRecord, code: string) => {
  if (
    (await task.wait(() => deriveStoreName(r.target.principalId, r.target.workspaceId))) !==
    r.target.dbName
  )
    stopStartup('repair-required', 'clear-route-mismatch');
  let factor: Bytes | undefined, key: CryptoKey | undefined;
  const subtle = guardedSubtle(() => task.step(() => {}));
  try {
    try {
      factor = utf8(normalizeDeviceCode(code));
    } catch {
      stopStartup('unlock-failed', 'clear-factor-invalid');
    }
    key = await task.wait(() =>
      hkdf(
        factor!,
        r.salt,
        fields('done/local-clear-authentication/v1', r.target.slotId, r.intentId),
        { name: 'HMAC', hash: 'SHA-256', length: 256 },
        ['sign', 'verify'],
        subtle,
      ),
    );
  } finally {
    factor?.fill(0);
  }
  return {
    async verify(record: LocalClearRecord): Promise<void> {
      if (!(await task.wait(() => subtle.verify('HMAC', key!, record.mac, clearPayload(record)))))
        stopStartup('unlock-failed', 'clear-factor-wrong-or-intent-damaged');
    },
    async sign(record: LocalClearRecord): Promise<LocalClearRecord> {
      return {
        ...record,
        mac: new Uint8Array(await task.wait(() => subtle.sign('HMAC', key!, clearPayload(record)))),
      };
    },
    dispose() {
      key = undefined;
    },
  };
};
