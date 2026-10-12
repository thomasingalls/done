// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { createContentOwner, type ContentCrypto } from '../src/crdt/contentStore';
import { recordAAD, type StoredRecord } from '../src/crdt/contentRecord';
import { deriveStoreName } from '../src/crdt/storeName';
import { WARM_AUDIT_MS } from '../src/crdt/warmContent';
import type { SessionTask } from '../src/crdt/writeSession';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const f of cleanups.splice(0)) f();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(count = 40) {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  const scope = {
    slotId: 'warm',
    principalId: 'warm',
    workspaceId: 'warm',
    storeId: 'ab'.repeat(16),
    rootId: 'cd'.repeat(16),
  };
  const aes = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  const hmac = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
  const abort = new AbortController();
  const task: SessionTask = {
    signal: abort.signal,
    step: (f) => {
      if (abort.signal.aborted) throw Error('closed');
      return f();
    },
    wait: async (f) => {
      if (abort.signal.aborted) throw Error('closed');
      const v = await f();
      if (abort.signal.aborted) throw Error('closed');
      return v;
    },
  };
  const crypt: ContentCrypto = {
    reuseOpened: true,
    warmLoads: true,
    validate() {},
    sign: async (_t, b) => new Uint8Array(await crypto.subtle.sign('HMAC', hmac, b)),
    verify: (_t, b, m) => crypto.subtle.verify('HMAC', hmac, m, b),
    open: async (_t, r) =>
      new Uint8Array(
        await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: r.nonce, additionalData: recordAAD(scope, r) },
          aes,
          r.ct,
        ),
      ),
    seal: async (_t, r, b) => {
      const nonce = crypto.getRandomValues(new Uint8Array(12));
      return {
        ...r,
        nonce,
        ct: new Uint8Array(
          await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: nonce, additionalData: recordAAD(scope, r) },
            aes,
            b,
          ),
        ),
      };
    },
  };
  const owner = createContentOwner(scope, 1, crypt);
  cleanups.push(() => owner.dispose());
  await owner.initialize(task, { checkCreation() {} });
  await owner.append(
    task,
    Array.from({ length: count }, () => ({ kind: 'update', bytes: new Uint8Array([0, 0]) })),
  );
  await owner.load(task);
  const name = await deriveStoreName(scope.principalId, scope.workspaceId);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  cleanups.push(() => db.close());
  const mutate = (fn: (s: IDBObjectStore) => void) =>
    new Promise<void>((resolve, reject) => {
      const tx = db.transaction('content', 'readwrite');
      fn(tx.objectStore('content'));
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  const damage = (seq: number) =>
    mutate((s) => {
      const r = s.get(seq);
      r.onsuccess = () => {
        const row = r.result as StoredRecord;
        row.ct[0] = row.ct[0]! ^ 1;
        s.put(row, seq);
      };
    });
  return { owner, task, crypt, scope, mutate, damage, abort, db };
}
it('unchanged loads and owned committed appends avoid full row reads and preserve detached results', async () => {
  const f = await fixture();
  const read = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  const first = await f.owner.load(f.task);
  first[0]!.bytes.fill(7);
  expect((await f.owner.load(f.task))[0]!.bytes).toEqual(new Uint8Array([0, 0]));
  await f.owner.append(f.task, [{ kind: 'update', bytes: new Uint8Array([1, 2, 3]) }]);
  const after = await f.owner.load(f.task);
  expect(after).toHaveLength(41);
  expect(after.at(-1)!.bytes).toEqual(new Uint8Array([1, 2, 3]));
  expect(read).not.toHaveBeenCalled();
});
it('counts detect deletion immediately; bounds detect a delete/add with the same count', async () => {
  const f = await fixture();
  await f.mutate((s) => s.delete(25));
  await expect(f.owner.load(f.task)).rejects.toThrow('shape');
  const g = await fixture();
  await g.mutate((s) => {
    const r = s.get(40);
    r.onsuccess = () => {
      s.delete(40);
      s.put(r.result, 41);
    };
  });
  await expect(g.owner.load(g.task)).rejects.toThrow('shape');
});
it('a changed interior ciphertext is refused by the rolling audit without using it as plaintext', async () => {
  const f = await fixture();
  await f.damage(25);
  const first = await f.owner.load(f.task);
  expect(first[24]!.bytes).toEqual(new Uint8Array([0, 0]));
  await expect(f.owner.load(f.task)).rejects.toThrow('audit mismatch');
});
it('resume invalidation forces a complete physical read before reusing the cache', async () => {
  const f = await fixture();
  await f.damage(25);
  f.owner.invalidateWarm();
  const read = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  await expect(f.owner.load(f.task)).rejects.toThrow();
  expect(read).toHaveBeenCalled();
});
it('a changed authenticated counter requires a full read, never a guessed append range', async () => {
  const f = await fixture();
  const other = createContentOwner(f.scope, 1, f.crypt);
  cleanups.push(() => other.dispose());
  await other.initialize(f.task);
  await other.append(f.task, [{ kind: 'update', bytes: new Uint8Array([9]) }]);
  const read = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  expect((await f.owner.load(f.task)).at(-1)!.bytes).toEqual(new Uint8Array([9]));
  expect(read).toHaveBeenCalled();
});
it('failed sealing burns its reservation but cannot install speculative rows', async () => {
  const f = await fixture();
  const original = f.crypt.seal;
  f.crypt.seal = async () => {
    throw Error('seal fault');
  };
  await expect(
    f.owner.append(f.task, [{ kind: 'update', bytes: new Uint8Array([9]) }]),
  ).rejects.toThrow('seal fault');
  f.crypt.seal = original;
  const read = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  expect(await f.owner.load(f.task)).toHaveLength(40);
  expect(read).toHaveBeenCalled();
  const receipt = await f.owner.append(f.task, [{ kind: 'update', bytes: new Uint8Array([9]) }]);
  expect(receipt.sequences).toEqual([42]);
});
it('row/time ceilings become due and background slices finish despite continuing appends', async () => {
  const f = await fixture();
  await f.owner.append(
    f.task,
    Array.from({ length: 256 }, () => ({ kind: 'update' as const, bytes: new Uint8Array([0, 0]) })),
  );
  expect(f.owner.warmAuditDue()).toBe(true);
  // The first slice captures all 297 rows then present. Later appends do not move that cut.
  for (let i = 0; i < 19; i++) {
    await f.owner.append(f.task, [{ kind: 'update', bytes: new Uint8Array([0, 0]) }]);
    const complete = await f.owner.auditWarm(f.task);
    expect(complete).toBe(i === 18);
  }
  expect(f.owner.warmAuditDue()).toBe(false);
  const now = performance.now();
  vi.spyOn(performance, 'now').mockReturnValue(now + WARM_AUDIT_MS + 1);
  expect(f.owner.warmAuditDue()).toBe(true);
});
it('closing during verification cannot return or reinstall a warm result', async () => {
  const f = await fixture();
  f.crypt.validate = () => {
    f.abort.abort();
  };
  await expect(f.owner.load(f.task)).rejects.toThrow('closed');
});

it('aborting the record commit never installs its rows in the warm view', async () => {
  const f = await fixture();
  const original = IDBObjectStore.prototype.add;
  const add = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (
    this: IDBObjectStore,
    ...args
  ) {
    const request = original.apply(this, args);
    if (this.name === 'content') this.transaction.abort();
    return request;
  });
  await expect(
    f.owner.append(f.task, [{ kind: 'update', bytes: new Uint8Array([8]) }]),
  ).rejects.toThrow();
  add.mockRestore();
  const read = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  expect(await f.owner.load(f.task)).toHaveLength(40);
  expect(read).toHaveBeenCalled();
});

