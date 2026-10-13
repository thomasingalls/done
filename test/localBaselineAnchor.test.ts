// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { setup, readCensus } from './local-baseline/anchor-fixture';
import type { SessionTask } from '../src/crdt/writeSession';
import { anchorLocalBaseline, readEncryptedBaseline } from '../src/crdt/localBaselineStorage';
import {
  baselineChunkKey,
  baselineCounterPayload,
  parseBaselineCounter,
} from '../src/crdt/localBaselineAnchor';
import { counterPayload, parseCounter } from '../src/crdt/contentRecord';
import { StorageCompatibilityError } from '../src/crdt/storageCompatibility';
import {
  baselineAuthenticationPayload,
  decodeLocalBaseline,
  encodeLocalBaseline,
  LOCAL_BASELINE_LIMIT,
} from '../src/crdt/localBaselineRecord';
import { hex } from '../src/crdt/custodyCrypto';

const cleanup: (() => void)[] = [];
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
});
afterEach(() => {
  cleanup.splice(0).forEach((f) => f());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function lifetime() {
  const controller = new AbortController();
  const check = () => {
    if (controller.signal.aborted) throw Error('cancelled');
  };
  const task: SessionTask = {
    signal: controller.signal,
    step: (f) => {
      check();
      return f();
    },
    wait: async (f) => {
      check();
      const v = await f();
      check();
      return v;
    },
  };
  return { task, controller };
}
async function fixture(chars = 400000) {
  const l = lifetime(),
    f = await setup(l.task, 'anchor-fixture', chars);
  cleanup.push(f.close);
  return { ...f, ...l };
}
function mutate(db: IDBDatabase, store: string, fn: (s: IDBObjectStore) => void) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    fn(tx.objectStore(store));
  });
}
async function metadata(db: IDBDatabase) {
  return new Promise<unknown[]>((resolve, reject) => {
    const tx = db.transaction('meta'),
      r = tx.objectStore('meta').getAll();
    tx.oncomplete = () => resolve(r.result);
    tx.onabort = () => reject(tx.error);
  });
}
async function resign(
  f: Awaited<ReturnType<typeof fixture>>,
  change: (b: ReturnType<typeof decodeLocalBaseline>) => void,
) {
  const b = decodeLocalBaseline(f.input.baseline.payload);
  change(b);
  const payload = encodeLocalBaseline(b);
  f.input.baseline = {
    payload,
    mac: await f.owner.crypt.sign(f.task, baselineAuthenticationPayload(payload)),
  };
  f.input.anchor = {
    revision: b.revision,
    hash: hex(new Uint8Array(await crypto.subtle.digest('SHA-256', payload))),
  };
}

it('commits a multi-chunk encrypted baseline and independent pointer, preserves every history byte and isolates callers', async () => {
  const f = await fixture(),
    before = structuredClone(f.census),
    expected = structuredClone(f.input);
  const remove = vi.spyOn(IDBObjectStore.prototype, 'delete'),
    clear = vi.spyOn(IDBObjectStore.prototype, 'clear');
  const anchor = await f.anchor();
  const opened = await f.read();
  expect(opened.anchor).toEqual(anchor);
  expect(opened.baseline).toEqual(expected.baseline);
  expect(opened.counter.baseline.chunks).toBeGreaterThan(1);
  expect(opened.counter.next_seq).toBe(before.counter!.next_seq + opened.counter.baseline.chunks);
  expect(opened.counter.reserved[1]).toBe(
    before.counter!.reserved[1]! + opened.counter.baseline.chunks,
  );
  expect(opened.counter.spool).toEqual((before.counter as { spool: unknown }).spool);
  expect(remove).not.toHaveBeenCalled();
  expect(clear).not.toHaveBeenCalled();
  const meta = await metadata(f.owner.db);
  expect(JSON.stringify(meta)).not.toContain(expected.anchor.hash);
  expect(meta.slice(1).every((r) => !('payload' in (r as object)))).toBe(true);
  f.input.baseline.payload.fill(0);
  opened.baseline.payload.fill(0);
  opened.counter.baseline.commitment = '0'.repeat(64);
  expect((await f.read()).baseline).toEqual(expected.baseline);
  for (const row of before.rows) {
    const actual = await new Promise((r) => {
      const q = f.owner.db.transaction(row.store).objectStore(row.store).get(row.key);
      q.onsuccess = () => r(q.result);
    });
    expect(actual).toEqual(row.value);
  }
  await expect(f.carrier.load(f.task)).rejects.toBeInstanceOf(StorageCompatibilityError);
  await expect(
    f.carrier.append(f.task, [{ kind: 'update', bytes: new Uint8Array([0, 0]) }]),
  ).rejects.toBeInstanceOf(StorageCompatibilityError);
  expect(await metadata(f.owner.db)).toEqual(meta);
});

