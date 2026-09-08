import { deriveStoreName } from './storeName';
/** Internal carrier owner. Only custody constructs its crypto callbacks. No key or reservation escapes. */
import { hex, random, type Bytes } from './custodyCrypto';
import { CUSTODY_STORE, openCustodyDb, recordKey } from './custodyRecord';
import { contentTransaction, openContentDb } from './contentDatabase';
import {
  CONTENT_STORES,
  ContentError,
  corrupt,
  parseCounter,
  parseWitness,
  parseStoredRecord,
  counterPayload,
  witnessPayload,
  equalCounter,
  reserveCounter,
  recordStore,
  type ContentIdentity,
  type ContentInput,
  type ContentCounter,
  type ContentWitness,
  type StoredRecord,
  type OpenedRecord,
} from './contentRecord';
import type { SessionTask } from './writeSession';

export interface ContentCrypto {
  open(task: SessionTask, record: StoredRecord): Promise<Bytes>;
  seal(
    task: SessionTask,
    record: Omit<StoredRecord, 'nonce' | 'ct'>,
    plaintext: Bytes,
  ): Promise<StoredRecord>;
  sign(task: SessionTask, payload: Bytes): Promise<Bytes>;
  verify(task: SessionTask, payload: Bytes, mac: Bytes): Promise<boolean>;
}
export interface ContentCreationOptions {
  signal?: AbortSignal;
  /** Fresh all-other-carrier check under exclusion; not a prior cached census. */
  checkCreation(
    task: SessionTask,
    scope: Readonly<ContentIdentity>,
    intent: string,
    mode: 'fresh' | 'resume',
  ): void | PromiseLike<void>;
}
export interface ContentReceipt {
  readonly storeId: string;
  readonly generation: number;
  readonly sequences: readonly number[];
}
interface DiskRow {
  store: string;
  key: IDBValidKey;
  value: unknown;
}
interface DiskState {
  counter: ContentCounter | null;
  rows: DiskRow[];
}

