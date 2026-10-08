import { compactContent, equalStoredRecord, type DiskState } from './contentCompaction';
import { copyRecords, eraseVerified } from './verifiedRecords';
import { rotateContent, type ContentRotation } from './contentRotation';
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
  copyBatch,
  reserveCounter,
  recordStore,
  emptySpoolWitness,
  sameSpoolWitness,
  type SpoolWitness,
  type ContentIdentity,
  type ContentInput,
  type ContentCounter,
  type ContentWitness,
  type StoredRecord,
  type OpenedRecord,
} from './contentRecord';
import type { SessionTask } from './writeSession';

export interface ContentCrypto {
  /** Only the private v9 owner opts into lifetime-local plaintext reuse. Validation still runs. */
  reuseOpened?: true;
  /** Optional private carrier payload validation, including every compaction audit. */
  allowSpoolCounter?: true;
  validate?(
    records: readonly OpenedRecord[],
    task: SessionTask,
    counter: ContentCounter,
    view?: object,
  ): void | Promise<void>;
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
  /** Immutable genesis intent supplied by the composed owner. */
  intent?: string;
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

export const createContentOwner = (
  scope: ContentIdentity,
  generation: number,
  crypt: ContentCrypto,
) => {
  let db: IDBDatabase | undefined, custodyDb: IDBDatabase | undefined;
  let witness!: ContentWitness;
  let openedView:
    | { counter: ContentCounter; sealed: StoredRecord[]; opened: OpenedRecord[]; id: object }
    | undefined;
  const clearView = () => {
    eraseVerified(openedView);
    openedView = undefined;
  };
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
              // Both requests share this readonly transaction and complete in request order.
              // Keep every physical key: bulk collection must not hide placement or missing-row damage.
              const store = tx.objectStore(name),
                values = store.getAll(),
                keys = store.getAllKeys();
              keys.onsuccess = () =>
                guard(() => {
                  if (keys.result.length !== values.result.length)
                    corrupt('Content census differs.');
                  for (let i = 0; i < keys.result.length; i++)
                    state.rows.push({ store: name, key: keys.result[i]!, value: values.result[i] });
                });
            }
        },
      ),
    );
  const currentCounter = async (task: SessionTask): Promise<ContentCounter> => {
    const { counter } = await read(task, false);
    if (!counter)
      throw new ContentError('missing-content', 'The initialized content counter is missing.');
    if (counter.v === 2 && !crypt.allowSpoolCounter) corrupt('Content requires the spool owner.');
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
    checkCommit?: () => void,
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
              checkCommit?.();
              if (next) store.put(next, 'counter');
              for (const record of records)
                tx.objectStore(recordStore(record.kind)).add(record, record.seq);
              result(true);
            });
        },
        'strict',
      ),
    );
  const openSnapshot = async (task: SessionTask, snapshot: DiskState): Promise<OpenedRecord[]> => {
    const counter = snapshot.counter;
    const opened: OpenedRecord[] = [],
      seen = new Set<number>(),
      sealed: StoredRecord[] = [];
    try {
      if (!counter)
        throw new ContentError('missing-content', 'The initialized content counter is missing.');
      if (counter.v === 2 && !crypt.allowSpoolCounter) corrupt('Content requires the spool owner.');
      await verify(task, counterPayload(scope, counter), counter.mac);
      if (counter.active_gen !== generation)
        throw new ContentError('generation-changed', 'Reopen the current content generation.');
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
        sealed.push(r);
      }
      sealed.sort((a, b) => a.seq - b.seq);
      const reuse =
        crypt.reuseOpened &&
        openedView &&
        equalCounter(scope, counter, openedView.counter) &&
        sealed.length === openedView.sealed.length &&
        sealed.every((r, i) => equalStoredRecord(r, openedView!.sealed[i]!));
      if (reuse) opened.push(...copyRecords(openedView!.opened));
      else {
        const prior = new Map(
          crypt.reuseOpened ? openedView?.sealed.map((r, i) => [r.seq, i]) : [],
        );
        for (const r of sealed) {
          const index = prior.get(r.seq),
            previous = index === undefined ? undefined : openedView!.sealed[index];
          opened.push({
            kind: r.kind,
            gen: r.gen,
            seq: r.seq,
            bytes:
              previous && equalStoredRecord(r, previous)
                ? openedView!.opened[index!]!.bytes.slice()
                : await crypt.open(task, r),
          });
        }
      }
      const id = reuse ? openedView!.id : {};
      if (crypt.validate) await task.wait(() => crypt.validate!(opened, task, counter, id));
      if (crypt.reuseOpened && !reuse)
        task.step(() => {
          clearView();
          openedView = {
            id,
            counter: structuredClone(counter),
            sealed: structuredClone(sealed),
            opened: copyRecords(opened),
          };
        });
      return task.step(() => opened.sort((a, b) => a.seq - b.seq));
    } catch (cause) {
      clearView();
      for (const r of opened) r.bytes.fill(0);
      throw cause;
    }
  };
  const load = async (task: SessionTask): Promise<OpenedRecord[]> => {
    try {
      return await openSnapshot(task, await read(task, true));
    } catch (cause) {
      clearView();
      throw cause;
    }
  };
  const appendRecords = async (
    task: SessionTask,
    input: ContentInput[],
    spool?: {
      before: SpoolWitness;
      after: SpoolWitness;
      beforeCommit?: (records: readonly StoredRecord[]) => Promise<void>;
      checkCommit?: () => void;
    },
  ): Promise<StoredRecord[]> => {
    let before!: ContentCounter;
    while (true) {
      before = await currentCounter(task);
      if (
        spool &&
        (!crypt.allowSpoolCounter ||
          before.v !== 2 ||
          !sameSpoolWitness(before.spool, spool.before) ||
          spool.after.events !== spool.before.events + 1)
      )
        corrupt('Spool witness changed before reservation.');
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
      if (spool?.beforeCommit) await task.wait(() => spool.beforeCommit!(records));
      const current = await currentCounter(task);
      if (
        current.next_seq < before.next_seq + input.length ||
        current.reserved[String(generation)]! < before.reserved[String(generation)]! + input.length
      )
        corrupt('A content reservation was rewound.');
      let next: ContentCounter | null = null;
      if (spool) {
        if (current.v !== 2 || !sameSpoolWitness(current.spool, spool.before))
          corrupt('Spool witness changed before commit.');
        next = { ...current, v: 2, spool: { ...spool.after } };
        next = { ...next, mac: await crypt.sign(task, counterPayload(scope, next)) };
      }
      if (await compareAndWrite(task, current, next, records, spool?.checkCommit)) break;
    }
    return records;
  };
  return {
    dispose() {
      clearView();
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
        if (creation.intent !== undefined && !/^[0-9a-f]{32}$/u.test(creation.intent))
          throw new ContentError('invalid-input', 'Genesis requires a 128-bit content intent.');
        if (existing?.state === 'ready')
          throw new ContentError(
            'already-initialized',
            'Content is already initialized; use normal open.',
          );
        const intent = existing?.intent ?? creation.intent ?? hex(random(16));
        if (creation.intent !== undefined && creation.intent !== intent)
          corrupt('Content intent differs from its genesis claim.');
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
    /** Internal applying-owner boundary. This predecessor instance must be disposed after success. */
    async rotate(task: SessionTask, next: ContentRotation) {
      try {
        await rotateContent(
          task,
          {
            db: db!,
            scope,
            generation,
            intent: witness.intent,
            read: () => read(task, true),
            authenticate: (snapshot) => openSnapshot(task, snapshot),
            crypt,
          },
          next,
        );
      } finally {
        clearView();
      }
    },
    /** Internal v7 activation, after its reader fence and before admission. */
    async enableSpool(task: SessionTask) {
      if (!crypt.allowSpoolCounter || !crypt.validate) corrupt('Spool validation is required.');
      const rows = await load(task);
      for (const row of rows) row.bytes.fill(0);
      while (true) {
        const current = await currentCounter(task);
        if (current.v === 2) return;
        let next: ContentCounter = { ...current, v: 2, spool: emptySpoolWitness() };
        next = { ...next, mac: await crypt.sign(task, counterPayload(scope, next)) };
        if (await compareAndWrite(task, current, next)) return;
      }
    },
    async spoolWitness(task: SessionTask): Promise<SpoolWitness> {
      const current = await currentCounter(task);
      if (current.v !== 2) return corrupt('Spool metadata is not activated.');
      return { ...current.spool };
    },
    async appendSpool(
      task: SessionTask,
      input: ContentInput,
      transition: {
        before: SpoolWitness;
        after: SpoolWitness;
        beforeCommit?: (records: readonly StoredRecord[]) => Promise<void>;
      },
    ) {
      await appendRecords(task, [input], transition);
    },
    /** Internal multi-record receive commit. One evidence event and its original content share the witness. */
    async appendInbound(
      task: SessionTask,
      input: readonly ContentInput[],
      transition: {
        before: SpoolWitness;
        after: SpoolWitness;
        beforeCommit: () => Promise<void>;
        checkCommit?: () => void;
      },
    ): Promise<ContentReceipt> {
      const copied = task.step(() => copyBatch(input));
      try {
        if (copied.at(-1)?.kind !== 'heads' || copied.slice(0, -1).some((r) => r.kind !== 'update'))
          corrupt('Invalid receive batch shape');
        const records = await appendRecords(task, copied, transition);
        return Object.freeze({
          storeId: scope.storeId,
          generation,
          sequences: Object.freeze(records.map((r) => r.seq)),
        });
      } finally {
        for (const r of copied) r.bytes.fill(0);
      }
    },
    async append(task: SessionTask, input: ContentInput[]): Promise<ContentReceipt> {
      const records = await appendRecords(task, input);
      return Object.freeze({
        storeId: scope.storeId,
        generation,
        sequences: Object.freeze(records.map((r) => r.seq)),
      });
    },
    compact: (task: SessionTask, checkJournal: () => void) =>
      compactContent(task, {
        scope,
        generation,
        intent: witness.intent,
        db: db!,
        read: () => read(task, true),
        authenticate: (snapshot) => openSnapshot(task, snapshot),
        publish: async (bytes) => (await appendRecords(task, [{ kind: 'state', bytes }]))[0]!,
        checkJournal,
      }),
  };
};
