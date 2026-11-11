// @vitest-environment node
import { beforeAll, afterAll, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { setup, readCensus } from './local-baseline/anchor-fixture';
import { task } from './local-baseline/one-shot-fixture';
import { contentTransaction } from '../src/crdt/contentDatabase';
import { counterPayload, reserveCounter, equalCounter } from '../src/crdt/contentRecord';
import { deriveStoreName } from '../src/crdt/storeName';
import type { Bytes } from '../src/crdt/custodyCrypto';
import type { PreparationStorageOwner } from '../src/crdt/retentionPreparationStorage';
import {
  capacityFaultModule,
  capacitySites,
  uncachedSites,
  type CapacityFaultSite,
} from './retention-hardening/capacity-fault-module';

let built: Awaited<ReturnType<typeof capacityFaultModule>>;
const clean: (() => void)[] = [];
beforeAll(async () => {
  built = await capacityFaultModule();
}, 60000);
afterAll(async () => {
  await built?.dispose();
});
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
});
afterEach(() => {
  built?.api.fault();
  clean
    .splice(0)
    .reverse()
    .forEach((f) => f());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
let identity = 0;
async function storage() {
  const f = await setup(task, (++identity).toString(16).padStart(32, '0'), 32);
  clean.push(f.close);
  const capture = async () => {
    const c = await readCensus(task, f.owner),
      counter = c.counter!;
    if (!(await f.owner.crypt.verify(task, counterPayload(f.owner.identity, counter), counter.mac)))
      throw Error('counter MAC');
    return {
      context: '01'.repeat(32),
      counter,
      inventory: { rows: c.rows, metadata: [{ key: 'counter', value: counter }] },
    };
  };
  const owner: PreparationStorageOwner = {
    name: await deriveStoreName(f.owner.identity.principalId, f.owner.identity.workspaceId),
    crypt: f.owner.crypt,
    capture,
    reserve: async (t, n) => {
      const before = (await readCensus(t, f.owner)).counter!,
        next = reserveCounter(before, n, 1);
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
              if (!equalCounter(f.owner.identity, get.result, before)) throw Error('counter race');
              tx.objectStore('meta').put(next, 'counter');
            });
        },
        'strict',
      );
      return { first: before.next_seq, generation: 1 };
    },
  };
  return { owner, capture };
}
async function checkReceipt(
  journal: ReturnType<typeof built.api.createPreparationJournal>,
  slot = 'opened:1',
) {
  return journal.memo.check(
    slot,
    'physical-row',
    [new Uint8Array([1])],
    async () => new Uint8Array([7]),
    () => {},
  );
}
/** The three guards that still refuse: saved-journal format bounds and the prefix capture. */
async function action(site: CapacityFaultSite) {
  const a = built.api,
    context = '01'.repeat(32),
    current = () => {};
  const f = await storage(),
    source = await f.capture();
  if (site === 'physical-prefix') {
    await a.capturePreparationPrefix(source.inventory, source.counter);
    return;
  }
  const loaded = await a.loadPreparationCheckpoint(task, f.owner, source),
    j = a.createPreparationJournal({ context, current });
  try {
    await checkReceipt(j);
    await a.savePreparationCheckpoint(task, f.owner, loaded.checkpoint, j);
  } finally {
    a.disposePreparationCheckpoint(loaded.checkpoint);
    j.dispose();
  }
}
async function auth() {
  const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
  return {
    sign: async (b: Bytes) => new Uint8Array(await crypto.subtle.sign('HMAC', key, b)),
    verify: (b: Bytes, mac: Bytes) => crypto.subtle.verify('HMAC', key, mac, b),
  };
}
/** One pass at a cache guard, armed or not: what it returned, reused, kept, and whether a later
 * miss past the slice clock still pauses. */
async function cacheGuard(site: CapacityFaultSite, armed: boolean) {
  const a = built.api,
    context = '01'.repeat(32),
    current = () => {};
  let clock = 0;
  const j = a.createPreparationJournal({ context, current, now: () => clock });
  try {
    if (site === 'journal-import') {
      const key = await auth(),
        seed = a.createPreparationJournal({ context, current });
      try {
        await checkReceipt(seed);
        const d = await seed.delta(key);
        try {
          const proof = await a.authenticatePreparationReceipts(
            context,
            d.payload,
            d.mac,
            key,
            current,
          );
          try {
            if (armed) a.fault(site);
            j.import(proof);
          } finally {
            a.disposePreparationReceipts(proof);
          }
        } finally {
          d.payload.fill(0);
          d.mac.fill(0);
        }
      } finally {
        seed.dispose();
      }
    } else if (armed) a.fault(site);
    const verifier = vi.fn(async () => new Uint8Array([7]));
    const first = await j.memo.check(
      'opened:1',
      'physical-row',
      [new Uint8Array([1])],
      verifier,
      current,
    );
    const reached = a.reached();
    a.fault();
    clock = a.PREPARATION_SLICE_MS + 1;
    let paused = false,
      second: unknown;
    try {
      second = await checkReceipt(j, 'opened:2');
    } catch (cause) {
      if (!(cause instanceof a.PreparationPause)) throw cause;
      paused = true;
    }
    return {
      reached,
      first,
      verified: verifier.mock.calls.length,
      paused,
      second,
      ...j.statistics,
    };
  } finally {
    a.fault();
    j.dispose();
  }
}
for (const site of uncachedSites)
  it(`real ${site} overflow returns fresh results uncached and stops slicing instead of refusing`, async () => {
    // Positive control first: below the guard the receipt is kept (or reused) as before.
    const control = await cacheGuard(site, false);
    expect(control).toMatchObject(
      site === 'journal-check'
        ? { reached: undefined, verified: 1, entries: 1, pending: 1, full: false, paused: true }
        : { reached: undefined, verified: 0, hits: 1, full: false, paused: false },
    );
    const o = await cacheGuard(site, true);
    expect(o.reached).toBe(site);
    expect(o.first).toEqual(new Uint8Array([7]));
    // Nothing is reused or kept past the guard: the verifier ran and the journal stays empty.
    expect(o).toMatchObject({ verified: 1, entries: 0, pending: 0, hits: 0, full: true });
    // Past the slice clock a later miss neither pauses nor refuses; it is returned uncached.
    expect(o.paused).toBe(false);
    expect(o.second).toEqual(new Uint8Array([7]));
  });
