import { MaintenanceInterrupted } from './contentMaintenance';
import {
  ledgerProfiling,
  ledgerWorkStart,
  countLedgerWork,
  measureLedgerWork,
  observeAdmissionQueue,
} from './accountLedgerMetrics';
import { createBatchWindow, type BatchTiming } from './batchWindow';
import { applyUpdate, createDoc, encodeState, forkDoc, sameDocState, type YDoc } from './yjs';
import {
  createWorkspacePreparation,
  localWorkspacePreparation,
  type LocalWorkspacePreparation,
  type PreparationContext,
  type PreparationBytes,
} from './workspacePreparation';
import { MAX_JOURNAL_UPDATE, type JournalSession } from './custody';
import type { Bytes } from './custodyCrypto';
import {
  cloneDocument,
  newWriterId,
  prepareIntent,
  replayRecovery,
  writerClock,
  type PrepareIntent,
} from './admissionDocument';

export const MAX_PENDING_BYTES = 4 * 1024 * 1024;
export const MAX_PENDING_ITEMS = 256;
export const FLUSH_DELAY_MS = 250;
/** Advisory work thresholds, not claims about total disk/proof size. */
export const CONTENT_MAINTENANCE_RECORDS = 128;
export const CONTENT_MAINTENANCE_BYTES = 1024 * 1024;
export const CONTENT_MAINTENANCE_IDLE_MS = 750;
export type AdmissionFailure =
  | 'invalid-input'
  | 'queue-full'
  | 'slice-required'
  | 'prepare-failed'
  | 'receive-refused'
  | 'storage-failed'
  | 'repair-required'
  | 'projection-mismatch'
  | 'discarded'
  | 'inactive-session';
