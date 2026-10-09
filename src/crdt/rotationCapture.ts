/** Preserve exact journal source capsules and their original updates before switching generations. */
import {
  captureCatalog,
  decodeSourceCapsule,
  eraseCapsule,
  type CaptureRoute,
} from './sourceCapture';
import { hex, type Bytes } from './custodyCrypto';
import type { SessionTask } from './writeSession';
import type { createContentOwner } from './contentStore';
import type { OpenedRecord } from './contentRecord';
export async function persistRotationJournal(
  task: SessionTask,
  owner: ReturnType<typeof createContentOwner>,
  route: CaptureRoute,
  storeId: string,
  sourceRecords: (records: OpenedRecord[]) => OpenedRecord[],
  values: readonly Bytes[],
) {
  const records = await owner.load(task);
  const sequences: number[] = [];
  try {
    const catalog = captureCatalog(sourceRecords(records), route);
    for (const bytes of values) {
      const capsule = decodeSourceCapsule(bytes, route);
      try {
        const prior = catalog.get(capsule.id);
        if (prior && hex(prior) !== hex(bytes)) throw Error('Conflicting journal source identity');
        if (prior) continue;
        const batch = [
          ...capsule.sources.map((s) => ({ kind: 'update' as const, bytes: s.bytes })),
          { kind: 'outbound' as const, bytes },
        ];
        sequences.push(...(await owner.append(task, batch)).sequences);
        catalog.set(capsule.id, bytes);
      } finally {
        eraseCapsule(capsule);
      }
    }
    return { storeId, generation: 1, sequences };
  } finally {
    for (const r of records) r.bytes.fill(0);
  }
}
