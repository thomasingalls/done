/** Window UI/admission mirror of an authenticated dedicated-worker owner. */
import { createAdmittedWorkspace, type WorkspaceOptions } from './admittedWorkspace';
import {
  createAdmissionOwner,
  requireAdmissionFence,
  type AdmissionFence,
  type AdmissionCarrier,
  type OwnedReceiveQueue,
  type OwnedPreparedReceiveQueue,
  type OwnedJournalFenceQueue,
} from './admissionQueue';
import { copyBatch, type ContentInput } from './contentRecord';
import type { ContentReceipt } from './contentStore';
import type { JournalRecovery } from './custody';
import { createJournalOwner, eraseJournalSnapshot, type JournalFlushReceipt } from './journalStore';
import { deriveStoreName } from './storeName';
import { makeSourceCapsule, decodeSourceCapsule, eraseCapsule } from './sourceCapture';
import { accountBatchPolicy } from './accountBatchPolicy';
import { accountTextMode } from './accountTextMode';
import { accountLedgerMode } from './accountLedgerMode';
import { requireWindowAccountCohort, type WindowAccountCohort } from './accountWorkerCohort';
import type { SessionTask } from './writeSession';
import type { Bytes } from './custodyCrypto';
import { sameBytes } from './verifiedRecords';
import {
  takeAccountMirrorOpening,
  eraseIncomingOpening,
  eraseMirrorMaterial,
  mirrorOpeningError as fail,
  type AccountMirrorOpening,
  type AccountMirrorMaterial,
} from './accountMirrorMaterial';
export type { AccountMirrorOpening } from './accountMirrorMaterial';

export interface AccountMirrorWorker {
  loadRecovery(): Promise<JournalRecovery>;
  appendBatch(input: readonly ContentInput[]): Promise<ContentReceipt>;
  flushJournal(): Promise<JournalFlushReceipt>;
}
const mirrorControllers = new WeakMap<object, WindowAccountCohort>();
/** Trusted composition identity, not a native/account proof. Reject fake adapters before effects. */
export function requireWindowAccountMirrorController(
  controller: object,
  cohort: WindowAccountCohort,
): void {
  if (mirrorControllers.get(controller) !== cohort) throw fail();
  requireWindowAccountCohort(cohort);
}
type MirrorOptions = Pick<WorkspaceOptions, 'identity' | 'today' | 'deviceLabelId'>;

/** Preserve the application surface: no receive, fence or rebinding capability escapes on it. */
export async function createWindowAccountMirror(
  cohort: WindowAccountCohort,
  input: AccountMirrorOpening,
  worker: AccountMirrorWorker,
  options: MirrorOptions,
) {
  return (await createWindowAccountMirrorController(cohort, input, worker, options)).workspace;
}

