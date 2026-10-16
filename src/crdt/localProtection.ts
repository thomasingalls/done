/** Resumable Local protection: exact Yjs copy into fresh custody/content, then retire automatic opening. */
import { Y, hasPendingUpdates } from './yjs';
import { automaticCode, automaticOpeningKey } from './automaticOpening';
import {
  createCustodyUnderPermit,
  checkContentUnderPermit,
  withPreactiveContentUnderPermit,
  withRecoveryUnderPermit,
} from './custody';
import { CUSTODY_DB, CUSTODY_STORE, recordKey, parseRecord } from './custodyRecord';
import {
  fields,
  generateDeviceCode,
  hex,
  hkdf,
  normalizeDeviceCode,
  random,
  utf8,
  type Bytes,
} from './custodyCrypto';
import { contentCensus } from './startupClassification';
import { MAX_BATCH_BYTES, MAX_BATCH_RECORDS, type ContentInput } from './contentRecord';
import { journalCount } from './startupStorage';
import {
  claimScope,
  localClaimKey,
  parseLocalClaim,
  signLocalClaim,
  slotCustodyRows,
  verifyLocalClaim,
  type LocalClaim,
} from './localGenesisRecord';
import { localCensus, localRoute } from './localGenesisStorage';
import { contentTransaction } from './contentDatabase';
import { probeDatabase, readRow } from './startupStorage';
import { deriveStoreName } from './storeName';
import { journalPrefix } from './journalCodec';
import { stopStartup } from './startupState';
import { retireSlotWriters, withExclusiveSlot, type SessionTask } from './writeSession';

