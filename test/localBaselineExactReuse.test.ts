// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { IDBObjectStore } from 'fake-indexeddb';
import * as shadow from '../src/crdt/localBaselineShadow';
import { createContentOwner } from '../src/crdt/contentStore';
import { oneShotFixture, task } from './local-baseline/one-shot-fixture';
const clean: (() => void)[] = [];
afterEach(() => {
  clean.splice(0).forEach((f) => f());
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('one-shot readers without the immutable-authority opt-in keep full verification', async () => {
  const x = await oneShotFixture(clean),
    replay = vi.spyOn(shadow, 'verifyCompleteLocalBaseline');
  const { exactBaselineReuse: _opt, ...reference } = x.crypt;
  const owner = createContentOwner(x.context.identity, 1, reference);
  clean.push(() => owner.dispose());
  await owner.initialize(task);
  await owner.loadAccount(task);
  expect(replay).toHaveBeenCalledTimes(2);
});

it('same-owner recovery reuses completed baseline proof after fresh exact reads and authority checks', async () => {
  const x = await oneShotFixture(clean),
    replay = vi.spyOn(shadow, 'verifyCompleteLocalBaseline'),
    owner = x.makeOwner();
  await owner.initialize(task);
  expect(replay).toHaveBeenCalledTimes(1);
  const reads = vi.spyOn(IDBObjectStore.prototype, 'getAll'),
    auth = x.auth.mock.calls.length;
  const first = await owner.loadAccount(task);
  expect(first.kind).toBe('baseline-plus-suffix');
  expect(replay).toHaveBeenCalledTimes(1);
  expect(reads).toHaveBeenCalledTimes(3);
  expect(x.auth.mock.calls.length).toBeGreaterThanOrEqual(auth + 2);
  const bytes = first.records[0]!.bytes.slice();
  first.records[0]!.bytes.fill(0);
  expect((await owner.loadAccount(task)).records[0]!.bytes).toEqual(bytes);
  expect(replay).toHaveBeenCalledTimes(1);
});

it('a new owner and explicit invalidation both require full replay', async () => {
  const x = await oneShotFixture(clean),
    replay = vi.spyOn(shadow, 'verifyCompleteLocalBaseline'),
    owner = x.makeOwner();
  await owner.initialize(task);
  await owner.loadAccount(task);
  expect(replay).toHaveBeenCalledTimes(1);
  owner.invalidateWarm();
  await owner.loadAccount(task);
  expect(replay).toHaveBeenCalledTimes(2);
  owner.dispose();
  const fresh = x.makeOwner();
  await fresh.initialize(task);
  expect(replay).toHaveBeenCalledTimes(3);
});

it('changed same-shape encrypted chunks cannot reuse a valid baseline', async () => {
  const x = await oneShotFixture(clean),
    owner = x.makeOwner();
  await owner.initialize(task);
  await x.mutate((s) => {
    const r = s.get(['local-baseline', 0]);
    r.onsuccess = () => {
      r.result.ct[0] ^= 1;
      s.put(r.result, ['local-baseline', 0]);
    };
  });
  await expect(owner.loadAccount(task)).rejects.toThrow();
});

it('fresh replacement authority takes full verification even when its scalar scope agrees', async () => {
  const x = await oneShotFixture(clean),
    replay = vi.spyOn(shadow, 'verifyCompleteLocalBaseline'),
    owner = x.makeOwner();
  await owner.initialize(task);
  x.context.inbound = { ...x.context.inbound };
  await owner.loadAccount(task);
  expect(replay).toHaveBeenCalledTimes(2);
});

it('equivalent but reconstructed one-shot capabilities retain reference verification', async () => {
  const x = await oneShotFixture(clean),
    replay = vi.spyOn(shadow, 'verifyCompleteLocalBaseline');
  x.auth.mockImplementation(async () => ({
    ...x.context,
    inbound: { ...x.context.inbound },
    installation: structuredClone(x.context.installation),
  }));
  const owner = x.makeOwner();
  await owner.initialize(task);
  await owner.loadAccount(task);
  expect(replay).toHaveBeenCalledTimes(2);
});

it('authority changing at the last reuse check refuses and clears the completed proof', async () => {
  const x = await oneShotFixture(clean),
    replay = vi.spyOn(shadow, 'verifyCompleteLocalBaseline'),
    owner = x.makeOwner();
  await owner.initialize(task);
  let calls = 0;
  x.auth.mockImplementation(async () => {
    if (++calls === 3) x.context.inbound = { ...x.context.inbound };
    return { ...x.context };
  });
  await expect(owner.loadAccount(task)).rejects.toThrow('authority changed during reuse');
  await owner.loadAccount(task);
  expect(replay).toHaveBeenCalledTimes(2);
});

it('a changed counter MAC cannot bypass fresh authentication through the proof cache', async () => {
  const x = await oneShotFixture(clean),
    owner = x.makeOwner();
  await owner.initialize(task);
  await x.mutate((s) => {
    const r = s.get('counter');
    r.onsuccess = () => {
      r.result.mac[0] ^= 1;
      s.put(r.result, 'counter');
    };
  });
  await expect(owner.loadAccount(task)).rejects.toThrow('authentication');
});

it('disposal during the final authority check cannot publish a late reused result', async () => {
  const x = await oneShotFixture(clean),
    owner = x.makeOwner();
  await owner.initialize(task);
  let calls = 0;
  x.auth.mockImplementation(async () => {
    if (++calls === 3) owner.dispose();
    return { ...x.context };
  });
  await expect(owner.loadAccount(task)).rejects.toThrow('authority changed during reuse');
});

it('a fresh complete census still rejects extra baseline metadata', async () => {
  const x = await oneShotFixture(clean),
    owner = x.makeOwner();
  await owner.initialize(task);
  await x.mutate((s) => s.put(new Uint8Array(32), 'unrecognised'));
  await expect(owner.loadAccount(task)).rejects.toThrow('metadata');
});

it('a one-shot proof does not retain the expiring preparation task', async () => {
  const x = await oneShotFixture(clean),
    replay = vi.spyOn(shadow, 'verifyCompleteLocalBaseline'),
    owner = x.makeOwner();
  let alive = true;
  const first = {
    ...task,
    step<T>(f: () => T) {
      if (!alive) throw Error('expired first task');
      return f();
    },
    async wait<T>(f: () => T | PromiseLike<T>) {
      if (!alive) throw Error('expired first task');
      return f();
    },
  };
  x.auth.mockImplementation(async (current = task) => ({
    ...x.context,
    assertCurrent: () => current.step(() => {}),
  }));
  await owner.initialize(first);
  alive = false;
  expect((await owner.loadAccount(task)).kind).toBe('baseline-plus-suffix');
  expect(replay).toHaveBeenCalledTimes(1);
});