it('ordinary reader rejects v3 without treating its allocation portion as an ordinary counter', async () => {
  const f = await fixture(30);
  await f.anchor();
  const c = (await f.read()).counter;
  expect(() => parseCounter(c, f.owner.identity, f.owner.intent)).toThrow(
    StorageCompatibilityError,
  );
  expect(() =>
    parseBaselineCounter(
      { ...c, baseline: { ...c.baseline, history: 'trimmed' } },
      f.owner.identity,
      f.owner.intent,
    ),
  ).toThrow(StorageCompatibilityError);
  expect(() =>
    parseBaselineCounter(
      { ...c, baseline: { ...c.baseline, format: 'future' } },
      f.owner.identity,
      f.owner.intent,
    ),
  ).toThrow(StorageCompatibilityError);
  expect(() =>
    parseBaselineCounter(
      { ...c, baseline: { ...c.baseline, chunks: c.baseline.chunks + 1 } },
      f.owner.identity,
      f.owner.intent,
    ),
  ).toThrow();
  expect(() =>
    parseBaselineCounter({ ...c, unknown: true }, f.owner.identity, f.owner.intent),
  ).toThrow();
});

it.each(['payload', 'mac', 'anchor', 'scope', 'cut', 'counter-mac', 'oversize'] as const)(
  'refuses %s before any allocation or seal',
  async (kind) => {
    const f = await fixture(40),
      before = await metadata(f.owner.db),
      seal = vi.spyOn(f.owner.crypt, 'seal');
    if (kind === 'payload') f.input.baseline.payload[20]! ^= 1;
    if (kind === 'mac') f.input.baseline.mac[0]! ^= 1;
    if (kind === 'anchor') f.input.anchor.hash = 'ef'.repeat(32);
    if (kind === 'scope')
      await resign(f, (b) => {
        b.identity.rootId = 'ef'.repeat(16);
      });
    if (kind === 'cut')
      await resign(f, (b) => {
        b.cut.sequence = 0;
      });
    if (kind === 'counter-mac') f.census.counter!.mac[0]! ^= 1;
    if (kind === 'oversize') f.input.baseline.payload = new Uint8Array(LOCAL_BASELINE_LIMIT + 1);
    await expect(f.anchor()).rejects.toThrow();
    expect(seal).not.toHaveBeenCalled();
    expect(await metadata(f.owner.db)).toEqual(before);
  },
);

it('reservation is durable before encryption, and a seal failure burns its entire range', async () => {
  const f = await fixture(),
    count = Math.ceil((f.input.baseline.payload.length + 32) / 262144);
  vi.spyOn(f.owner.crypt, 'seal').mockImplementation(async () => {
    const disk = await readCensus(f.task, f.owner);
    expect(disk.counter!.next_seq).toBe(f.census.counter!.next_seq + count);
    throw Error('crypto stopped');
  });
  await expect(f.anchor()).rejects.toThrow('crypto stopped');
  const after = await readCensus(f.task, f.owner);
  expect(after.rows).toEqual(f.census.rows);
  expect(after.counter!.v).toBe(2);
  expect(after.counter!.next_seq).toBe(f.census.counter!.next_seq + count);
  await expect(f.carrier.load(f.task)).resolves.toHaveLength(1);
  await expect(f.anchor()).rejects.toThrow('counter changed');
});

