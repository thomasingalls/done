import type { AccountBaselineRead } from './localBaselineShadow';
import type { createBaselineReuse } from './localBaselineReuse';
import { StorageCompatibilityError } from './storageCompatibility';
import type { RetentionInventory } from './localRetentionPlan';
import { BASELINE_MAX_CHUNKS } from './localBaselineAnchor';
import { createBaselineMetadata } from './localBaselineMetadata';
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
  parseCounter as parseOrdinaryCounter,
  parseWitness,
  parseStoredRecord,
  counterPayload as ordinaryCounterPayload,
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
import type {
  BaselineAuthentication,
  LocalReplayInput,
  LocalBaselineContext,
} from './localBaselineReplay';

export interface ContentCrypto {
  /** Non-deleting experiment: logical reads require an authenticated journal era. */
  readBaseline?: true;
  /** Explicit non-deleting v9 experiment only. Builds a context after a fresh authority check. */
  baseline?(
    task: SessionTask,
    identity: ContentIdentity,
    counter: ContentCounter,
  ): Promise<LocalBaselineContext>;
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
    baseline?: AccountBaselineRead,
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
  if (
    crypt.readBaseline &&
    !(crypt.baseline && crypt.reuseOpened && crypt.validate && crypt.allowSpoolCounter)
  )
    throw Error('Logical Account reads require an owned baseline verifier.');
  let db: IDBDatabase | undefined, custodyDb: IDBDatabase | undefined;
  let witness!: ContentWitness;
  const allowReduced = !!(
    crypt.readBaseline && import.meta.env?.['VITE_ACCOUNT_RETENTION'] === '1'
  );
  const metadata = crypt.baseline ? createBaselineMetadata(scope, allowReduced) : undefined;
  const parseCounter = (value: unknown, identity: ContentIdentity, intent: string) =>
    metadata ? metadata.parse(value, intent) : parseOrdinaryCounter(value, identity, intent);
  const counterPayload = (identity: ContentIdentity, counter: ContentCounter) =>
    metadata ? metadata.payload(counter) : ordinaryCounterPayload(identity, counter);
  const baselineAuth = (task: SessionTask): BaselineAuthentication => ({
    sign: (bytes) => crypt.sign(task, bytes),
    verify: (bytes, mac) => crypt.verify(task, bytes, mac),
  });
  const baselineOwner = (assertCurrent: () => Promise<void>, checkCommit: () => void) => ({
    db: db!,
    allowReduced,
    identity: scope,
    generation,
    intent: witness.intent,
    crypt,
    assertCurrent,
    checkCommit,
  });
  let openedView:
    | {
        counter: ContentCounter;
        sealed: StoredRecord[];
        opened: OpenedRecord[];
        id: object;
        baseline?: AccountBaselineRead;
        baselineChunks?: StoredRecord[];
      }
    | undefined;
  let warm: ReturnType<typeof createWarmContent> | undefined;
  let baselineReuse: Awaited<ReturnType<typeof createBaselineReuse>> | undefined;
  let forceFullRead = false;
  const canSelect = !!(
    crypt.selectiveLoads &&
    crypt.warmLoads &&
    crypt.reuseOpened &&
    crypt.validate
  );
  const clearView = () => {
    baselineReuse?.clear();
    baselineReuse = undefined;
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
          const meta = tx.objectStore('meta'),
            keys = meta.getAllKeys(undefined, BASELINE_MAX_CHUNKS + 2),
            req = meta.get('counter');
          req.onsuccess = () =>
            guard(() => {
              if (req.result !== undefined)
                state.counter = parseCounter(req.result, scope, witness.intent);
              if (state.counter && metadata) metadata.metadataKeys(keys.result);
              else if (keys.result.some((key) => key !== 'counter'))
                corrupt('Unknown content metadata.');
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
  // Capture raw metadata and exact physical keys in one snapshot. Unlike ordinary loads this
  // intentionally retains the authenticated pointer/chunks rather than a semantic counter view.
  const retentionInventory = (task: SessionTask) =>
    task.wait(() =>
      contentTransaction<RetentionInventory>(
        db!,
        task,
        [...CONTENT_STORES],
        'readonly',
        (tx, result, guard) => {
          const inventory: RetentionInventory = { rows: [], metadata: [] };
          result(inventory);
          for (const name of CONTENT_STORES) {
            const store = tx.objectStore(name),
              values = store.getAll(),
              keys = store.getAllKeys();
            keys.onsuccess = () =>
              guard(() => {
                if (keys.result.length !== values.result.length)
                  corrupt('Retention census differs.');
                keys.result.forEach((key, i) => {
                  const value = values.result[i];
                  if (name === 'meta') inventory.metadata.push({ key, value });
                  else inventory.rows.push({ store: name, key, value });
                });
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
              if (next) store.put(metadata?.stored(next) ?? next, 'counter');
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
          metadata?.reservedSequence(r.seq) ||
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
      const id = metadata?.active() ? {} : reuse ? openedView!.id : {};
      let logical: AccountBaselineRead | undefined;
      let chunks: StoredRecord[] | undefined, baselineContext: LocalBaselineContext | undefined;
      try {
        if (metadata?.active()) {
          const { readEncryptedBaseline } = await task.wait(() => import('./localBaselineStorage'));
          const { verifyCompleteLocalBaseline } = await task.wait(
            () => import('./localBaselineShadow'),
          );
          let context = await crypt.baseline!(task, { ...scope }, counter);
          const held = await readEncryptedBaseline(
            task,
            baselineOwner(
              async () => {
                context = await crypt.baseline!(task, { ...scope }, counter);
              },
              () => context.assertCurrent(),
            ),
          );
          try {
            const allocation = metadata.parse(held.counter, witness.intent);
            if (!equalCounter(scope, allocation, counter))
              corrupt('Baseline census changed during read.');
            const { baselineAuthorityPin } = await task.wait(() => import('./localBaselineReuse'));
            const unchangedAuthority = baselineAuthorityPin(context);
            countLedgerWork('baselineFullReplays');
            logical = await verifyCompleteLocalBaseline(
              { records: opened, counter },
              context,
              baselineAuth(task),
              held,
              crypt.readBaseline === true,
              held.counter.v === 5,
            );
            baselineContext = await crypt.baseline!(task, { ...scope }, counter);
            // One-shot rotation/custody readers reconstruct equivalent evidence per call.
            // Only live warm owners promise stable verifier-owned capability identities.
            if (crypt.warmLoads && metadata.reduced() && !unchangedAuthority(baselineContext))
              throw new ContentError(
                'generation-changed',
                'Baseline authority changed during replay.',
              );
            if (
              logical &&
              openedView?.baseline &&
              reuse &&
              baselineReuse?.hasIdentity(openedView.id) &&
              baselineReuse.matches(baselineContext)
            )
              baselineReuse.compare(logical);
            if (held.counter.v === 5) chunks = structuredClone(held.chunks);
          } finally {
            eraseVerified(held);
          }
        }
        if (crypt.validate)
          await task.wait(() => crypt.validate!(opened, task, counter, id, logical));
        if (crypt.reuseOpened && (!reuse || metadata?.active()))
          task.step(() => {
            clearView();
            openedView = {
              id,
              counter: structuredClone(counter),
              sealed: structuredClone(sealed),
              opened: copyRecords(opened),
              ...(logical ? { baseline: structuredClone(logical) } : {}),
              ...(chunks ? { baselineChunks: structuredClone(chunks) } : {}),
            };
          });
        if (crypt.warmLoads && openedView && !metadata?.active())
          warm = createWarmContent(scope, witness.intent, openedView.sealed);
        else if (
          crypt.warmLoads &&
          openedView &&
          metadata?.reduced() &&
          logical &&
          baselineContext
        ) {
          const { createBaselineReuse } = await task.wait(() => import('./localBaselineReuse'));
          baselineReuse = await createBaselineReuse(task, logical, baselineContext, counter, id);
          warm = createWarmContent(scope, witness.intent, openedView.sealed, {
            chunks: openedView.baselineChunks!,
            parse: metadata.parse,
            metadataKeys: metadata.metadataKeys,
          });
        }
        return task.step(() => opened.sort((a, b) => a.seq - b.seq));
      } finally {
        eraseVerified(logical);
        eraseVerified(chunks);
      }
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
          if (baselineReuse) {
            const context = await crypt.baseline!(task, { ...scope }, checked.counter);
            if (!baselineReuse.matches(context)) {
              forceFullRead = true;
              return select ? await load(task, select) : await load(task);
            }
            const logical = await baselineReuse.advance(
              task,
              openedView.opened,
              context,
              checked.counter,
              openedView.id,
            );
            try {
              const fresh = await crypt.baseline!(task, { ...scope }, checked.counter);
              if (forceFullRead || !baselineReuse.matches(fresh)) {
                eraseVerified(logical);
                forceFullRead = true;
                return select ? await load(task, select) : await load(task);
              }
              if (logical) {
                eraseVerified(openedView.baseline);
                openedView.baseline = logical;
              }
            } catch (e) {
              eraseVerified(logical);
              throw e;
            }
          }
          // Only the opted-in private validator borrows retained input. Selection callers receive
          // an opaque lease, never these rows. Ordinary load callers keep independent copies.
          const borrowed = !!select;
          const result = borrowed ? openedView.opened : copyRecords(openedView.opened);
          try {
            if (crypt.validate)
              await task.wait(() =>
                crypt.validate!(
                  result,
                  task,
                  checked.counter,
                  openedView!.id,
                  openedView!.baseline,
                ),
              );
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
  /** Read-only preparation may finish before final FIFO entry. No task/crypto callback escapes. */
  const prepareHistoryRemoval = async (
    task: SessionTask,
    assertCurrent: () => Promise<void>,
    checkCommit: () => void,
    expectedRevision: number,
    checkRetained: () => void,
  ) => {
    if (
      !allowReduced ||
      !crypt.baseline ||
      !metadata ||
      !crypt.validate ||
      !crypt.allowSpoolCounter
    )
      throw new StorageCompatibilityError('Private retention writer disabled.');
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      corrupt('Invalid retention predecessor revision.');
    const {
      planLocalRetention,
      retentionPlanReport,
      disposeRetentionPlan,
      assertRetentionInventory,
      inspectRetentionPlan,
      verifyRetentionPlan,
      sameRetentionInventory,
    } = await task.wait(() => import('./localRetentionPlan'));
    const inventory = await retentionInventory(task);
    let plan: Awaited<ReturnType<typeof planLocalRetention>> | undefined;
    let delivered = false;
    try {
      const raw = inventory.metadata.find((m) => m.key === 'counter')?.value;
      const counter = parseCounter(raw, scope, witness.intent);
      const pointer = (raw as import('./localBaselineAnchor').BaselineCounter).baseline;
      const revision = pointer?.revision ?? 0;
      if (
        revision === expectedRevision + 1 &&
        metadata.reduced() &&
        pointer?.journalEra?.revision === revision
      ) {
        const opened = await load(task);
        try {
          await assertCurrent();
          checkCommit();
          return { kind: 'already-removed' as const };
        } finally {
          eraseVerified(opened);
        }
      }
      if (revision !== expectedRevision) corrupt('Retention predecessor changed.');
      const context = await crypt.baseline(task, { ...scope }, counter);
      const binding = { lifetime: {}, intent: witness.intent, allowReduced };
      plan = await planLocalRetention(
        task,
        inventory,
        {
          ...context,
          assertCurrent: () => {
            context.assertCurrent();
            checkCommit();
          },
        },
        {
          open: (r) => crypt.open(task, r),
          verify: (b, mac) => crypt.verify(task, b, mac),
          auth: baselineAuth(task),
        },
        binding,
        checkRetained,
      );
      if (plan.kind === 'skipped') return plan;
      const prepared = plan;
      const report = retentionPlanReport(prepared);
      let used = false;
      const dispose = () => {
        used = true;
        disposeRetentionPlan(prepared);
      };
      const commit = async (
        currentTask: SessionTask,
        fresh: () => Promise<void>,
        checkJournal: () => void,
        beforeMutation: () => void,
      ) => {
        if (used) throw new MaintenanceInterrupted();
        used = true;
        const check = () =>
          currentTask.step(() => {
            checkRetained();
            checkJournal();
          });
        let expected: RetentionInventory | undefined;
        let actual: RetentionInventory | undefined;
        let opened: OpenedRecord[] | undefined;
        let candidate: ReturnType<typeof inspectRetentionPlan> | undefined;
        try {
          check();
          let phase = ledgerWorkStart();
          await fresh();
          check();
          measureLedgerWork('retentionFinalAuthority', phase);
          phase = ledgerWorkStart();
          candidate = inspectRetentionPlan(prepared);
          measureLedgerWork('retentionPlanCopy', phase);
          phase = ledgerWorkStart();
          actual = await retentionInventory(currentTask);
          measureLedgerWork('retentionPreflightRead', phase);
          phase = ledgerWorkStart();
          // Another owned storage job may have run between preparation and final FIFO entry.
          // Abandon rather than broadening/reusing the cut; no nonce has been reserved yet.
          if (!sameRetentionInventory(candidate.inventory, actual))
            throw new MaintenanceInterrupted();
          verifyRetentionPlan(prepared, actual, binding);
          measureLedgerWork('retentionPreflightCompare', phase);
          check();
          const { removePlannedLocalHistory } = await currentTask.wait(
            () => import('./localRetentionStorage'),
          );
          beforeMutation();
          phase = ledgerWorkStart();
          expected = await removePlannedLocalHistory(
            currentTask,
            baselineOwner(fresh, check),
            prepared,
            binding,
          );
          measureLedgerWork('retentionAdapter', phase);
          clearView();
          metadata.replaced();
          eraseVerified(actual);
          phase = ledgerWorkStart();
          actual = await retentionInventory(currentTask);
          measureLedgerWork('retentionReadback', phase);
          phase = ledgerWorkStart();
          assertRetentionInventory(expected, actual);
          measureLedgerWork('retentionReadbackCompare', phase);
          phase = ledgerWorkStart();
          opened = await load(currentTask);
          measureLedgerWork('retentionReload', phase);
          phase = ledgerWorkStart();
          const { verifyCompleteLocalBaseline } = await currentTask.wait(
            () => import('./localBaselineShadow'),
          );
          const current = await currentCounter(currentTask);
          const verified = await verifyCompleteLocalBaseline(
            { records: opened, counter: current },
            await crypt.baseline!(currentTask, { ...scope }, current),
            baselineAuth(currentTask),
            candidate.candidate,
            true,
            true,
          );
          eraseVerified(verified);
          measureLedgerWork('retentionReplay', phase);
          phase = ledgerWorkStart();
          await fresh();
          check();
          measureLedgerWork('retentionEndAuthority', phase);
          return { kind: 'removed' as const, revision: report.revision, removed: report.rows };
        } finally {
          const cleanup = ledgerWorkStart();
          dispose();
          eraseVerified(expected);
          eraseVerified(actual);
          eraseVerified(opened);
          eraseVerified(candidate);
          clearView();
          measureLedgerWork('retentionCleanup', cleanup);
        }
      };
      checkRetained();
      delivered = true;
      return Object.freeze({
        kind: 'prepared-removal' as const,
        commit,
        dispose,
        check: checkRetained,
      });
    } finally {
      if (!delivered && plan?.kind === 'local-retention-dry-run') disposeRetentionPlan(plan);
      eraseVerified(inventory);
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
    /** Explicit logical recovery seam; physical load/rotation/census semantics stay unchanged. */
    async loadAccount(
      task: SessionTask,
    ): Promise<AccountBaselineRead | { kind: 'complete'; records: OpenedRecord[] }> {
      const records = await load(task);
      try {
        if (openedView?.baseline) {
          const result = task.step(() => structuredClone(openedView!.baseline!));
          eraseVerified(records);
          return result;
        }
        return task.step(() => ({ kind: 'complete' as const, records }));
      } catch (cause) {
        eraseVerified(records);
        throw cause;
      }
    },
    /** Private prospective-authority adapter. Checks the retained origin under a proposed context
     * without installing that context or publishing a view. The caller still commits custody and
     * performs its normal authenticated readback. Complete-history owners keep their old path. */
    async verifyBaselineTransition(
      task: SessionTask,
      proposed: (identity: ContentIdentity, counter: ContentCounter) => LocalBaselineContext,
    ): Promise<boolean> {
      if (!crypt.readBaseline || !metadata?.era() || !crypt.baseline) return false;
      const snapshot = await read(task, true),
        records = await openSnapshot(task, snapshot);
      const { readEncryptedBaseline } = await task.wait(() => import('./localBaselineStorage'));
      const { verifyCompleteLocalBaseline } = await task.wait(
        () => import('./localBaselineShadow'),
      );
      const { verifySyncState } = await task.wait(() => import('./accountSyncState'));
      let held: Awaited<ReturnType<typeof readEncryptedBaseline>> | undefined;
      let logical: AccountBaselineRead | undefined;
      const fresh = async () => {
        await crypt.baseline!(task, { ...scope }, snapshot.counter!);
      };
      try {
        held = await readEncryptedBaseline(
          task,
          baselineOwner(fresh, () => task.step(() => {})),
        );
        if (!equalCounter(scope, metadata.parse(held.counter, witness.intent), snapshot.counter!))
          corrupt('Transition census changed.');
        const context = proposed({ ...scope }, structuredClone(snapshot.counter!));
        logical = await verifyCompleteLocalBaseline(
          { records, counter: snapshot.counter! },
          context,
          baselineAuth(task),
          held,
          true,
          held.counter.v === 5,
        );
        if (!logical) throw Error('Transition lost its retained origin.');
        verifySyncState(
          logical.ledger.census.delivery,
          logical.ledger.delivery,
          logical.ledger.inbound,
        );
        await fresh();
        context.assertCurrent();
        return true;
      } finally {
        eraseVerified(records);
        eraseVerified(held);
        eraseVerified(logical);
      }
    },
    journalBinding: () => {
      const era = metadata?.era();
      return era ? { identity: { ...scope }, intent: witness.intent, era } : undefined;
    },
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
      if (metadata?.reduced())
        throw new StorageCompatibilityError('Full-history shadow unavailable after retention.');
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
    /** Exact projected deletion only: no reservation, chunk installation, era change or live mutation. */
    async dryRunRetention(
      task: SessionTask,
      assertCurrent: () => Promise<void>,
      checkCommit: () => void,
    ) {
      if (
        !metadata ||
        !crypt.baseline ||
        !crypt.readBaseline ||
        !crypt.allowSpoolCounter ||
        !crypt.validate
      )
        throw Error('Private Account retention planner disabled');
      const { planLocalRetention, verifyRetentionPlan, retentionPlanReport, disposeRetentionPlan } =
        await task.wait(() => import('./localRetentionPlan'));
      await assertCurrent();
      checkCommit();
      const inventory = await retentionInventory(task);
      let finalInventory: RetentionInventory | undefined;
      let plan: Awaited<ReturnType<typeof planLocalRetention>> | undefined;
      let counter: ContentCounter | undefined;
      try {
        counter = parseCounter(
          inventory.metadata.find((m) => m.key === 'counter')?.value,
          scope,
          witness.intent,
        );
        const context = await crypt.baseline(task, { ...scope }, counter);
        const binding = { lifetime: {}, intent: witness.intent, allowReduced };
        plan = await planLocalRetention(
          task,
          inventory,
          {
            ...context,
            assertCurrent: () => {
              context.assertCurrent();
              checkCommit();
            },
          },
          {
            open: (r) => crypt.open(task, r),
            verify: (b, mac) => crypt.verify(task, b, mac),
            auth: baselineAuth(task),
          },
          binding,
        );
        if (plan.kind === 'skipped') return plan;
        await assertCurrent();
        finalInventory = await retentionInventory(task);
        checkCommit();
        verifyRetentionPlan(plan, finalInventory, binding);
        return retentionPlanReport(plan);
      } finally {
        if (plan?.kind === 'local-retention-dry-run') disposeRetentionPlan(plan);
        eraseVerified(inventory);
        eraseVerified(finalInventory);
        eraseVerified(counter);
      }
    },
    prepareHistoryRemoval,
    /** Same-task adapter for private carrier fixtures. Composition uses the split handoff. */
    async removeHistory(
      task: SessionTask,
      assertCurrent: () => Promise<void>,
      checkCommit: () => void,
      expectedRevision: number,
    ) {
      const prepared = await prepareHistoryRemoval(
        task,
        assertCurrent,
        checkCommit,
        expectedRevision,
        () => task.step(checkCommit),
      );
      if (prepared.kind !== 'prepared-removal') return prepared;
      try {
        return await prepared.commit(task, assertCurrent, checkCommit, () => {});
      } finally {
        prepared.dispose();
      }
    },
    /** Called only while the composed admission queue fences input; never deletes or swaps the live doc. */
    async installBaseline(
      task: SessionTask,
      assertCurrent: () => Promise<void>,
      checkCommit: () => void,
      expectedRevision?: number,
      advanceEra = false,
    ) {
      if (!metadata || !crypt.baseline || !crypt.allowSpoolCounter || !crypt.validate)
        throw Error('Private Account baseline installer disabled');
      const snapshot = await read(task, true);
      if (metadata.reduced())
        throw new StorageCompatibilityError('Reduced baseline requires atomic retention.');
      const records = await openSnapshot(task, snapshot);
      let previous:
        | Awaited<ReturnType<(typeof import('./localBaselineStorage'))['readEncryptedBaseline']>>
        | undefined;
      let candidate:
        | Awaited<ReturnType<(typeof import('./localBaselineReplay'))['prepareLocalBaseline']>>
        | undefined;
      try {
        checkCommit();
        if (
          expectedRevision !== undefined &&
          (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
        )
          throw Error('Invalid expected baseline revision');
        if (metadata.active()) {
          if (expectedRevision === undefined) return { kind: 'already-installed' as const };
          const { readEncryptedBaseline } = await task.wait(() => import('./localBaselineStorage'));
          previous = await readEncryptedBaseline(task, baselineOwner(assertCurrent, checkCommit));
          if (
            !equalCounter(
              scope,
              metadata.parse(previous.counter, witness.intent),
              snapshot.counter!,
            )
          )
            corrupt('Replacement census changed.');
          // An explicit expected revision makes a retry after a lost reply idempotent.
          if (previous.anchor.revision === expectedRevision + 1) {
            if (
              advanceEra &&
              previous.counter.baseline.journalEra?.revision !== previous.anchor.revision
            )
              corrupt('Retry is not an era transition');
            return { kind: 'already-installed' as const };
          }
          if (previous.anchor.revision !== expectedRevision)
            corrupt('Replacement revision changed.');
        } else if (expectedRevision !== undefined)
          corrupt('Replacement requires an installed baseline.');
        const { prepareLocalBaseline, rebaseLocalBaseline, LocalBaselineError } = await task.wait(
          () => import('./localBaselineReplay'),
        );
        const { verifyCompleteLocalBaseline } = await task.wait(
          () => import('./localBaselineShadow'),
        );
        const input = { records, counter: snapshot.counter! };
        const context = await crypt.baseline(task, { ...scope }, input.counter);
        const auth = baselineAuth(task);
        const oldEra = previous?.counter.baseline.journalEra;
        const era = advanceEra
          ? {
              current: hex(crypto.getRandomValues(new Uint8Array(32))),
              previous: oldEra?.current ?? null,
              revision: (previous?.anchor.revision ?? 0) + 1,
            }
          : oldEra;
        try {
          if (previous && crypt.readBaseline) {
            const { decodeLocalBaseline } = await task.wait(() => import('./localBaselineRecord'));
            const old = decodeLocalBaseline(previous.baseline.payload);
            try {
              candidate = await rebaseLocalBaseline(
                previous.baseline,
                previous.anchor,
                {
                  records: records.filter((r) => r.seq >= old.cut.nextSequence),
                  counter: input.counter,
                },
                context,
                auth,
                era,
              );
            } finally {
              eraseVerified(old);
            }
          } else
            candidate = await prepareLocalBaseline(input, context, auth, previous?.anchor, era);
        } catch (error) {
          // Only a new candidate can be ineligible. A persisted anchor's failure above is fatal.
          if (error instanceof LocalBaselineError && error.reason !== 'integrity')
            return { kind: 'skipped' as const, reason: error.reason };
          throw error;
        }
        await verifyCompleteLocalBaseline(input, context, auth, candidate);
        await assertCurrent();
        checkCommit();
        const { anchorLocalBaseline } = await task.wait(() => import('./localBaselineStorage'));
        await anchorLocalBaseline(
          task,
          baselineOwner(assertCurrent, checkCommit),
          snapshot,
          candidate,
          previous?.anchor,
        );
        // Re-read the committed pointer before any future allocation, including a lost-reply retry.
        clearView();
        if (previous) metadata.replaced();
        const reopened = await load(task);
        eraseVerified(reopened);
        return { kind: previous ? ('replaced' as const) : ('installed' as const) };
      } finally {
        clearView();
        eraseVerified(records);
        eraseVerified(candidate);
        eraseVerified(previous);
      }
    },
    async checkRetainedCheckpoint(
      task: SessionTask,
      heads: readonly import('../../account-protocol/historyCheckpoint').HistoryHead[],
      assertCurrent: () => Promise<void>,
      installed?: ReadonlyMap<string, { position: number; link: string }>,
    ) {
      if (!metadata?.era()) return;
      const { readEncryptedBaseline } = await task.wait(() => import('./localBaselineStorage'));
      const { decodeLocalBaseline } = await task.wait(() => import('./localBaselineRecord'));
      const { checkRetainedCheckpointCuts } = await task.wait(
        () => import('./retentionCheckpoint'),
      );
      const held = await readEncryptedBaseline(
        task,
        baselineOwner(assertCurrent, () => task.step(() => {})),
      );
      let decoded: ReturnType<typeof decodeLocalBaseline> | undefined;
      try {
        decoded = decodeLocalBaseline(held.baseline.payload);
        checkRetainedCheckpointCuts(decoded, heads, installed);
      } finally {
        eraseVerified(decoded);
        eraseVerified(held);
      }
    },
    canSelect,
    select: <T>(task: SessionTask, select: (lease: ContentSelection) => T) => load(task, select),
    invalidateWarm() {
      forceFullRead = true;
    },
    warmAuditDue: () => Boolean(warm?.due() || baselineReuse?.due()),
    warmAuditDelay: () =>
      Math.min(warm?.delay() ?? WARM_AUDIT_MS, baselineReuse?.delay() ?? WARM_AUDIT_MS),
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
        const completed = await warm.audit(db!, task);
        if (completed && baselineReuse?.due()) {
          // Compare like with like even when this maintenance job follows a commit whose
          // suffix has not yet been requested by another consumer. Unsupported deltas take
          // full replay here and reset the oracle deadline themselves.
          if (!baselineReuse.hasIdentity(openedView.id)) eraseVerified(await load(task));
        }
        if (completed && baselineReuse?.due()) {
          // Full semantic oracle stays in interruptible maintenance, never moved to a typing task.
          forceFullRead = true;
          const rows = await load(task);
          eraseVerified(rows);
        }
        return completed;
      } catch (cause) {
        if (!(cause instanceof MaintenanceInterrupted)) clearView();
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
            allowReduced,
            scope,
            generation,
            intent: witness.intent,
            read: () => read(task, true),
            authenticate: (snapshot) => openSnapshot(task, snapshot),
            assertCurrent: async (counter) => {
              if (metadata?.active()) await crypt.baseline!(task, { ...scope }, counter);
            },
            crypt,
            ...(metadata
              ? {
                  baseline: async (counter: ContentCounter) => {
                    if (!metadata.active()) return undefined;
                    const { readEncryptedBaseline } = await task.wait(
                      () => import('./localBaselineStorage'),
                    );
                    let context = await crypt.baseline!(task, { ...scope }, counter);
                    const held = await readEncryptedBaseline(
                      task,
                      baselineOwner(
                        async () => {
                          context = await crypt.baseline!(task, { ...scope }, counter);
                        },
                        () => context.assertCurrent(),
                      ),
                    );
                    held.baseline.payload.fill(0);
                    held.baseline.mac.fill(0);
                    return { counter: held.counter, chunks: held.chunks };
                  },
                }
              : {}),
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
      if (metadata?.active()) {
        const rows = await load(task);
        eraseVerified(rows);
        checkJournal();
        return {
          status: 'retained' as const,
          storeId: scope.storeId,
          generation,
          stateSequence: null,
          removed: [],
        };
      }
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
