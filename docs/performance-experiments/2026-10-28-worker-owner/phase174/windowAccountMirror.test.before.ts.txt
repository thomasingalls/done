// @vitest-environment node
import { copyAccountMirrorRecovery } from '../src/crdt/accountMirrorRecovery';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createWindowAccountMirror,
  type AccountMirrorOpening,
} from '../src/crdt/windowAccountMirror';
import { openWindowAccountCohort, type WindowAccountCohort } from '../src/crdt/accountWorkerCohort';
import { createJournalOwner, eraseJournalSnapshot } from '../src/crdt/journalStore';
import {
  capturedRecovery,
  decodeSourceCapsule,
  eraseCapsule,
  type CaptureRoute,
} from '../src/crdt/sourceCapture';
import { createDoc, encodeState } from '../src/crdt/yjs';
import { deriveStoreName } from '../src/crdt/storeName';
import { type ContentInput, type OpenedRecord } from '../src/crdt/contentRecord';
import type { Bytes } from '../src/crdt/custodyCrypto';
import type { SessionTask } from '../src/crdt/writeSession';
const stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const stop of stops.splice(0).reverse()) await stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const scope = {
  slotId: 'account-' + '01'.repeat(16),
  principalId: '02'.repeat(16),
  workspaceId: '03'.repeat(16),
  storeId: '04'.repeat(16),
  rootId: '05'.repeat(16),
};
const route: CaptureRoute = {
  workspace: scope.workspaceId,
  principal: scope.principalId,
  credential: '06'.repeat(16),
  epoch: 1,
  generation: 1,
};
const identity = {
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
async function fixture() {
  const held = nativeModel(),
    storage = new StorageMap();
  vi.stubGlobal('localStorage', storage);
  const dbName = await deriveStoreName(scope.principalId, scope.workspaceId),
    key = new Uint8Array(32).fill(7);
  const workerJournal = createJournalOwner(scope, dbName, 1, key);
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
      const capsule = decodeSourceCapsule(value, route);
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
            route,
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
    route: { ...route },
  });
  const material = opening(),
    options = { identity: structuredClone(identity), today: () => '2026-10-28' as const };
  const open = () => createWindowAccountMirror(cohort, material, worker, options);
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
    opening,
    records,
    workerJournal,
    counts: () => ({ appendCalls, flushCalls, loads }),
    hold,
    free,
  };
}
const end = (w: Awaited<ReturnType<typeof createWindowAccountMirror>>) =>
  w.text({ kind: 'master' });