it.each(['activity', 'authority', 'counter', 'old-row', 'extra-row', 'abort-after-put'] as const)(
  'refuses a changed %s at the final boundary; keeps complete history and only reservation burns',
  async (kind) => {
    const f = await fixture(30),
      initial = structuredClone(f.census);
    let checks = 0,
      activity = false;
    f.owner.checkCommit = () => {
      if (activity) throw Error('input arrived');
    };
    f.owner.assertCurrent = async () => {
      if (++checks !== 2) return;
      if (kind === 'authority') throw Error('authority changed');
      if (kind === 'activity') activity = true;
      if (kind === 'counter')
        await mutate(f.owner.db, 'meta', (s) => {
          const r = s.get('counter');
          r.onsuccess = () => {
            const c = r.result;
            c.next_seq++;
            c.reserved[1]++;
            s.put(c, 'counter');
          };
        });
      if (kind === 'old-row')
        await mutate(f.owner.db, 'content', (s) => {
          const r = s.get(1);
          r.onsuccess = () => {
            r.result.ct[0] ^= 1;
            s.put(r.result, 1);
          };
        });
      if (kind === 'extra-row')
        await mutate(f.owner.db, 'content', (s) => s.put(initial.rows[0]!.value, 888));
      if (kind === 'abort-after-put') {
        const put = IDBObjectStore.prototype.put;
        vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
          this: IDBObjectStore,
          ...args: Parameters<typeof put>
        ) {
          const r = put.apply(this, args);
          if (args[1] === 'counter' && (args[0] as { v: number }).v === 3) this.transaction.abort();
          return r;
        });
      }
    };
    await expect(f.anchor()).rejects.toThrow();
    const meta = await metadata(f.owner.db);
    expect(meta).toHaveLength(1);
    expect((meta[0] as { v: number }).v).toBe(2);
    if (!['old-row', 'extra-row'].includes(kind))
      expect((await readCensus(f.task, f.owner)).rows).toEqual(initial.rows);
  },
);

it.each([
  'ciphertext',
  'missing',
  'reorder',
  'pointer-mac',
  'pointer-commitment',
  'downgrade',
  'unknown',
] as const)('refuses damaged %s on cold carrier read', async (kind) => {
  const f = await fixture();
  await f.anchor();
  await mutate(f.owner.db, 'meta', (s) => {
    if (kind === 'missing') {
      s.delete(baselineChunkKey(0));
      return;
    }
    if (kind === 'unknown') {
      s.put(null, 'unexpected');
      return;
    }
    const key = ['pointer-mac', 'pointer-commitment', 'downgrade'].includes(kind)
        ? 'counter'
        : baselineChunkKey(0),
      r = s.get(key);
    r.onsuccess = () => {
      const v = r.result;
      if (kind === 'ciphertext') v.ct[0] ^= 1;
      if (kind === 'reorder') v.seq++;
      if (kind === 'pointer-mac') v.mac[0] ^= 1;
      if (kind === 'pointer-commitment') v.baseline.commitment = 'ef'.repeat(32);
      if (kind === 'downgrade') v.v = 2;
      s.put(v, key);
    };
  });
  await expect(f.read()).rejects.toThrow();
});

it('verifies the independent pointer before opening chunks; authenticated wrong commitment still refuses', async () => {
  const f = await fixture(20);
  await f.anchor();
  const c = (await f.read()).counter;
  c.baseline.commitment = 'fe'.repeat(32);
  c.mac = await f.owner.crypt.sign(f.task, baselineCounterPayload(f.owner.identity, c));
  await mutate(f.owner.db, 'meta', (s) => s.put(c, 'counter'));
  await expect(f.read()).rejects.toThrow('scope');
  c.mac[0]! ^= 1;
  await mutate(f.owner.db, 'meta', (s) => s.put(c, 'counter'));
  const open = vi.spyOn(f.owner.crypt, 'open');
  await expect(f.read()).rejects.toThrow('authentication');
  expect(open).not.toHaveBeenCalled();
});

it('a lost committed reply is readable without allocating or sealing again', async () => {
  const f = await fixture(30);
  await f.anchor(); // reply deliberately discarded
  const before = await metadata(f.owner.db),
    seal = vi.spyOn(f.owner.crypt, 'seal');
  expect((await f.read()).anchor).toEqual(f.input.anchor);
  await expect(anchorLocalBaseline(f.task, f.owner, f.census, f.input)).rejects.toThrow(
    'metadata changed',
  );
  expect(seal).not.toHaveBeenCalled();
  expect(await metadata(f.owner.db)).toEqual(before);
});

it('cancellation during sealing expires work and leaves an ordinary counter with burned reservations', async () => {
  const f = await fixture(30),
    seal = f.owner.crypt.seal;
  f.owner.crypt.seal = async (...args) => {
    const result = await seal(...args);
    f.controller.abort();
    return result;
  };
  await expect(f.anchor()).rejects.toThrow('cancelled');
  const after = await readCensus(lifetime().task, f.owner);
  expect(after.counter!.v).toBe(2);
  expect(after.counter!.next_seq).toBe(3);
  expect(after.rows).toEqual(f.census.rows);
});

it('input buffers changing while crypto waits cannot change the installed candidate', async () => {
  const f = await fixture(30),
    expected = structuredClone(f.input),
    verify = f.owner.crypt.verify;
  f.owner.crypt.verify = async (...args) => {
    f.input.baseline.payload.fill(0);
    f.census.rows.length = 0;
    f.input.anchor.hash = '0'.repeat(64);
    return verify(...args);
  };
  await f.anchor();
  expect((await f.read()).baseline).toEqual(expected.baseline);
});

