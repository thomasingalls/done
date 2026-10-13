/** Private exclusive-Account cache guard. Counts/bounds are shape checks, not row authentication. */
import { countLedgerWork } from './accountLedgerMetrics';
import { contentTransaction } from './contentDatabase';
import { equalStoredRecord } from './contentCompaction';
import {
  corrupt,
  parseCounter,
  parseStoredRecord,
  recordStore,
  type ContentCounter,
  type ContentIdentity,
  type StoredRecord,
} from './contentRecord';
import type { SessionTask } from './writeSession';
import { BASELINE_MAX_CHUNKS, baselineChunkKey } from './localBaselineAnchor';

/** Already authenticated immutable metadata, scoped to this owner and baseline revision. */
export interface WarmBaselineMetadata {
  chunks: StoredRecord[];
  parse(value: unknown, intent: string): ContentCounter;
  metadataKeys(keys: IDBValidKey[]): void;
}

const stores = ['content', 'heads', 'outbound'] as const;
type Shape = { count: number; first: IDBValidKey | undefined; last: IDBValidKey | undefined };
export const WARM_AUDIT_ROWS = 256;
export const WARM_AUDIT_MS = 5 * 60 * 1000;
export function createWarmContent(
  scope: ContentIdentity,
  intent: string,
  rows: StoredRecord[],
  baseline?: WarmBaselineMetadata,
) {
  const chunks = baseline?.chunks ?? [];
  const length = () => chunks.length + rows.length;
  const rowAt = (i: number) => (i < chunks.length ? chunks[i]! : rows[i - chunks.length]!);
  const shapes = new Map<string, Shape>(
    stores.map((name) => [name, { count: 0, first: undefined, last: undefined }]),
  );
  const addShape = (row: StoredRecord) => {
    const s = shapes.get(recordStore(row.kind))!;
    s.count++;
    s.first = s.first === undefined ? row.seq : Math.min(s.first as number, row.seq);
    s.last = s.last === undefined ? row.seq : Math.max(s.last as number, row.seq);
  };
  for (const row of rows) addShape(row);
  let cursor = 0,
    target = length(),
    appended = 0,
    completedAt = performance.now();
  return {
    appended(added: readonly StoredRecord[]) {
      for (const row of added) addShape(row);
      appended += added.length;
    },
    due: () => appended >= WARM_AUDIT_ROWS || performance.now() - completedAt >= WARM_AUDIT_MS,
    delay: () =>
      appended >= WARM_AUDIT_ROWS
        ? 0
        : Math.max(0, completedAt + WARM_AUDIT_MS - performance.now()),
    async check(
      db: IDBDatabase,
      task: SessionTask,
    ): Promise<{ counter: ContentCounter; shapeMatches: boolean }> {
      let shapeMatches = true;
      const counter = await task.wait(() =>
        contentTransaction<ContentCounter>(
          db,
          task,
          ['meta', ...stores],
          'readonly',
          (tx, result, guard) => {
            const metadata = tx.objectStore('meta'),
              read = metadata.get('counter');
            read.onsuccess = () =>
              guard(() =>
                result(
                  baseline
                    ? baseline.parse(read.result, intent)
                    : parseCounter(read.result, scope, intent),
                ),
              );
            if (baseline) {
              const keys = metadata.getAllKeys(undefined, BASELINE_MAX_CHUNKS + 2);
              keys.onsuccess = () => guard(() => baseline.metadataKeys(keys.result));
            } else {
              const count = metadata.count();
              count.onsuccess = () =>
                guard(() => {
                  if (count.result !== 1) corrupt('Warm content metadata changed.');
                });
            }
            for (const name of stores) {
              const store = tx.objectStore(name),
                expected = shapes.get(name)!,
                count = store.count(),
                first = store.openKeyCursor(),
                last = store.openKeyCursor(undefined, 'prev');
              count.onsuccess = () =>
                guard(() => {
                  if (count.result !== expected.count) shapeMatches = false;
                });
              first.onsuccess = () =>
                guard(() => {
                  if (first.result?.key !== expected.first) shapeMatches = false;
                });
              last.onsuccess = () =>
                guard(() => {
                  if (last.result?.key !== expected.last) shapeMatches = false;
                });
            }
          },
        ),
      );
      return { counter, shapeMatches };
    },
    /** One bounded slice; captured target prevents ongoing appends moving the finish line. */
    async audit(db: IDBDatabase, task: SessionTask): Promise<boolean> {
      // Include everything committed before this pass starts, not just the previous pass's end.
      if (cursor === 0) target = length();
      const start = cursor;
      let end = start,
        bytes = 0;
      while (
        end < target &&
        end - start < 16 &&
        (end === start || bytes + rowAt(end).ct.length <= 128 * 1024)
      )
        bytes += rowAt(end++).ct.length;
      await task.wait(() =>
        contentTransaction<void>(
          db,
          task,
          baseline ? ['meta', ...stores] : [...stores],
          'readonly',
          (tx, _result, guard) => {
            for (let i = start; i < end; i++) {
              const expected = rowAt(i),
                read =
                  i < chunks.length
                    ? tx.objectStore('meta').get(baselineChunkKey(i))
                    : tx.objectStore(recordStore(expected.kind)).get(expected.seq);
              read.onsuccess = () =>
                guard(() => {
                  countLedgerWork('warmAuditRows');
                  if (read.result?.ct instanceof Uint8Array)
                    countLedgerWork('warmAuditBytes', read.result.ct.length);
                  if (!equalStoredRecord(expected, parseStoredRecord(read.result)))
                    corrupt('Warm content audit mismatch.');
                });
            }
          },
        ),
      );
      task.step(() => {
        cursor = end;
      });
      if (cursor < target) return false;
      task.step(() => {
        cursor = 0;
        target = length();
        appended = 0;
        completedAt = performance.now();
      });
      return true;
    },
  };
}
