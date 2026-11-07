// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { openLocalWorkerLifetime } from '../src/crdt/localWorkerLifetime';
import {
  cohortNames,
  localWorkerPinName,
  type AccountWorkerTicket,
} from '../src/crdt/nativeCoordination';

const ticket = (): AccountWorkerTicket => ({
  v: 1,
  slotId: 'local-test',
  incarnation: crypto.randomUUID().replaceAll('-', ''),
  windowClient: 'window',
});
afterEach(() => vi.unstubAllGlobals());
function native(t: AccountWorkerTicket) {
  const n = cohortNames(t.slotId, t.incarnation),
    held: LockInfo[] = [
      { name: n.reservation, mode: 'shared', clientId: 'window' },
      { name: n.anchor, mode: 'exclusive', clientId: 'window' },
      { name: n.slot, mode: 'shared', clientId: 'window' },
    ];
  const request = vi.fn(
    async (name: string, options: LockOptions, callback: (lock: Lock | null) => unknown) => {
      const row: LockInfo = { name, mode: options.mode ?? 'exclusive', clientId: 'worker' };
      held.push(row);
      try {
        return await callback({ name, mode: row.mode! } as Lock);
      } finally {
        held.splice(held.indexOf(row), 1);
      }
    },
  );
  vi.stubGlobal('window', undefined);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', { locks: { query: async () => ({ held, pending: [] }), request } });
  return {
    n,
    held,
    request,
    pin: () =>
      held.push({ name: localWorkerPinName(t, 'worker'), mode: 'exclusive', clientId: 'window' }),
  };
}
it('refuses Window context and insecure native coordination', async () => {
  const t = ticket();
  native(t);
  vi.stubGlobal('window', {});
  await expect(openLocalWorkerLifetime(t)).rejects.toThrow('inactive');
  vi.stubGlobal('window', undefined);
  vi.stubGlobal('isSecureContext', false);
  await expect(openLocalWorkerLifetime(t)).rejects.toThrow('secure context');
});
it('rejects ticket getters without executing them', async () => {
  const t = ticket();
  native(t);
  const get = vi.fn();
  Object.defineProperty(t, 'slotId', { get });
  await expect(openLocalWorkerLifetime(t)).rejects.toThrow('inactive');
  expect(get).not.toHaveBeenCalled();
});
it('Account exclusive reservation cannot substitute for a Local shared owner', async () => {
  const t = ticket(),
    h = native(t);
  h.held[0]!.mode = 'exclusive';
  await expect(openLocalWorkerLifetime(t)).rejects.toThrow('inactive');
  expect(h.request).not.toHaveBeenCalled();
});
it('a ticket and actual Worker root still cannot run a phase before the actual Window pin', async () => {
  const t = ticket(),
    h = native(t),
    root = await openLocalWorkerLifetime(t),
    call = vi.fn();
  await expect(root.request(h.n.slot, { mode: 'shared' }, call)).rejects.toThrow('inactive');
  expect(call).not.toHaveBeenCalled();
  await root.close();
});
it('rejects a pin held by a different native client and refuses exclusive/other-slot phases', async () => {
  const t = ticket(),
    h = native(t),
    root = await openLocalWorkerLifetime(t),
    call = vi.fn();
  h.held.push({
    name: localWorkerPinName(t, 'worker'),
    mode: 'exclusive',
    clientId: 'other-window',
  });
  await expect(root.request(h.n.slot, { mode: 'shared' }, call)).rejects.toThrow('inactive');
  await expect(root.request(h.n.slot, { mode: 'exclusive' }, call)).rejects.toThrow('inactive');
  await expect(root.request(h.n.slot + 'other', { mode: 'shared' }, call)).rejects.toThrow(
    'inactive',
  );
  expect(call).not.toHaveBeenCalled();
  await root.close();
});
it('passes the actual native phase lock; original callback lifetime completes before root release', async () => {
  const t = ticket(),
    h = native(t),
    root = await openLocalWorkerLifetime(t);
  h.pin();
  let finish!: () => void;
  const pending = new Promise<void>((r) => (finish = r)),
    started = (() => {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => (resolve = r));
      return { promise, resolve };
    })();
  const phase = root.request(h.n.slot, { mode: 'shared' }, async (lock) => {
    expect(lock.name).toBe(h.n.slot);
    expect(lock.mode).toBe('shared');
    started.resolve();
    await pending;
    return 7;
  });
  await started.promise;
  root.beforeRelease(async () => finish());
  await root.close();
  expect(await phase).toBe(7);
  expect(h.held.some((v) => v.clientId === 'worker')).toBe(false);
  expect(() => root.assertCurrent()).toThrow('inactive');
});
it('failed cleanup retains actual member and shared fences and permanently retires root', async () => {
  const t = ticket(),
    h = native(t),
    root = await openLocalWorkerLifetime(t);
  h.pin();
  root.beforeRelease(async () => {
    throw Error('key cleanup failed');
  });
  await expect(root.close()).rejects.toThrow('key cleanup failed');
  expect(root.signal.aborted).toBe(true);
  expect(h.held.filter((v) => v.clientId === 'worker').length).toBe(2);
  expect(() => root.assertCurrent()).toThrow('inactive');
});
it('a retired incarnation cannot be replayed in the same Worker realm', async () => {
  const t = ticket();
  native(t);
  const root = await openLocalWorkerLifetime(t);
  await root.close();
  await expect(openLocalWorkerLifetime(t)).rejects.toThrow('inactive');
});
it('pre-cancellation never exposes a usable root or phase', async () => {
  const t = ticket(),
    h = native(t);
  await expect(openLocalWorkerLifetime(t, AbortSignal.abort())).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(h.held.some((v) => v.clientId === 'worker')).toBe(false);
});
