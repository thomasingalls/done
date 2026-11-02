// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { createContentOwner } from '../src/crdt/contentStore';
import * as shadow from '../src/crdt/localBaselineShadow';
import { keys, cryptFor } from './local-baseline/anchor-fixture';
import { extendSpoolWitness } from '../src/crdt/spoolRecord';
import { deriveStoreName } from '../src/crdt/storeName';
import { openContentDb } from '../src/crdt/contentDatabase';
import type { LocalBaselineContext } from '../src/crdt/localBaselineReplay';
import type { OpenedRecord } from '../src/crdt/contentRecord';
import type { SessionTask } from '../src/crdt/writeSession';
// @ts-expect-error Shared independent real protocol fixture.
import { memberFixture } from './local-baseline/fixtures.mjs';
const clean: (() => void)[] = [];
afterEach(() => {
  clean.splice(0).forEach((f) => f());
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const task: SessionTask = {
  signal: new AbortController().signal,
  step: (f) => f(),
  wait: async (f) => f(),
};
async function fixture(version: 3 | 4, warm = false, opt = true) {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const name of [
    'VITE_ACCOUNT_RETENTION',
    'VITE_ACCOUNT_BASELINE_READ',
    'VITE_ACCOUNT_BASELINE_INSTALL',
  ])
    vi.stubEnv(name, '1');
  const f = await memberFixture();
  clean.push(f.clear);
  const context: LocalBaselineContext = f.ctx;
  const auth = vi.fn(async (current = task) => ({
    ...context,
    identity: { ...context.identity },
    route: { ...context.route },
    assertCurrent: () => current.step(() => {}),
  }));
  const validate = vi.fn(() => {});
  const crypt = {
    ...cryptFor(context.identity, await keys()),
    reuseOpened: true as const,
    ...(warm ? { warmLoads: true as const } : opt ? { exactBaselineReuse: true as const } : {}),
    readBaseline: true as const,
    baseline: auth,
    validate,
  };
  const owners: ReturnType<typeof createContentOwner>[] = [];
  const makeOwner = () => {
    const owner = createContentOwner(context.identity, 1, crypt);
    owners.push(owner);
    return owner;
  };
  clean.push(() => owners.forEach((o) => o.dispose()));
  const seed = makeOwner();
  await seed.initialize(task, { intent: '04'.repeat(16), checkCreation() {} });
  await seed.enableSpool(task);
  let persisted = 0;
  const append = async (owner: ReturnType<typeof createContentOwner>) => {
    for (const row of (f.rows as OpenedRecord[]).slice(persisted)) {
      const event =
        row.kind === 'heads' ||
        (row.kind === 'outbound' &&
          !new TextDecoder().decode(row.bytes).startsWith('["done/source-capture/v1"'));
      if (event) {
        const before = await owner.spoolWitness(task),
          after = await extendSpoolWitness(before, row.bytes, crypto.subtle);
        await owner.appendSpool(task, row, { before, after });
      } else await owner.append(task, [row]);
      persisted++;
    }
  };
  await f.appendOwn();
  await f.appendPeer();
  await append(seed);
  expect(
    (
      await seed.installBaseline(
        task,
        async () => {},
        () => {},
        undefined,
        version === 4,
      )
    ).kind,
  ).toBe('installed');
  expect(seed.hasReducedHistory()).toBe(false);
  seed.dispose();
  const db = await openContentDb(
    task,
    await deriveStoreName(context.identity.principalId, context.identity.workspaceId),
    false,
  );
  clean.push(() => db.close());
  const mutate = (store: string, change: (store: IDBObjectStore) => void) =>
    new Promise<void>((yes, no) => {
      const tx = db.transaction(store, 'readwrite');
      change(tx.objectStore(store));
      tx.oncomplete = () => yes();
      tx.onabort = () => no(tx.error);
    });
  return { f, context, crypt, auth, validate, makeOwner, db, mutate, append };
}
for (const version of [3, 4] as const)
  for (const warm of [false, true])
    it(`v${version} ${warm ? 'live warm' : 'one-shot'} reuses only after complete exact reads and fresh authority`, async () => {
      const x = await fixture(version, warm),
        replay = vi.spyOn(shadow, 'verifyCompleteLocalBaseline'),
        owner = x.makeOwner();
      await owner.initialize(task);
      expect(replay).toHaveBeenCalledTimes(1);
      const reads = vi.spyOn(IDBObjectStore.prototype, 'getAll'),
        beforeAuth = x.auth.mock.calls.length,
        beforeValidate = x.validate.mock.calls.length;
      const first = await owner.loadAccount(task);
      expect(first.kind).toBe(version === 4 ? 'baseline-plus-suffix' : 'complete');
      expect(reads).toHaveBeenCalledTimes(3);
      expect(x.auth.mock.calls.length).toBeGreaterThanOrEqual(beforeAuth + 2);
      expect(x.validate.mock.calls.length).toBeGreaterThan(beforeValidate);
      expect(replay).toHaveBeenCalledTimes(1);
      const expected = structuredClone(first.records);
      for (const row of first.records) row.bytes.fill(0);
      const next = await owner.loadAccount(task);
      expect(next.records).toEqual(expected);
      expect(replay).toHaveBeenCalledTimes(1);
      for (const row of [...expected, ...next.records]) row.bytes.fill(0);
    });
for (const version of [3, 4] as const) {
  it(`v${version} opt-out keeps full physical-history verification`, async () => {
    const x = await fixture(version, false, false),
      replay = vi.spyOn(shadow, 'verifyCompleteLocalBaseline'),
      owner = x.makeOwner();
    await owner.initialize(task);
    await owner.loadAccount(task);
    expect(replay).toHaveBeenCalledTimes(2);
  });
  it(`v${version} changed same-shape chunk refuses instead of reusing`, async () => {
    const x = await fixture(version, true),
      owner = x.makeOwner();
    await owner.initialize(task);
    await x.mutate('meta', (s) => {
      const q = s.get(['local-baseline', 0]);
      q.onsuccess = () => {
        q.result.ct[0] ^= 1;
        s.put(q.result, ['local-baseline', 0]);
      };
    });
    await expect(owner.loadAccount(task)).rejects.toThrow();
  });
  it(`v${version} changed retained prefix ciphertext refuses instead of reusing`, async () => {
    const x = await fixture(version, true),
      owner = x.makeOwner();
    await owner.initialize(task);
    await x.mutate('outbound', (s) => {
      const q = s.getAll();
      q.onsuccess = () => {
        const row = q.result[0];
        row.ct[0] ^= 1;
        s.put(row, row.seq);
      };
    });
    await expect(owner.loadAccount(task)).rejects.toThrow();
  });
  it(`v${version} changed counter MAC remains freshly authenticated`, async () => {
    const x = await fixture(version, true),
      owner = x.makeOwner();
    await owner.initialize(task);
    await x.mutate('meta', (s) => {
      const q = s.get('counter');
      q.onsuccess = () => {
        q.result.mac[0] ^= 1;
        s.put(q.result, 'counter');
      };
    });
    await expect(owner.loadAccount(task)).rejects.toThrow('authentication');
  });
  it(`v${version} extra baseline metadata cannot hide behind exact reuse`, async () => {
    const x = await fixture(version, true),
      owner = x.makeOwner();
    await owner.initialize(task);
    await x.mutate('meta', (s) => s.put(new Uint8Array(32), 'unrecognised'));
    await expect(owner.loadAccount(task)).rejects.toThrow('metadata');
  });
}
it('unreduced explicit invalidation, reference census and another carrier each require full verification', async () => {
  const x = await fixture(4, true),
    replay = vi.spyOn(shadow, 'verifyCompleteLocalBaseline'),
    owner = x.makeOwner();
  await owner.initialize(task);
  await owner.loadAccount(task);
  expect(replay).toHaveBeenCalledTimes(1);
  owner.invalidateWarm();
  await owner.loadAccount(task);
  expect(replay).toHaveBeenCalledTimes(2);
  await owner.withBaselineCensus(task, async (input) => input.records.length);
  expect(replay).toHaveBeenCalledTimes(3);
  owner.dispose();
  const fresh = x.makeOwner();
  await fresh.initialize(task);
  expect(replay).toHaveBeenCalledTimes(4);
});
it('unreduced reconstructed authority capabilities retain independent full comparison', async () => {
  const x = await fixture(4, true),
    replay = vi.spyOn(shadow, 'verifyCompleteLocalBaseline');
  x.auth.mockImplementation(async () => ({
    ...x.context,
    identity: { ...x.context.identity },
    route: { ...x.context.route },
    inbound: { ...x.context.inbound },
    assertCurrent() {},
  }));
  const owner = x.makeOwner();
  await owner.initialize(task);
  await owner.loadAccount(task);
  expect(replay).toHaveBeenCalledTimes(2);
});
it('unreduced authority change during the final exact check refuses the late proof', async () => {
  const x = await fixture(4, true),
    owner = x.makeOwner();
  await owner.initialize(task);
  let calls = 0;
  x.auth.mockImplementation(async () => {
    if (++calls === 3) x.context.inbound = { ...x.context.inbound };
    return { ...x.context };
  });
  await expect(owner.loadAccount(task)).rejects.toThrow('authority changed during reuse');
});
it('unreduced disposal during final authority cannot publish a late exact result', async () => {
  const x = await fixture(4, true),
    owner = x.makeOwner();
  await owner.initialize(task);
  let calls = 0;
  x.auth.mockImplementation(async () => {
    if (++calls === 3) owner.dispose();
    return { ...x.context };
  });
  await expect(owner.loadAccount(task)).rejects.toThrow('authority changed during reuse');
});
it('unreduced append invalidates exact evidence before the new logical load', async () => {
  const x = await fixture(4, true),
    owner = x.makeOwner();
  await owner.initialize(task);
  await owner.loadAccount(task);
  const replay = vi.spyOn(shadow, 'verifyCompleteLocalBaseline');
  await x.f.appendOwn();
  await x.append(owner);
  await owner.loadAccount(task);
  expect(replay.mock.calls.length).toBeGreaterThan(0);
});
it('unreduced proof retains no expired task and still uses the new task authority', async () => {
  const x = await fixture(4, true),
    replay = vi.spyOn(shadow, 'verifyCompleteLocalBaseline'),
    owner = x.makeOwner();
  let alive = true;
  const first: SessionTask = {
    signal: task.signal,
    step(f) {
      if (!alive) throw Error('expired first task');
      return f();
    },
    async wait(f) {
      if (!alive) throw Error('expired first task');
      return f();
    },
  };
  await owner.initialize(first);
  alive = false;
  expect((await owner.loadAccount(task)).kind).toBe('baseline-plus-suffix');
  expect(replay).toHaveBeenCalledTimes(1);
});

for (const version of [3, 4] as const)
  it(`v${version} failed authentication clears the proof even when the exact disk bytes return`, async () => {
    const x = await fixture(version, true),
      replay = vi.spyOn(shadow, 'verifyCompleteLocalBaseline'),
      owner = x.makeOwner();
    await owner.initialize(task);
    let original: unknown;
    await x.mutate('meta', (s) => {
      const q = s.get('counter');
      q.onsuccess = () => {
        original = structuredClone(q.result);
        q.result.mac[0] ^= 1;
        s.put(q.result, 'counter');
      };
    });
    await expect(owner.loadAccount(task)).rejects.toThrow('authentication');
    await x.mutate('meta', (s) => s.put(original, 'counter'));
    await owner.loadAccount(task);
    expect(replay).toHaveBeenCalledTimes(2);
  });
it('unreduced explicit invalidation during the final check refuses the late exact proof', async () => {
  const x = await fixture(4, true),
    owner = x.makeOwner();
  await owner.initialize(task);
  let calls = 0;
  x.auth.mockImplementation(async () => {
    if (++calls === 3) owner.invalidateWarm();
    return { ...x.context };
  });
  await expect(owner.loadAccount(task)).rejects.toThrow('authority changed during reuse');
});
