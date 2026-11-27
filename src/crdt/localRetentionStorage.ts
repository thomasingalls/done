/** Private atomic reclamation. Only an exact, complete verified cut can clear logical stores. */
import { ledgerWorkStart, measureLedgerWork } from './accountLedgerMetrics';
import { contentTransaction } from './contentDatabase';
import {
  CONTENT_STORES,
  corrupt,
  counterPayload,
  reserveCounter,
  parseStoredRecord,
  type StoredRecord,
  type ContentCounter,
} from './contentRecord';
import {
  reducedBaselineCarrier,
  baselineChunkBytes,
  baselineVersion,
  baselineCounterPayload,
  baselineChunkKey,
  baselineChunkPrefix,
  parseBaselineCounter,
  type BaselineCounter,
  type BaselinePointer,
} from './localBaselineAnchor';
import { decodeLocalBaseline } from './localBaselineRecord';
import { type BaselineStorageOwner } from './localBaselineStorage';
import {
  copyRetentionMaterial,
  reservedRetentionVerifier,
  verifyRetentionPlan,
  type LocalRetentionPlan,
  type RetentionBinding,
  type RetentionInventory,
} from './localRetentionPlan';
import { concat, hex, type Bytes } from './custodyCrypto';
import { eraseVerified } from './verifiedRecords';
import type { SessionTask } from './writeSession';

/** Group only a complete enumerated deletion set, after the transaction census matches.
 * No range/max-sequence inference: omissions, duplicates and foreign stores refuse before writes.
 * This proof must remain even if the planner later supports partial cuts or surviving rows. */
function completeRemovalStores(
  inventory: RetentionInventory,
  deletion: { store: string; key: number }[],
) {
  const selected = new Map<string, Set<number>>();
  for (const row of deletion) {
    if (
      !['content', 'heads', 'outbound'].includes(row.store) ||
      !Number.isSafeInteger(row.key) ||
      row.key < 1
    )
      corrupt('Retention deletion set is not complete.');
    let keys = selected.get(row.store);
    if (!keys) selected.set(row.store, (keys = new Set()));
    if (keys.has(row.key)) corrupt('Retention deletion set repeats a key.');
    keys.add(row.key);
  }
  if (deletion.length !== inventory.rows.length) corrupt('Retention deletion set is not complete.');
  for (const row of inventory.rows)
    if (typeof row.key !== 'number' || !selected.get(row.store)?.delete(row.key))
      corrupt('Retention deletion set differs from its inventory.');
  for (const keys of selected.values())
    if (keys.size) corrupt('Retention deletion set exceeds its inventory.');
  return [...selected.keys()];
}

