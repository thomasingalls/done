/** Controlled carrier fixture only; this does not authenticate an Account or replace native browser evidence. */
import { copyAccountMirrorRecovery } from '../../src/crdt/accountMirrorRecovery';
import { vi } from 'vitest';
import {
  createWindowAccountMirror,
  createWindowAccountMirrorController,
  type AccountMirrorOpening,
} from '../../src/crdt/windowAccountMirror';
import { openWindowAccountCohort } from '../../src/crdt/accountWorkerCohort';
import { createJournalOwner, eraseJournalSnapshot } from '../../src/crdt/journalStore';
import {
  capturedRecovery,
  decodeSourceCapsule,
  eraseCapsule,
  type CaptureRoute,
} from '../../src/crdt/sourceCapture';
import { createDoc, encodeState } from '../../src/crdt/yjs';
import { deriveStoreName } from '../../src/crdt/storeName';
import { type ContentInput, type OpenedRecord } from '../../src/crdt/contentRecord';
import type { Bytes } from '../../src/crdt/custodyCrypto';
import type { SessionTask } from '../../src/crdt/writeSession';
import type { JournalBinding } from '../../src/crdt/journalEra';
const stops: (() => Promise<void> | void)[] = [];
export async function cleanupMirrorFixtures() {
  for (const stop of stops.splice(0).reverse()) await stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
}
export const scope = {
  slotId: 'account-' + '01'.repeat(16),
  principalId: '02'.repeat(16),
  workspaceId: '03'.repeat(16),
  storeId: '04'.repeat(16),
  rootId: '05'.repeat(16),
};
export const route: CaptureRoute = {
  workspace: scope.workspaceId,
  principal: scope.principalId,
  credential: '06'.repeat(16),
  epoch: 1,
  generation: 1,
};
export const identity = {
  id: scope.principalId,
  actor: { kind: 'human' as const, name: 'Fixture', color: '#e0662f' },
  device: { id: 'fixture', name: 'Fixture' },
};
class StorageMap implements Storage {
  [key: string]: unknown;
  get length() {
    return Object.keys(this).length;
  }
  key(i: number) {
    return Object.keys(this)[i] ?? null;
  }
  getItem(k: string) {
    return Object.hasOwn(this, k) ? (this[k] as string) : null;
  }
  setItem(k: string, v: string) {
    Object.defineProperty(this, k, {
      value: v,
      configurable: true,
      enumerable: true,
      writable: true,
    });
  }
  removeItem(k: string) {
    delete this[k];
  }
  clear() {
    for (const k of Object.keys(this)) delete this[k];
  }
}
function nativeModel() {
  const held: { name: string; mode: LockMode; clientId: string }[] = [];
  const locks = {
    query: async () => ({ held: [...held], pending: [] }),
    request: async (
      name: string,
      options: LockOptions,
      callback: (lock: Lock) => Promise<unknown>,
    ) => {
      const lock = { name, mode: options.mode ?? 'exclusive', clientId: 'unit-window' };
      held.push(lock);
      try {
        return await callback(lock);
      } finally {
        held.splice(held.indexOf(lock), 1);
      }
    },
  };
  vi.stubGlobal('window', {});
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', { locks });
  return held;
}
export async function fixture() {
  const held = nativeModel(),
    storage = new StorageMap();
  vi.stubGlobal('localStorage', storage);
  const dbName = await deriveStoreName(scope.principalId, scope.workspaceId),
    key = new Uint8Array(32).fill(7);
  let workerBinding: JournalBinding | undefined,
    workerRoute = { ...route };
  const workerJournal = createJournalOwner(scope, dbName, 1, key, new Map(), () => workerBinding);
  const initial = createDoc(),
    records: OpenedRecord[] = [
      { kind: 'state', gen: 1, seq: 1, bytes: new Uint8Array(encodeState(initial)) },
    ];
  initial.destroy();
  let next = 2,
    gate: Promise<void> | undefined,
    release: (() => void) | undefined;
  let appendCalls = 0,
    flushCalls = 0,
    loads = 0;
  const task: SessionTask = {
    signal: new AbortController().signal,
    step: (fn) => fn(),
    wait: async (fn) => fn(),
  };
  const commit = async (values: Bytes[]) => {
    const sequences: number[] = [];
    for (const value of values) {
      const capsule = decodeSourceCapsule(value, workerRoute);
      try {
        if (
          records.some(
            (r) => r.kind === 'outbound' && Buffer.from(r.bytes).equals(Buffer.from(value)),
          )
        )
          continue;
        for (const source of capsule.sources) {
          const seq = next++;
          records.push({ kind: 'update', gen: 1, seq, bytes: source.bytes.slice() });
          sequences.push(seq);
        }
        const seq = next++;
        records.push({ kind: 'outbound', gen: 1, seq, bytes: value.slice() });
        sequences.push(seq);
      } finally {
        eraseCapsule(capsule);
      }
    }
    return { storeId: scope.storeId, generation: 1, sequences };
  };
  const worker = {
    loadRecovery: async () => {
      loads++;
      const journal = workerJournal.snapshot();
      try {
        return copyAccountMirrorRecovery(
          capturedRecovery(
            { records: records.map((r) => ({ ...r, bytes: r.bytes.slice() })), journal },
            workerRoute,
          ),
        );
      } finally {
        eraseJournalSnapshot(journal);
      }
    },
    appendBatch: async (input: readonly ContentInput[]) => {
      appendCalls++;
      await gate;
      return commit(input.map((r) => r.bytes));
    },
    flushJournal: async () => {
      flushCalls++;
      const journal = workerJournal.snapshot();
      try {
        return await workerJournal.flush(task, journal, (_task, values) => commit(values));
      } finally {
        eraseJournalSnapshot(journal);
      }
    },
  };
  const cohort = await openWindowAccountCohort(scope.slotId, async () => workerJournal.dispose());
  stops.push(async () => {
    release?.();
    gate = undefined;
    await cohort.close();
  });
  const opening = (): AccountMirrorOpening => ({
    incarnation: cohort.ticket.incarnation,
    scope: { ...scope },
    dbName,
    generation: 1,
    key: key.slice(),
    previous: [],
    route: { ...workerRoute },
    ...(workerBinding ? { binding: structuredClone(workerBinding) } : {}),
  });
  const material = opening(),
    options = { identity: structuredClone(identity), today: () => '2026-10-28' as const };
  const open = () => createWindowAccountMirror(cohort, material, worker, options);
  const openController = () =>
    createWindowAccountMirrorController(cohort, material, worker, options);
  const hold = () => {
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
  };
  const free = () => {
    release?.();
    gate = undefined;
  };
  return {
    held,
    storage,
    worker,
    cohort,
    material,
    options,
    open,
    openController,
    moveWorkerContext(epoch: number, binding?: JournalBinding) {
      workerRoute = { ...workerRoute, epoch };
      workerBinding = binding ? structuredClone(binding) : undefined;
    },
    opening,
    records,
    workerJournal,
    counts: () => ({ appendCalls, flushCalls, loads }),
    hold,
    free,
  };
}
