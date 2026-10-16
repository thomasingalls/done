/** Automatic Local opening is an explicit weaker custody mode. Never a protected-slot fallback. */
import type { LocalClaim } from './localGenesisRecord';
import { fields, hex, normalizeDeviceCode, random, utf8, type Bytes } from './custodyCrypto';
import { stopStartup } from './startupState';
import type { SessionTask } from './writeSession';
import { CUSTODY_DB, CUSTODY_STORE } from './custodyRecord';
import { probeDatabase, readRow } from './startupStorage';

export const automaticOpeningKey = (slotId: string) => [slotId, 'automatic-opening-v1'];
interface AutomaticOpening {
  v: 1;
  kind: 'automatic-opening';
  claim: string;
  key: CryptoKey;
  nonce: Bytes;
  ct: Bytes;
}
const aad = (claim: LocalClaim) =>
  fields('done/automatic-opening/v1', claim.initial.slot_id, hex(claim.initial.mac));
export function parseAutomaticOpening(value: unknown, claim: LocalClaim): AutomaticOpening {
  const v = value as AutomaticOpening;
  if (
    !claim.automatic ||
    !v ||
    Object.keys(v).sort().join() !== 'claim,ct,key,kind,nonce,v' ||
    v.v !== 1 ||
    v.kind !== 'automatic-opening' ||
    v.claim !== hex(claim.initial.mac) ||
    !v.key ||
    v.key.type !== 'secret' ||
    v.key.extractable ||
    v.key.algorithm.name !== 'AES-GCM' ||
    !(v.nonce instanceof Uint8Array) ||
    v.nonce.length !== 12 ||
    !(v.ct instanceof Uint8Array)
  )
    stopStartup('repair-required', 'automatic-opener-does-not-match-local-claim');
  return v;
}
export async function createAutomaticOpening(task: SessionTask, claim: LocalClaim, code: string) {
  const key = await task.wait(() =>
    crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
  );
  const nonce = random(12),
    bytes = utf8(normalizeDeviceCode(code));
  try {
    const ct = new Uint8Array(
      await task.wait(() =>
        crypto.subtle.encrypt(
          { name: 'AES-GCM', iv: nonce, additionalData: aad(claim) },
          key,
          bytes,
        ),
      ),
    );
    return {
      v: 1 as const,
      kind: 'automatic-opening' as const,
      claim: hex(claim.initial.mac),
      key,
      nonce,
      ct,
    };
  } finally {
    bytes.fill(0);
  }
}
export async function automaticCode(task: SessionTask, claim: LocalClaim): Promise<string | null> {
  const result = await probeDatabase(task, CUSTODY_DB, async (db) => ({
    value: await readRow(task, db, CUSTODY_STORE, automaticOpeningKey(claim.initial.slot_id)),
  }));
  if (!result || result.value === undefined) {
    if (claim.automatic) stopStartup('repair-required', 'automatic-opener-missing');
    return null;
  }
  const opening = parseAutomaticOpening(result.value, claim);
  const bytes = new Uint8Array(
    await task.wait(() =>
      crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: opening.nonce, additionalData: aad(claim) },
        opening.key,
        opening.ct,
      ),
    ),
  );
  try {
    return normalizeDeviceCode(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally {
    bytes.fill(0);
  }
}