/** Trusted composition only. The original Window canonical/admission/Undo owner survives rebinding. */
export async function createWindowAccountMirrorController(
  cohort: WindowAccountCohort,
  input: AccountMirrorOpening,
  worker: AccountMirrorWorker,
  options: MirrorOptions,
) {
  let opened = false,
    owned = false,
    journal: ReturnType<typeof createJournalOwner> | undefined,
    fingerprint: Bytes | undefined;
  const temporary = new Set<AccountMirrorMaterial>();
  const erase = (material: AccountMirrorMaterial) => {
    eraseMirrorMaterial(material);
    temporary.delete(material);
  };
  const keyFingerprint = async (material: AccountMirrorMaterial) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', material.key));
  try {
    requireWindowAccountCohort(cohort);
    owned = true;
    const identity = structuredClone(options.identity),
      today = options.today,
      deviceLabelId = options.deviceLabelId;
    cohort.disposeWith(() => {
      try {
        journal?.dispose();
      } finally {
        fingerprint?.fill(0);
        for (const material of temporary) eraseMirrorMaterial(material);
        temporary.clear();
      }
    });
    const io = {
      loadRecovery: worker.loadRecovery.bind(worker),
      appendBatch: worker.appendBatch.bind(worker),
      flushJournal: worker.flushJournal.bind(worker),
    };
    const first = takeAccountMirrorOpening(cohort, input, identity.id);
    temporary.add(first);
    const scope = first.scope,
      dbName = first.dbName;
    let route = first.route,
      generation = first.generation,
      binding = first.binding;
    if (dbName !== (await deriveStoreName(scope.principalId, scope.workspaceId))) throw fail();
    fingerprint = await keyFingerprint(first);
    journal = cohort.write(() =>
      createJournalOwner(scope, dbName, generation, first.key, first.previous, () => first.binding),
    );
    erase(first);
    const task: SessionTask = {
      signal: cohort.signal,
      step<T>(effect: () => T & (T extends PromiseLike<unknown> ? never : T)): T {
        return cohort.write<T>(effect);
      },
      wait: async (start) => {
        cohort.write(() => {});
        const value = await start();
        cohort.write(() => {});
        return value;
      },
    };
    const refreshBudget = async () => eraseJournalSnapshot(await journal!.readSnapshot(task));
    await refreshBudget();
    const carrier: AdmissionCarrier = {
      get state() {
        return cohort.state === 'failed' ? 'failed' : cohort.state;
      },
      signal: cohort.signal,
      close: () => cohort.close(),
      beforeRelease: (cleanup) => cohort.beforeRelease(cleanup),
      get observedJournalCharacters() {
        return journal!.observedCharacters;
      },
      captureLocal: (_update, sources) =>
        cohort.write(() => {
          if (!sources?.length) throw fail();
          return makeSourceCapsule(route, sources);
        }),
      appendLocal: (bytes) =>
        cohort.write(() => {
          const c = decodeSourceCapsule(bytes, route);
          eraseCapsule(c);
          return journal!.append(bytes);
        }),
      loadRecovery: async () => {
        cohort.write(() => {});
        const recovery = await io.loadRecovery();
        try {
          cohort.write(() => {});
          return recovery;
        } catch (cause) {
          for (const r of [...recovery.records, ...recovery.journal]) r.bytes.fill(0);
          throw cause;
        }
      },
      appendBatch: async (input) => {
        const copied = cohort.write(() => copyBatch(input));
        try {
          for (const r of copied) {
            if (r.kind !== 'update') throw fail();
            const c = decodeSourceCapsule(r.bytes, route);
            eraseCapsule(c);
          }
          const result = await io.appendBatch(copied);
          cohort.write(() => {});
          return result;
        } finally {
          for (const r of copied) r.bytes.fill(0);
        }
      },
      flushJournal: async () => {
        cohort.write(() => {});
        const result = await io.flushJournal();
        cohort.write(() => {});
        await refreshBudget();
        return result;
      },
    };
    const batch = accountBatchPolicy(import.meta.env?.['VITE_ACCOUNT_BATCH']);
    let enqueue!: OwnedReceiveQueue,
      prepare!: OwnedPreparedReceiveQueue,
      journalFence!: OwnedJournalFenceQueue;
    const workspace = await createAdmittedWorkspace(
      (config) =>
        createAdmissionOwner(
          carrier,
          {
            ...config,
            ...(batch.localFlush ? { flushBatch: batch.localFlush } : {}),
            ...(import.meta.env?.['VITE_ACCOUNT_BACKGROUND_FLUSH'] !== '0'
              ? { backgroundFlush: true as const }
              : {}),
            ...(batch.publication ? { publishReceivePage: true } : {}),
          },
          (receive, prepared, fenced) => {
            enqueue = receive;
            prepare = prepared;
            journalFence = fenced;
          },
        ),
      {
        identity,
        ...(today ? { today } : {}),
        ...(deviceLabelId ? { deviceLabelId } : {}),
        captureSources: true,
        suppressEmptySources: true,
        signal: cohort.signal,
        validateReceive: () => {
          throw Error('Use the worker-owned signed-page receiver');
        },
      },
      accountLedgerMode(import.meta.env?.['VITE_ACCOUNT_LEDGER']) === 'incremental'
        ? accountTextMode(import.meta.env?.['VITE_ACCOUNT_TEXT_ADMISSION'])
        : 'reference',
    );

    const rebind = async (fence: AdmissionFence, incoming: AccountMirrorOpening) => {
      let authorized = false,
        material: AccountMirrorMaterial | undefined,
        nextFingerprint: Bytes | undefined;
      let candidate: ReturnType<typeof createJournalOwner> | undefined;
      const check = () => {
        requireWindowAccountCohort(cohort);
        requireAdmissionFence(fence, carrier);
      };
      try {
        check();
        authorized = true;
        material = takeAccountMirrorOpening(cohort, incoming, identity.id);
        temporary.add(material);
        if (
          material.dbName !== dbName ||
          Object.keys(scope).some(
            (k) => scope[k as keyof typeof scope] !== material!.scope[k as keyof typeof scope],
          ) ||
          material.route.credential !== route.credential ||
          material.generation < generation ||
          material.route.epoch < route.epoch ||
          (binding &&
            (!material.binding ||
              material.binding.intent !== binding.intent ||
              material.binding.era.revision < binding.era.revision ||
              (material.binding.era.revision === binding.era.revision &&
                (material.binding.era.current !== binding.era.current ||
                  material.binding.era.previous !== binding.era.previous))))
        )
          throw fail();
        nextFingerprint = await keyFingerprint(material);
        check();
        // An internal equality guard, never authentication or exported approval. Keep no raw JS key
        // after codec import, and refuse an unexpected same-generation key change before sealing.
        if (material.generation === generation && !sameBytes(fingerprint!, nextFingerprint))
          throw fail();
        const pending = cohort.write(() => journal!.snapshot());
        try {
          if (pending.length) throw fail();
        } finally {
          eraseJournalSnapshot(pending);
        }
        check();
        const nextBinding = material.binding;
        candidate = cohort.write(() =>
          createJournalOwner(
            scope,
            dbName,
            material!.generation,
            material!.key,
            material!.previous,
            () => nextBinding,
          ),
        );
        // Refresh its actual Window storage budget while the same FIFO reservation excludes input.
        eraseJournalSnapshot(await candidate.readSnapshot(task));
        check();
        const previousJournal = journal;
        journal = candidate;
        candidate = undefined;
        route = material.route;
        generation = material.generation;
        binding = material.binding;
        fingerprint!.fill(0);
        fingerprint = nextFingerprint;
        nextFingerprint = undefined;
        previousJournal!.dispose();
      } catch (cause) {
        // Awaiting close from inside its own queue head would deadlock drain. Abort is immediate;
        // the owning composition observes the rejection while normal root cleanup drains this job.
        if (authorized) void cohort.close().catch(() => {});
        throw cause;
      } finally {
        candidate?.dispose();
        nextFingerprint?.fill(0);
        if (material) erase(material);
        eraseIncomingOpening(incoming);
      }
    };
    opened = true;
    const controller = Object.freeze({ workspace, enqueue, prepare, journalFence, rebind });
    mirrorControllers.set(controller, cohort);
    return controller;
  } catch (cause) {
    if (owned) {
      try {
        await cohort.close();
      } catch (cleanup) {
        throw new AggregateError([cause, cleanup], 'Worker mirror opening and cleanup failed.');
      }
    }
    throw cause;
  } finally {
    eraseIncomingOpening(input);
    if (!opened) fingerprint?.fill(0);
    for (const material of temporary) eraseMirrorMaterial(material);
    temporary.clear();
  }
}
