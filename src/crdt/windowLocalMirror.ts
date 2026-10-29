/** Canonical Local UI/Undo stays in Window; native custody/content and crypto stay in Worker. */
import { createAdmittedWorkspace, type WorkspaceOptions } from './admittedWorkspace';
import { createAdmissionOwner, type AdmissionCarrier } from './admissionQueue';
import { requireWindowLocalCohort, type WindowAccountCohort } from './accountWorkerCohort';
import { createJournalOwner, eraseJournalSnapshot } from './journalStore';
import { deriveStoreName } from './storeName';
import { copyBatch } from './contentRecord';
import { eraseWorkerMessage } from './workerChannel';
import type { LocalMirrorOpening, openLocalWorkerSession } from './localWorkerClient';
import type { SessionTask } from './writeSession';
import type { Bytes } from './custodyCrypto';

const refused = () => Error('Local mirror is not bound to its live native Worker');
const shape = (input: unknown, fields: string) => {
  if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype)
    throw refused();
  const d = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(d).sort().join() !== fields || Object.values(d).some((v) => !('value' in v)))
    throw refused();
};
const keyCopy = (input: Uint8Array) => {
  if (
    !(input instanceof Uint8Array) ||
    Object.getPrototypeOf(input) !== Uint8Array.prototype ||
    !(input.buffer instanceof ArrayBuffer) ||
    input.length !== 32
  )
    throw refused();
  return new Uint8Array(input);
};
/** Takes ownership even on refused or canceled composition. Never accepts a Local factor or root key. */
export async function createWindowLocalMirror(
  cohort: WindowAccountCohort,
  incoming: LocalMirrorOpening,
  worker: Awaited<ReturnType<typeof openLocalWorkerSession>>['worker'],
  options: Pick<WorkspaceOptions, 'identity' | 'today'>,
) {
  let journal: ReturnType<typeof createJournalOwner> | undefined,
    key: Bytes | undefined,
    owned = false;
  const previous = new Map<number, Bytes>();
  try {
    requireWindowLocalCohort(cohort);
    owned = true;
    cohort.disposeWith(() => journal?.dispose());
    const identity = structuredClone(options.identity),
      today = options.today;
    shape(incoming, 'dbName,generation,incarnation,key,previous,scope');
    shape(incoming.scope, 'principalId,rootId,slotId,storeId,workspaceId');
    const scope = structuredClone(incoming.scope),
      generation = incoming.generation,
      dbName = incoming.dbName;
    if (
      incoming.incarnation !== cohort.ticket.incarnation ||
      scope.slotId !== cohort.ticket.slotId ||
      [scope.principalId, scope.workspaceId, scope.rootId, scope.storeId].some(
        (v) => typeof v !== 'string' || !/^[a-f0-9]{32}$/.test(v),
      ) ||
      identity.id !== scope.principalId ||
      !Number.isSafeInteger(generation) ||
      generation < 1 ||
      generation > 0xffffffff ||
      typeof dbName !== 'string' ||
      !Array.isArray(incoming.previous) ||
      incoming.previous.length > 128
    )
      throw refused();
    key = keyCopy(incoming.key);
    for (const row of incoming.previous) {
      if (
        !Array.isArray(row) ||
        row.length !== 2 ||
        !Number.isSafeInteger(row[0]) ||
        row[0] < 1 ||
        row[0] >= generation ||
        previous.has(row[0])
      )
        throw refused();
      previous.set(row[0], keyCopy(row[1]));
    }
    // Capture keys and fields synchronously, then erase every incoming/temporary copy before await.
    journal = cohort.write(() => createJournalOwner(scope, dbName, generation, key!, previous));
    eraseWorkerMessage(incoming);
    key.fill(0);
    for (const k of previous.values()) k.fill(0);
    previous.clear();
    if (dbName !== (await deriveStoreName(scope.principalId, scope.workspaceId))) throw refused();
    requireWindowLocalCohort(cohort);
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
    const budget = async () => eraseJournalSnapshot(await journal!.readSnapshot(task));
    const io = {
      loadRecovery: worker.loadRecovery.bind(worker),
      appendBatch: worker.appendBatch.bind(worker),
      flushJournal: worker.flushJournal.bind(worker),
    };
    const carrier: AdmissionCarrier = {
      get state() {
        return cohort.state;
      },
      signal: cohort.signal,
      close: () => cohort.close(),
      beforeRelease: (cleanup) => cohort.beforeRelease(cleanup),
      get observedJournalCharacters() {
        return journal!.observedCharacters;
      },
      appendLocal: (update) => cohort.write(() => journal!.append(update)),
      async loadRecovery() {
        cohort.write(() => {});
        const result = await io.loadRecovery();
        try {
          cohort.write(() => {});
          return result;
        } catch (cause) {
          for (const r of [...result.records, ...result.journal]) r.bytes.fill(0);
          throw cause;
        }
      },
      async appendBatch(input) {
        const copied = cohort.write(() => copyBatch(input));
        try {
          if (copied.some((v) => v.kind !== 'update')) throw refused();
          const result = await io.appendBatch(copied);
          cohort.write(() => {});
          return result;
        } finally {
          for (const r of copied) r.bytes.fill(0);
        }
      },
      compactContent: (interrupt, fence) => {
        if (!interrupt || !fence) throw refused();
        return worker.compactContent(interrupt, fence, carrier);
      },
      async flushJournal() {
        cohort.write(() => {});
        const result = await io.flushJournal();
        cohort.write(() => {});
        await budget();
        return result;
      },
    };
    await budget();
    return await createAdmittedWorkspace(
      (config) => createAdmissionOwner(carrier, config),
      {
        identity,
        ...(today ? { today } : {}),
        signal: cohort.signal,
        validateReceive: () => {
          throw Error('Network delivery is not enabled for Local');
        },
      },
      'local-snapshots',
    );
  } catch (cause) {
    if (owned) await cohort.close();
    throw cause;
  } finally {
    eraseWorkerMessage(incoming);
    key?.fill(0);
    for (const k of previous.values()) k.fill(0);
    previous.clear();
  }
}
