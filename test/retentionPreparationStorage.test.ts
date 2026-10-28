// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { setup, readCensus } from './local-baseline/anchor-fixture';
import { task } from './local-baseline/one-shot-fixture';
import { contentTransaction } from '../src/crdt/contentDatabase';
import {
  counterPayload,
  reserveCounter,
  equalCounter,
  parseStoredRecord,
} from '../src/crdt/contentRecord';
import { createPreparationJournal } from '../src/crdt/retentionPreparation';
import {
  loadPreparationCheckpoint,
  savePreparationCheckpoint,
  savePreparationDelta,
  importPreparationCheckpoint,
  disposePreparationCheckpoint,
  preparationStoreName,
  removePreparationCache,
  type PreparationStorageOwner,
} from '../src/crdt/retentionPreparationStorage';
import {
  capturePreparationPrefix,
  matchesPreparationPrefix,
} from '../src/crdt/retentionPreparationBinding';
import { sameRetentionInventory, type RetentionInventory } from '../src/crdt/localRetentionPlan';
import { probeDatabase } from '../src/crdt/startupStorage';
import { deriveStoreName } from '../src/crdt/storeName';
import { eraseVerified } from '../src/crdt/verifiedRecords';

const clean: (() => void)[] = [];
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
});
afterEach(() => {
  clean
    .splice(0)
    .reverse()
    .forEach((f) => f());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture() {
  const f = await setup(task, '11'.repeat(16), 256);
  clean.push(f.close);
  let context = '01'.repeat(32);
  const capture = async () => {
    const c = await readCensus(task, f.owner),
      counter = c.counter!;
    if (!(await f.owner.crypt.verify(task, counterPayload(f.owner.identity, counter), counter.mac)))
      throw Error('counter MAC');
    return {
      context,
      counter,
      inventory: {
        rows: c.rows,
        metadata: [{ key: 'counter', value: counter }],
      } satisfies RetentionInventory,
    };
  };
  const owner: PreparationStorageOwner = {
    name: await deriveStoreName(f.owner.identity.principalId, f.owner.identity.workspaceId),
    crypt: f.owner.crypt,
    capture,
    reserve: async (t, n) => {
      const before = (await readCensus(t, f.owner)).counter!;
      const next = reserveCounter(before, n, 1);
      next.mac = await f.owner.crypt.sign(t, counterPayload(f.owner.identity, next));
      await contentTransaction<void>(
        f.owner.db,
        t,
        ['meta'],
        'readwrite',
        (tx, _result, guard) => {
          const get = tx.objectStore('meta').get('counter');
          get.onsuccess = () =>
            guard(() => {
              if (!equalCounter(f.owner.identity, get.result, before))
                throw Error('fixture counter race');
              tx.objectStore('meta').put(next, 'counter');
            });
        },
        'strict',
      );
      return { first: before.next_seq, generation: 1 };
    },
  };
  const open = async () => {
    const source = await capture(),
      read = await loadPreparationCheckpoint(task, owner, source);
    const journal = createPreparationJournal({
      context: source.context,
      current: () => task.step(() => {}),
    });
    if (read.status === 'ready') importPreparationCheckpoint(read.checkpoint, journal);
    eraseVerified(source.inventory); // No retained alias may depend on this old capture.
    const dispose = () => {
      disposePreparationCheckpoint(read.checkpoint);
      journal.dispose();
    };
    clean.push(dispose);
    return {
      ...read,
      journal,
      save: () => savePreparationCheckpoint(task, owner, read.checkpoint, journal),
      dispose,
    };
  };
  const raw = async () =>
    probeDatabase(task, preparationStoreName(owner.name), (db) =>
      contentTransaction<{ head: unknown; chunks: unknown[] }>(
        db,
        task,
        ['head', 'chunks'],
        'readonly',
        (tx, result, guard) => {
          const h = tx.objectStore('head').get('current'),
            c = tx.objectStore('chunks').getAll();
          c.onsuccess = () => guard(() => result({ head: h.result, chunks: c.result }));
        },
      ),
    );
  const mutate = async (work: (tx: IDBTransaction) => void) =>
    probeDatabase(task, preparationStoreName(owner.name), (db) =>
      contentTransaction<void>(
        db,
        task,
        ['head', 'chunks'],
        'readwrite',
        (tx) => work(tx),
        'strict',
      ),
    );
  return {
    ...f,
    db: f.owner.db,
    owner,
    open,
    raw,
    mutate,
    capture,
    setContext: (c: string) => {
      context = c;
    },
  };
}
async function one(f: Awaited<ReturnType<typeof fixture>>, seq = 1) {
  const p = await f.open();
  await p.journal.memo.check(
    'opened:' + seq,
    'physical-row',
    [new Uint8Array([seq])],
    async () => new TextEncoder().encode('PRIVATE PREPARATION WRITING ' + seq),
    () => {},
  );
  await p.save();
  p.dispose();
}
it('persists only encrypted data, reopens authenticated receipts and leaves every original row intact', async () => {
  const f = await fixture(),
    before = await f.capture();
  await one(f);
  const raw = await f.raw();
  expect(raw).not.toBeNull();
  for (const value of [raw!.head, ...raw!.chunks]) {
    const row = parseStoredRecord(value);
    expect(new TextDecoder().decode(row.ct)).not.toContain('PRIVATE PREPARATION WRITING');
    expect(Object.keys(row).sort()).toEqual(['ct', 'gen', 'kind', 'nonce', 'seq', 'v']);
  }
  const p = await f.open();
  expect(p.status).toBe('ready');
  const callback = vi.fn(async () => new Uint8Array());
  expect(
    new TextDecoder().decode(
      await p.journal.memo.check(
        'opened:1',
        'physical-row',
        [new Uint8Array([1])],
        callback,
        () => {},
      ),
    ),
  ).toContain('PRIVATE PREPARATION WRITING');
  expect(callback).not.toHaveBeenCalled();
  const after = await f.capture();
  expect(
    sameRetentionInventory(
      { rows: before.inventory.rows, metadata: [] },
      { rows: after.inventory.rows, metadata: [] },
    ),
  ).toBe(true);
  expect(after.counter.next_seq).toBeGreaterThan(before.counter.next_seq);
  expect(after.counter.v === 2 && before.counter.v === 2 && after.counter.spool).toEqual(
    before.counter.v === 2 && before.counter.spool,
  );
  p.dispose();
});
it('appends only new deltas and restores both without re-encrypting old chunks', async () => {
  const f = await fixture();
  await one(f);
  const before = await f.raw();
  await one(f, 2);
  const after = await f.raw();
  expect(after!.chunks.slice(0, before!.chunks.length)).toEqual(before!.chunks);
  const p = await f.open();
  expect(p.journal.statistics.entries).toBe(2);
  expect(p.journal.statistics.pending).toBe(0);
  p.dispose();
});
it('unchanged source appends survive prefix matching, while missing/replaced/extra low rows invalidate reuse', async () => {
  const f = await fixture();
  await one(f);
  await f.carrier.append(task, [{ kind: 'state', bytes: new Uint8Array([3]) }]);
  let p = await f.open();
  expect(p.status).toBe('ready');
  p.dispose();
  const original = (await f.capture()).inventory.rows[0]!,
    row = parseStoredRecord(original.value);
  await contentTransaction<void>(f.db, task, ['content'], 'readwrite', (tx) =>
    tx.objectStore('content').delete(row.seq),
  );
  p = await f.open();
  expect(p.status).toBe('stale');
  p.dispose();
  await contentTransaction<void>(f.db, task, ['content'], 'readwrite', (tx) =>
    tx.objectStore('content').put(row, row.seq),
  );
  const altered = structuredClone(row);
  altered.ct[0]! ^= 1;
  await contentTransaction<void>(f.db, task, ['content'], 'readwrite', (tx) =>
    tx.objectStore('content').put(altered, row.seq),
  );
  p = await f.open();
  expect(p.status).toBe('stale');
  p.dispose();
});
it('new owner/verifier context invalidates reuse before any imported success', async () => {
  const f = await fixture();
  await one(f);
  f.setContext('ff'.repeat(32));
  const p = await f.open();
  expect(p.status).toBe('stale');
  expect(p.journal.statistics.entries).toBe(0);
  p.dispose();
});
it('corrupt encrypted chunks or manifest are optional-cache failures, never content authority', async () => {
  const f = await fixture();
  await one(f);
  const original = await f.raw();
  const r = parseStoredRecord(original!.chunks[0]);
  r.ct[0]! ^= 1;
  await f.mutate((tx) => tx.objectStore('chunks').put(r, r.seq));
  let p = await f.open();
  expect(p.status).toBe('invalid');
  expect(p.journal.statistics.entries).toBe(0);
  p.dispose();
  await f.mutate((tx) =>
    tx.objectStore('chunks').put(original!.chunks[0], parseStoredRecord(original!.chunks[0]).seq),
  );
  const head = parseStoredRecord(original!.head);
  head.ct[0]! ^= 1;
  await f.mutate((tx) => tx.objectStore('head').put(head, 'current'));
  p = await f.open();
  expect(p.status).toBe('invalid');
  p.dispose();
  expect((await f.carrier.load(task)).length).toBeGreaterThan(0);
});
it('reservation/sealing interruption burns the range and retains the prior checkpoint', async () => {
  const f = await fixture();
  await one(f);
  const before = await f.raw(),
    counter = (await f.capture()).counter.next_seq;
  const p = await f.open();
  await p.journal.memo.check(
    'spool:2',
    'r',
    [],
    async () => {},
    () => {},
  );
  const spy = vi.spyOn(f.owner.crypt, 'seal').mockRejectedValueOnce(Error('interrupted seal'));
  await expect(p.save()).rejects.toThrow('interrupted seal');
  spy.mockRestore();
  expect(await f.raw()).toEqual(before);
  expect((await f.capture()).counter.next_seq).toBeGreaterThan(counter);
  p.dispose();
  await one(f, 2);
  const restored = await f.open();
  expect(restored.journal.statistics.entries).toBe(2);
  restored.dispose();
});
it('strict auxiliary abort cannot partially replace the head or retain an uncommitted chunk', async () => {
  const f = await fixture();
  await one(f);
  const before = await f.raw(),
    p = await f.open();
  await p.journal.memo.check(
    'spool:2',
    'r',
    [],
    async () => {},
    () => {},
  );
  const original = IDBObjectStore.prototype.put;
  const fault = vi
    .spyOn(IDBObjectStore.prototype, 'put')
    .mockImplementation(function (this: IDBObjectStore, value, key) {
      const request = original.call(this, value, key);
      if (this.name === 'head') this.transaction.abort();
      return request;
    });
  await expect(p.save()).rejects.toThrow();
  fault.mockRestore();
  expect(await f.raw()).toEqual(before);
  p.dispose();
  const restored = await f.open();
  expect(restored.status).toBe('ready');
  expect(restored.journal.statistics.entries).toBe(1);
  restored.dispose();
});
it('a lost readback after durable exchange is reconciled from the encrypted checkpoint on reopen', async () => {
  const f = await fixture(),
    p = await f.open();
  await p.journal.memo.check(
    'spool:1',
    'r',
    [],
    async () => {},
    () => {},
  );
  const capture = f.owner.capture;
  let calls = 0;
  f.owner.capture = async (t) => {
    if (++calls === 2) throw Error('lost readback');
    return capture(t);
  };
  await expect(p.save()).rejects.toThrow('lost readback');
  p.dispose();
  f.owner.capture = capture;
  const next = await f.open();
  expect(next.status).toBe('ready');
  expect(next.journal.statistics.entries).toBe(1);
  next.dispose();
});
it('disposed capture capabilities cannot be saved and a racing new head cannot be overwritten', async () => {
  const f = await fixture(),
    a = await f.open(),
    b = await f.open();
  await a.journal.memo.check(
    'spool:1',
    'r',
    [],
    async () => {},
    () => {},
  );
  await b.journal.memo.check(
    'spool:2',
    'r',
    [],
    async () => {},
    () => {},
  );
  await a.save();
  const saved = await f.raw();
  await expect(b.save()).rejects.toThrow('checkpoint changed');
  expect(await f.raw()).toEqual(saved);
  a.dispose();
  await expect(a.save()).rejects.toThrow('expired');
  b.dispose();
});
it('unknown auxiliary layouts are not overwritten and ordinary content remains readable', async () => {
  const f = await fixture();
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(preparationStoreName(f.owner.name), 2);
    r.onupgradeneeded = () => r.result.createObjectStore('future');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  db.close();
  await expect(f.open()).rejects.toThrow('reader required');
  expect((await f.carrier.load(task)).length).toBeGreaterThan(0);
});
it('removal deletes only the deterministic auxiliary database without keys', async () => {
  const f = await fixture();
  await one(f);
  const source = await f.capture(),
    prefix = await capturePreparationPrefix(source.inventory, source.counter);
  expect(await matchesPreparationPrefix(prefix, source.inventory, source.counter)).toBe(true);
  await removePreparationCache(task, f.owner.name);
  expect(await f.raw()).toBeNull();
  expect((await f.carrier.load(task)).length).toBeGreaterThan(0);
  expect(() => preparationStoreName('done')).toThrow();
  expect(() => preparationStoreName('done.slots')).toThrow();
});

it('a new row in an old burned allocation is not hidden by cached verification', async () => {
  const f = await fixture();
  await f.owner.reserve(task, 3);
  await one(f);
  const row = await f.owner.crypt.seal(
    task,
    { v: 1, gen: 1, seq: 2, kind: 'heads' },
    new Uint8Array([1]),
  );
  await contentTransaction<void>(f.db, task, ['heads'], 'readwrite', (tx) =>
    tx.objectStore('heads').put(row, row.seq),
  );
  const p = await f.open();
  expect(p.status).toBe('stale');
  expect(p.journal.statistics.entries).toBe(0);
  p.dispose();
});
it('multi-chunk deltas are bound to their exact physical sequence and encrypted chunk order', async () => {
  const f = await fixture(),
    p = await f.open(),
    bytes = new Uint8Array(300000).fill(19);
  await p.journal.memo.check(
    'opened:1',
    'large',
    [],
    async () => bytes.slice(),
    () => {},
  );
  await p.save();
  p.dispose();
  const raw = await f.raw();
  expect(raw!.chunks).toHaveLength(2);
  const next = await f.open();
  expect(
    await next.journal.memo.check(
      'opened:1',
      'large',
      [],
      async () => {
        throw Error('must reuse');
      },
      () => {},
    ),
  ).toEqual(bytes);
  next.dispose();
  const a = parseStoredRecord(raw!.chunks[0]),
    b = parseStoredRecord(raw!.chunks[1]);
  await f.mutate((tx) => {
    tx.objectStore('chunks').put(a, b.seq);
    tx.objectStore('chunks').put(b, a.seq);
  });
  const bad = await f.open();
  expect(bad.status).toBe('invalid');
  bad.dispose();
});
it('a corrupted main counter cannot be reclassified as an optional cache failure', async () => {
  const f = await fixture();
  await one(f);
  const s = await f.capture();
  s.counter.mac[0]! ^= 1;
  await contentTransaction<void>(f.db, task, ['meta'], 'readwrite', (tx) =>
    tx.objectStore('meta').put(s.counter, 'counter'),
  );
  await expect(f.open()).rejects.toThrow('counter MAC');
});
it('an aborted owner cannot receive a late reusable checkpoint', async () => {
  const f = await fixture();
  await one(f);
  const source = await f.capture(),
    controller = new AbortController();
  const stopped = {
    signal: controller.signal,
    step: <T>(work: () => T) => {
      controller.signal.throwIfAborted();
      return work();
    },
    wait: async <T>(work: () => T | PromiseLike<T>) => {
      controller.signal.throwIfAborted();
      return work();
    },
  };
  const original = f.owner.crypt.open;
  const fault = vi.spyOn(f.owner.crypt, 'open').mockImplementation(async (t, r) => {
    const bytes = await original(t, r);
    controller.abort(Error('retired owner'));
    return bytes;
  });
  await expect(loadPreparationCheckpoint(stopped, f.owner, source)).rejects.toThrow(
    'retired owner',
  );
  fault.mockRestore();
  const restored = await f.open();
  expect(restored.status).toBe('ready');
  restored.dispose();
});

it('a sealed delta crosses read-task settlement without retaining its expiring verifier callbacks', async () => {
  const f = await fixture(),
    source = await f.capture(),
    loaded = await loadPreparationCheckpoint(task, f.owner, source);
  let active = true;
  const journal = createPreparationJournal({
    context: source.context,
    current: () => {
      if (!active) throw Error('old task expired');
    },
  });
  await journal.memo.check(
    'spool:1',
    'r',
    [],
    async () => {},
    () => {},
  );
  const delta = await journal.delta({ sign: (b) => f.owner.crypt.sign(task, b) });
  journal.dispose();
  active = false;
  eraseVerified(source.inventory);
  expect(await savePreparationDelta(task, f.owner, loaded.checkpoint, delta)).toMatchObject({
    kind: 'preparation-saved',
    newEntries: 1,
  });
  eraseVerified(delta);
  disposePreparationCheckpoint(loaded.checkpoint);
  const restored = await f.open();
  expect(restored.status).toBe('ready');
  expect(restored.journal.statistics.entries).toBe(1);
  restored.dispose();
});
it('delta authentication and fresh context precede every native allocation', async () => {
  const f = await fixture(),
    p = await f.open();
  await p.journal.memo.check(
    'spool:1',
    'r',
    [],
    async () => {},
    () => {},
  );
  const delta = await p.journal.delta({ sign: (b) => f.owner.crypt.sign(task, b) });
  delta.mac[0]! ^= 1;
  const reserve = vi.spyOn(f.owner, 'reserve');
  await expect(savePreparationDelta(task, f.owner, p.checkpoint, delta)).rejects.toThrow('receipt');
  expect(reserve).not.toHaveBeenCalled();
  expect(await f.raw()).toBeNull();
  p.dispose();
  eraseVerified(delta);
});
