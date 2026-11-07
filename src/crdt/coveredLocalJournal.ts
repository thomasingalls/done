/** Retirement data comparison only. Caller independently owns fresh source/target authentication.
 * No snapshot, hash bucket or result here authorizes storage mutation or application. */
import { createCpuBudget, type CpuCheckpoint } from './cpuBudget';
import { sameBytes } from './verifiedRecords';
import { ContentError, type OpenedRecord } from './contentRecord';
import { requireExclusiveSessionTask, type SessionTask } from './writeSession';
import type { JournalUpdate } from './journalStore';
async function bucket(bytes: Uint8Array, checkpoint: CpuCheckpoint): Promise<string> {
  // Non-cryptographic candidate filter ONLY. Every collision still requires full byte equality.
  let hash = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    hash = Math.imul(hash ^ bytes[i]!, 16777619) >>> 0;
    if ((i & 65535) === 0) {
      const pause = checkpoint();
      if (pause) await pause;
    }
  }
  return bytes.length + ':' + hash;
}
export async function assertCoveredLocalJournal(
  task: SessionTask,
  slotId: string,
  entries: readonly JournalUpdate[],
  verifiedTarget: readonly OpenedRecord[],
): Promise<void> {
  requireExclusiveSessionTask(task, slotId);
  const checkpoint = createCpuBudget(() => requireExclusiveSessionTask(task, slotId)),
    candidates = new Map<string, Uint8Array[]>();
  for (const record of verifiedTarget) {
    const pause = checkpoint();
    if (pause) await pause;
    if (record.kind !== 'update') continue;
    const key = await bucket(record.bytes, checkpoint),
      values = candidates.get(key);
    if (values) values.push(record.bytes);
    else candidates.set(key, [record.bytes]);
  }
  for (const entry of entries) {
    const pause = checkpoint();
    if (pause) await pause;
    const values = candidates.get(await bucket(entry.bytes, checkpoint));
    if (!values?.some((value) => sameBytes(value, entry.bytes)))
      throw new ContentError(
        'repair-required',
        'A retained source journal update is not in the protected copy.',
      );
  }
  requireExclusiveSessionTask(task, slotId);
}
