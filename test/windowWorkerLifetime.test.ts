// @vitest-environment node
/** Wiring model only; real native exclusive membership/hard death are checked in browsers. */
import { afterEach, expect, it, vi } from 'vitest';
import { openWindowLocalCohort, type WindowAccountCohort } from '../src/crdt/accountWorkerCohort';
import { watchWindowWorkerLifetime } from '../src/crdt/windowWorkerLifetime';
import { cohortNames } from '../src/crdt/nativeCoordination';
const roots: WindowAccountCohort[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await root.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function fixture() {
  const held: LockInfo[] = [];
  let pending: { grant(): Promise<void>; fail(cause: unknown): void } | undefined;
  const query = vi.fn(async () => ({ held: [...held], pending: [] }));
  const request = vi.fn(
    async (name: string, options: LockOptions, callback: (lock: Lock) => unknown) => {
      if (
        name.includes('/worker-member/') &&
        held.some((v) => v.name === name && v.clientId === 'worker')
      ) {
        return new Promise<void>((resolve, reject) => {
          const aborted = () => {
            pending = undefined;
            reject(new DOMException('cancelled', 'AbortError'));
          };
          options.signal?.addEventListener('abort', aborted, { once: true });
          pending = {
            async grant() {
              options.signal?.removeEventListener('abort', aborted);
              pending = undefined;
              await callback({ name, mode: 'exclusive' } as Lock);
              resolve();
            },
            fail(cause) {
              options.signal?.removeEventListener('abort', aborted);
              pending = undefined;
              reject(cause);
            },
          };
        });
      }
      const value: LockInfo = { name, mode: options.mode ?? 'exclusive', clientId: 'window' };
      held.push(value);
      try {
        return await callback({ name, mode: value.mode! } as Lock);
      } finally {
        held.splice(held.indexOf(value), 1);
      }
    },
  );
  vi.stubGlobal('window', {});
  vi.stubGlobal('navigator', { locks: { request, query } });
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('BroadcastChannel', undefined);
  const release = () => {
    for (let i = held.length - 1; i >= 0; i--)
      if (held[i]!.clientId === 'worker') held.splice(i, 1);
  };
  const root = await openWindowLocalCohort('watch-test', async () => release());
  roots.push(root);
  const names = cohortNames(root.ticket.slotId, root.ticket.incarnation);
  held.push(
    { name: names.member, mode: 'exclusive', clientId: 'worker' },
    { name: names.slot, mode: 'shared', clientId: 'worker' },
  );
  await root.bindLocalWorker();
  return {
    root,
    held,
    names,
    request,
    query,
    async grant() {
      const p = pending!;
      release();
      await p.grant();
    },
    fail(cause: unknown) {
      pending!.fail(cause);
    },
  };
}
it('a forged cohort cannot execute a supplied lifetime capability', async () => {
  const write = vi.fn(),
    retire = vi.fn();
  await expect(
    watchWindowWorkerLifetime({ write } as unknown as WindowAccountCohort, retire),
  ).rejects.toThrow('inactive');
  expect(write).not.toHaveBeenCalled();
  expect(retire).not.toHaveBeenCalled();
});
it('one queued exclusive member request observes actual release without repeated queries or timers', async () => {
  const f = await fixture(),
    retire = vi.fn();
  f.query.mockClear();
  const timer = vi.spyOn(globalThis, 'setInterval');
  await watchWindowWorkerLifetime(f.root, retire);
  expect(f.query).toHaveBeenCalledTimes(1);
  expect(retire).not.toHaveBeenCalled();
  const [name, options] = f.request.mock.calls.at(-1)!;
  expect(name).toBe(f.names.member);
  expect(options.mode).toBe('exclusive');
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(timer).not.toHaveBeenCalled();
  await f.grant();
  expect(retire.mock.calls).toEqual([[true]]);
});
it('normal Window withdrawal cancels its observer before native member drain and never reports worker death', async () => {
  const f = await fixture(),
    retire = vi.fn();
  await watchWindowWorkerLifetime(f.root, retire);
  await f.root.close();
  expect(retire).not.toHaveBeenCalled();
  expect(f.root.state).toBe('closed');
});
it('native request failure withdraws without claiming physical release', async () => {
  const f = await fixture(),
    retire = vi.fn();
  await watchWindowWorkerLifetime(f.root, retire);
  f.fail(Error('native request failed'));
  await Promise.resolve();
  await Promise.resolve();
  expect(retire.mock.calls).toEqual([[false]]);
});
it('wrong native membership mode refuses before queuing an observation', async () => {
  const f = await fixture();
  const member = f.held.find((v) => v.name === f.names.member)!;
  member.mode = 'shared';
  const count = f.request.mock.calls.length;
  await expect(watchWindowWorkerLifetime(f.root, vi.fn())).rejects.toThrow('inactive');
  expect(f.request.mock.calls.length).toBe(count);
});
it('a native member without the matching shared old-slot holder refuses observation', async () => {
  const f = await fixture();
  const slot = f.held.find((v) => v.name === f.names.slot && v.clientId === 'worker')!;
  slot.clientId = 'unrelated';
  const count = f.request.mock.calls.length;
  await expect(watchWindowWorkerLifetime(f.root, vi.fn())).rejects.toThrow('inactive');
  expect(f.request.mock.calls.length).toBe(count);
});
it('the native observer callback returns without awaiting its own final member barrier', async () => {
  const f = await fixture();
  let closed: Promise<void> | undefined;
  await watchWindowWorkerLifetime(f.root, () => {
    closed = f.root.close();
  });
  await f.grant();
  await closed;
  expect(f.root.state).toBe('closed');
});
