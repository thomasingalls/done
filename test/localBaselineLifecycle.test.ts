// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { setup } from './local-baseline/anchor-fixture';
import { anchorLocalBaseline, readEncryptedBaseline } from '../src/crdt/localBaselineStorage';
import {
  baselineAuthenticationPayload,
  decodeLocalBaseline,
  encodeLocalBaseline,
} from '../src/crdt/localBaselineRecord';
import { baselineChunkKey, parseBaselineCounter } from '../src/crdt/localBaselineAnchor';
import { rotateContent } from '../src/crdt/contentRotation';
import { parseStoredRecord } from '../src/crdt/contentRecord';
import type { DiskState } from '../src/crdt/contentCompaction';
import type { SessionTask } from '../src/crdt/writeSession';
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
const task: SessionTask = {
  signal: new AbortController().signal,
  step: (f) => f(),
  wait: (f) => Promise.resolve(f()),
};
async function fixture(chars = 40) {
  const f = await setup(task, 'lifecycle', chars);
  cleanup.push(f.close);
  await f.anchor();
  return f;
}
async function census(f: Awaited<ReturnType<typeof fixture>>): Promise<DiskState> {
  return new Promise((resolve, reject) => {
    const tx = f.owner.db.transaction(['meta', 'content', 'heads', 'outbound']);
    const result: DiskState = { counter: null, rows: [] };
    const counter = tx.objectStore('meta').get('counter');
    counter.onsuccess = () => {
      const { baseline: _pointer, ...allocation } = parseBaselineCounter(
        counter.result,
        f.owner.identity,
        f.owner.intent,
      );
      result.counter = { ...allocation, v: 2 };
    };
    for (const name of ['content', 'heads', 'outbound']) {
      const store = tx.objectStore(name),
        keys = store.getAllKeys(),
        values = store.getAll();
      values.onsuccess = () =>
        keys.result.forEach((key, i) =>
          result.rows.push({ store: name, key, value: values.result[i] }),
        );
    }
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error);
  });
}
async function replacement(f: Awaited<ReturnType<typeof fixture>>) {
  const previous = await f.read(),
    disk = await census(f),
    b = decodeLocalBaseline(previous.baseline.payload);
  b.revision++;
  b.predecessor = previous.anchor.hash;
  b.generation = f.owner.generation;
  b.cut.nextSequence = disk.counter!.next_seq;
  b.cut.reserved = Object.entries(disk.counter!.reserved).map(([g, n]) => [Number(g), n]);
  const payload = encodeLocalBaseline(b),
    input = {
      baseline: {
        payload,
        mac: await f.owner.crypt.sign(task, baselineAuthenticationPayload(payload)),
      },
      anchor: {
        revision: b.revision,
        hash: hex(new Uint8Array(await crypto.subtle.digest('SHA-256', payload))),
      },
    };
  return {
    previous,
    disk,
    input,
    run: () => anchorLocalBaseline(task, f.owner, disk, input, previous.anchor),
  };
}
it('replaces only the metadata, links the exact predecessor, and refuses stale replacement replay', async () => {
  const f = await fixture(),
    r = await replacement(f);
  const remove = vi.spyOn(IDBObjectStore.prototype, 'delete'),
    clear = vi.spyOn(IDBObjectStore.prototype, 'clear');
  expect(await r.run()).toEqual(r.input.anchor);
  const opened = await f.read();
  expect(opened.anchor.revision).toBe(2);
  expect(decodeLocalBaseline(opened.baseline.payload).predecessor).toBe(r.previous.anchor.hash);
  expect(opened.counter.baseline.firstSequence).toBe(r.disk.counter!.next_seq);
  expect((await census(f)).rows).toEqual(r.disk.rows);
  expect(remove).not.toHaveBeenCalled();
  expect(clear).not.toHaveBeenCalled();
  const sealed = vi.spyOn(f.owner.crypt, 'seal');
  await expect(r.run()).rejects.toThrow('predecessor changed');
  expect(sealed).not.toHaveBeenCalled();
});
it('rejects a MAC-valid candidate with the wrong predecessor before reserving or encrypting', async () => {
  const f = await fixture(),
    r = await replacement(f),
    b = decodeLocalBaseline(r.input.baseline.payload);
  b.predecessor = 'ef'.repeat(32);
  r.input.baseline.payload = encodeLocalBaseline(b);
  r.input.baseline.mac = await f.owner.crypt.sign(
    task,
    baselineAuthenticationPayload(r.input.baseline.payload),
  );
  r.input.anchor.hash = hex(
    new Uint8Array(await crypto.subtle.digest('SHA-256', r.input.baseline.payload)),
  );
  const seal = vi.spyOn(f.owner.crypt, 'seal');
  await expect(r.run()).rejects.toThrow('current cut');
  expect(seal).not.toHaveBeenCalled();
  expect((await f.read()).counter).toEqual(r.previous.counter);
});
it.each(['seal', 'journal', 'abort'] as const)(
  'replacement %s failure retains the old authenticated anchor and burns its range',
  async (fault) => {
    const f = await fixture(),
      r = await replacement(f),
      seal = f.owner.crypt.seal;
    let journalDirty = false;
    f.owner.checkCommit = () => {
      if (journalDirty) throw Error('journal not empty');
    };
    f.owner.crypt.seal = async (...args) => {
      const during = await f.read();
      expect(during.anchor).toEqual(r.previous.anchor);
      expect(during.counter.next_seq).toBeGreaterThan(r.previous.counter.next_seq);
      if (fault === 'seal') throw Error('injected seal');
      if (fault === 'journal') journalDirty = true;
      return seal(...args);
    };
    if (fault === 'abort') {
      const put = IDBObjectStore.prototype.put;
      vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(
        function (this: IDBObjectStore, value, key) {
          const result = put.call(this, value, key);
          if (this.name === 'meta' && value?.baseline?.revision === 2) this.transaction.abort();
          return result;
        },
      );
    }
    await expect(r.run()).rejects.toThrow();
    f.owner.checkCommit = () => {};
    expect((await f.read()).anchor).toEqual(r.previous.anchor);
    expect((await census(f)).rows).toEqual(r.disk.rows);
    f.owner.crypt.seal = seal;
    vi.restoreAllMocks();
    const retry = await replacement(f);
    await retry.run();
    expect((await f.read()).counter.baseline.firstSequence).toBeGreaterThan(
      r.disk.counter!.next_seq,
    );
  },
);
it('refuses an old chunk changed after reservation, without overwriting the damage', async () => {
  const f = await fixture(),
    r = await replacement(f),
    seal = f.owner.crypt.seal;
  f.owner.crypt.seal = async (...args) => {
    await new Promise<void>((resolve, reject) => {
      const tx = f.owner.db.transaction('meta', 'readwrite'),
        store = tx.objectStore('meta'),
        get = store.get(baselineChunkKey(0));
      get.onsuccess = () => {
        get.result.ct[0] ^= 1;
        store.put(get.result, baselineChunkKey(0));
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    return seal(...args);
  };
  await expect(r.run()).rejects.toThrow('chunks changed');
  await expect(f.read()).rejects.toThrow();
});
it.each(['complete', 'complete-era', 'journal', 'abort', 'authority'] as const)(
  'rotation %s preserves the old encrypted baseline and exact history keys',
  async (fault) => {
    const f = await fixture();
    if (fault === 'complete-era') await (await withEra(f, '12'.repeat(32), null)).run();
    const before = await census(f),
      old = await f.read();
    let reserved = 0;
    const checkJournal = () => {
      if (fault === 'journal' && reserved) throw Error('journal not empty');
    };
    if (fault === 'abort') {
      const put = IDBObjectStore.prototype.put;
      vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(
        function (this: IDBObjectStore, value, key) {
          const result = put.call(this, value, key);
          if (this.name === 'meta' && value?.active_gen === 2) this.transaction.abort();
          return result;
        },
      );
    }
    const rotate = () =>
      rotateContent(
        task,
        {
          db: f.owner.db,
          scope: f.owner.identity,
          generation: 1,
          intent: f.owner.intent,
          read: () => census(f),
          authenticate: async (s) =>
            Promise.all(
              s.rows.map(async (r) => {
                const sealed = parseStoredRecord(r.value);
                return {
                  gen: sealed.gen,
                  seq: sealed.seq,
                  kind: sealed.kind,
                  bytes: await f.owner.crypt.open(task, sealed),
                };
              }),
            ),
          assertCurrent: async () => {
            if (fault === 'authority') throw Error('authority changed');
          },
          crypt: f.owner.crypt,
          baseline: () => f.read(),
        },
        {
          generation: 2,
          reserve: async (n) => (reserved += n),
          seal: (h, b) => f.owner.crypt.seal(task, h, b),
          open: (r) => f.owner.crypt.open(task, r),
          checkJournal,
        },
      );
    if (fault !== 'complete' && fault !== 'complete-era') {
      await expect(rotate()).rejects.toThrow();
      expect((await f.read()).counter).toEqual(old.counter);
      expect((await census(f)).rows).toEqual(before.rows);
      return;
    }
    await rotate();
    f.owner.generation = 2;
    const after = await readEncryptedBaseline(task, f.owner);
    expect(after.anchor).toEqual(old.anchor);
    expect(after.chunks).toEqual(old.chunks);
    expect(after.counter.active_gen).toBe(2);
    expect(after.counter.baseline.generation).toBe(1);
    const open = f.owner.crypt.open;
    f.owner.crypt.open = (t, row) =>
      row.gen === 1 ? Promise.reject(Error('missing retained opener')) : open(t, row);
    await expect(f.read()).rejects.toThrow('missing retained opener');
    f.owner.crypt.open = open;
    expect((await census(f)).rows.map((r) => r.key)).toEqual(before.rows.map((r) => r.key));
    const refreshed = await replacement(f);
    await refreshed.run();
    expect((await f.read()).counter.baseline.generation).toBe(2);
  },
);

it('replacement shrinks the bounded carrier inventory by removing only superseded metadata chunks', async () => {
  const f = await fixture(300000),
    r = await replacement(f);
  // Carrier-only framing control: semantic equivalence is the real owner's separate obligation.
  const b = decodeLocalBaseline(r.input.baseline.payload);
  b.snapshot = new Uint8Array([0, 0]);
  r.input.baseline.payload = encodeLocalBaseline(b);
  r.input.baseline.mac = await f.owner.crypt.sign(
    task,
    baselineAuthenticationPayload(r.input.baseline.payload),
  );
  r.input.anchor.hash = hex(
    new Uint8Array(await crypto.subtle.digest('SHA-256', r.input.baseline.payload)),
  );
  const deleted: [string, IDBValidKey][] = [],
    remove = IDBObjectStore.prototype.delete;
  vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(
    function (this: IDBObjectStore, key) {
      deleted.push([this.name, key as IDBValidKey]);
      return remove.call(this, key);
    },
  );
  expect(r.previous.counter.baseline.chunks).toBeGreaterThan(1);
  await r.run();
  expect((await f.read()).counter.baseline.chunks).toBe(1);
  expect(deleted).toEqual(
    Array.from({ length: r.previous.counter.baseline.chunks - 1 }, (_, i) => [
      'meta',
      baselineChunkKey(i + 1),
    ]),
  );
  expect((await census(f)).rows).toEqual(r.disk.rows);
});

it('copies the expected predecessor before awaiting fresh authentication', async () => {
  const f = await fixture(),
    r = await replacement(f),
    expected = structuredClone(r.input.anchor);
  const pending = r.run();
  r.previous.anchor.hash = 'ef'.repeat(32);
  r.input.baseline.payload.fill(0);
  r.input.baseline.mac.fill(0);
  expect(await pending).toEqual(expected);
  expect((await f.read()).anchor).toEqual(expected);
});

async function withEra(
  f: Awaited<ReturnType<typeof fixture>>,
  current: string,
  previous: string | null,
) {
  const r = await replacement(f),
    b = decodeLocalBaseline(r.input.baseline.payload);
  b.journalEra = { current, previous, revision: b.revision };
  r.input.baseline.payload = encodeLocalBaseline(b);
  r.input.baseline.mac = await f.owner.crypt.sign(
    task,
    baselineAuthenticationPayload(r.input.baseline.payload),
  );
  r.input.anchor.hash = hex(
    new Uint8Array(await crypto.subtle.digest('SHA-256', r.input.baseline.payload)),
  );
  return r;
}
it('era transitions bind predecessor, carrier and payload while retaining every history byte', async () => {
  const f = await fixture(),
    first = await withEra(f, '12'.repeat(32), null);
  await first.run();
  const a = await f.read();
  expect(a.counter.v).toBe(4);
  expect(decodeLocalBaseline(a.baseline.payload).journalEra).toEqual(a.counter.baseline.journalEra);
  expect((await census(f)).rows).toEqual(first.disk.rows);
  const bad = await withEra(f, '23'.repeat(32), '34'.repeat(32));
  const seal = vi.spyOn(f.owner.crypt, 'seal');
  await expect(bad.run()).rejects.toThrow('predecessor');
  expect(seal).not.toHaveBeenCalled();
  expect((await f.read()).counter).toEqual(a.counter);
  await (await withEra(f, '23'.repeat(32), '12'.repeat(32))).run();
  const next = await f.read();
  expect(next.counter.baseline.journalEra).toEqual({
    current: '23'.repeat(32),
    previous: '12'.repeat(32),
    revision: 3,
  });
  await (await replacement(f)).run();
  expect((await f.read()).counter.baseline.journalEra).toEqual(next.counter.baseline.journalEra);
  expect((await census(f)).rows).toEqual(first.disk.rows);
});
it.each(['seal', 'abort', 'journal'] as const)(
  'era %s failure preserves old era and burns reservations before retry',
  async (fault) => {
    const f = await fixture();
    await (await withEra(f, '12'.repeat(32), null)).run();
    const r = await withEra(f, '23'.repeat(32), '12'.repeat(32)),
      original = f.owner.crypt.seal;
    f.owner.crypt.seal = async (...args) => {
      if (fault === 'seal') throw Error('seal fault');
      return original(...args);
    };
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(
      function (this: IDBObjectStore, value, key) {
        const result = put.call(this, value, key);
        if (fault === 'abort' && value?.baseline?.revision === 3) this.transaction.abort();
        return result;
      },
    );
    let checks = 0;
    f.owner.checkCommit = () => {
      if (fault === 'journal' && ++checks >= 3) throw Error('journal appeared');
    };
    await expect(r.run()).rejects.toThrow();
    f.owner.checkCommit = () => {};
    vi.restoreAllMocks();
    f.owner.crypt.seal = original;
    const after = await f.read();
    expect(after.counter.baseline).toEqual(r.previous.counter.baseline);
    expect((await census(f)).rows).toEqual(r.disk.rows);
    const retry = await withEra(f, '45'.repeat(32), '12'.repeat(32));
    await retry.run();
    expect((await f.read()).counter.baseline.firstSequence).toBeGreaterThan(
      r.disk.counter!.next_seq,
    );
  },
);