it('counter signatures cannot be reused as baseline pointer signatures', async () => {
  const f = await fixture(30);
  await f.anchor();
  const c = (await f.read()).counter;
  const { baseline: _pointer, ...allocation } = c;
  c.mac = await f.owner.crypt.sign(
    f.task,
    counterPayload(f.owner.identity, { ...allocation, v: 2 }),
  );
  await mutate(f.owner.db, 'meta', (s) => s.put(c, 'counter'));
  await expect(readEncryptedBaseline(f.task, f.owner)).rejects.toThrow('authentication');
});

it('a reservation transaction abort performs no encryption and preserves the original counter', async () => {
  const f = await fixture(30),
    before = await metadata(f.owner.db),
    put = IDBObjectStore.prototype.put,
    seal = vi.spyOn(f.owner.crypt, 'seal');
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    ...args: Parameters<typeof put>
  ) {
    const r = put.apply(this, args);
    if (args[1] === 'counter') this.transaction.abort();
    return r;
  });
  await expect(f.anchor()).rejects.toThrow();
  expect(seal).not.toHaveBeenCalled();
  expect(await metadata(f.owner.db)).toEqual(before);
});

it('rebuilding after a failed attempt allocates beyond the burned range and cold-reads the new anchor', async () => {
  const f = await fixture(30),
    seal = f.owner.crypt.seal,
    used: number[] = [];
  f.owner.crypt.seal = async (t, h, b) => {
    used.push(h.seq);
    await seal(t, h, b);
    throw Error('interrupted');
  };
  await expect(f.anchor()).rejects.toThrow('interrupted');
  const next = await readCensus(f.task, f.owner);
  await resign(f, (b) => {
    b.cut.nextSequence = next.counter!.next_seq;
    b.cut.reserved = [[1, next.counter!.reserved[1]!]];
  });
  f.owner.crypt.seal = async (t, h, b) => {
    used.push(h.seq);
    return seal(t, h, b);
  };
  await anchorLocalBaseline(f.task, f.owner, next, f.input);
  expect(used).toEqual([2, 3]);
  expect((await f.read()).counter.next_seq).toBe(4);
  expect((await f.read()).baseline).toEqual(f.input.baseline);
});

it('requires the payload MAC to match the independently retained keyed commitment', async () => {
  const f = await fixture(30);
  await f.anchor();
  const open = f.owner.crypt.open;
  f.owner.crypt.open = async (...args) => {
    const plain = await open(...args);
    const offset = plain.length - f.input.baseline.payload.length - 32;
    plain[offset]! ^= 1;
    return plain;
  };
  await expect(f.read()).rejects.toThrow('commitment differs');
});

it('private allocation adapter keeps the anchor in every MAC/write and isolates returned metadata', async () => {
  const { createBaselineMetadata } = await import('../src/crdt/localBaselineMetadata');
  const { reserveCounter } = await import('../src/crdt/contentRecord');
  const f = await fixture(40);
  await f.anchor();
  const c = (await f.read()).counter,
    adapter = createBaselineMetadata(f.owner.identity);
  const allocation = adapter.parse(c, f.owner.intent);
  const next = reserveCounter(allocation, 3, c.active_gen),
    stored = adapter.stored(next);
  expect(stored.v).toBe(3);
  expect(adapter.payload(next)).toEqual(
    baselineCounterPayload(f.owner.identity, stored as typeof c),
  );
  expect(adapter.payload(next)).not.toEqual(counterPayload(f.owner.identity, next));
  (stored as typeof c).baseline.commitment = 'ef'.repeat(32);
  c.baseline.commitment = 'ab'.repeat(32);
  expect((adapter.stored(next) as typeof c).baseline.commitment).not.toBe(c.baseline.commitment);
  expect(() => adapter.parse(allocation, f.owner.intent)).toThrow('downgraded');
  expect(() => adapter.parse(c, f.owner.intent)).toThrow('changed');
  expect(() => adapter.metadataKeys(['counter'])).toThrow();
  expect(() => adapter.metadataKeys(['counter', baselineChunkKey(0)])).not.toThrow();
  expect(() => adapter.metadataKeys(['counter', baselineChunkKey(1)])).toThrow();
  expect(adapter.reservedSequence(c.baseline.firstSequence)).toBe(true);
  expect(adapter.reservedSequence(c.baseline.firstSequence - 1)).toBe(false);
});