const sel = (at: number) => ({ ranges: [{ anchor: at, head: at }], main: 0 });
async function ready() {
  const f = await fixture(),
    w = await f.open();
  await w.whenDurable();
  // Match the next browser input task, after the explicit flush barrier finishes its queue turn.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { ...f, w };
}
it('local text is accepted and sealed in the same handler without a worker append', async () => {
  const f = await ready(),
    before = f.counts();
  f.hold();
  const text = end(f.w),
    at = text.read().text.length;
  const ticket = text.input({ name: 'insert', text: ' local' }, sel(at));
  expect(text.read().text).toBe(' local');
  expect(f.counts()).toEqual(before);
  expect(f.storage.length).toBeGreaterThan(0);
  expect(f.material.key.every((v) => v === 0)).toBe(true);
  await ticket.accepted;
  const snapshot = f.workerJournal.snapshot();
  expect(snapshot.length).toBeGreaterThan(0);
  eraseJournalSnapshot(snapshot);
  f.free();
});
it('the original human Undo and Redo operate on admitted mirror state', async () => {
  const f = await ready();
  await end(f.w).input({ name: 'insert', text: ' edit' }, sel(0)).accepted;
  await f.w.command({ kind: 'undo' }).accepted;
  expect(end(f.w).read().text).toBe('');
  await f.w.command({ kind: 'redo' }).accepted;
  expect(end(f.w).read().text).toBe(' edit');
});
it('quota refusal leaves text pending until the worker commit and later input cannot overtake', async () => {
  const f = await ready();
  f.hold();
  vi.spyOn(f.storage, 'setItem').mockImplementation(() => {
    throw new DOMException('quota', 'QuotaExceededError');
  });
  const first = end(f.w).input({ name: 'insert', text: 'a' }, sel(0)),
    second = end(f.w).input({ name: 'insert', text: 'b' }, sel(0));
  let accepted = false;
  void first.accepted.then(() => {
    accepted = true;
  });
  for (let i = 0; i < 20 && f.counts().appendCalls === 0; i++)
    await new Promise((r) => setTimeout(r, 0));
  expect(f.counts().appendCalls).toBe(1);
  expect(end(f.w).read().text).toBe('');
  expect(accepted).toBe(false);
  f.free();
  await first.accepted;
  await second.accepted;
  expect(end(f.w).read().text).toBe('ab');
});
it('closing during a commit never promotes its late reply and retains the recoverable suffix', async () => {
  const f = await ready();
  f.hold();
  vi.spyOn(f.storage, 'setItem').mockImplementation(() => {
    throw new DOMException('quota', 'QuotaExceededError');
  });
  const ticket = end(f.w).input({ name: 'insert', text: 'uncertain' }, sel(0));
  const refused = expect(ticket.accepted).rejects.toThrow();
  for (let i = 0; i < 20 && f.counts().appendCalls === 0; i++)
    await new Promise((r) => setTimeout(r, 0));
  const closing = f.cohort.close();
  expect(f.cohort.state).toBe('closing');
  expect(f.held.some((v) => v.name === 'done/slot-writer/' + JSON.stringify(scope.slotId))).toBe(
    true,
  );
  f.free();
  await refused;
  await closing;
  expect(f.cohort.state).toBe('closed');
  expect(f.records.some((r) => r.kind === 'update')).toBe(true);
});
it('generic remote input cannot bypass the owned signed-page receiver', async () => {
  const f = await ready(),
    before = f.w.snapshot();
  await expect(f.w.receive(Uint8Array.of(0, 0)).accepted).rejects.toThrow('validation');
  expect(f.w.snapshot()).toEqual(before);
});
it('wrong incarnation refuses and consumes every owned incoming journal key', async () => {
  const f = await fixture();
  (f.material as { incarnation: string }).incarnation = 'ff'.repeat(16);
  const old = new Uint8Array(32).fill(9);
  (f.material as unknown as { previous: [number, Bytes][] }).previous = [[1, old]];
  await expect(f.open()).rejects.toThrow('bound');
  expect(f.material.key.every((v) => v === 0)).toBe(true);
  expect(old.every((v) => v === 0)).toBe(true);
  expect(f.counts().loads).toBe(0);
});
it('wrong actor identity cannot create an admitted mirror or consult worker data', async () => {
  const f = await fixture();
  f.options.identity.id = 'ff'.repeat(16);
  await expect(f.open()).rejects.toThrow('bound');
  expect(f.counts().loads).toBe(0);
  expect(f.material.key.every((v) => v === 0)).toBe(true);
});
it('an opening cannot move journal writes to another database', async () => {
  const f = await fixture();
  (f.material as { dbName: string }).dbName = 'done.other';
  await expect(f.open()).rejects.toThrow('bound');
  expect(f.storage.length).toBe(0);
  expect(f.material.key.every((v) => v === 0)).toBe(true);
});
it('denied Window storage refuses the opening and erases its incoming subkey', async () => {
  const f = await fixture();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('denied', 'SecurityError');
    },
  });
  await expect(f.open()).rejects.toThrow('unavailable');
  expect(f.material.key.every((v) => v === 0)).toBe(true);
  expect(f.cohort.state).toBe('closed');
});
it('a forged structural coordinator is refused without calling its supplied methods', async () => {
  const f = await fixture(),
    write = vi.fn(),
    close = vi.fn();
  await expect(
    createWindowAccountMirror(
      { write, close } as unknown as WindowAccountCohort,
      f.material,
      f.worker,
      f.options,
    ),
  ).rejects.toThrow('inactive');
  expect(write).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  expect(f.material.key.every((v) => v === 0)).toBe(true);
});
it('cancellation during the initial asynchronous step cannot retain a live writer or subkey', async () => {
  const f = await fixture(),
    opening = f.open();
  const refused = expect(opening).rejects.toThrow();
  await f.cohort.close();
  await refused;
  expect(f.material.key.every((v) => v === 0)).toBe(true);
  expect(f.held).toEqual([]);
  expect(f.storage.length).toBe(0);
});
it('captures scope and actor identity before its first await', async () => {
  const f = await fixture(),
    opening = f.open();
  f.options.identity.id = 'ff'.repeat(16);
  f.material.route.principal = 'ff'.repeat(16);
  const w = await opening;
  await end(w).input({ name: 'insert', text: 'owned' }, sel(0)).accepted;
  const journal = f.workerJournal.snapshot();
  try {
    for (const e of journal) {
      const c = decodeSourceCapsule(e.bytes, route);
      expect(c.principal).toBe(scope.principalId);
      eraseCapsule(c);
    }
  } finally {
    eraseJournalSnapshot(journal);
  }
});
it('refuses an opening with a hidden authority-looking extension', async () => {
  const f = await fixture();
  Object.defineProperty(f.material, 'rootKey', { value: new Uint8Array(32), enumerable: true });
  await expect(f.open()).rejects.toThrow('bound');
  expect(f.material.key.every((v) => v === 0)).toBe(true);
});
it('retained journal openers cannot replace the active generation', async () => {
  const f = await fixture(),
    old = new Uint8Array(32).fill(9);
  (f.material as unknown as { previous: [number, Bytes][] }).previous = [[1, old]];
  await expect(f.open()).rejects.toThrow('bound');
  expect(old.every((v) => v === 0)).toBe(true);
  expect(f.material.key.every((v) => v === 0)).toBe(true);
});