it('reacquisition has no warm state and authenticates the entire store', async () => {
  const f = await fixture();
  f.owner.dispose();
  await f.damage(25);
  const next = createContentOwner(f.scope, 1, f.crypt);
  cleanups.push(() => next.dispose());
  const read = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  await expect(next.initialize(f.task)).rejects.toThrow();
  expect(read).toHaveBeenCalled();
});

it('a late lower-sequence commit cannot be silently skipped by a warm reader', async () => {
  const f = await fixture();
  let reserved!: () => void, resume!: () => void;
  const atReservation = new Promise<void>((r) => {
    reserved = r;
  });
  const gate = new Promise<void>((r) => {
    resume = r;
  });
  const other = createContentOwner(f.scope, 1, {
    ...f.crypt,
    seal: async (...args) => {
      reserved();
      await gate;
      return f.crypt.seal(...args);
    },
  });
  cleanups.push(() => other.dispose());
  await other.initialize(f.task);
  const pending = other.append(f.task, [{ kind: 'update', bytes: new Uint8Array([8]) }]);
  await atReservation;
  // Another low-level owner deliberately violates Account exclusion. Observe the reservation,
  // then append above it, leaving an apparent high-water mark beyond the pending row.
  await f.owner.load(f.task);
  await f.owner.append(f.task, [{ kind: 'update', bytes: new Uint8Array([9]) }]);
  resume();
  await pending;
  await expect(f.owner.load(f.task)).rejects.toThrow('shape');
});

it('even an otherwise matching warm load authenticates the counter', async () => {
  const f = await fixture();
  await new Promise<void>((resolve, reject) => {
    const tx = f.db.transaction('meta', 'readwrite'),
      s = tx.objectStore('meta'),
      read = s.get('counter');
    read.onsuccess = () => {
      const c = read.result;
      c.mac[0] ^= 1;
      s.put(c, 'counter');
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  await expect(f.owner.load(f.task)).rejects.toThrow('authentication');
});

it('retained plaintext is the sealed input, even if the caller mutates its original while sealing', async () => {
  const f = await fixture();
  const input = new Uint8Array([3, 4]),
    seal = f.crypt.seal;
  f.crypt.seal = async (...args) => {
    const result = await seal(...args);
    input.fill(9);
    return result;
  };
  await f.owner.append(f.task, [{ kind: 'update', bytes: input }]);
  expect((await f.owner.load(f.task)).at(-1)!.bytes).toEqual(new Uint8Array([3, 4]));
  f.owner.invalidateWarm();
  expect((await f.owner.load(f.task)).at(-1)!.bytes).toEqual(new Uint8Array([3, 4]));
});

it('resumption during an in-flight warm validation forces a full read before returning', async () => {
  const f = await fixture();
  let once = false;
  f.crypt.validate = async () => {
    if (once) return;
    once = true;
    await f.damage(25);
    f.owner.invalidateWarm();
  };
  await expect(f.owner.load(f.task)).rejects.toThrow();
});