export const protectionKey = (slotId: string) => [slotId, 'local-protection-v1'];
const phases = [
  'creating',
  'copying',
  'verified',
  'content-removed',
  'journal-removed',
  'index-selected',
] as const;
interface Protection {
  v: 1;
  kind: 'local-protection';
  slotId: string;
  source: LocalClaim;
  target: LocalClaim;
  phase: (typeof phases)[number];
  snapshotDigest: string | null;
  salt: Bytes;
  mac: Bytes;
}
function parse(value: unknown, slotId: string): Protection {
  const p = value as Protection;
  if (
    !p ||
    Object.keys(p).sort().join() !== 'kind,mac,phase,salt,slotId,snapshotDigest,source,target,v' ||
    p.v !== 1 ||
    p.kind !== 'local-protection' ||
    p.slotId !== slotId ||
    !phases.includes(p.phase) ||
    !(p.salt instanceof Uint8Array) ||
    p.salt.length !== 16 ||
    !(p.mac instanceof Uint8Array) ||
    p.mac.length !== 32 ||
    (phases.indexOf(p.phase) < 2
      ? p.snapshotDigest !== null
      : typeof p.snapshotDigest !== 'string' || !/^[a-f0-9]{64}$/.test(p.snapshotDigest))
  )
    stopStartup('repair-required', 'invalid-protection-transition');
  const source = parseLocalClaim(p.source, slotId),
    target = parseLocalClaim(p.target, slotId);
  if (
    source.stage !== 'ready' ||
    source.initial.principal_id !== target.initial.principal_id ||
    source.initial.workspace_id === target.initial.workspace_id
  )
    stopStartup('repair-required', 'invalid-protection-identities');
  return { ...p, source, target };
}
export async function readLocalProtection(
  task: SessionTask,
  slotId: string,
): Promise<Protection | null> {
  const result = await probeDatabase(task, CUSTODY_DB, async (db) => ({
    value: await readRow(task, db, CUSTODY_STORE, protectionKey(slotId)),
  }));
  return !result || result.value === undefined ? null : parse(result.value, slotId);
}
export async function assertNoLocalProtection(task: SessionTask, slotId: string) {
  if (await readLocalProtection(task, slotId))
    stopStartup('creation-pending', 'local-protection-needs-unlock-code');
}
async function authenticate(p: Protection, code: string, signing: boolean): Promise<Bytes> {
  const bytes = utf8(normalizeDeviceCode(code));
  try {
    const key = await hkdf(
      bytes,
      p.salt,
      fields('done/local-protection/v1', p.slotId),
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      ['sign', 'verify'],
    );
    const { mac: _mac, ...body } = p;
    const payload = utf8(JSON.stringify(body));
    if (signing) return new Uint8Array(await crypto.subtle.sign('HMAC', key, payload));
    if (!(await crypto.subtle.verify('HMAC', key, p.mac, payload)))
      stopStartup('unlock-failed', 'wrong-protection-code');
    return p.mac;
  } finally {
    bytes.fill(0);
  }
}
async function write(task: SessionTask, p: Protection, code: string, before?: Protection) {
  p = { ...p, mac: await task.wait(() => authenticate(p, code, true)) };
  await probeDatabase(task, CUSTODY_DB, async (db) => {
    await contentTransaction<void>(db, task, [CUSTODY_STORE], 'readwrite', (tx, _result, guard) => {
      const store = tx.objectStore(CUSTODY_STORE),
        r = store.get(protectionKey(p.slotId));
      r.onsuccess = () =>
        guard(() => {
          if (before && JSON.stringify(r.result) !== JSON.stringify(before))
            throw Error('Protection progress changed');
          store.put(p, protectionKey(p.slotId));
        });
    });
    return true;
  });
  return p;
}
const authority = (claim: LocalClaim) => ({
  ...claimScope(claim),
  resolvePrincipal: () => claim.initial.principal_id,
});
function encodeCopy(rows: readonly { kind: string; bytes: Bytes }[]): Bytes {
  const doc = new Y.Doc({ gc: false });
  try {
    for (const row of rows) {
      if (!['state', 'update'].includes(row.kind)) throw Error('Unexpected Local content');
      Y.applyUpdate(doc, row.bytes);
    }
    if (hasPendingUpdates(doc)) throw Error('Local content has missing dependencies');
    return new Uint8Array(Y.encodeStateAsUpdate(doc));
  } finally {
    doc.destroy();
  }
}
function removeJournal(task: SessionTask, name: string) {
  task.step(() => {
    const prefix = journalPrefix(name);
    for (const key of Object.keys(localStorage))
      if (key.startsWith(prefix)) localStorage.removeItem(key);
  });
}
async function finish(
  task: SessionTask,
  p: Protection,
  code: string,
  observe?: (phase: Protection['phase']) => void,
) {
  await task.wait(() => authenticate(p, code, false));
  await verifyLocalClaim(task, p.target, code);
  if (p.phase === 'creating') {
    await prepareTarget(task, p, code);
    const target = await signLocalClaim(task, { ...p.target, stage: 'ready' }, code);
    p = await write(task, { ...p, target, phase: 'copying' }, code, p);
    observe?.(p.phase);
  }
  if (p.phase === 'copying') {
    const oldCode = await automaticCode(task, p.source);
    if (!oldCode) throw Error('Automatic source opener is missing');
    await verifyLocalClaim(task, p.source, oldCode);
    const source = await withRecoveryUnderPermit(
      task,
      authority(p.source),
      oldCode,
      async (recovered) => {
        const records: ContentInput[] = [
          ...recovered.records.map((row) => ({ kind: row.kind, bytes: row.bytes.slice() })),
          ...recovered.journal.map((row) => ({
            kind: 'update' as const,
            bytes: row.bytes.slice(),
          })),
        ];
        try {
          return { records, snapshot: encodeCopy(records) };
        } catch (cause) {
          records.forEach((row) => row.bytes.fill(0));
          throw cause;
        }
      },
    );
    const snapshotDigest = hex(
      new Uint8Array(await task.wait(() => crypto.subtle.digest('SHA-256', source.snapshot))),
    );
    try {
      await withPreactiveContentUnderPermit(task, authority(p.target), code, async (content) => {
        const rows = await content.loadRecords();
        let cursor = rows.length;
        try {
          if (
            cursor > source.records.length ||
            rows.some((row, index) => {
              const expected = source.records[index]!;
              return (
                row.kind !== expected.kind ||
                row.bytes.length !== expected.bytes.length ||
                row.bytes.some((byte, i) => byte !== expected.bytes[i])
              );
            })
          )
            throw Error('Protected copy prefix changed');
        } finally {
          for (const row of rows) row.bytes.fill(0);
        }
        while (cursor < source.records.length) {
          const batch: ContentInput[] = [];
          let size = 0;
          while (cursor < source.records.length && batch.length < MAX_BATCH_RECORDS) {
            const next = source.records[cursor]!;
            if (size + next.bytes.length > MAX_BATCH_BYTES) break;
            batch.push(next);
            size += next.bytes.length;
            cursor++;
          }
          if (!batch.length) throw Error('A source record exceeds the supported transfer size');
          await content.appendBatch(batch);
        }
      });
    } finally {
      source.snapshot.fill(0);
      source.records.forEach((row) => row.bytes.fill(0));
    }
    p = await write(task, { ...p, snapshotDigest, phase: 'verified' }, code, p);
    observe?.(p.phase);
  }
  // Durable phase markers never substitute for cold verification before retiring an opener.
  await withPreactiveContentUnderPermit(task, authority(p.target), code, async (content) => {
    const rows = await content.loadRecords();
    let snapshot: Bytes | undefined;
    try {
      snapshot = encodeCopy(rows);
      if (
        hex(new Uint8Array(await task.wait(() => crypto.subtle.digest('SHA-256', snapshot!)))) !==
        p.snapshotDigest
      )
        throw Error('Protected copy is missing or changed');
    } finally {
      rows.forEach((row) => row.bytes.fill(0));
      snapshot?.fill(0);
    }
  });
  const sourceName = await task.wait(() =>
    deriveStoreName(p.source.initial.principal_id, p.source.initial.workspace_id),
  );
  if (p.phase === 'verified') {
    await task.wait(
      () =>
        new Promise<void>((resolve, reject) => {
          const r = indexedDB.deleteDatabase(sourceName);
          r.onsuccess = () => resolve();
          r.onerror = () => reject(r.error ?? Error('Source deletion failed'));
        }),
    );
    p = await write(task, { ...p, phase: 'content-removed' }, code, p);
    observe?.(p.phase);
  }
  if (p.phase === 'content-removed') {
    removeJournal(task, sourceName);
    p = await write(task, { ...p, phase: 'journal-removed' }, code, p);
    observe?.(p.phase);
  }
  if (p.phase === 'journal-removed') {
    const next = await localRoute(task, p.target),
      old = await localRoute(task, p.source);
    await probeDatabase(task, 'done.slots', (db) =>
      contentTransaction<void>(db, task, ['slots'], 'readwrite', (tx, _result, guard) => {
        const store = tx.objectStore('slots'),
          r = store.get(p.slotId);
        r.onsuccess = () =>
          guard(() => {
            if (![JSON.stringify(next), JSON.stringify(old)].includes(JSON.stringify(r.result)))
              throw Error('Local route changed');
            store.put(next);
          });
      }),
    );
    p = await write(task, { ...p, phase: 'index-selected' }, code, p);
    observe?.(p.phase);
  }
  await probeDatabase(task, CUSTODY_DB, (db) =>
    contentTransaction<void>(db, task, [CUSTODY_STORE], 'readwrite', (tx, _result, guard) => {
      const store = tx.objectStore(CUSTODY_STORE),
        r = store.get(protectionKey(p.slotId));
      r.onsuccess = () =>
        guard(() => {
          if (JSON.stringify(r.result) !== JSON.stringify(p))
            throw Error('Protection progress changed');
          store.delete(recordKey(claimScope(p.source)));
          store.delete([...recordKey(claimScope(p.source)), 'content-v1']);
          store.delete(automaticOpeningKey(p.slotId));
          store.put(p.target, localClaimKey(p.slotId));
          store.delete(protectionKey(p.slotId));
        });
    }),
  );
}
async function prepareTarget(task: SessionTask, p: Protection, code: string) {
  const scope = claimScope(p.target),
    rows = await slotCustodyRows(task, p.slotId);
  const row = rows?.find((r) => indexedDB.cmp(r.key, recordKey(scope)) === 0);
  if (!row) throw Error('Staged protection custody is missing');
  const record = parseRecord(row.value, scope);
  const check = async () => {
    if (JSON.stringify(await readLocalProtection(task, p.slotId)) !== JSON.stringify(p))
      throw Error('Protection intent changed');
  };
  if (record.state === 'creating')
    await createCustodyUnderPermit(
      task,
      authority(p.target),
      code,
      { checkCreation: check },
      'resume',
    );
  const witness = rows?.find((r) => indexedDB.cmp(r.key, [...recordKey(scope), 'content-v1']) === 0)
    ?.value as { state?: string } | undefined;
  await checkContentUnderPermit(
    task,
    authority(p.target),
    code,
    witness?.state === 'ready'
      ? undefined
      : { intent: p.target.initial.creation_intent!.id, checkCreation: check },
  );
}
/** The confirmed code is never persisted for redisplay or automatic opening. */
export function beginLocalProtection(slotId: string) {
  let code: string | null = generateDeviceCode();
  return {
    get displayCode() {
      return code;
    },
    cancel() {
      code = null;
    },
    async confirm(typed: string) {
      if (!code || normalizeDeviceCode(typed) !== normalizeDeviceCode(code))
        throw Error('Enter the code from your saved copy');
      code = null;
      await protectLocalWorkspace(slotId, typed);
    },
  };
}
export async function protectLocalWorkspace(
  slotId: string,
  code: string,
  options: { onPhase?: (phase: Protection['phase']) => void; signal?: AbortSignal } = {},
) {
  options.signal?.throwIfAborted();
  retireSlotWriters(slotId);
  await withExclusiveSlot(
    slotId,
    async (task) => {
      const retained = await readLocalProtection(task, slotId);
      if (retained) return finish(task, retained, code, options.onPhase);
      const rows = await slotCustodyRows(task, slotId);
      const row = rows?.find((r) => indexedDB.cmp(r.key, localClaimKey(slotId)) === 0);
      if (!row) throw Error('Local source is missing');
      const source = parseLocalClaim(row.value, slotId),
        oldCode = await automaticCode(task, source);
      if (!oldCode) throw Error('This workspace is already protected');
      await verifyLocalClaim(task, source, oldCode);
      await localCensus(task, source);
      if (source.stage !== 'ready' || source.imported) throw Error('Finish Local setup first');
      const scope = {
        slotId,
        principalId: source.initial.principal_id,
        workspaceId: hex(random(16)),
      };
      let p!: Protection;
      await createCustodyUnderPermit(
        task,
        { ...scope, resolvePrincipal: () => scope.principalId },
        code,
        {
          checkCreation: async () => {
            const name = await task.wait(() =>
              deriveStoreName(scope.principalId, scope.workspaceId),
            );
            if ((await contentCensus(task, name)) || journalCount(task, journalPrefix(name)))
              throw Error('Protection destination already contains data');
          },
        },
        'fresh',
        async (task, db, _scope, initial) => {
          const target = await signLocalClaim(
            task,
            { v: 1, initial, stage: 'custody', mac: new Uint8Array(32) },
            code,
          );
          p = {
            v: 1,
            kind: 'local-protection',
            slotId,
            source,
            target,
            phase: 'creating',
            snapshotDigest: null,
            salt: random(16),
            mac: new Uint8Array(32),
          };
          p.mac = await task.wait(() => authenticate(p, code, true));
          await contentTransaction<void>(db, task, [CUSTODY_STORE], 'readwrite', (tx) => {
            tx.objectStore(CUSTODY_STORE).add(initial, recordKey(scope));
            tx.objectStore(CUSTODY_STORE).add(p, protectionKey(slotId));
          });
          options.onPhase?.('creating');
        },
      );
      // Creation finished in the same permit. A resumed attempt may still be creating.
      await prepareTarget(task, p, code);
      p = await write(
        task,
        {
          ...p,
          target: await signLocalClaim(task, { ...p.target, stage: 'ready' }, code),
          phase: 'copying',
        },
        code,
        p,
      );
      options.onPhase?.(p.phase);
      await finish(task, p, code, options.onPhase);
    },
    options.signal ? { signal: options.signal } : {},
  );
}
