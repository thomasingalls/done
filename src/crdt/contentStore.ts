import { createWarmContent, WARM_AUDIT_MS } from './warmContent';
import { MaintenanceInterrupted } from './contentMaintenance';
import { withContentSelection, type ContentSelection } from './contentSelection';
import {
  countLedgerWork,
  ledgerProfiling,
  ledgerWorkStart,
  measureLedgerWork,
  measureLedger,
} from './accountLedgerMetrics';
import { compactContent, equalStoredRecord, type DiskState } from './contentCompaction';
import { copyRecords, eraseVerified } from './verifiedRecords';
import {
  rotateContent,
  initializeEmptyAccountGeneration,
  type ContentRotation,
} from './contentRotation';
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
import type { BaselineAuthentication, LocalReplayInput } from './localBaselineReplay';

export interface ContentCrypto {
  /** Account owners opt into lifetime-local plaintext reuse. The validation callback still runs. */
  reuseOpened?: true;
  /** Private exclusive Account lifetime only; generic/shared Local owners must not opt in. */
  warmLoads?: true;
  /** Private v9 validator: reads retained input immutably and owns any bytes it retains. */
  selectiveLoads?: true;
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
  let warm: ReturnType<typeof createWarmContent> | undefined;
  let forceFullRead = false;
  const canSelect = !!(
    crypt.selectiveLoads &&
    crypt.warmLoads &&
    crypt.reuseOpened &&
    crypt.validate
  );
  const clearView = () => {
    warm = undefined;
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
      if (crypt.warmLoads && openedView)
        warm = createWarmContent(scope, witness.intent, openedView.sealed);
      return task.step(() => opened.sort((a, b) => a.seq - b.seq));
    } catch (cause) {
      // Interruption is not failed authentication. Retain only the previous detached view;
      // Reference loads compare every sealed row; exclusive warm loads use the authenticated
      // counter/shape guard and bounded rolling audit.
      if (!(cause instanceof MaintenanceInterrupted)) clearView();
      for (const r of opened) r.bytes.fill(0);
      throw cause;
    }
  };
  function load(task: SessionTask): Promise<OpenedRecord[]>;
  function load<T>(task: SessionTask, select: (lease: ContentSelection) => T): Promise<T>;
  async function load<T>(
    task: SessionTask,
    select?: (lease: ContentSelection) => T,
  ): Promise<OpenedRecord[] | T> {
    if (select && !canSelect) throw Error('Content selection requires the private Account owner');
    const selected = () => {
      const view = openedView;
      if (!view) throw Error('No retained content view');
      const result = withContentSelection(
        task,
        view.id,
        () => openedView === view && !forceFullRead,
        select!,
      );
      countLedgerWork('selectedLoads');
      return result;
    };
    countLedgerWork('loads');
    const began = ledgerWorkStart();
    try {
      if (crypt.warmLoads && openedView && warm && !forceFullRead) {
        const at = ledgerWorkStart();
        const checked = await warm.check(db!, task);
        measureLedgerWork('warmShapeCheck', at);
        await verify(task, counterPayload(scope, checked.counter), checked.counter.mac);
        if (equalCounter(scope, checked.counter, openedView.counter) && !forceFullRead) {
          if (!checked.shapeMatches) corrupt('Warm content shape changed.');
          await warm.audit(db!, task);
          // Only the opted-in private validator borrows retained input. Selection callers receive
          // an opaque lease, never these rows. Ordinary load callers keep independent copies.
          const borrowed = !!select;
          const result = borrowed ? openedView.opened : copyRecords(openedView.opened);
          try {
            if (crypt.validate)
              await task.wait(() => crypt.validate!(result, task, checked.counter, openedView!.id));
            if (forceFullRead) {
              if (!borrowed) for (const row of result) row.bytes.fill(0);
              return select ? await load(task, select) : await load(task);
            }
            countLedgerWork('warmLoads');
            if (select) return selected();
            return task.step(() => result);
          } catch (cause) {
            if (!borrowed) for (const row of result) row.bytes.fill(0);
            throw cause;
          }
        }
      }
      forceFullRead = false;
      const at = ledgerWorkStart();
      const snapshot = await read(task, true);
      measureLedgerWork('physicalRead', at);
      countLedgerWork('loadedRows', snapshot.rows.length);
      const result = await openSnapshot(task, snapshot);
      if (ledgerProfiling)
        countLedgerWork(
          'loadedBytes',
          result.reduce((n, r) => n + r.bytes.length, 0),
        );
      if (forceFullRead) {
        for (const row of result) row.bytes.fill(0);
        return select ? await load(task, select) : await load(task);
      }
      if (select) {
        try {
          return selected();
        } finally {
          for (const row of result) row.bytes.fill(0);
        }
      }
      return result;
    } catch (cause) {
      // Interruption is not failed authentication. Retain only the previous detached view;
      // Reference loads compare every sealed row; exclusive warm loads use the authenticated
      // counter/shape guard and bounded rolling audit.
      if (!(cause instanceof MaintenanceInterrupted)) clearView();
      throw cause;
    } finally {
      measureLedgerWork('loadElapsed', began);
    }
  }
  const appendRecords = async (
    task: SessionTask,
    input: ContentInput[],
    spool?: {
      before: SpoolWitness;
      after: SpoolWitness;
      events?: number;
      beforeCommit?: (records: readonly StoredRecord[]) => Promise<void>;
      checkCommit?: () => void;
    },
  ): Promise<StoredRecord[]> => {
    let before!: ContentCounter, reserved!: ContentCounter;
    const plaintexts = crypt.warmLoads ? input.map((row) => row.bytes.slice()) : [];
    try {
      while (true) {
        before = await currentCounter(task);
        if (
          spool &&
          (!crypt.allowSpoolCounter ||
            before.v !== 2 ||
            !sameSpoolWitness(before.spool, spool.before) ||
            spool.after.events !== spool.before.events + (spool.events ?? 1))
        )
          corrupt('Spool witness changed before reservation.');
        let next = reserveCounter(before, input.length, generation);
        next = { ...next, mac: await crypt.sign(task, counterPayload(scope, next)) };
        if (await compareAndWrite(task, before, next)) {
          reserved = next;
          // Reservation changes authenticated metadata, not the committed rows. Retain
          // only an exact owned predecessor so pre-commit loads can still authenticate
          // the counter, check shape and audit without rereading all old rows. Never
          // advance the semantic identity or clear a pending full-read invalidation.
          if (
            crypt.warmLoads &&
            warm &&
            openedView &&
            equalCounter(scope, openedView.counter, before)
          )
            task.step(() => {
              openedView!.counter = structuredClone(reserved);
            });
          break;
        }
      }
      // This range has completed durably. Every attempt consumes exactly one
      // invocation per record; a failure/retry abandons it and reserves a new range.
      const records: StoredRecord[] = [];
      for (const [i, value] of input.entries())
        records.push(
          await crypt.seal(
            task,
            { v: 1, gen: generation, seq: before.next_seq + i, kind: value.kind },
            plaintexts[i] ?? value.bytes,
          ),
        );
      while (true) {
        if (spool?.beforeCommit) await task.wait(() => spool.beforeCommit!(records));
        const current = await currentCounter(task);
        if (
          current.next_seq < before.next_seq + input.length ||
          current.reserved[String(generation)]! <
            before.reserved[String(generation)]! + input.length
        )
          corrupt('A content reservation was rewound.');
        let next: ContentCounter | null = null;
        if (spool) {
          if (current.v !== 2 || !sameSpoolWitness(current.spool, spool.before))
            corrupt('Spool witness changed before commit.');
          next = { ...current, v: 2, spool: { ...spool.after } };
          next = { ...next, mac: await crypt.sign(task, counterPayload(scope, next)) };
        }
        if (await compareAndWrite(task, current, next, records, spool?.checkCommit)) {
          // Only an owned, completed commit extends this private view. A reservation is not a row.
          if (
            crypt.warmLoads &&
            warm &&
            openedView &&
            records.every((row) => row.seq > (openedView!.sealed.at(-1)?.seq ?? 0)) &&
            (equalCounter(scope, openedView.counter, current) ||
              (equalCounter(scope, openedView.counter, before) &&
                equalCounter(scope, current, reserved)))
          ) {
            task.step(() => {
              const added = structuredClone(records);
              warm!.appended(added);
              openedView!.sealed.push(...added);
              openedView!.opened.push(
                ...records.map((r, i) => ({
                  kind: r.kind,
                  gen: r.gen,
                  seq: r.seq,
                  bytes: plaintexts[i]!.slice(),
                })),
              );
              openedView!.counter = structuredClone(next ?? current);
              openedView!.id = {};
            });
          } else if (crypt.warmLoads) clearView();
          break;
        }
      }
      return records;
    } catch (cause) {
      clearView();
      throw cause;
    } finally {
      for (const bytes of plaintexts) bytes.fill(0);
    }
  };
  return {
    dispose() {
      clearView();
      db?.close();
      db = undefined;
      custodyDb?.close();
      custodyDb = undefined;
    },
    async initialize(
      task: SessionTask,
      creation?: ContentCreationOptions,
      initialAccount?: () => void,
    ) {
      if (creation && initialAccount)
        corrupt('Account initialization requires an existing empty carrier.');
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
        if (initialAccount)
          await initializeEmptyAccountGeneration(
            task,
            {
              db: db!,
              scope,
              generation,
              intent: witness.intent,
              read: () => read(task, true),
              crypt,
            },
            initialAccount,
          );
        const validated = await load(task);
        for (const record of validated) record.bytes.fill(0);
      }
      custodyDb!.close();
      custodyDb = undefined;
    },
    load: (task: SessionTask) => load(task),
    /** Private shadow experiment: a complete physical read, never a warm selection or a write.
     * The composed owner supplies exclusion, journal eligibility and fresh custody checks. */
    async withBaselineCensus<T>(
      task: SessionTask,
      operation: (
        input: LocalReplayInput,
        identity: ContentIdentity,
        auth: BaselineAuthentication,
      ) => Promise<T>,
    ): Promise<T> {
      if (!crypt.allowSpoolCounter || !crypt.validate) throw Error('Account owner required');
      const { assertBaselineAuthenticationMessage } = await task.wait(
        () => import('./localBaselineRecord'),
      );
      const snapshot = await read(task, true);
      const records = await openSnapshot(task, snapshot);
      let active = true;
      const checked = (message: Bytes) =>
        task.step(() => {
          if (!active) throw Error('Baseline census expired');
          assertBaselineAuthenticationMessage(message);
          return message.slice();
        });
      const auth: BaselineAuthentication = {
        async sign(message) {
          const copy = checked(message);
          try {
            return await crypt.sign(task, copy);
          } finally {
            copy.fill(0);
          }
        },
        async verify(message, mac) {
          const copy = checked(message),
            seal = mac.slice();
          try {
            return await crypt.verify(task, copy, seal);
          } finally {
            copy.fill(0);
            seal.fill(0);
          }
        },
      };
      try {
        return await task.wait(() =>
          operation({ records, counter: structuredClone(snapshot.counter!) }, { ...scope }, auth),
        );
      } finally {
        active = false;
        for (const row of records) row.bytes.fill(0);
      }
    },
    canSelect,
    select: <T>(task: SessionTask, select: (lease: ContentSelection) => T) => load(task, select),
    invalidateWarm() {
      forceFullRead = true;
    },
    warmAuditDue: () => Boolean(warm?.due()),
    warmAuditDelay: () => warm?.delay() ?? WARM_AUDIT_MS,
    /** One background slice. Caller serializes slices with ordinary storage jobs. */
    async auditWarm(task: SessionTask): Promise<boolean> {
      try {
        if (!warm || !openedView) return true;
        if (forceFullRead) {
          const rows = await load(task);
          for (const row of rows) row.bytes.fill(0);
          return true;
        }
        const checked = await warm.check(db!, task);
        await verify(task, counterPayload(scope, checked.counter), checked.counter.mac);
        if (!equalCounter(scope, checked.counter, openedView.counter)) {
          forceFullRead = true;
          const rows = await load(task);
          for (const row of rows) row.bytes.fill(0);
          return true;
        }
        if (!checked.shapeMatches) corrupt('Warm content shape changed.');
        return await warm.audit(db!, task);
      } catch (cause) {
        clearView();
        throw cause;
      }
    },
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
    /** Internal receive commit. Original content/evidence pairs share one atomic witness transition. */
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
        if (
          copied.at(-1)?.kind !== 'heads' ||
          copied.some((r) => r.kind !== 'update' && r.kind !== 'heads')
        )
          corrupt('Invalid receive batch shape');
        const events = copied.filter((r) => r.kind === 'heads').length;
        const records = await appendRecords(task, copied, { ...transition, events });
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
    compact: async (task: SessionTask, checkJournal: () => void) => {
      const began = performance.now();
      try {
        // Compaction owns an independent exact census; its row deletions invalidate warm shapes.
        warm = undefined;
        return await compactContent(task, {
          scope,
          generation,
          intent: witness.intent,
          db: db!,
          read: () => read(task, true),
          authenticate: (snapshot) => openSnapshot(task, snapshot),
          publish: async (bytes) => (await appendRecords(task, [{ kind: 'state', bytes }]))[0]!,
          checkJournal,
        });
      } finally {
        warm = undefined;
        measureLedger('compaction', began);
      }
    },
  };
};