/** Crypto has completed before entry. All comparisons and writes share one strict transaction. */
function exchange(
  task: SessionTask,
  owner: BaselineStorageOwner,
  counter: ContentCounter | BaselineCounter,
  checkPlan: (actual: RetentionInventory) => void,
  replacement?: { chunks: StoredRecord[]; deleteRows: { store: string; key: number }[] },
) {
  const elapsed = ledgerWorkStart();
  return task.wait(() =>
    contentTransaction<void>(
      owner.db,
      task,
      [...CONTENT_STORES],
      'readwrite',
      (tx, _result, guard) => {
        const actual: RetentionInventory = { rows: [], metadata: [] };
        let remaining = CONTENT_STORES.length;
        for (const name of CONTENT_STORES) {
          const store = tx.objectStore(name),
            values = store.getAll(),
            keys = store.getAllKeys();
          keys.onsuccess = () =>
            guard(() => {
              if (keys.result.length !== values.result.length)
                corrupt('Retention transaction census differs.');
              keys.result.forEach((key, i) => {
                const value = values.result[i];
                if (name === 'meta') actual.metadata.push({ key, value });
                else actual.rows.push({ store: name, key, value });
              });
              if (--remaining) return;
              try {
                measureLedgerWork(
                  replacement ? 'retentionReplaceCensus' : 'retentionReserveCensus',
                  elapsed,
                );
                const compare = ledgerWorkStart();
                checkPlan(actual);
                owner.checkCommit();
                measureLedgerWork(
                  replacement ? 'retentionReplaceCompare' : 'retentionReserveCompare',
                  compare,
                );
                const writes = ledgerWorkStart();
                const stores = replacement
                  ? completeRemovalStores(actual, replacement.deleteRows)
                  : [];
                if (replacement) {
                  replacement.chunks.forEach((row, i) =>
                    tx.objectStore('meta').put(row, baselineChunkKey(i)),
                  );
                  // Exact old metadata keys were compared above. Only obsolete chunk keys are removed.
                  for (const m of actual.metadata)
                    if (Array.isArray(m.key) && Number(m.key[1]) >= replacement.chunks.length)
                      tx.objectStore('meta').delete(m.key);
                  // The complete physical census still matches the exact verified plan in this
                  // transaction. Every key in these stores was individually covered above;
                  // transaction serialization excludes a row appearing between proof and clear.
                  for (const name of stores) tx.objectStore(name).clear();
                }
                tx.objectStore('meta').put(counter, 'counter');
                measureLedgerWork(
                  replacement ? 'retentionReplaceWrites' : 'retentionReserveWrites',
                  writes,
                );
              } finally {
                eraseVerified(actual);
              }
            });
        }
      },
      'strict',
    ),
  );
}

