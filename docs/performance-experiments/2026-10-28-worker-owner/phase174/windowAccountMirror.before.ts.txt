/** Internal Window admission over a completed, authenticated dedicated-worker opening.
 * This is not an account opener: the composition must obtain material from its real verified worker.
 * It never receives a root/generation/content/signing key. No application route selects it yet. */
import { createAdmittedWorkspace, type WorkspaceOptions } from './admittedWorkspace';
import { createAdmissionOwner, type AdmissionCarrier } from './admissionQueue';
import { copyBatch, type ContentIdentity, type ContentInput } from './contentRecord';
import type { ContentReceipt } from './contentStore';
import type { JournalRecovery } from './custody';
import { createJournalOwner, eraseJournalSnapshot, type JournalFlushReceipt } from './journalStore';
import { parseJournalEra, type JournalBinding } from './journalEra';
import { deriveStoreName } from './storeName';
import {
  makeSourceCapsule,
  decodeSourceCapsule,
  eraseCapsule,
  type CaptureRoute,
} from './sourceCapture';
import { accountBatchPolicy } from './accountBatchPolicy';
import { accountTextMode } from './accountTextMode';
import { accountLedgerMode } from './accountLedgerMode';
import { requireWindowAccountCohort, type WindowAccountCohort } from './accountWorkerCohort';
import type { SessionTask } from './writeSession';
import type { Bytes } from './custodyCrypto';

export interface AccountMirrorOpening {
  readonly incarnation: string;
  readonly scope: ContentIdentity;
  readonly dbName: string;
  readonly generation: number;
  /** Owned copies of domain-separated journal subkeys ONLY; this factory consumes/erases them. */
  readonly key: Bytes;
  readonly previous: readonly (readonly [number, Bytes])[];
  readonly binding?: JournalBinding;
  readonly route: Omit<CaptureRoute, 'history'>;
}
export interface AccountMirrorWorker {
  /** Original verified native recovery, not a fabricated record/receipt or a serialized proof lease. */
  loadRecovery(): Promise<JournalRecovery>;
  appendBatch(input: readonly ContentInput[]): Promise<ContentReceipt>;
  flushJournal(): Promise<JournalFlushReceipt>;
}
const fail = () => new Error('Worker mirror opening is not bound to this live account.');
const fields = (v: unknown, expected: string) => {
  if (!v || typeof v !== 'object' || Object.getPrototypeOf(v) !== Object.prototype) throw fail();
  const descriptors = Object.getOwnPropertyDescriptors(v);
  if (
    Reflect.ownKeys(descriptors).sort().join(',') !== expected ||
    Object.values(descriptors).some((d) => !('value' in d))
  )
    throw fail();
};
const ordinaryKey = (key: Uint8Array) => {
  if (
    !(key instanceof Uint8Array) ||
    Object.getPrototypeOf(key) !== Uint8Array.prototype ||
    !(key.buffer instanceof ArrayBuffer) ||
    key.length !== 32
  )
    throw fail();
  key.subarray(0, 0);
  return new Uint8Array(key);
};
function eraseIncoming(input: AccountMirrorOpening) {
  if (!input || typeof input !== 'object') return;
  const d = Object.getOwnPropertyDescriptors(input);
  const erase = (v: unknown) => {
    if (
      v instanceof Uint8Array &&
      Object.getPrototypeOf(v) === Uint8Array.prototype &&
      v.buffer instanceof ArrayBuffer
    ) {
      try {
        v.fill(0);
      } catch {
        /* detached owned bytes cannot be reused */
      }
    }
  };
  erase(d['key']?.value);
  const previous = d['previous']?.value;
  if (Array.isArray(previous)) for (const pair of previous) if (Array.isArray(pair)) erase(pair[1]);
}

/** Trusted composition seam, like createAdmittedWorkspace. It accepts no service/UI-supplied key hint.
 * The cohort and original admission owner retain native exclusion and accepted/pending semantics. */
