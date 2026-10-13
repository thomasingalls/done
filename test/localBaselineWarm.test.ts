// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { createContentOwner } from '../src/crdt/contentStore';
import { keys, cryptFor } from './local-baseline/anchor-fixture';
import { extendSpoolWitness } from '../src/crdt/spoolRecord';
import { deriveStoreName } from '../src/crdt/storeName';
import { openContentDb } from '../src/crdt/contentDatabase';
import type { LocalBaselineContext } from '../src/crdt/localBaselineReplay';
import type { OpenedRecord } from '../src/crdt/contentRecord';
import type { SessionTask } from '../src/crdt/writeSession';
import { WARM_AUDIT_MS } from '../src/crdt/warmContent';
import { MaintenanceInterrupted } from '../src/crdt/contentMaintenance';
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
async function fixture() {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubEnv('VITE_ACCOUNT_RETENTION', '1');
  const f = await memberFixture();
  clean.push(f.clear);
  const context: LocalBaselineContext = f.ctx;
  const auth = vi.fn(async () => ({
    ...context,
    identity: { ...context.identity },
    route: { ...context.route },
  }));
  const crypt = {
    ...cryptFor(context.identity, await keys()),
    reuseOpened: true as const,
    warmLoads: true as const,
    readBaseline: true as const,
    baseline: auth,
  };
  const owner = createContentOwner(context.identity, 1, crypt);
  clean.push(() => owner.dispose());
  await owner.initialize(task, { intent: '04'.repeat(16), checkCreation() {} });
  await owner.enableSpool(task);
  let persisted = 0;
  const append = async () => {
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
  await append();
  await owner.removeHistory(
    task,
    async () => {},
    () => {},
    0,
  );
  await owner.loadAccount(task); // Removal deliberately closes its pre-transition cache.
  const db = await openContentDb(
    task,
    await deriveStoreName(context.identity.principalId, context.identity.workspaceId),
    false,
  );
  clean.push(() => db.close());
  const mutate = (fn: (s: IDBObjectStore) => void) =>
    new Promise<void>((resolve, reject) => {
      const tx = db.transaction('meta', 'readwrite');
      fn(tx.objectStore('meta'));
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  return { f, context, crypt, owner, auth, append, db, mutate };
}
it('reduced owner keeps reservations and appends warm, with fresh authority and detached caller data', async () => {
  const x = await fixture(),
    read = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  const first = await x.owner.loadAccount(task);
  if (first.kind !== 'baseline-plus-suffix') throw Error('baseline expected');
  const snapshot = first.records[0]!.bytes.slice();
  first.records[0]!.bytes.fill(0);
  const calls = x.auth.mock.calls.length;
  const second = await x.owner.loadAccount(task);
  expect(second.records[0]!.bytes).toEqual(snapshot);
  expect(x.auth.mock.calls.length).toBeGreaterThan(calls);
  const seal = x.crypt.seal;
  let during = false;
  vi.spyOn(x.crypt, 'seal').mockImplementationOnce(async (...a) => {
    await x.owner.loadAccount(task);
    during = true;
    return seal(...a);
  });
  await x.f.appendOwn();
  await x.f.appendPeer();
  await x.append();
  const next = await x.owner.loadAccount(task);
  expect(during).toBe(true);
  expect(next.kind).toBe('baseline-plus-suffix');
  if (next.kind === 'baseline-plus-suffix') expect(next.ledger.delivery.acceptedThrough).toBe(2);
  expect(read).not.toHaveBeenCalled();
  x.owner.invalidateWarm();
  expect(await x.owner.loadAccount(task)).toEqual(next);
  expect(read.mock.calls.length).toBeGreaterThanOrEqual(3);
});
it('changed authority capability and explicit resume invalidation take full reads', async () => {
  const x = await fixture(),
    read = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  x.context.inbound = { ...x.context.inbound };
  await x.owner.loadAccount(task);
  expect(read.mock.calls.length).toBeGreaterThanOrEqual(3);
  read.mockClear();
  await x.owner.loadAccount(task);
  expect(read).not.toHaveBeenCalled();
  x.owner.invalidateWarm();
  await x.owner.loadAccount(task);
  expect(read.mock.calls.length).toBeGreaterThanOrEqual(3);
});
for (const damage of ['chunk', 'missing-chunk', 'extra-key', 'pointer'] as const)
  it(`warm reduced load refuses ${damage} without writing`, async () => {
    const x = await fixture();
    await x.mutate((s) => {
      if (damage === 'extra-key') {
        s.put('unexpected', 'extra');
        return;
      }
      if (damage === 'missing-chunk') {
        s.delete(['local-baseline', 0]);
        return;
      }
      const key = damage === 'chunk' ? ['local-baseline', 0] : 'counter',
        r = s.get(key);
      r.onsuccess = () => {
        const v = r.result;
        if (damage === 'chunk') v.ct[0] ^= 1;
        else v.baseline.revision++;
        s.put(v, key);
      };
    });
    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    await expect(x.owner.loadAccount(task)).rejects.toThrow();
    expect(put).not.toHaveBeenCalled();
  });
it('a failed append cannot retain a speculative view; the next load authenticates disk', async () => {
  const x = await fixture(),
    seal = vi.spyOn(x.crypt, 'seal').mockRejectedValueOnce(Error('seal aborted'));
  await expect(
    x.owner.append(task, [{ kind: 'update', bytes: new Uint8Array([0, 0]) }]),
  ).rejects.toThrow('seal aborted');
  seal.mockRestore();
  const read = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  await x.owner.loadAccount(task);
  expect(read.mock.calls.length).toBeGreaterThanOrEqual(3);
});
it('semantic audit is due independently of disk slices and remains retryable after interruption', async () => {
  const x = await fixture();
  await x.f.appendOwn();
  await x.append();
  await x.owner.loadAccount(task);
  const before = performance.now();
  vi.spyOn(performance, 'now').mockReturnValue(before + WARM_AUDIT_MS + 1);
  expect(x.owner.warmAuditDue()).toBe(true);
  const read = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  x.auth.mockRejectedValueOnce(new MaintenanceInterrupted());
  await expect(x.owner.auditWarm(task)).rejects.toBeInstanceOf(MaintenanceInterrupted);
  expect(read.mock.calls.length).toBeGreaterThanOrEqual(3);
  expect(x.owner.warmAuditDue()).toBe(true);
  read.mockClear();
  await x.owner.loadAccount(task);
  expect(read).not.toHaveBeenCalled(); // Interrupted reference work stays off the next foreground load.
  while (!(await x.owner.auditWarm(task))) {
    /* bounded slices */
  }
  expect(read.mock.calls.length).toBeGreaterThanOrEqual(3);
  expect(x.owner.warmAuditDue()).toBe(false);
});
it('authority replaced during a full read cannot seed a warm view under the new capability', async () => {
  const x = await fixture();
  x.owner.invalidateWarm();
  let calls = 0;
  x.auth.mockImplementation(async () => {
    if (++calls === 4) x.context.inbound = { ...x.context.inbound };
    return { ...x.context, identity: { ...x.context.identity }, route: { ...x.context.route } };
  });
  await expect(x.owner.loadAccount(task)).rejects.toThrow('authority changed');
});
it('one-shot lifecycle readers may reconstruct equivalent authority evidence on every fresh check', async () => {
  const x = await fixture();
  x.owner.dispose();
  x.auth.mockImplementation(async () => ({
    ...x.context,
    inbound: { ...x.context.inbound },
    installation: structuredClone(x.context.installation),
  }));
  const { warmLoads: _warm, ...reference } = x.crypt;
  const owner = createContentOwner(x.context.identity, 1, reference);
  clean.push(() => owner.dispose());
  await owner.initialize(task);
  expect((await owner.loadAccount(task)).kind).toBe('baseline-plus-suffix');
});
it('a due oracle first extends a committed but not yet consumed suffix, then compares full replay', async () => {
  const x = await fixture();
  await x.f.appendOwn();
  await x.append();
  vi.spyOn(performance, 'now').mockReturnValue(performance.now() + WARM_AUDIT_MS + 1);
  while (!(await x.owner.auditWarm(task))) {
    /* finish the captured disk audit */
  }
  expect(x.owner.warmAuditDue()).toBe(false);
  const read = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  const logical = await x.owner.loadAccount(task);
  if (logical.kind !== 'baseline-plus-suffix') throw Error('baseline expected');
  expect(logical.ledger.delivery.acceptedThrough).toBe(2);
  expect(read).not.toHaveBeenCalled();
});
