// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createAuthorityAuthentication } from '../src/crdt/accountAuthority';
import { authorityClaim } from '../src/crdt/accountAuthorityInventory';
import type { SessionTask } from '../src/crdt/writeSession';
import fc from 'fast-check';

afterEach(() => vi.unstubAllGlobals());
const taskFor = (signal = new AbortController().signal): SessionTask => {
  const guard = () => {
    if (signal.aborted) throw Error('closed');
  };
  return {
    signal,
    step: (f) => {
      guard();
      return f();
    },
    wait: async (f) => {
      guard();
      const v = await f();
      guard();
      return v;
    },
  };
};
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { resolve, promise };
};
async function fixture() {
  const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
  const expected = { slot: 'owner', epoch: 3, ct: [1, 2, 3], nested: { accepted: true } };
  const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
  const initial = {
    value: expected,
    mac: new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes(expected))),
  };
  let stored = structuredClone(initial),
    calls = 0,
    reads = 0;
  const authenticate = async (_task: SessionTask, row: typeof initial) => {
    calls++;
    if (!(await crypto.subtle.verify('HMAC', key, row.mac, bytes(row.value))))
      throw Error('bad MAC');
    if (JSON.stringify(row.value) !== JSON.stringify(expected)) throw Error('authority changed');
  };
  const options = {
    read: async () => {
      reads++;
      return structuredClone(stored);
    },
    authenticate,
  };
  return {
    initial,
    expected,
    key,
    bytes,
    options,
    get stored() {
      return stored;
    },
    set stored(v) {
      stored = v;
    },
    get calls() {
      return calls;
    },
    get reads() {
      return reads;
    },
    memo: createAuthorityAuthentication(options),
  };
}
it('authenticates once but reads every task, retaining no caller-owned buffers', async () => {
  const f = await fixture(),
    task = taskFor();
  await f.memo.check(task);
  await f.memo.check(task);
  expect(f.calls).toBe(1);
  expect(f.reads).toBe(2);
  expect(f.stored).toEqual(f.initial);
  f.memo.invalidate();
  await f.memo.check(task);
  expect(f.calls).toBe(2);
  const second = createAuthorityAuthentication(f.options);
  await second.check(task);
  expect(f.calls).toBe(3);
  f.memo.dispose();
  await expect(f.memo.check(task)).rejects.toThrow('not available');
  await second.check(task);
  expect(f.calls).toBe(3);
});
it.each(['byte', 'mac', 'epoch', 'slot', 'nested', 'extra', 'missing'])(
  'a changed %s cannot reuse an unchanged MAC',
  async (change) => {
    const f = await fixture(),
      task = taskFor();
    await f.memo.check(task);
    switch (change) {
      case 'byte':
        f.stored.value.ct[1] = 9;
        break;
      case 'mac':
        f.stored.mac[0]! ^= 1;
        break;
      case 'epoch':
        f.stored.value.epoch++;
        break;
      case 'slot':
        f.stored.value.slot = 'other';
        break;
      case 'nested':
        f.stored.value.nested.accepted = false;
        break;
      case 'extra':
        Object.assign(f.stored.value, { added: false });
        break;
      case 'missing':
        Reflect.deleteProperty(f.stored.value, 'ct');
        break;
    }
    await expect(f.memo.check(task)).rejects.toThrow('bad MAC');
    expect(f.calls).toBe(2);
    f.stored = structuredClone(f.initial);
    await f.memo.check(task);
    expect(f.calls).toBe(3);
  },
);
it('a valid different authority still cannot adopt itself', async () => {
  const f = await fixture();
  await f.memo.check(taskFor());
  f.stored.value.epoch++;
  f.stored.mac = new Uint8Array(await crypto.subtle.sign('HMAC', f.key, f.bytes(f.stored.value)));
  await expect(f.memo.check(taskFor())).rejects.toThrow('authority changed');
});
it.each(['invalidate', 'dispose', 'close'] as const)(
  'late authentication cannot reinstall after %s',
  async (event) => {
    const f = await fixture(),
      hold = deferred(),
      entered = deferred(),
      controller = new AbortController();
    const memo = createAuthorityAuthentication({
      ...f.options,
      authenticate: async (task, rows) => {
        entered.resolve();
        await hold.promise;
        await f.options.authenticate(task, rows);
      },
    });
    const check = memo.check(taskFor(controller.signal));
    await entered.promise;
    if (event === 'close') controller.abort();
    else memo[event]();
    hold.resolve();
    await expect(check).rejects.toThrow();
    if (event === 'dispose') await expect(memo.check(taskFor())).rejects.toThrow('not available');
    else {
      await memo.check(taskFor());
      expect(f.calls).toBe(2);
    }
  },
);
it('a resumed read cannot use a memo hit from before invalidation', async () => {
  const f = await fixture(),
    hold = deferred(),
    entered = deferred();
  let pause = false;
  const memo = createAuthorityAuthentication({
    ...f.options,
    read: async () => {
      const rows = await f.options.read();
      if (pause) {
        entered.resolve();
        await hold.promise;
      }
      return rows;
    },
  });
  await memo.check(taskFor());
  pause = true;
  const check = memo.check(taskFor());
  await entered.promise;
  memo.invalidate();
  hold.resolve();
  await expect(check).rejects.toThrow('invalidated');
  pause = false;
  await memo.check(taskFor());
  expect(f.calls).toBe(2);
});
it('overlapping checks refuse without erasing the in-flight inventory', async () => {
  const f = await fixture(),
    hold = deferred(),
    entered = deferred();
  const memo = createAuthorityAuthentication({
    ...f.options,
    authenticate: async (task, rows) => {
      entered.resolve();
      await hold.promise;
      await f.options.authenticate(task, rows);
    },
  });
  const first = memo.check(taskFor());
  await entered.promise;
  await expect(memo.check(taskFor())).rejects.toThrow('not available');
  hold.resolve();
  await first;
  await memo.check(taskFor());
  expect(f.calls).toBe(1);
});
it('clears positive results after read failure, and never installs mutated verifier input', async () => {
  const f = await fixture();
  let fail = false,
    mutate = false;
  const memo = createAuthorityAuthentication({
    read: async () => {
      if (fail) throw Error('read failed');
      return f.options.read();
    },
    authenticate: async (task, rows) => {
      await f.options.authenticate(task, rows);
      if (mutate) rows.mac.fill(0);
    },
  });
  await memo.check(taskFor());
  fail = true;
  await expect(memo.check(taskFor())).rejects.toThrow('read failed');
  fail = false;
  mutate = true;
  await memo.check(taskFor());
  mutate = false;
  await memo.check(taskFor());
  expect(f.calls).toBe(3);
});
it('generated inventory mutations always reach authentication, including keys and nested bytes', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.uint8Array({ minLength: 1, maxLength: 200 }),
      fc.nat(),
      async (bytes, n) => {
        const original = [
          { key: ['slot', 'custody'], value: { ct: bytes, mac: new Uint8Array(32), absent: null } },
        ];
        let rows = structuredClone(original),
          calls = 0;
        const memo = createAuthorityAuthentication({
          read: async () => structuredClone(rows),
          authenticate: async (_task, observed) => {
            calls++;
            expect(observed).toStrictEqual(original);
          },
        });
        await memo.check(taskFor());
        await memo.check(taskFor());
        expect(calls).toBe(1);
        const changes = [
          () => {
            rows[0]!.value.ct[n % bytes.length]! ^= 1;
          },
          () => {
            rows[0]!.key[0] = 'other';
          },
          () => {
            rows = [];
          },
          () => {
            rows.push(structuredClone(rows[0]!));
          },
          () => {
            Object.assign(rows[0]!.value, { extra: undefined });
          },
          () => {
            Reflect.deleteProperty(rows[0]!.value, 'absent');
          },
        ];
        changes[n % changes.length]!();
        await expect(memo.check(taskFor())).rejects.toThrow();
        expect(calls).toBe(2);
        memo.dispose();
      },
    ),
    { seed: 101227, numRuns: 30 },
  );
});
it('clear and import interlocks refuse from the captured inventory before claim use', () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  expect(() =>
    authorityClaim([{ key: ['owner', 'legacy-import-v1'], value: {} }], 'owner'),
  ).toThrow('pre-active-import-needs-owner');
  expect(() => authorityClaim([{ key: ['owner', 'local-clear-v1'], value: {} }], 'owner')).toThrow(
    'invalid-local-clear-record',
  );
  expect(authorityClaim([], 'owner')).toBeNull();
});