export async function removePlannedLocalHistory(
  task: SessionTask,
  owner: BaselineStorageOwner,
  plan: LocalRetentionPlan,
  binding: RetentionBinding,
): Promise<RetentionInventory> {
  // Snapshot caller-owned parameters before awaiting; callbacks retain their original receiver.
  owner = {
    ...owner,
    identity: { ...owner.identity },
    crypt: {
      open: owner.crypt.open.bind(owner.crypt),
      seal: owner.crypt.seal.bind(owner.crypt),
      sign: owner.crypt.sign.bind(owner.crypt),
      verify: owner.crypt.verify.bind(owner.crypt),
    },
    assertCurrent: owner.assertCurrent.bind(owner),
    checkCommit: owner.checkCommit.bind(owner),
  };
  binding = { ...binding };
  if (!owner.allowReduced) corrupt('Reduced retention writer is disabled.');
  let phase = ledgerWorkStart();
  const evidence = copyRetentionMaterial(plan, binding);
  measureLedgerWork('retentionEvidenceCopy', phase);
  phase = ledgerWorkStart();
  let packed: Bytes | undefined;
  let decoded: ReturnType<typeof decodeLocalBaseline> | undefined;
  const chunks: StoredRecord[] = [];
  try {
    owner.checkCommit();
    const b = (decoded = decodeLocalBaseline(evidence.candidate.baseline.payload));
    const era = b.journalEra ?? corrupt('Retention requires a journal era.');
    const counter = evidence.counter;
    if (
      (['slotId', 'principalId', 'workspaceId', 'storeId', 'rootId'] as const).some(
        (k) => b.identity[k] !== owner.identity[k],
      ) ||
      b.generation !== owner.generation ||
      b.cut.intent !== owner.intent ||
      counter.active_gen !== owner.generation ||
      counter.intent !== owner.intent ||
      !b.journalEra ||
      b.journalEra.revision !== b.revision
    )
      corrupt('Retention generation, intent or era differs.');
    const raw = evidence.rawCounter;
    const prior =
      Number((raw as { v: number }).v) >= 3
        ? parseBaselineCounter(raw, owner.identity, owner.intent, true)
        : undefined;
    if (era.previous !== (prior?.baseline.journalEra?.current ?? null))
      corrupt('Retention era predecessor differs.');
    packed = concat(evidence.candidate.baseline.mac, evidence.candidate.baseline.payload);
    // Released draft-3 whenever it fits; the large carrier only for what draft-3 cannot hold.
    const format = reducedBaselineCarrier(packed.length),
      size = baselineChunkBytes({ format });
    const pointer: BaselinePointer = {
      format,
      history: 'baseline-plus-suffix',
      journalEra: era,
      revision: b.revision,
      commitment: hex(evidence.candidate.baseline.mac),
      generation: owner.generation,
      firstSequence: counter.next_seq,
      chunks: Math.ceil(packed.length / size),
      bytes: packed.length,
    };
    const stored = (c: ContentCounter): ContentCounter | BaselineCounter =>
      prior
        ? ({
            ...c,
            v: baselineVersion(prior.baseline),
            baseline: prior.baseline,
          } as BaselineCounter)
        : c;
    let reserved = stored(reserveCounter(counter, pointer.chunks, owner.generation));
    reserved = {
      ...reserved,
      mac: await owner.crypt.sign(
        task,
        'baseline' in reserved
          ? baselineCounterPayload(owner.identity, reserved)
          : counterPayload(owner.identity, reserved),
      ),
    };
    measureLedgerWork('retentionReservePrepare', phase);
    phase = ledgerWorkStart();
    await task.wait(owner.assertCurrent);
    measureLedgerWork('retentionReserveAuthority', phase);
    phase = ledgerWorkStart();
    await exchange(task, owner, reserved, (actual) => verifyRetentionPlan(plan, actual, binding));
    measureLedgerWork('retentionReserveExchange', phase);
    phase = ledgerWorkStart();
    // Old representation and era remain usable on interruption; this range is now burned.
    const expected = reservedRetentionVerifier(plan, reserved, binding);
    measureLedgerWork('retentionExpectedCopy', phase);
    phase = ledgerWorkStart();
    try {
      for (let i = 0; i < pointer.chunks; i++) {
        const plain = concat(
          baselineChunkPrefix(owner.identity, pointer, i),
          packed.subarray(i * size, (i + 1) * size),
        );
        try {
          const header = {
            v: 1 as const,
            kind: 'heads' as const,
            gen: owner.generation,
            seq: pointer.firstSequence + i,
          };
          const sealed = parseStoredRecord(
            await task.wait(() => owner.crypt.seal(task, header, plain)),
          );
          if (
            sealed.seq !== header.seq ||
            sealed.gen !== header.gen ||
            sealed.kind !== header.kind ||
            sealed.ct.length !== plain.length + 16
          )
            corrupt('Retention seal header differs.');
          chunks.push(sealed);
        } finally {
          plain.fill(0);
        }
      }
      let next = parseBaselineCounter(
        { ...reserved, v: 5, baseline: pointer },
        owner.identity,
        owner.intent,
        true,
      );
      next = {
        ...next,
        mac: await owner.crypt.sign(task, baselineCounterPayload(owner.identity, next)),
      };
      measureLedgerWork('retentionSeal', phase);
      phase = ledgerWorkStart();
      await task.wait(owner.assertCurrent);
      measureLedgerWork('retentionReplaceAuthority', phase);
      phase = ledgerWorkStart();
      await exchange(task, owner, next, expected.verify, {
        chunks,
        deleteRows: evidence.deleteRows,
      });
      measureLedgerWork('retentionReplaceExchange', phase);
      // Caller must authenticate/read back this exact successor before releasing admission.
      return structuredClone({
        rows: [],
        metadata: [
          { key: 'counter', value: next },
          ...chunks.map((value, i) => ({ key: baselineChunkKey(i), value })),
        ],
      });
    } finally {
      expected.dispose();
    }
  } finally {
    const cleanup = ledgerWorkStart();
    packed?.fill(0);
    eraseVerified(decoded);
    eraseVerified(chunks);
    eraseVerified(evidence);
    measureLedgerWork('retentionAdapterCleanup', cleanup);
  }
}
