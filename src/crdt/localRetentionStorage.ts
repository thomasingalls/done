/** Private atomic reclamation. A verified ephemeral plan is required; never accepts a range. */
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
  REDUCED_BASELINE_CARRIER,
  BASELINE_CHUNK_BYTES,
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
  assertRetentionInventory,
  inspectRetentionPlan,
  verifyRetentionPlan,
  type LocalRetentionPlan,
  type RetentionBinding,
  type RetentionInventory,
} from './localRetentionPlan';
import { concat, hex, type Bytes } from './custodyCrypto';
import { eraseVerified } from './verifiedRecords';
import type { SessionTask } from './writeSession';

/** Crypto has completed before entry. All comparisons and writes share one strict transaction. */
function exchange(
  task: SessionTask,
  owner: BaselineStorageOwner,
  expected: RetentionInventory,
  counter: ContentCounter | BaselineCounter,
  checkPlan: () => void,
  replacement?: { chunks: StoredRecord[]; deleteRows: { store: string; key: number }[] },
) {
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
                assertRetentionInventory(expected, actual);
                checkPlan();
                owner.checkCommit();
                if (replacement) {
                  replacement.chunks.forEach((row, i) =>
                    tx.objectStore('meta').put(row, baselineChunkKey(i)),
                  );
                  // Exact old metadata keys were compared above. Only obsolete chunk keys are removed.
                  for (const m of expected.metadata)
                    if (Array.isArray(m.key) && Number(m.key[1]) >= replacement.chunks.length)
                      tx.objectStore('meta').delete(m.key);
                  for (const row of replacement.deleteRows)
                    tx.objectStore(row.store).delete(row.key);
                }
                tx.objectStore('meta').put(counter, 'counter');
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
  const evidence = inspectRetentionPlan(plan);
  let packed: Bytes | undefined;
  let decoded: ReturnType<typeof decodeLocalBaseline> | undefined;
  const chunks: StoredRecord[] = [];
  try {
    const check = () => verifyRetentionPlan(plan, evidence.inventory, binding);
    check();
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
    const raw = evidence.inventory.metadata.find((m) => m.key === 'counter')!.value;
    const prior =
      Number((raw as { v: number }).v) >= 3
        ? parseBaselineCounter(raw, owner.identity, owner.intent, true)
        : undefined;
    if (era.previous !== (prior?.baseline.journalEra?.current ?? null))
      corrupt('Retention era predecessor differs.');
    packed = concat(evidence.candidate.baseline.mac, evidence.candidate.baseline.payload);
    const pointer: BaselinePointer = {
      format: REDUCED_BASELINE_CARRIER,
      history: 'baseline-plus-suffix',
      journalEra: era,
      revision: b.revision,
      commitment: hex(evidence.candidate.baseline.mac),
      generation: owner.generation,
      firstSequence: counter.next_seq,
      chunks: Math.ceil(packed.length / BASELINE_CHUNK_BYTES),
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
    await task.wait(owner.assertCurrent);
    await exchange(task, owner, evidence.inventory, reserved, check);
    // Old representation and era remain usable on interruption; this range is now burned.
    const expected = structuredClone(evidence.inventory);
    try {
      expected.metadata.find((m) => m.key === 'counter')!.value = reserved;
      for (let i = 0; i < pointer.chunks; i++) {
        const plain = concat(
          baselineChunkPrefix(owner.identity, pointer, i),
          packed.subarray(i * BASELINE_CHUNK_BYTES, (i + 1) * BASELINE_CHUNK_BYTES),
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
      await task.wait(owner.assertCurrent);
      await exchange(task, owner, expected, next, check, {
        chunks,
        deleteRows: evidence.deleteRows,
      });
      // Caller must authenticate/read back this exact successor before releasing admission.
      return structuredClone({
        rows: [],
        metadata: [
          { key: 'counter', value: next },
          ...chunks.map((value, i) => ({ key: baselineChunkKey(i), value })),
        ],
      });
    } finally {
      eraseVerified(expected);
    }
  } finally {
    packed?.fill(0);
    eraseVerified(decoded);
    eraseVerified(chunks);
    eraseVerified(evidence);
  }
}