export const createContentOwner = (
  scope: ContentIdentity,
  generation: number,
  crypt: ContentCrypto,
) => {
  let db: IDBDatabase | undefined, custodyDb: IDBDatabase | undefined;
  let witness!: ContentWitness;
  const key = [...recordKey(scope), 'content-v1'];
  const verify = async (task: SessionTask, payload: Bytes, mac: Bytes) => {
    if (!(await crypt.verify(task, payload, mac)))
      corrupt('Content metadata authentication failed.');
  };
  const readWitness = (task: SessionTask) =>
    task.wait(() =>
      contentTransaction<ContentWitness | null>(
        custodyDb!,
        task,
        [CUSTODY_STORE],
        'readonly',
        (tx, result, guard) => {
          const req = tx.objectStore(CUSTODY_STORE).get(key);
          req.onsuccess = () =>
            guard(() => result(req.result === undefined ? null : parseWitness(req.result)));
        },
      ),
    );
  const writeWitness = async (
    task: SessionTask,
    previous: ContentWitness | null,
    next: ContentWitness,
  ) => {
    next = { ...next, mac: await crypt.sign(task, witnessPayload(scope, next)) };
    await task.wait(() =>
      contentTransaction<void>(
        custodyDb!,
        task,
        [CUSTODY_STORE],
        'readwrite',
        (tx, _result, guard) => {
          const store = tx.objectStore(CUSTODY_STORE),
            req = store.get(key);
          req.onsuccess = () =>
            guard(() => {
              const current = req.result === undefined ? null : parseWitness(req.result);
              if (
                previous === null
                  ? current !== null
                  : !current ||
                    hex(witnessPayload(scope, current)) !== hex(witnessPayload(scope, previous)) ||
                    hex(current.mac) !== hex(previous.mac)
              )
                corrupt('Content initialization changed concurrently.');
              store.put(next, key);
            });
        },
      ),
    );
    return next;
  };
  const read = (task: SessionTask, all: boolean) =>
    task.wait(() =>
      contentTransaction<DiskState>(
        db!,
        task,
        all ? [...CONTENT_STORES] : ['meta'],
        'readonly',
        (tx, result, guard) => {
          const state: DiskState = { counter: null, rows: [] };
          result(state);
          const req = tx.objectStore('meta').openCursor();
          let seen = false;
          req.onsuccess = () =>
            guard(() => {
              const c = req.result;
              if (!c) return;
              if (seen || c.key !== 'counter') corrupt('Unknown content metadata.');
              seen = true;
              state.counter = parseCounter(c.value, scope, witness.intent);
              c.continue();
            });
          if (all)
            for (const name of ['content', 'heads', 'outbound']) {
              const scan = tx.objectStore(name).openCursor();
              scan.onsuccess = () =>
                guard(() => {
                  const c = scan.result;
                  if (c) {
                    state.rows.push({ store: name, key: c.key, value: c.value });
                    c.continue();
                  }
                });
            }
        },
      ),
    );
  const currentCounter = async (task: SessionTask): Promise<ContentCounter> => {
    const { counter } = await read(task, false);
    if (!counter)
      throw new ContentError('missing-content', 'The initialized content counter is missing.');
    await verify(task, counterPayload(scope, counter), counter.mac);
    return counter;
  };
  // Crypto cannot await inside IDB transactions. Authenticate a read, then compare
  // those exact bytes under serialization; retry a conflicting read before using it.
  const compareAndWrite = (
    task: SessionTask,
    expected: ContentCounter,
    next: ContentCounter | null,
    records: StoredRecord[] = [],
  ) =>
    task.wait(() =>
      contentTransaction<boolean>(
        db!,
        task,
        [...CONTENT_STORES],
        'readwrite',
        (tx, result, guard) => {
          result(false);
          const store = tx.objectStore('meta'),
            req = store.get('counter');
          req.onsuccess = () =>
            guard(() => {
              const current = parseCounter(req.result, scope, witness.intent);
              if (!equalCounter(scope, current, expected)) return;
              if (current.active_gen !== generation)
                throw new ContentError(
                  'generation-changed',
                  'The content generation changed before commit.',
                );
              if (next) store.put(next, 'counter');
              for (const record of records)
                tx.objectStore(recordStore(record.kind)).add(record, record.seq);
              result(true);
            });
        },
      ),
    );
  const load = async (task: SessionTask): Promise<OpenedRecord[]> => {
    const snapshot = await read(task, true),
      counter = snapshot.counter;
    if (!counter)
      throw new ContentError('missing-content', 'The initialized content counter is missing.');
    await verify(task, counterPayload(scope, counter), counter.mac);
    if (counter.active_gen !== generation)
      throw new ContentError('generation-changed', 'Reopen the current content generation.');
    const opened: OpenedRecord[] = [],
      seen = new Set<number>();
    try {
      for (const row of snapshot.rows) {
        const r = parseStoredRecord(row.value);
        if (
          row.key !== r.seq ||
          row.store !== recordStore(r.kind) ||
          seen.has(r.seq) ||
          r.seq >= counter.next_seq ||
          r.gen > counter.active_gen ||
          !counter.reserved[String(r.gen)]
        )
          corrupt('Record placement or allocation is inconsistent.');
        seen.add(r.seq);
        opened.push({ kind: r.kind, gen: r.gen, seq: r.seq, bytes: await crypt.open(task, r) });
      }
      return task.step(() => opened.sort((a, b) => a.seq - b.seq));
    } catch (cause) {
      for (const r of opened) r.bytes.fill(0);
      throw cause;
    }
  };
  return {
    dispose() {
      db?.close();
      db = undefined;
      custodyDb?.close();
      custodyDb = undefined;
    },
    async initialize(task: SessionTask, creation?: ContentCreationOptions) {
      await task.wait(async () => {
        custodyDb = await openCustodyDb();
      });
      const existing = await readWitness(task);
      if (existing) await verify(task, witnessPayload(scope, existing), existing.mac);
      if (creation) {
        if (existing?.state === 'ready')
          throw new ContentError(
            'already-initialized',
            'Content is already initialized; use normal open.',
          );
        const intent = existing?.intent ?? hex(random(16));
        await task.wait(() =>
          creation.checkCreation(
            task,
            Object.freeze({ ...scope }),
            intent,
            existing ? 'resume' : 'fresh',
          ),
        );
        witness =
          existing ??
          (await writeWitness(task, null, {
            v: 1,
            state: 'creating',
            intent,
            mac: new Uint8Array(32),
          }));
      } else {
        if (!existing)
          throw new ContentError('missing-content', 'Content has no initialization witness.');
        if (existing.state !== 'ready')
          throw new ContentError(
            'creation-pending',
            'Resume content initialization before normal open.',
          );
        witness = existing;
      }
      const name = await task.wait(() => deriveStoreName(scope.principalId, scope.workspaceId));
      await task.wait(async () => {
        db = await openContentDb(task, name, Boolean(creation));
      });
      if (creation) {
        const snapshot = await read(task, true);
        if (snapshot.rows.length) corrupt('Content exists beside unfinished initialization.');
        if (snapshot.counter) {
          await verify(task, counterPayload(scope, snapshot.counter), snapshot.counter.mac);
          if (snapshot.counter.next_seq !== 1 || snapshot.counter.active_gen !== generation)
            corrupt('Unfinished initialization has used reservations.');
        } else {
          let initial: ContentCounter = {
            v: 1,
            store_id: scope.storeId,
            intent: witness.intent,
            active_gen: generation,
            next_seq: 1,
            reserved: { [generation]: 0 },
            mac: new Uint8Array(32),
          };
          initial = { ...initial, mac: await crypt.sign(task, counterPayload(scope, initial)) };
          await task.wait(() =>
            contentTransaction<void>(
              db!,
              task,
              [...CONTENT_STORES],
              'readwrite',
              (tx, _result, guard) => {
                // The exclusive permit excludes conforming writers; check all rows again
                // in the installing transaction so even a changed carrier is not replaced.
                for (const name of CONTENT_STORES) {
                  const req = tx.objectStore(name).count();
                  req.onsuccess = () =>
                    guard(() => {
                      if (req.result) corrupt('Carrier changed during initialization.');
                    });
                }
                tx.objectStore('meta').add(initial, 'counter');
              },
            ),
          );
        }
        witness = await writeWitness(task, witness, { ...witness, state: 'ready' });
      } else {
        // No normal-open capability is returned over a partly readable store.
        const validated = await load(task);
        for (const record of validated) record.bytes.fill(0);
      }
      custodyDb!.close();
      custodyDb = undefined;
    },
    load,
    async append(task: SessionTask, input: ContentInput[]): Promise<ContentReceipt> {
      let before!: ContentCounter;
      while (true) {
        before = await currentCounter(task);
        let next = reserveCounter(before, input.length, generation);
        next = { ...next, mac: await crypt.sign(task, counterPayload(scope, next)) };
        if (await compareAndWrite(task, before, next)) break;
      }
      // This range has completed durably. Every attempt consumes exactly one
      // invocation per record; a failure/retry abandons it and reserves a new range.
      const records: StoredRecord[] = [];
      for (const [i, value] of input.entries())
        records.push(
          await crypt.seal(
            task,
            { v: 1, gen: generation, seq: before.next_seq + i, kind: value.kind },
            value.bytes,
          ),
        );
      while (true) {
        const current = await currentCounter(task);
        if (
          current.next_seq < before.next_seq + input.length ||
          current.reserved[String(generation)]! <
            before.reserved[String(generation)]! + input.length
        )
          corrupt('A content reservation was rewound.');
        if (await compareAndWrite(task, current, null, records)) break;
      }
      return Object.freeze({
        storeId: scope.storeId,
        generation,
        sequences: Object.freeze(records.map((r) => r.seq)),
      });
    },
  };
};