export class AdmissionError extends Error {
  override readonly name = 'AdmissionError';
  constructor(
    readonly code: AdmissionFailure,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
export interface AdmissionOptions {
  /** Internal Account flush policy. Journal acknowledgment and forced barriers are unchanged. */
  readonly flushBatch?: BatchTiming;
  /** Private owned receives retain/apply frames in order, then publish the verified page once. */
  readonly publishReceivePage?: boolean;
  readonly [localWorkspacePreparation]?: LocalWorkspacePreparation;
  readonly prepare: PrepareIntent;
  /** Transport-specific authority/shape validation, before persistence. Throw to refuse. */
  readonly validateReceive: (bytes: Bytes) => void;
}
/** Internal composition only. The operation owns verification, persistence and synchronous promotion.
 * Neither this enqueue capability nor its promotion callback is exposed by an application workspace. */
export type OwnedReceiveQueue = <T>(
  bytes: Bytes,
  commit: (bytes: Bytes, promote: (updates: readonly Bytes[]) => void) => Promise<T>,
) => Promise<T>;
export interface AdmissionReceipt {
  readonly id: number;
  readonly source: 'local' | 'remote';
  readonly revision: number;
  readonly slices: number;
}
export interface AdmissionTicket {
  readonly id: number;
  readonly accepted: Promise<AdmissionReceipt>;
}
export interface AcceptedUpdate {
  readonly source: 'local' | 'remote';
  readonly revision: number;
  readonly update: Bytes;
  /** Only the private owned receive can mark an intermediate frame. */
  readonly publicationComplete?: false;
}
export interface AdmissionStatus {
  readonly state: 'active' | 'blocked' | 'closing' | 'closed' | 'failed';
  readonly revision: number;
  readonly pendingItems: number;
  readonly pendingBytes: number;
  /** Conservative admission reservation includes future prepared bytes/remainder. */
  readonly reservedBytes: number;
  readonly durable: boolean;
  readonly pressure: Readonly<{ code: string; cause?: string }> | null;
  readonly maintenance?: 'running' | 'retained' | 'deferred';
}
export interface AdmissionSession {
  /** Optional composed carrier hook; never an application cleanup or authority shortcut. */
  beforeRelease?: JournalSession['beforeRelease'];
  readonly status: AdmissionStatus;
  readonly signal: AbortSignal;
  submit(intent: Bytes): AdmissionTicket;
  receive(update: Bytes): AdmissionTicket;
  /** A detached accepted-state update, including Yjs pending structs/delete sets. */
  snapshot(): Bytes;
  /** Detached runtime copy for projection startup; caller owns/destroys it. Never the canonical doc. */
  fork(): YDoc;
  /** Read-only consistency check against accepted canonical state, including pending information. */
  matches(doc: YDoc): boolean;
  subscribe(listener: (event: AcceptedUpdate) => void): () => void;
  onStatus(listener: (status: AdmissionStatus) => void): () => void;
  /** FIFO barrier over every input observed before this call; forces the journal to IDB. */
  whenDurable(): Promise<void>;
  retry(): void;
  /** Only while blocked and quiescent; discards the entire unaccepted suffix. */
  discardPending(): void;
  close(): Promise<void>;
}
const deferred = <T>() => {
  let resolve!: (value: T) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  // Status exposes failures even if an input handler ignores its ticket.
  void promise.catch(() => {});
  return { promise, resolve, reject };
};
type Prepared = PreparationBytes & { carrierBytes?: Bytes };
type InputJob = {
  kind: 'local' | 'remote';
  id: number;
  input: Bytes;
  reservation: number;
  slices: number;
  sliced: boolean;
  prepared?: Prepared | undefined;
  preparation?: PreparationContext | undefined;
  force?: string;
  commit?: (bytes: Bytes, promote: (updates: readonly Bytes[]) => void) => Promise<void>;
  completion: ReturnType<typeof deferred<AdmissionReceipt>>;
};
type FlushJob = { kind: 'flush'; completion: ReturnType<typeof deferred<void>> };
type Job = InputJob | FlushJob;
const codeOf = (error: unknown): string =>
  error && typeof error === 'object' && 'code' in error ? String(error.code) : 'storage-failed';
const erase = (job: Job) => {
  if (job.kind === 'flush') return;
  job.input.fill(0);
  // The preparation owner drains these buffers after any outstanding write lease.
  if (job.preparation) return;
  job.prepared?.update.fill(0);
  job.prepared?.remaining?.fill(0);
  job.prepared?.carrierBytes?.fill(0);
  for (const source of job.prepared?.sources ?? []) source.bytes.fill(0);
};

/** Internal seam for controlled tests. Production construction owns an actual JournalSession. */
export const createAdmissionOwner = async (
  carrier: JournalSession,
  options: AdmissionOptions,
  bindOwnedReceive?: (enqueue: OwnedReceiveQueue) => void,
): Promise<AdmissionSession> => {
  const local = options[localWorkspacePreparation];
  if (local && carrier.captureLocal)
    throw Error('Local preparation is not authorized for Account source capture');
  const canonical = createDoc(),
    listeners = new Set<(e: AcceptedUpdate) => void>(),
    statusListeners = new Set<(s: AdmissionStatus) => void>();
  const queue: Job[] = [];
  const queuedAt = ledgerProfiling ? new WeakMap<Job, number>() : undefined;
  const flushBatch = options.flushBatch
    ? createBatchWindow(options.flushBatch, () => performance.now())
    : undefined;
  let state: AdmissionStatus['state'] = 'active',
    revision = 0,
    nextId = 0,
    writer = newWriterId();
  const preparation = local
    ? createWorkspacePreparation({
        head: () => {
          const job = queue[0];
          return state === 'active' && job && job.kind !== 'flush'
            ? { kind: job.kind, job, slice: job.slices, revision, writer }
            : undefined;
        },
        verifiedRevision: local.verifiedRevision,
      })
    : undefined;
  let repairRequired = false;
  let pressure: AdmissionStatus['pressure'] = null,
    journalDirty = false,
    busy = false;
  let timer: ReturnType<typeof setTimeout> | undefined, inFlight: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  let maintenanceTimer: ReturnType<typeof setTimeout> | undefined;
  let maintenanceStop: AbortController | undefined;
  let maintenance: AdmissionStatus['maintenance'];
  let contentChanges = 0,
    contentBytes = 0,
    journalBytes = 0;
  const changedContent = (count: number, bytes: number) => {
    contentChanges += count;
    contentBytes += bytes;
  };
  const clearMaintenanceTimer = () => {
    if (maintenanceTimer !== undefined) clearTimeout(maintenanceTimer);
    maintenanceTimer = undefined;
  };
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    canonical.destroy();
    listeners.clear();
  };
  try {
    carrier.beforeRelease?.(async () => {
      await inFlight;
      await preparation?.close();
      dispose();
    });
  } catch (cause) {
    // Cancellation can win after the carrier factory returns but before composition starts.
    dispose();
    throw cause;
  }
  const live = () => {
    if (state !== 'active' && state !== 'blocked')
      throw new AdmissionError('inactive-session', 'This admission session is inactive.');
    if (carrier.signal.aborted || carrier.state !== 'active')
      throw new AdmissionError('inactive-session', 'The carrier session is inactive.');
  };
  const status = (): AdmissionStatus =>
    Object.freeze({
      state,
      revision,
      pendingItems: queue.filter((j) => j.kind !== 'flush').length,
      pendingBytes: queue.reduce(
        (n, j) =>
          n +
          (j.kind === 'flush'
            ? 0
            : j.input.length +
              (j.prepared?.update.length ?? 0) +
              (j.prepared?.carrierBytes?.length ?? 0) +
              (j.prepared?.sources?.reduce((n, s) => n + s.bytes.length, 0) ?? 0) +
              (j.prepared?.remaining?.length ?? 0)),
        0,
      ),
      reservedBytes: queue.reduce((n, j) => n + (j.kind === 'flush' ? 0 : j.reservation), 0),
      durable: state === 'active' && !queue.length && !journalDirty && pressure === null,
      pressure,
      ...(maintenance ? { maintenance } : {}),
    });
  const notify = () => {
    const value = status();
    // Observer errors cannot turn a completed carrier into a refusal or bypass the queue.
    for (const listener of [...statusListeners]) {
      try {
        listener(value);
      } catch {
        /* caller owns observer errors */
      }
    }
  };
  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const rejectBarriers = (error: unknown) => {
    for (let i = queue.length - 1; i >= 0; i--)
      if (queue[i]!.kind === 'flush') {
        queue[i]!.completion.reject(error);
        queue.splice(i, 1);
      }
  };
  const block = (error: unknown) => {
    if (state !== 'active') return;
    state = 'blocked';
    clearTimer();
    clearMaintenanceTimer();
    repairRequired ||= codeOf(error) === 'repair-required';
    pressure = Object.freeze({ code: codeOf(error) });
    rejectBarriers(error);
    notify();
  };
  const close = (): Promise<void> => {
    if (closing) return closing;
    const done = deferred<void>();
    closing = done.promise;
    state = 'closing';
    flushBatch?.clear();
    clearTimer();
    clearMaintenanceTimer();
    carrier.signal.removeEventListener('abort', cancelled);
    maintenanceStop?.abort();
    const error = new AdmissionError(
      'inactive-session',
      'Admission closed before this input completed.',
    );
    const preparationStopped = preparation?.close();
    for (const job of queue) {
      job.completion.reject(error);
      erase(job);
    }
    queue.length = 0;
    notify();
    const stopped = carrier.close();
    void Promise.allSettled([inFlight, stopped, preparationStopped]).then((results) => {
      dispose();
      const failure = results.find((r) => r.status === 'rejected');
      state = failure ? 'failed' : 'closed';
      notify();
      statusListeners.clear();
      if (failure?.status === 'rejected') done.reject(failure.reason);
      else done.resolve();
    });
    return closing;
  };
  const cancelled = () => {
    void close().catch(() => {});
  };
  carrier.signal.addEventListener('abort', cancelled, { once: true });
  try {
    const recovery = await carrier.loadRecovery();
    try {
      live();
      try {
        replayRecovery(canonical, recovery);
      } catch (cause) {
        throw new AdmissionError('repair-required', 'Persisted Yjs content cannot be replayed.', {
          cause,
        });
      }
      live();
      const content = recovery.records.filter((r) => r.kind === 'state' || r.kind === 'update');
      // A single large state cannot be made smaller by this maintenance operation.
      if (content.length > 1)
        changedContent(
          content.length,
          content.reduce((n, r) => n + r.bytes.length, 0),
        );
      journalBytes = recovery.journal.reduce((n, r) => n + r.bytes.length, 0);
      journalDirty = recovery.journal.length > 0;
      if (journalDirty) flushBatch?.note();
    } finally {
      for (const r of [...recovery.records, ...recovery.journal]) r.bytes.fill(0);
    }
  } catch (error) {
    await close();
    throw error;
  }
  const validateRemote = (bytes: Bytes) => {
    const input = bytes.slice();
    let probe: YDoc | undefined;
    try {
      const result: unknown = options.validateReceive(input);
      if (result && typeof result === 'object' && 'then' in result)
        void Promise.resolve(result).catch(() => {});
      if (result !== undefined)
        throw Error('Receive validation must be synchronous and return void.');
      // Validation cannot rewrite the captured transport bytes.
      if (input.length !== bytes.length || input.some((v, i) => v !== bytes[i]))
        throw Error('Receive validation changed its input.');
      probe = cloneDocument(canonical);
      applyUpdate(probe, bytes);
    } catch (cause) {
      throw new AdmissionError('receive-refused', 'Inbound update failed validation.', { cause });
    } finally {
      input.fill(0);
      probe?.destroy();
    }
  };
  const promote = (job: InputJob, update: Bytes, publicationComplete = true) => {
    live();
    // A closing observer may revoke and erase the handoff during publication.
    const publication = update.slice();
    try {
      const before = writerClock(canonical, writer);
      applyUpdate(canonical, update);
      if (job.kind === 'remote' && writerClock(canonical, writer) !== before)
        writer = newWriterId();
      revision++;
      if (job.preparation) {
        try {
          const candidate = preparation!.adopt(job.preparation, (prepared) =>
            sameDocState(canonical, prepared.state.history.doc),
          );
          const retired = local!.accept(candidate, revision);
          if (retired) preparation!.retire(retired);
        } catch (cause) {
          // Persistence already succeeded. Never retry this input or expose the failed projection.
          const error = new AdmissionError(
            'projection-mismatch',
            'Prepared workspace adoption failed.',
            { cause },
          );
          try {
            local!.fail(error);
          } finally {
            void close().catch(() => {});
          }
          throw error;
        }
      }
      // Adoption must see the original slice ordinal at the newly promoted revision.
      job.slices++;
      for (const listener of [...listeners]) {
        if (state !== 'active') break;
        try {
          listener(
            Object.freeze({
              source: job.kind,
              revision,
              update: publication.slice(),
              ...(!publicationComplete ? { publicationComplete: false as const } : {}),
            }),
          );
        } catch {
          /* completed acceptance cannot be rolled back */
        }
      }
    } finally {
      publication.fill(0);
    }
  };
  const completeInput = (job: InputJob) => {
    live();
    // The queue takes its own remainder before finish erases all handoff buffers.
    const rest = job.preparation ? job.prepared?.remaining?.slice() : job.prepared?.remaining;
    if (job.preparation) {
      preparation!.finish(job.preparation);
      job.preparation = undefined;
      job.prepared = undefined;
    }
    if (rest) {
      job.input.fill(0);
      job.prepared?.update.fill(0);
      job.prepared?.carrierBytes?.fill(0);
      for (const source of job.prepared?.sources ?? []) source.bytes.fill(0);
      job.input = rest;
      job.prepared = undefined;
      job.sliced = true;
      job.force = 'oversize';
      job.reservation = 2 * rest.length + MAX_JOURNAL_UPDATE;
    } else {
      if (queue[0] !== job) throw new Error('Admission queue lost its head.');
      queue.shift();
      erase(job);
      job.completion.resolve(
        Object.freeze({ id: job.id, source: job.kind, revision, slices: job.slices }),
      );
    }
    pressure = null;
    notify();
  };
  const flush = async () => {
    live();
    countLedgerWork('journalFlushes');
    if (journalDirty) countLedgerWork('dirtyJournalFlushes');
    const receipt = await carrier.flushJournal();
    live();
    if (receipt.retained) {
      const checked = await carrier.loadRecovery();
      for (const r of [...checked.records, ...checked.journal]) r.bytes.fill(0);
      live();
      throw new AdmissionError(
        'storage-failed',
        'Content committed, but journal cleanup still needs retry.',
      );
    }
    changedContent(receipt.removed ?? 0, journalBytes);
    journalBytes = 0;
    journalDirty = false;
    flushBatch?.clear();
  };
  const forceLocal = async (job: InputJob) => {
    await flush();
    live();
    const lease = job.preparation ? preparation!.borrow(job.preparation) : undefined;
    try {
      await carrier.appendBatch([
        { kind: 'update', bytes: job.prepared!.carrierBytes ?? job.prepared!.update },
      ]);
    } finally {
      lease?.release();
    }
    live();
    changedContent(1, (job.prepared!.carrierBytes ?? job.prepared!.update).length);
    promote(job, job.prepared!.update);
    completeInput(job);
  };
  const process = (job: Job): void | Promise<void> => {
    live();
    if (job.kind === 'flush')
      return flush().then(() => {
        live();
        queue.shift();
        pressure = null;
        job.completion.resolve();
        notify();
      });
    if (job.kind === 'remote') {
      if (job.commit) {
        let promoted = false;
        return job
          .commit(job.input, (updates) => {
            live();
            if (promoted) throw Error('Owned receive promoted twice');
            promoted = true;
            changedContent(
              updates.length,
              updates.reduce((n, b) => n + b.length, 0),
            );
            // Preserve original frames and their delivery order, including pending buffers/deletions.
            for (let i = 0; i < updates.length; i++)
              promote(job, updates[i]!, !options.publishReceivePage || i === updates.length - 1);
          })
          .then(() => {
            live();
            if (!promoted) throw Error('Owned receive omitted its ordered handoff');
            completeInput(job);
          })
          .catch((error) => {
            if (codeOf(error) !== 'receive-refused') throw error;
            live();
            if (queue[0] !== job) throw Error('Owned receive lost its queue head');
            queue.shift();
            erase(job);
            job.completion.reject(error);
            notify();
          });
      }
      // Invalid network input is rejected before persistence; it is not a storage failure.
      try {
        validateRemote(job.input);
      } catch (error) {
        queue.shift();
        erase(job);
        job.completion.reject(error);
        notify();
        return;
      }
      live();
      return carrier.appendBatch([{ kind: 'update', bytes: job.input }]).then(() => {
        live();
        changedContent(1, job.input.length);
        promote(job, job.input);
        completeInput(job);
      });
    }
    if (!job.prepared) {
      try {
        if (preparation) {
          const context = preparation.issue();
          preparation.prepare(
            context,
            job.input,
            MAX_JOURNAL_UPDATE,
            local!.command,
            (candidate) => {
              // Local frames come directly from the command's actual transactions. A source-free
              // no-op additionally proves full equality before storage; Account needs its own probe.
              if (candidate.sources !== undefined) return false;
              return (
                !(
                  candidate.update.length === 2 &&
                  candidate.update[0] === 0 &&
                  candidate.update[1] === 0
                ) || sameDocState(canonical, candidate.state.history.doc)
              );
            },
          );
          job.preparation = context;
          const lease = preparation.borrow(context);
          try {
            job.prepared = lease.prepared;
          } finally {
            lease.release();
          }
        } else {
          job.prepared = prepareIntent(
            canonical,
            writer,
            job.input,
            MAX_JOURNAL_UPDATE,
            options.prepare,
          );
        }
        if (carrier.captureLocal && job.prepared.sources?.length !== 0)
          job.prepared.carrierBytes = carrier.captureLocal(
            job.prepared.update,
            job.prepared.sources,
          );
        if (job.prepared.carrierBytes) {
          const extra =
            job.prepared.carrierBytes.length +
            (job.prepared.sources?.reduce((n, s) => n + s.bytes.length, 0) ?? 0);
          if (status().reservedBytes + extra > MAX_PENDING_BYTES)
            throw new AdmissionError('queue-full', 'Source capture exceeds pending capacity.');
          job.reservation += extra;
        }
      } catch (cause) {
        if (job.preparation) {
          preparation!.discard(job.preparation);
          job.preparation = undefined;
        }
        job.prepared?.update.fill(0);
        job.prepared?.remaining?.fill(0);
        job.prepared?.carrierBytes?.fill(0);
        for (const s of job.prepared?.sources ?? []) s.bytes.fill(0);
        job.prepared = undefined;
        throw new AdmissionError(
          'prepare-failed',
          'Local preparation failed; pending input retained.',
          { cause },
        );
      }
      try {
        live();
      } catch (error) {
        erase(job);
        throw error;
      }
      if (job.prepared.update.length > MAX_JOURNAL_UPDATE) {
        job.prepared.update.fill(0);
        job.prepared.remaining?.fill(0);
        job.prepared.carrierBytes?.fill(0);
        for (const s of job.prepared.sources ?? []) s.bytes.fill(0);
        job.prepared = undefined;
        job.reservation = 2 * job.input.length + MAX_JOURNAL_UPDATE;
        throw new AdmissionError(
          'slice-required',
          'The command adapter must prepare a smaller slice.',
        );
      }
    }
    // Empty source lists are checked against the complete draft by prepareIntent. Still publish the
    // command's ordered history/selection transition, but allocate no journal capsule or network source.
    if (
      job.prepared.sources?.length === 0 &&
      job.prepared.update.length === 2 &&
      job.prepared.update[0] === 0 &&
      job.prepared.update[1] === 0
    ) {
      promote(job, job.prepared.update);
      completeInput(job);
      return;
    }
    const lease = job.preparation ? preparation!.borrow(job.preparation) : undefined;
    let attempt: { status: 'journalled' } | { status: 'refused'; reason: string };
    try {
      attempt =
        job.force || job.sliced || job.prepared.remaining
          ? { status: 'refused', reason: job.force ?? 'oversize' }
          : carrier.appendLocal(job.prepared.carrierBytes ?? job.prepared.update);
    } finally {
      lease?.release();
    }
    if (attempt.status === 'journalled') {
      journalDirty = true;
      flushBatch?.note();
      journalBytes += (job.prepared.carrierBytes ?? job.prepared.update).length;
      promote(job, job.prepared.update);
      completeInput(job);
      return;
    }
    job.force = attempt.reason;
    pressure = Object.freeze({ code: 'content-pending', cause: attempt.reason });
    notify();
    live();
    return forceLocal(job);
  };
  const scheduleMaintenance = () => {
    if (
      maintenanceTimer !== undefined ||
      !carrier.compactContent ||
      state !== 'active' ||
      busy ||
      queue.length ||
      journalDirty
    )
      return;
    if (contentChanges < CONTENT_MAINTENANCE_RECORDS && contentBytes < CONTENT_MAINTENANCE_BYTES)
      return;
    maintenanceTimer = setTimeout(() => {
      maintenanceTimer = undefined;
      if (state !== 'active' || busy || queue.length || journalDirty) return;
      // Preserve FIFO and native settlement. Foreground work interrupts this discretionary
      // flight at its next safe boundary; it never overtakes an active storage transaction.
      const stop = new AbortController();
      maintenanceStop = stop;
      const attemptedChanges = contentChanges,
        attemptedBytes = contentBytes;
      contentChanges = 0;
      contentBytes = 0;
      busy = true;
      maintenance = 'running';
      notify();
      inFlight = Promise.resolve()
        .then(() => {
          live();
          return carrier.compactContent(stop.signal);
        })
        .then((receipt) => {
          if (state !== 'active') return;
          maintenance = receipt.status === 'retained' ? 'retained' : undefined;
        })
        .catch((error) => {
          if (state !== 'active') return;
          maintenance = 'deferred';
          if (error instanceof MaintenanceInterrupted) {
            // Unlike a quota/incomplete-union failure, interruption should retry at the
            // next durable idle opportunity, even if the new input only requested a barrier.
            contentChanges += attemptedChanges;
            contentBytes += attemptedBytes;
            return;
          }
          if (['repair-required', 'generation-changed'].includes(codeOf(error))) block(error);
          // Quota/budget/unavailable maintenance does not refuse already durable writing.
          // New durable growth (or a fresh open) is required before another attempt.
        })
        .finally(() => {
          maintenanceStop = undefined;
          busy = false;
          inFlight = undefined;
          notify();
          pump();
        });
    }, CONTENT_MAINTENANCE_IDLE_MS);
  };
  const schedule = () => {
    scheduleMaintenance();
    if (state !== 'active' || !journalDirty) return;
    if (timer !== undefined) {
      if (!flushBatch) return;
      clearTimeout(timer);
    }
    timer = setTimeout(
      () => {
        timer = undefined;
        if (state === 'active') void barrier().catch(() => {});
      },
      flushBatch ? Math.max(0, flushBatch.due! - performance.now()) : FLUSH_DELAY_MS,
    );
  };
  const processMeasured = (job: Job) => {
    if (!ledgerProfiling) return process(job);
    const wait = queuedAt!.get(job);
    if (wait !== undefined) {
      measureLedgerWork(
        ({ local: 'waitLocal', remote: 'waitRemote', flush: 'waitFlush' } as const)[job.kind],
        wait,
      );
      queuedAt!.delete(job);
    }
    const start = ledgerWorkStart();
    const finish = () =>
      measureLedgerWork(
        ({ local: 'admissionLocal', remote: 'admissionRemote', flush: 'admissionFlush' } as const)[
          job.kind
        ],
        start,
      );
    try {
      const result = process(job);
      if (result) return result.finally(finish);
      finish();
    } catch (error) {
      finish();
      throw error;
    }
  };
  const recordQueue = (job: Job) => {
    if (!ledgerProfiling) return;
    queuedAt!.set(job, ledgerWorkStart());
    observeAdmissionQueue(queue);
  };
  const pump = () => {
    if (busy || state !== 'active') return;
    busy = true;
    try {
      while (queue.length && state === 'active') {
        const result = processMeasured(queue[0]!);
        if (result) {
          inFlight = result.then(undefined, block).finally(() => {
            busy = false;
            inFlight = undefined;
            pump();
            schedule();
          });
          return;
        }
      }
    } catch (error) {
      block(error);
    }
    busy = false;
    if (state === 'active' && queue.length) queueMicrotask(pump);
    schedule();
  };
  const enqueue = (
    kind: 'local' | 'remote',
    bytes: Bytes,
    commit?: InputJob['commit'],
  ): AdmissionTicket => {
    live();
    if (!(bytes instanceof Uint8Array) || !bytes.length)
      throw new AdmissionError('invalid-input', 'A nonempty byte input is required.');
    const reservation = kind === 'local' ? bytes.length * 2 + MAX_JOURNAL_UPDATE : bytes.length;
    if (repairRequired)
      throw new AdmissionError(
        'repair-required',
        'Reopen only after repairing persisted carriers.',
      );
    const current = status();
    if (
      queue.length >= MAX_PENDING_ITEMS ||
      current.reservedBytes + reservation > MAX_PENDING_BYTES
    )
      throw new AdmissionError(
        'queue-full',
        'Pending input is full; wait, retry storage, or discard the pending suffix.',
      );
    const completion = deferred<AdmissionReceipt>();
    const job: InputJob = {
      kind,
      id: ++nextId,
      input: bytes.slice(),
      reservation,
      slices: 0,
      sliced: false,
      completion,
      ...(commit ? { commit } : {}),
    };
    clearMaintenanceTimer();
    maintenanceStop?.abort();
    queue.push(job);
    recordQueue(job);
    pump();
    notify();
    return Object.freeze({ id: job.id, accepted: completion.promise });
  };
  bindOwnedReceive?.(<T>(bytes: Bytes, commit: Parameters<OwnedReceiveQueue>[1]) => {
    let value: T;
    const ticket = enqueue('remote', bytes, async (input, promote) => {
      value = (await commit(input, promote)) as T;
    });
    return ticket.accepted.then(() => value);
  });
  const barrier = (): Promise<void> => {
    try {
      live();
      if (state === 'blocked')
        throw new AdmissionError(
          'storage-failed',
          'Retry or discard blocked pending input before requesting durability.',
        );
      clearTimer();
      const last = queue.at(-1);
      if (last?.kind === 'flush') return last.completion.promise;
      if (queue.length >= MAX_PENDING_ITEMS)
        throw new AdmissionError(
          'queue-full',
          'The admission queue has no room for a flush barrier.',
        );
      const completion = deferred<void>();
      clearMaintenanceTimer();
      maintenanceStop?.abort();
      const job: FlushJob = { kind: 'flush', completion };
      queue.push(job);
      recordQueue(job);
      pump();
      notify();
      return completion.promise;
    } catch (cause) {
      return Promise.reject(cause);
    }
  };
  const api: AdmissionSession = Object.freeze({
    get status() {
      return status();
    },
    signal: carrier.signal,
    ...(carrier.beforeRelease ? { beforeRelease: carrier.beforeRelease } : {}),
    submit: (intent: Bytes) => enqueue('local', intent),
    receive: (update: Bytes) => enqueue('remote', update),
    snapshot: () => {
      live();
      if (repairRequired)
        throw new AdmissionError(
          'repair-required',
          'Ordinary snapshots are disabled until repair.',
        );
      return new Uint8Array(encodeState(canonical));
    },
    fork: () => {
      live();
      if (repairRequired)
        throw new AdmissionError('repair-required', 'Workspace repair is required.');
      return forkDoc(canonical, false);
    },
    matches: (doc: YDoc) => {
      live();
      if (repairRequired)
        throw new AdmissionError('repair-required', 'Workspace repair is required.');
      return sameDocState(canonical, doc);
    },
    subscribe: (listener: (event: AcceptedUpdate) => void) => {
      live();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onStatus: (listener: (value: AdmissionStatus) => void) => {
      live();
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },
    whenDurable: barrier,
    retry: () => {
      live();
      if (repairRequired)
        throw new AdmissionError('repair-required', 'Repair requires a fresh session.');
      if (state !== 'blocked') return;
      state = 'active';
      pressure = null;
      pump();
      notify();
    },
    discardPending: () => {
      live();
      if (repairRequired)
        throw new AdmissionError(
          'repair-required',
          'Pending discard cannot repair persisted carriers.',
        );
      if (state !== 'blocked' || busy)
        throw new AdmissionError('invalid-input', 'Discard requires a blocked, settled queue.');
      const error = new AdmissionError('discarded', 'The unaccepted pending suffix was discarded.');
      for (const job of queue) {
        job.completion.reject(error);
        if (job.kind !== 'flush' && job.preparation) {
          preparation!.discard(job.preparation);
          job.preparation = undefined;
        }
        erase(job);
      }
      queue.length = 0;
      state = 'active';
      pressure = null;
      notify();
      schedule();
    },
    close,
  });
  schedule();
  return api;
};
