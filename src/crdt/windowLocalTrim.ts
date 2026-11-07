/** Private final Local commit. Ciphertext census is data authenticated by the owning native Worker;
 * this Window never authenticates content or chooses coverage. It checks exact current disk/journal. */
import { requireWindowLocalCohort, type WindowAccountCohort } from './accountWorkerCohort';
import {
  requireMaintenanceFence,
  type AdmissionCarrier,
  type MaintenanceFence,
} from './admissionQueue';
import {
  CONTENT_STORES,
  MAX_BATCH_BYTES,
  ContentError,
  corrupt,
  equalCounter,
  parseCounter,
  viewStoredRecord,
  recordStore,
  type ContentCounter,
  type ContentIdentity,
  type StoredRecord,
} from './contentRecord';
import { createWorkerFrameReceiver, type WorkerFramePart } from './workerFrameStream';
import { MaintenanceInterrupted } from './contentMaintenance';
import type { createWindowJournalBridge } from './windowJournalBridge';

type RowHeader = Omit<StoredRecord, 'ct'> & {
  store: string;
  key: number;
  total: number;
  covered: boolean;
};
export interface LocalTrimCensus {
  counter: ContentCounter;
  rows: number;
}
const refused = () => Error('Local trim census is no longer its owning maintenance flight');
const integer = (value: number, min: number) => Number.isSafeInteger(value) && value >= min;
/** No application workspace receives this endpoint. One native job owns it until settled/expired. */
export function createWindowLocalTrim(
  cohort: WindowAccountCohort,
  carrier: AdmissionCarrier,
  fence: MaintenanceFence,
  interrupt: AbortSignal,
  scope: ContentIdentity,
  dbName: string,
  generation: number,
  journal: Pick<Awaited<ReturnType<typeof createWindowJournalBridge>>, 'matchesObservation'>,
) {
  requireWindowLocalCohort(cohort);
  requireMaintenanceFence(fence, carrier);
  let state: 'empty' | 'receiving' | 'committing' | 'closed' = 'empty',
    census: LocalTrimCensus | undefined,
    pending:
      | { header: RowHeader; receiver: ReturnType<typeof createWorkerFrameReceiver> }
      | undefined,
    activeTx: IDBTransaction | undefined;
  const rows = new Map<string, { record: Readonly<StoredRecord>; covered: boolean }>();
  const coveredSequences: number[] = [];
  const check = () => {
    requireWindowLocalCohort(cohort);
    requireMaintenanceFence(fence, carrier);
    if (interrupt.aborted) throw new MaintenanceInterrupted();
    if (state === 'closed') throw refused();
  };
  const abort = () => {
    try {
      activeTx?.abort();
    } catch {
      /* settled */
    }
  };
  interrupt.addEventListener('abort', abort);
  cohort.signal.addEventListener('abort', abort);
  const close = () => {
    state = 'closed';
    abort();
    pending?.receiver.close();
    pending = undefined;
    for (const { record } of rows.values()) {
      record.ct.fill(0);
      record.nonce.fill(0);
    }
    rows.clear();
    coveredSequences.length = 0;
    census?.counter.mac.fill(0);
    census = undefined;
    interrupt.removeEventListener('abort', abort);
    cohort.signal.removeEventListener('abort', abort);
  };
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      check();
      let failure: unknown;
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => {
        failure = new ContentError('missing-content', 'Ordinary Local trim never creates storage.');
        request.transaction!.abort();
      };
      request.onblocked = () => {
        failure = new ContentError('storage-failed', 'Local trim open is blocked.');
      };
      request.onerror = () => reject(failure ?? request.error);
      request.onsuccess = () => {
        const db = request.result;
        try {
          check();
          if (failure) throw failure;
          if ([...db.objectStoreNames].sort().join() !== [...CONTENT_STORES].sort().join())
            corrupt();
          // Validate native layout before starting effects. No schema initialization or upgrade.
          const tx = db.transaction([...CONTENT_STORES], 'readonly');
          let layoutFailure: unknown;
          tx.oncomplete = () => {
            try {
              check();
              resolve(db);
            } catch (cause) {
              db.close();
              reject(cause);
            }
          };
          tx.onabort = () => {
            db.close();
            reject(layoutFailure ?? tx.error);
          };
          try {
            for (const name of CONTENT_STORES) {
              const store = tx.objectStore(name);
              if (store.keyPath !== null || store.autoIncrement || store.indexNames.length)
                corrupt();
            }
          } catch (cause) {
            layoutFailure = cause;
            tx.abort();
          }
        } catch (cause) {
          db.close();
          reject(cause);
        }
      };
    });
  return Object.freeze({
    begin(input: LocalTrimCensus) {
      check();
      if (state !== 'empty' || !integer(input.rows, 0)) throw refused();
      const counter = parseCounter(input.counter, scope, input.counter.intent);
      if (counter.active_gen !== generation)
        throw new ContentError('generation-changed', 'Local generation changed.');
      census = { counter, rows: input.rows };
      state = 'receiving';
    },
    row(input: RowHeader) {
      check();
      if (
        state !== 'receiving' ||
        pending ||
        !census ||
        rows.size >= census.rows ||
        !integer(input.key, 1) ||
        !integer(input.total, 16) ||
        input.total > MAX_BATCH_BYTES + 16 ||
        typeof input.covered !== 'boolean' ||
        input.key !== input.seq ||
        input.store !== recordStore(input.kind) ||
        !CONTENT_STORES.includes(input.store as 'content') ||
        (input.covered && input.store !== 'content')
      )
        throw refused();
      const header = { ...input, nonce: input.nonce.slice() };
      // The same pure record validator checks header shape; no bytes authenticate in Window.
      viewStoredRecord({
        v: header.v,
        gen: header.gen,
        seq: header.seq,
        kind: header.kind,
        nonce: header.nonce,
        ct: new Uint8Array(16),
      });
      const key = input.store + ':' + input.key;
      if (rows.has(key)) throw refused();
      pending = {
        header,
        receiver: createWorkerFrameReceiver(
          { frames: 1, total: input.total },
          MAX_BATCH_BYTES + 16,
        ),
      };
    },
    part(input: WorkerFramePart) {
      check();
      if (state !== 'receiving' || !pending) throw refused();
      pending.receiver.accept(input);
      if (input.done) {
        const [ct] = pending.receiver.take(),
          h = pending.header;
        rows.set(h.store + ':' + h.key, {
          record: { v: h.v, gen: h.gen, seq: h.seq, kind: h.kind, nonce: h.nonce, ct: ct! },
          covered: h.covered,
        });
        if (h.covered) coveredSequences.push(h.seq);
        pending = undefined;
      }
    },
    async commit(observation: number): Promise<boolean> {
      check();
      if (state !== 'receiving' || pending || !census || rows.size !== census.rows) throw refused();
      state = 'committing';
      const expected = census,
        db = await open();
      try {
        return await new Promise<boolean>((resolve, reject) => {
          check();
          const tx = db.transaction([...CONTENT_STORES], 'readwrite');
          activeTx = tx;
          let failure: unknown,
            changed = false,
            counterSeen = false,
            count = 0,
            finished = 0,
            deleted = false;
          const guard = (effect: () => void) => {
            try {
              check();
              effect();
            } catch (cause) {
              failure = cause;
              abort();
            }
          };
          const retain = () => {
            changed = true;
            abort();
          };
          tx.onabort = () => {
            activeTx = undefined;
            try {
              check();
            } catch (cause) {
              failure ??= cause;
            }
            if (failure) reject(failure);
            else if (changed) resolve(false);
            else
              reject(
                new ContentError('storage-failed', 'Local trim did not settle.', {
                  cause: tx.error,
                }),
              );
          };
          tx.oncomplete = () => {
            activeTx = undefined;
            if (failure) reject(failure);
            else resolve(deleted);
          };
          const same = (a: StoredRecord, b: Readonly<StoredRecord>) =>
            a.v === b.v &&
            a.gen === b.gen &&
            a.seq === b.seq &&
            a.kind === b.kind &&
            indexedDB.cmp(a.nonce, b.nonce) === 0 &&
            indexedDB.cmp(a.ct, b.ct) === 0;
          const remove = () => {
            if (!counterSeen) corrupt('The content counter disappeared during trim.');
            if (count !== expected.rows) {
              retain();
              return;
            }
            if (!journal.matchesObservation(observation)) {
              retain();
              return;
            }
            const covered = coveredSequences[Symbol.iterator]();
            const next = () => {
              check();
              const entry = covered.next();
              if (entry.done) {
                // Another compatible writer can seal journal while cursor/deletion callbacks run.
                // Abort rolls back every delete if that happened, including after the last one.
                if (!journal.matchesObservation(observation)) {
                  retain();
                  return;
                }
                deleted = true;
                return;
              }
              const request = tx.objectStore('content').delete(entry.value);
              request.onsuccess = () => guard(next);
            };
            next();
          };
          for (const name of CONTENT_STORES) {
            const request = tx.objectStore(name).openCursor();
            request.onsuccess = () =>
              guard(() => {
                const cursor = request.result;
                if (!cursor) {
                  if (++finished === CONTENT_STORES.length) remove();
                  return;
                }
                if (name === 'meta') {
                  if (counterSeen || cursor.key !== 'counter')
                    corrupt('Unknown content metadata during trim.');
                  counterSeen = true;
                  const current = parseCounter(cursor.value, scope, expected.counter.intent);
                  if (current.active_gen !== generation)
                    throw new ContentError(
                      'generation-changed',
                      'Content generation changed before trim.',
                    );
                  if (!equalCounter(scope, current, expected.counter)) {
                    retain();
                    return;
                  }
                } else {
                  const wanted = rows.get(name + ':' + String(cursor.key));
                  const current = viewStoredRecord(cursor.value);
                  if (
                    typeof cursor.key !== 'number' ||
                    !wanted ||
                    current.seq !== cursor.key ||
                    name !== recordStore(current.kind) ||
                    !same(current, wanted.record)
                  ) {
                    retain();
                    return;
                  }
                  count++;
                }
                cursor.continue();
              });
          }
        });
      } finally {
        db.close();
      }
    },
    close,
  });
}