export async function createWindowAccountMirror(
  cohort: WindowAccountCohort,
  input: AccountMirrorOpening,
  worker: AccountMirrorWorker,
  options: Pick<WorkspaceOptions, 'identity' | 'today' | 'deviceLabelId'>,
) {
  let owned = false,
    journal: ReturnType<typeof createJournalOwner> | undefined;
  const retained = new Map<number, Bytes>();
  let key: Bytes | undefined;
  try {
    requireWindowAccountCohort(cohort);
    owned = true;
    const identity = structuredClone(options.identity),
      today = options.today,
      deviceLabelId = options.deviceLabelId;
    const io = {
      loadRecovery: worker.loadRecovery.bind(worker),
      appendBatch: worker.appendBatch.bind(worker),
      flushJournal: worker.flushJournal.bind(worker),
    };
    fields(
      input,
      Object.hasOwn(input, 'binding')
        ? 'binding,dbName,generation,incarnation,key,previous,route,scope'
        : 'dbName,generation,incarnation,key,previous,route,scope',
    );
    fields(input.scope, 'principalId,rootId,slotId,storeId,workspaceId');
    fields(input.route, 'credential,epoch,generation,principal,workspace');
    const scope = structuredClone(input.scope),
      route = structuredClone(input.route),
      generation = input.generation,
      dbName = input.dbName;
    if (
      input.incarnation !== cohort.ticket.incarnation ||
      scope.slotId !== cohort.ticket.slotId ||
      [scope.principalId, scope.workspaceId, scope.storeId, scope.rootId, route.credential].some(
        (v) => typeof v !== 'string' || !/^[a-f0-9]{32}$/.test(v),
      ) ||
      route.workspace !== scope.workspaceId ||
      route.principal !== scope.principalId ||
      identity.id !== scope.principalId ||
      !Number.isSafeInteger(generation) ||
      generation < 1 ||
      generation > 0xffffffff ||
      route.generation !== generation ||
      !Number.isSafeInteger(route.epoch) ||
      route.epoch < 1 ||
      typeof dbName !== 'string' ||
      !Array.isArray(input.previous) ||
      input.previous.length > 128
    )
      throw fail();
    key = ordinaryKey(input.key);
    // Register erasure before the first await. A canceled bootstrap cannot retain usable subkeys.
    cohort.disposeWith(() => {
      try {
        journal?.dispose();
      } finally {
        key?.fill(0);
        for (const v of retained.values()) v.fill(0);
        retained.clear();
      }
    });
    for (const pair of input.previous) {
      if (
        !Array.isArray(pair) ||
        pair.length !== 2 ||
        !Number.isSafeInteger(pair[0]) ||
        pair[0] < 1 ||
        pair[0] >= generation ||
        retained.has(pair[0])
      )
        throw fail();
      retained.set(pair[0], ordinaryKey(pair[1]));
    }
    let binding: JournalBinding | undefined;
    if (input.binding) {
      fields(input.binding, 'era,identity,intent');
      fields(input.binding.identity, 'principalId,rootId,slotId,storeId,workspaceId');
      if (
        Object.keys(scope).some(
          (k) =>
            scope[k as keyof ContentIdentity] !==
            input.binding!.identity[k as keyof ContentIdentity],
        ) ||
        typeof input.binding.intent !== 'string' ||
        !input.binding.intent
      )
        throw fail();
      binding = {
        identity: structuredClone(input.binding.identity),
        intent: input.binding.intent,
        era: parseJournalEra(input.binding.era),
      };
    }
    eraseIncoming(input);
    if (dbName !== (await deriveStoreName(scope.principalId, scope.workspaceId))) throw fail();
    journal = cohort.write(() =>
      createJournalOwner(scope, dbName, generation, key!, retained, () => binding),
    );
    key.fill(0);
    for (const v of retained.values()) v.fill(0);
    retained.clear();
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
    return await createAdmittedWorkspace(
      (config) =>
        createAdmissionOwner(carrier, {
          ...config,
          ...(batch.localFlush ? { flushBatch: batch.localFlush } : {}),
          ...(import.meta.env?.['VITE_ACCOUNT_BACKGROUND_FLUSH'] !== '0'
            ? { backgroundFlush: true as const }
            : {}),
        }),
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
    eraseIncoming(input);
    key?.fill(0);
    for (const v of retained.values()) v.fill(0);
    retained.clear();
  }
}
