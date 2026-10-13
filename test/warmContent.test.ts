// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { createContentOwner, type ContentCrypto } from '../src/crdt/contentStore';
import { recordAAD, type StoredRecord } from '../src/crdt/contentRecord';
import { deriveStoreName } from '../src/crdt/storeName';
import { WARM_AUDIT_MS } from '../src/crdt/warmContent';
import type { SessionTask } from '../src/crdt/writeSession';
import { createVerifiedRecords } from '../src/crdt/verifiedRecords';
import type { OpenedRecord } from '../src/crdt/contentRecord';
import type { ContentSelection } from '../src/crdt/contentSelection';
import fc from 'fast-check';
import {
  encodeLocalBaseline,
  baselineAuthenticationPayload,
} from '../src/crdt/localBaselineRecord';
import type { BaselineAuthentication } from '../src/crdt/localBaselineReplay';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const f of cleanups.splice(0)) f();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(count = 40, selective = false) {
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
  const verified = createVerifiedRecords<{ rows: readonly OpenedRecord[] }>({ ownResults: true });
  cleanups.push(verified.clear);
  const crypt: ContentCrypto = {
    reuseOpened: true,
    warmLoads: true,
    ...(selective ? { selectiveLoads: true as const } : {}),
    validate: selective
      ? (rows, task, _counter, view) =>
          verified.verify(
            rows,
            view,
            async (rows) => ({ rows }),
            () => task.step(() => {}),
          )
      : () => {},
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
  return { owner, task, crypt, scope, mutate, damage, abort, db, verified };
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

it('shadow census reads every physical store, keeps rows/counters isolated and expires its domain-limited authentication', async () => {
  const f = await fixture();
  f.crypt.allowSpoolCounter = true;
  await f.owner.enableSpool(f.task);
  const before = await f.owner.load(f.task);
  const read = vi.spyOn(IDBObjectStore.prototype, 'getAll'),
    write = vi.spyOn(IDBObjectStore.prototype, 'put'),
    remove = vi.spyOn(IDBObjectStore.prototype, 'delete');
  let escaped!: BaselineAuthentication,
    rows!: readonly OpenedRecord[],
    message!: Uint8Array<ArrayBuffer>;
  await f.owner.withBaselineCensus(f.task, async (input, identity, auth) => {
    expect(input.records).toEqual(before);
    if (input.counter.v !== 2) throw Error('Expected authenticated spool counter');
    message = baselineAuthenticationPayload(
      encodeLocalBaseline({
        identity,
        generation: 1,
        revision: 1,
        predecessor: '0'.repeat(64),
        authority: '0'.repeat(64),
        authorityState: { epoch: 1, head: '0'.repeat(64), generation: 1, cutsHash: '0'.repeat(64) },
        cut: {
          intent: input.counter.intent,
          sequence: before.at(-1)!.seq,
          nextSequence: input.counter.next_seq,
          reserved: [[1, input.counter.reserved[1]!]],
          witness: input.counter.spool,
        },
        snapshot: new Uint8Array([0, 0]),
        own: { position: 0, link: '0'.repeat(64), attempts: 0, receipt: null },
        sources: [],
        streams: [],
        history: null,
      }),
    );
    const seal = await auth.sign(message);
    expect(await auth.verify(message, seal)).toBe(true);
    await expect(auth.sign(new TextEncoder().encode('metadata-counter'))).rejects.toThrow();
    escaped = auth;
    rows = input.records;
    input.records[0]!.bytes.fill(8);
    input.counter.next_seq++;
    identity.storeId = 'ef'.repeat(16);
  });
  expect(read).toHaveBeenCalledTimes(3);
  expect(write).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  expect(rows.every((r) => r.bytes.every((b) => b === 0))).toBe(true);
  await expect(escaped.sign(message)).rejects.toThrow('expired');
  expect(await f.owner.load(f.task)).toEqual(before);
});

it('shadow census refuses old-row or metadata corruption before invoking any comparison', async () => {
  const f = await fixture();
  f.crypt.allowSpoolCounter = true;
  await f.damage(25);
  const compare = vi.fn(async () => {});
  await expect(f.owner.withBaselineCensus(f.task, compare)).rejects.toThrow();
  expect(compare).not.toHaveBeenCalled();
  const g = await fixture();
  g.crypt.allowSpoolCounter = true;
  g.crypt.verify = async () => false;
  await expect(g.owner.withBaselineCensus(g.task, compare)).rejects.toThrow('authentication');
  expect(compare).not.toHaveBeenCalled();
});

it('an aborted shadow census never calls its consumer; the next read still sees intact full history', async () => {
  const f = await fixture();
  f.crypt.allowSpoolCounter = true;
  const original = IDBObjectStore.prototype.getAll;
  const spy = vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(function (
    this: IDBObjectStore,
    ...args
  ) {
    const request = original.apply(this, args);
    request.addEventListener('success', () => this.transaction.abort(), { once: true });
    return request;
  });
  const compare = vi.fn(async () => {});
  await expect(f.owner.withBaselineCensus(f.task, compare)).rejects.toThrow('transaction');
  expect(compare).not.toHaveBeenCalled();
  spy.mockRestore();
  expect(await f.owner.load(f.task)).toHaveLength(40);
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

it('private selection returns detached projections without handing carrier rows to callers', async () => {
  const f = await fixture(40, true);
  let expired!: ContentSelection;
  const read = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  const projected = await f.owner.select(f.task, (lease) => {
    expired = lease;
    expect(Object.keys(lease)).toEqual([]);
    return f.verified.select(lease, (v) => v.rows[0]);
  });
  projected!.bytes.fill(7);
  const rows = await f.owner.load(f.task);
  rows[0]!.bytes.fill(8);
  expect(
    await f.owner.select(f.task, (lease) => f.verified.select(lease, (v) => v.rows[0]!.bytes)),
  ).toEqual(new Uint8Array([0, 0]));
  expect(read).not.toHaveBeenCalled();
  expect(() => f.verified.select(expired, (v) => v)).toThrow('expired');
  expect(() => f.verified.select({} as ContentSelection, (v) => v)).toThrow('expired');
  const other = createVerifiedRecords<{ rows: readonly OpenedRecord[] }>();
  await other.verify(
    rows,
    {},
    async (rows) => ({ rows }),
    () => {},
  );
  await expect(f.owner.select(f.task, (lease) => other.select(lease, (v) => v))).rejects.toThrow(
    'No verified',
  );
  other.clear();
  expect((await f.owner.load(f.task))[0]!.bytes).toEqual(new Uint8Array([0, 0]));
});

it('selection closes its lease on thrown or async callbacks and retains the ordinary full-load contract', async () => {
  const f = await fixture(4, true);
  let expired!: ContentSelection;
  await expect(
    f.owner.select(f.task, (lease) => {
      expired = lease;
      throw Error('selector failed');
    }),
  ).rejects.toThrow('selector failed');
  expect(() => f.verified.select(expired, (v) => v)).toThrow('expired');
  await expect(
    f.owner.select(f.task, async (lease) => {
      expired = lease;
      return 1;
    }),
  ).rejects.toThrow();
  expect(() => f.verified.select(expired, (v) => v)).toThrow('expired');
  await expect(
    f.owner.select(f.task, async (lease) => {
      await Promise.resolve();
      return f.verified.select(lease, (v) => v);
    }),
  ).rejects.toThrow('synchronous');
  expect(
    await f.owner.select(f.task, (lease) => f.verified.select(lease, (v) => v.rows.length)),
  ).toBe(4);
  const ordinary = await fixture(4);
  await expect(ordinary.owner.select(ordinary.task, () => 1)).rejects.toThrow('private Account');
  expect(await ordinary.owner.load(ordinary.task)).toHaveLength(4);
});

it('resume, deletion and audit failure cannot be bypassed by selecting a small answer', async () => {
  const f = await fixture(40, true);
  const select = () =>
    f.owner.select(f.task, (lease) => f.verified.select(lease, (v) => v.rows.length));
  await f.damage(25);
  expect(await select()).toBe(40);
  await expect(select()).rejects.toThrow('audit mismatch');
  const g = await fixture(40, true);
  await g.damage(25);
  g.owner.invalidateWarm();
  await expect(g.owner.select(g.task, () => 1)).rejects.toThrow();
  const h = await fixture(40, true);
  await h.mutate((s) => s.delete(25));
  await expect(h.owner.select(h.task, () => 1)).rejects.toThrow('shape');
});

it('resume during validation rereads before selection; invalidation or close during selection refuses', async () => {
  const f = await fixture(4, true);
  const original = f.crypt.validate!;
  let invalidate = true;
  f.crypt.validate = async (...args) => {
    await original(...args);
    if (invalidate) {
      invalidate = false;
      f.owner.invalidateWarm();
    }
  };
  const read = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  expect(
    await f.owner.select(f.task, (lease) => f.verified.select(lease, (v) => v.rows.length)),
  ).toBe(4);
  expect(read).toHaveBeenCalled();
  await expect(
    f.owner.select(f.task, (lease) => {
      const result = f.verified.select(lease, (v) => v.rows.length);
      f.owner.invalidateWarm();
      return result;
    }),
  ).rejects.toThrow('invalidated');
  await expect(
    f.owner.select(f.task, (lease) => {
      f.abort.abort();
      return f.verified.select(lease, (v) => v.rows.length);
    }),
  ).rejects.toThrow('closed');
});

it('late failed validation exposes no lease or result', async () => {
  const f = await fixture(4, true);
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((r) => {
    entered = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  f.crypt.validate = async () => {
    entered();
    await gate;
  };
  const select = vi.fn(() => 1);
  const work = f.owner.select(f.task, select);
  await started;
  f.abort.abort();
  release();
  await expect(work).rejects.toThrow('closed');
  expect(select).not.toHaveBeenCalled();
});

it('generated selective reads agree with full detached loads across appends, erasure and resume', async () => {
  await fc.assert(
    fc.asyncProperty(fc.array(fc.nat(255), { minLength: 1, maxLength: 10 }), async (values) => {
      const f = await fixture(2, true);
      try {
        for (const [i, b] of values.entries()) {
          await f.owner.append(f.task, [{ kind: 'update', bytes: new Uint8Array([b]) }]);
          if (i % 3 === 0) f.owner.invalidateWarm();
          const selected = await f.owner.select(f.task, (lease) =>
            f.verified.select(lease, (v) => v.rows),
          );
          const full = await f.owner.load(f.task);
          expect(selected).toEqual(full);
          selected.forEach((r) => r.bytes.fill(0));
          full.forEach((r) => r.bytes.fill(0));
          expect(
            await f.owner.select(f.task, (lease) =>
              f.verified.select(lease, (v) => [...v.rows.at(-1)!.bytes]),
            ),
          ).toEqual([b]);
        }
      } finally {
        f.owner.dispose();
        f.verified.clear();
        f.db.close();
      }
    }),
    { seed: 121027, numRuns: 20 },
  );
});

async function receiveFixture(count = 40, selective = true) {
  const f = await fixture(count, selective);
  f.crypt.allowSpoolCounter = true;
  await f.owner.enableSpool(f.task);
  await f.owner.load(f.task);
  const append = async (beforeCommit: () => Promise<void>, checkCommit?: () => void) => {
    const before = await f.owner.spoolWitness(f.task);
    const evidence = new Uint8Array([5, 6]);
    const { extendSpoolWitness } = await import('../src/crdt/spoolRecord');
    const after = await extendSpoolWitness(before, evidence, crypto.subtle);
    return f.owner.appendInbound(
      f.task,
      [
        { kind: 'update', bytes: new Uint8Array([3, 4]) },
        { kind: 'heads', bytes: evidence },
      ],
      { before, after, beforeCommit, ...(checkCommit ? { checkCommit } : {}) },
    );
  };
  return { ...f, append };
}

it('owned reservation pre-commit loads keep verified rows warm, detached and unextended until commit', async () => {
  const f = await receiveFixture();
  const read = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  const validate = vi.spyOn(f.crypt, 'validate');
  let called = false;
  await f.append(async () => {
    called = true;
    const rows = await f.owner.load(f.task);
    expect(rows).toHaveLength(40);
    rows[0]!.bytes.fill(77);
    const answer = await f.owner.select(f.task, (lease) =>
      f.verified.select(lease, (value) => value.rows[0]!.bytes),
    );
    expect(answer).toEqual(new Uint8Array([0, 0]));
    answer.fill(88);
    expect((await f.owner.load(f.task))[0]!.bytes).toEqual(new Uint8Array([0, 0]));
    expect(read).not.toHaveBeenCalled();
  });
  expect(called).toBe(true);
  expect(validate).toHaveBeenCalled();
  const rows = await f.owner.load(f.task);
  expect(rows).toHaveLength(42);
  expect(rows.at(-2)!.bytes).toEqual(new Uint8Array([3, 4]));
  expect(read).not.toHaveBeenCalled();
  f.owner.invalidateWarm();
  expect(await f.owner.load(f.task)).toEqual(rows);
  expect(read).toHaveBeenCalled();
});

it('an owned reservation does not bypass shape, counter authentication or rolling audit checks', async () => {
  for (const fault of ['shape', 'mac', 'audit'] as const) {
    const f = await receiveFixture(8);
    await expect(
      f.append(async () => {
        if (fault === 'shape') await f.mutate((s) => s.delete(4));
        else if (fault === 'audit') await f.damage(4);
        else
          await new Promise<void>((resolve, reject) => {
            const tx = f.db.transaction('meta', 'readwrite'),
              s = tx.objectStore('meta'),
              r = s.get('counter');
            r.onsuccess = () => {
              r.result.mac[0] ^= 1;
              s.put(r.result, 'counter');
            };
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error);
          });
        await f.owner.load(f.task);
      }),
    ).rejects.toThrow();
  }
});

it('resume and an unknown counter transition still force full reads inside a reservation', async () => {
  for (const change of ['resume', 'other-owner'] as const) {
    const f = await receiveFixture();
    const read = vi.spyOn(IDBObjectStore.prototype, 'getAll');
    await f.append(async () => {
      if (change === 'resume') f.owner.invalidateWarm();
      else {
        const crypt = { ...f.crypt };
        delete crypt.selectiveLoads;
        const other = createContentOwner(f.scope, 1, crypt);
        cleanups.push(() => other.dispose());
        await other.initialize(f.task);
        await other.append(f.task, [{ kind: 'update', bytes: new Uint8Array([9]) }]);
      }
      read.mockClear();
      await f.owner.load(f.task);
      expect(read).toHaveBeenCalled();
    });
    expect(await f.owner.load(f.task)).toHaveLength(change === 'resume' ? 42 : 43);
    read.mockRestore();
  }
});

it('reservation abort never advances reuse; record abort clears a pre-commit warm view', async () => {
  for (const boundary of ['reservation', 'records'] as const) {
    const f = await receiveFixture();
    let visited = false;
    const original = IDBObjectStore.prototype.put;
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args
    ) {
      const r = original.apply(this, args);
      if (boundary === 'reservation' && this.name === 'meta') this.transaction.abort();
      return r;
    });
    await expect(
      f.append(
        async () => {
          visited = true;
          expect(await f.owner.load(f.task)).toHaveLength(40);
        },
        () => {
          if (boundary === 'records') throw Error('commit fault');
        },
      ),
    ).rejects.toThrow();
    put.mockRestore();
    expect(visited).toBe(boundary === 'records');
    const read = vi.spyOn(IDBObjectStore.prototype, 'getAll');
    expect(await f.owner.load(f.task)).toHaveLength(40);
    expect(read).toHaveBeenCalled();
    read.mockRestore();
    const next = await f.append(async () => {});
    expect(next.sequences).toEqual(boundary === 'reservation' ? [41, 42] : [43, 44]);
  }
});

it('generated reservation/abort/erasure histories agree with full cold reads', async () => {
  await fc.assert(
    fc.asyncProperty(fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }), async (failures) => {
      const f = await receiveFixture(3);
      let count = 3;
      for (const fail of failures) {
        const pending = f.append(
          async () => {
            const rows = await f.owner.load(f.task);
            expect(rows).toHaveLength(count);
            for (const r of rows) r.bytes.fill(0);
          },
          () => {
            if (fail) throw Error('generated fault');
          },
        );
        if (fail) await expect(pending).rejects.toThrow('generated fault');
        else {
          await pending;
          count += 2;
        }
        const warm = await f.owner.load(f.task);
        expect(warm).toHaveLength(count);
        f.owner.invalidateWarm();
        expect(await f.owner.load(f.task)).toEqual(warm);
      }
      for (const cleanup of cleanups.splice(0)) cleanup();
    }),
    { seed: 20261012, numRuns: 20 },
  );
});
