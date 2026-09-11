export * from '../account-handoff/browser';
export * from './browser';
import { rows, put } from '../account-promotion/browser';
import { withExclusiveSlot } from '../../src/crdt/writeSession';
import {
  localClaimKey,
  readLocalClaim,
  signLocalClaim,
  type LocalClaim,
} from '../../src/crdt/localGenesisRecord';
import { clearAuthenticator } from '../../src/crdt/localClearCrypto';
import { signImportClaim } from '../../src/crdt/legacyImportRecord';
import { cleanupFingerprinter } from '../../src/crdt/legacyCleanupRecord';
import { inspectLegacySource } from '../../src/crdt/legacySource';
import { hex } from '../../src/crdt/custodyCrypto';
export async function storedClaim(slotId: string) {
  return (await rows()).find(
    (r) => JSON.stringify(r.key) === JSON.stringify(localClaimKey(slotId)),
  )!.value as LocalClaim;
}
export async function installVariant(
  slotId: string,
  code: string,
  variant: LocalClaim['imported'],
  cleanup: LocalClaim['sourceCleanup'],
) {
  return withExclusiveSlot(slotId, async (task) => {
    const claim = (await readLocalClaim(task, slotId))!;
    const next = await signLocalClaim(
      task,
      {
        ...claim,
        ...(variant ? { imported: variant } : {}),
        ...(cleanup ? { sourceCleanup: cleanup } : {}),
      },
      code,
    );
    await put(localClaimKey(slotId), next);
    return next;
  });
}
export const wire = (v: unknown): unknown =>
  v instanceof Uint8Array
    ? hex(v)
    : Array.isArray(v)
      ? v.map(wire)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, wire(x)]))
        : v;
export async function probeExcluded() {
  const task = {
    signal: new AbortController().signal,
    step: <T>(f: () => T) => f(),
    wait: async <T>(f: () => T | PromiseLike<T>) => f(),
  };
  const callbacks = [
    () => clearAuthenticator(task, undefined as never, ''),
    () => signImportClaim(task, undefined as never, ''),
    () => inspectLegacySource(task),
    () => cleanupFingerprinter(task, undefined as never, '', ''),
  ];
  const results = [];
  for (const fn of callbacks) {
    try {
      await fn();
      results.push('returned');
    } catch (e) {
      results.push(String(e));
    }
  }
  return results;
}
import { deriveStoreName } from '../../src/crdt/storeName';
export async function blockingClear(slotId: string) {
  const c = (await storedClaim(slotId)).initial,
    i = c.creation_intent!;
  return {
    v: 1,
    kind: 'local-clear',
    intentId: 'ac'.repeat(16),
    target: {
      slotId,
      principalId: c.principal_id,
      workspaceId: c.workspace_id,
      storeId: i.storeId,
      rootId: i.rootId,
      genesisIntentId: i.id,
      dbName: await deriveStoreName(c.principal_id, c.workspace_id),
    },
    stage: 'content',
    salt: new Uint8Array(16),
    mac: new Uint8Array(32),
  };
}
