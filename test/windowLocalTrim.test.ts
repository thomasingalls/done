// @vitest-environment node
/** Controlled IDB/cohort wiring only. Actual native Worker verification is tested separately. */
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openWindowLocalCohort } from '../src/crdt/accountWorkerCohort';
import { cohortNames } from '../src/crdt/nativeCoordination';
import { createAdmissionOwner, type AdmissionCarrier } from '../src/crdt/admissionQueue';
import { createWindowLocalTrim } from '../src/crdt/windowLocalTrim';
import { createWorkerFrameStream } from '../src/crdt/workerFrameStream';
import { CONTENT_STORES, type StoredRecord, type ContentCounter } from '../src/crdt/contentRecord';
import { MaintenanceInterrupted } from '../src/crdt/contentMaintenance';
const scope = {
  slotId: 'local-trim-unit',
  principalId: '11'.repeat(16),
  workspaceId: '22'.repeat(16),
  storeId: '33'.repeat(16),
  rootId: '44'.repeat(16),
};
const counter = (): ContentCounter => ({
  v: 1,
  store_id: scope.storeId,
  intent: '55'.repeat(16),
  active_gen: 1,
  next_seq: 5,
  reserved: { '1': 4 },
  mac: new Uint8Array(32).fill(7),
});
const row = (seq: number, kind: StoredRecord['kind'] = 'update'): StoredRecord => ({
  v: 1,
  gen: 1,
  seq,
  kind,
  nonce: new Uint8Array(12).fill(seq),
  ct: new Uint8Array(128).fill(seq),
});
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function fixture() {
  vi.stubGlobal('indexedDB', new IDBFactory());
  const held: LockInfo[] = [];
  vi.stubGlobal('window', {});
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('BroadcastChannel', undefined);
  vi.stubGlobal('navigator', {
    locks: {
      query: async () => ({ held, pending: [] }),
      request: async (name: string, options: LockOptions, callback: (lock: Lock) => unknown) => {
        const info: LockInfo = { name, mode: options.mode ?? 'exclusive', clientId: 'window' };
        held.push(info);
        try {
          return await callback({ name, mode: info.mode! } as Lock);
        } finally {
          held.splice(held.indexOf(info), 1);
        }
      },
    },
  });
  const root = await openWindowLocalCohort(scope.slotId, async () => {
    for (let i = held.length - 1; i >= 0; i--)
      if (held[i]!.clientId === 'worker') held.splice(i, 1);
  });
  const names = cohortNames(scope.slotId, root.ticket.incarnation);
  held.push(
    { name: names.member, mode: 'exclusive', clientId: 'worker' },
    { name: names.slot, mode: 'shared', clientId: 'worker' },
  );
  await root.bindLocalWorker();
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('trim-test', 1);
    r.onupgradeneeded = () => {
      for (const s of CONTENT_STORES) r.result.createObjectStore(s);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const modify = (effect: (tx: IDBTransaction) => void) =>
    new Promise<void>((resolve, reject) => {
      const tx = db.transaction([...CONTENT_STORES], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      effect(tx);
    });
  await modify((tx) => {
    tx.objectStore('meta').put(counter(), 'counter');
    tx.objectStore('content').put(row(1), 1);
    tx.objectStore('content').put(row(2, 'state'), 2);
    tx.objectStore('heads').put(row(3, 'heads'), 3);
    tx.objectStore('outbound').put(row(4, 'outbound'), 4);
  });
  const inventory = () =>
    new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction([...CONTENT_STORES]);
      const data: Record<string, unknown> = {};
      for (const s of CONTENT_STORES) {
        const r = tx.objectStore(s).getAll();
        r.onsuccess = () => (data[s] = r.result);
      }
      tx.oncomplete = () => resolve(data);
      tx.onabort = () => reject(tx.error);
    });
  const stop = new AbortController(),
    gate = deferred(),
    entered = deferred();
  let trim!: ReturnType<typeof createWindowLocalTrim>, interrupt!: AbortSignal;
  const matches = vi.fn(() => true);
  let journalEntries = 0;
  const carrier: AdmissionCarrier = {
    state: 'active',
    signal: stop.signal,
    close: async () => {
      stop.abort();
    },
    observedJournalCharacters: 0,
    appendLocal: () => ({ status: 'journalled', generation: 1, key: 'unit' + ++journalEntries }),
    appendBatch: async () => ({ storeId: scope.storeId, generation: 1, sequences: [] }),
    flushJournal: async () => {
      const removed = journalEntries;
      journalEntries = 0;
      return { contentReceipts: [], removed, retained: 0 };
    },
    loadRecovery: async () => ({ records: [], journal: [] }),
    async compactContent(signal, fence) {
      interrupt = signal!;
      trim = createWindowLocalTrim(root, carrier, fence!, signal!, scope, 'trim-test', 1, {
        matchesObservation: matches,
      });
      entered.resolve();
      await gate.promise;
      return {
        status: 'retained',
        storeId: scope.storeId,
        generation: 1,
        stateSequence: null,
        removed: [],
      };
    },
  };
  const owner = await createAdmissionOwner(carrier, {
    prepare: (doc) => {
      const t = doc.getText('text');
      t.insert(t.length, 'x');
    },
    validateReceive: () => {},
  });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  for (let i = 0; i < 128; i++) await owner.submit(new Uint8Array([1])).accepted;
  await owner.whenDurable();
  await vi.advanceTimersByTimeAsync(750);
  await entered.promise;
  cleanups.push(async () => {
    trim?.close();
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await owner.close();
    db.close();
    await root.close();
  });
  const stage = (overrides: { skip?: number; fault?: number } = {}) => {
    trim.begin({ counter: counter(), rows: 4 });
    for (const record of [row(1), row(2, 'state'), row(3, 'heads'), row(4, 'outbound')]) {
      if (record.seq === overrides.skip) continue;
      const { ct, ...header } = record;
      trim.row({
        ...header,
        store: record.kind === 'state' || record.kind === 'update' ? 'content' : record.kind,
        key: record.seq,
        total: ct.length,
        covered: record.seq === 1,
      });
      if (record.seq === overrides.fault) ct[0] = ct[0]! ^ 127;
      const stream = createWorkerFrameStream([ct], ct.length);
      trim.part(stream.next());
    }
  };
  return {
    root,
    trim,
    owner,
    modify,
    inventory,
    stage,
    matches,
    get interrupt() {
      return interrupt;
    },
  };
}
it('matching full counter and all-store ciphertext census deletes only covered content after two journal checks', async () => {
  const f = await fixture();
  f.stage();
  expect(await f.trim.commit(7)).toBe(true);
  const data = (await f.inventory()) as Record<string, StoredRecord[]>;
  expect(data['content']!.map((r) => r.seq)).toEqual([2]);
  expect(data['heads']).toHaveLength(1);
  expect(data['outbound']).toHaveLength(1);
  expect(data['meta']).toHaveLength(1);
  expect(f.matches.mock.calls).toEqual([[7], [7]]);
});
it('changed same-length ciphertext retains every row and counter without a journal approval', async () => {
  const f = await fixture();
  f.stage({ fault: 3 });
  const before = await f.inventory();
  expect(await f.trim.commit(7)).toBe(false);
  expect(await f.inventory()).toEqual(before);
  expect(f.matches).not.toHaveBeenCalled();
});
it('changed authenticated counter MAC retains the entire census', async () => {
  const f = await fixture();
  f.stage();
  await f.modify((tx) => {
    const c = counter();
    c.mac[0] = c.mac[0]! ^ 127;
    tx.objectStore('meta').put(c, 'counter');
  });
  const before = await f.inventory();
  expect(await f.trim.commit(7)).toBe(false);
  expect(await f.inventory()).toEqual(before);
});
it('fresh journal changes before deletion retain every covered record', async () => {
  const f = await fixture();
  f.stage();
  f.matches.mockReturnValue(false);
  const before = await f.inventory();
  expect(await f.trim.commit(7)).toBe(false);
  expect(await f.inventory()).toEqual(before);
});
it('a journal change after a delete rolls the whole native transaction back', async () => {
  const f = await fixture();
  f.stage();
  f.matches.mockReturnValueOnce(true).mockReturnValue(false);
  const before = await f.inventory();
  expect(await f.trim.commit(7)).toBe(false);
  expect(await f.inventory()).toEqual(before);
  expect(f.matches).toHaveBeenCalledTimes(2);
});
it('unreadable journal refuses with its integrity error and no covered deletion', async () => {
  const f = await fixture();
  f.stage();
  f.matches.mockImplementation(() => {
    throw Object.assign(Error('unreadable'), { code: 'repair-required' });
  });
  const before = await f.inventory();
  await expect(f.trim.commit(7)).rejects.toMatchObject({ code: 'repair-required' });
  expect(await f.inventory()).toEqual(before);
});
it('incomplete staged frames cannot start a native trim', async () => {
  const f = await fixture();
  f.stage({ skip: 2 });
  const before = await f.inventory();
  await expect(f.trim.commit(7)).rejects.toThrow('owning maintenance');
  expect(await f.inventory()).toEqual(before);
});
it('foreground input interrupts commit permission before effects', async () => {
  const f = await fixture();
  f.stage();
  const before = await f.inventory();
  const next = f.owner.submit(new Uint8Array([1]));
  expect(f.interrupt.aborted).toBe(true);
  await expect(f.trim.commit(7)).rejects.toThrow(MaintenanceInterrupted);
  expect(await f.inventory()).toEqual(before);
  void next.accepted.catch(() => {});
});
it('unknown content metadata aborts with repair-required and leaves every record', async () => {
  const f = await fixture();
  f.stage();
  await f.modify((tx) => tx.objectStore('meta').put({}, 'unexpected'));
  const before = await f.inventory();
  await expect(f.trim.commit(7)).rejects.toMatchObject({ code: 'repair-required' });
  expect(await f.inventory()).toEqual(before);
});
it('missing content metadata is an integrity refusal rather than a successful retained trim', async () => {
  const f = await fixture();
  f.stage();
  await f.modify((tx) => tx.objectStore('meta').delete('counter'));
  const before = await f.inventory();
  await expect(f.trim.commit(7)).rejects.toMatchObject({ code: 'repair-required' });
  expect(await f.inventory()).toEqual(before);
});
it('a concurrent new immutable row retains the full census until native reauthentication', async () => {
  const f = await fixture();
  f.stage();
  await f.modify((tx) => tx.objectStore('content').put(row(5), 5));
  const before = await f.inventory();
  expect(await f.trim.commit(7)).toBe(false);
  expect(await f.inventory()).toEqual(before);
  expect(f.matches).not.toHaveBeenCalled();
});