for (const [, site] of capacitySites.filter(([, s]) => !uncachedSites.includes(s)))
  it(`real ${site} refusal reaches the narrow automatic parked path`, async () => {
    const a = built.api;
    // Positive control first: same valid path without the injected refusal succeeds.
    await action(site);
    a.fault(site);
    let failure: unknown;
    try {
      await action(site);
    } catch (cause) {
      failure = cause;
    }
    expect(a.reached()).toBe(site);
    expect(failure).toBeInstanceOf(a.PreparationCapacity);
    a.fault();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(0);
    const remove = vi.fn(async () => {
      throw failure;
    });
    const run = a.createAutomaticLocalRetention({
      signal: new AbortController().signal,
      observe: () => ({
        ready: true,
        hint: { revision: 0, records: a.LOCAL_RETENTION_MIN_RECORDS },
      }),
      remove,
    });
    run.wake();
    await vi.advanceTimersByTimeAsync(a.LOCAL_RETENTION_QUIET_MS);
    expect(run.status).toEqual({ phase: 'idle', reason: 'capacity' });
    run.refresh();
    await vi.advanceTimersByTimeAsync(a.LOCAL_RETENTION_RETRY_MS * 3);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    run.dispose();
  });

it('reopens an authenticated saved journal, parks at the same real delta ceiling, and keeps its bytes', async () => {
  const a = built.api,
    f = await storage(),
    context = '01'.repeat(32),
    current = () => {};
  const initial = await a.loadPreparationCheckpoint(task, f.owner, await f.capture());
  const seed = a.createPreparationJournal({ context, current });
  await checkReceipt(seed);
  await a.savePreparationCheckpoint(task, f.owner, initial.checkpoint, seed);
  a.disposePreparationCheckpoint(initial.checkpoint);
  seed.dispose();
  const raw = () =>
    new Promise<unknown>((yes, no) => {
      const open = indexedDB.open(a.preparationStoreName(f.owner.name));
      open.onerror = () => no(open.error);
      open.onsuccess = () => {
        const db = open.result,
          tx = db.transaction(['head', 'chunks']),
          head = tx.objectStore('head').getAll(),
          chunks = tx.objectStore('chunks').getAll();
        tx.oncomplete = () => {
          db.close();
          yes({ head: head.result, chunks: chunks.result });
        };
        tx.onabort = () => {
          db.close();
          no(tx.error);
        };
      };
    });
  const before = await raw();
  let attempts = 0,
    imported = 0;
  const nativeAttempt = async () => {
    attempts++;
    const source = await f.capture(),
      read = await a.loadPreparationCheckpoint(task, f.owner, source);
    expect(read.status).toBe('ready');
    const j = a.createPreparationJournal({ context, current });
    try {
      a.importPreparationCheckpoint(read.checkpoint, j);
      const oldVerification = vi.fn(async () => new Uint8Array([99]));
      expect(
        await j.memo.check(
          'opened:1',
          'physical-row',
          [new Uint8Array([1])],
          oldVerification,
          current,
        ),
      ).toEqual(new Uint8Array([7]));
      expect(oldVerification).not.toHaveBeenCalled();
      expect(j.statistics.hits).toBe(1);
      imported++;
      await checkReceipt(j, 'opened:2');
      a.fault('storage-delta');
      return await a.savePreparationCheckpoint(task, f.owner, read.checkpoint, j);
    } finally {
      a.fault();
      a.disposePreparationCheckpoint(read.checkpoint);
      j.dispose();
    }
  };
  const delay = (await import('node:timers/promises')).setTimeout;
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(0);
  const openPolicy = () =>
    a.createAutomaticLocalRetention({
      signal: new AbortController().signal,
      observe: () => ({
        ready: true,
        hint: { revision: 0, records: a.LOCAL_RETENTION_MIN_RECORDS },
      }),
      remove: nativeAttempt,
    });
  const settle = async (run: ReturnType<typeof openPolicy>) => {
    await vi.advanceTimersByTimeAsync(a.LOCAL_RETENTION_QUIET_MS);
    for (let n = 0; n < 200 && run.status.reason !== 'capacity'; n++) {
      await delay(5);
      await vi.advanceTimersByTimeAsync(1);
    }
    expect(run.status).toEqual({ phase: 'idle', reason: 'capacity' });
    expect(run.diagnostics?.ownerError).toBeUndefined();
  };
  const first = openPolicy();
  clean.push(() => first.dispose());
  first.wake();
  await settle(first);
  expect(await raw()).toEqual(before);
  first.dispose();
  const reopened = openPolicy();
  clean.push(() => reopened.dispose());
  reopened.wake();
  await settle(reopened);
  expect(attempts).toBe(2);
  expect(imported).toBe(2);
  expect(await raw()).toEqual(before);
  for (let n = 0; n < 3; n++) {
    reopened.refresh();
    await vi.advanceTimersByTimeAsync(a.LOCAL_RETENTION_RETRY_MS);
  }
  expect(attempts).toBe(2);
  expect(vi.getTimerCount()).toBe(0);
  reopened.dispose();
});
