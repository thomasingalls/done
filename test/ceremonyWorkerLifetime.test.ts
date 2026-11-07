import { createWindowJournalBridge } from '../src/crdt/windowJournalBridge';
// @vitest-environment node
/** Controlled native-lock wiring only; browser evidence separately exercises actual locks. */
import { afterEach, expect, it, vi } from 'vitest';
import {
  openWindowCeremonyCohort,
  requireWindowAccountCohort,
  requireWindowWorkerCohort,
  requireWindowLocalCohort,
  requireWindowCeremonyCohort,
} from '../src/crdt/accountWorkerCohort';
import { openCeremonyWorkerLifetime } from '../src/crdt/ceremonyWorkerLifetime';
import { installCeremonyEnvironment } from '../src/crdt/ceremonyEnvironment';
import { cohortNames } from '../src/crdt/nativeCoordination';
import type { WorkerChannel } from '../src/crdt/workerChannel';
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const clean of cleanups.splice(0)) await clean();
  vi.unstubAllGlobals();
});
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
async function fixture() {
  const held: LockInfo[] = [];
  let client = 'window';
  const request = vi.fn(
    async (name: string, options: LockOptions, callback: (lock: Lock | null) => unknown) => {
      if (held.some((v) => v.name === name && v.mode === 'exclusive')) {
        if (options.ifAvailable) return callback(null);
        return new Promise<void>((_resolve, reject) =>
          options.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Cancelled', 'AbortError')),
            { once: true },
          ),
        );
      }
      const value: LockInfo = { name, mode: options.mode ?? 'exclusive', clientId: client };
      held.push(value);
      try {
        return await callback({ name, mode: value.mode! } as Lock);
      } finally {
        held.splice(held.indexOf(value), 1);
      }
    },
  );
  vi.stubGlobal('window', {});
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('BroadcastChannel', undefined);
  vi.stubGlobal('navigator', { locks: { request, query: async () => ({ held, pending: [] }) } });
  const window = await openWindowCeremonyCohort('ceremony-test', async () => {});
  cleanups.push(() => window.close());
  client = 'worker';
  vi.stubGlobal('window', undefined);
  const worker = await openCeremonyWorkerLifetime(window.ticket);
  cleanups.unshift(async () => {
    try {
      await worker.close();
    } catch {
      // Explicitly simulate physical context death only in failed-cleanup model teardown.
      for (let i = held.length - 1; i >= 0; i--)
        if (held[i]!.clientId === 'worker') held.splice(i, 1);
    }
  });
  return {
    window,
    worker,
    held,
    request,
    names: cohortNames(window.ticket.slotId, window.ticket.incarnation),
  };
}
it('ceremony coordination holds no old-slot fence and cannot substitute for an Account or pinned Local cohort', async () => {
  const f = await fixture();
  expect(f.held.some((v) => v.name === f.names.slot)).toBe(false);
  expect(() => requireWindowCeremonyCohort(f.window)).not.toThrow();
  expect(() => requireWindowWorkerCohort(f.window)).toThrow('inactive');
  await expect(createWindowJournalBridge(f.window)).rejects.toThrow('inactive');
  expect(() => requireWindowAccountCohort(f.window)).toThrow('inactive');
  expect(() => requireWindowLocalCohort(f.window)).toThrow('inactive');
});
it('only an actual root can install the fixed ceremony environment', () => {
  const assertCurrent = vi.fn();
  expect(() =>
    installCeremonyEnvironment(
      { assertCurrent } as unknown as Awaited<ReturnType<typeof openCeremonyWorkerLifetime>>,
      {} as WorkerChannel,
      { visibility: 'visible', online: true },
    ),
  ).toThrow('inactive');
  expect(assertCurrent).not.toHaveBeenCalled();
});
it('root close withdraws immediately but retains the member until the actual command settles', async () => {
  const f = await fixture(),
    gate = deferred();
  const running = f.worker.run(async () => {
    await gate.promise;
    return 'late';
  });
  await Promise.resolve();
  await Promise.resolve();
  const closing = f.worker.close();
  expect(f.worker.signal.aborted).toBe(true);
  expect(f.held.some((v) => v.name === f.names.member)).toBe(true);
  expect(() => f.worker.run(async () => {})).toThrow('inactive');
  gate.resolve();
  await expect(running).rejects.toThrow('inactive');
  await closing;
  expect(f.held.some((v) => v.name === f.names.member)).toBe(false);
});
it('replayed incarnation cannot acquire a second native ceremony member', async () => {
  const f = await fixture();
  await expect(openCeremonyWorkerLifetime(f.window.ticket)).rejects.toThrow('inactive');
});
it('changed physical Window anchor refuses a command before its operation executes', async () => {
  const f = await fixture(),
    operation = vi.fn(async () => {});
  f.held.find((v) => v.name === f.names.anchor)!.clientId = 'unrelated';
  await expect(f.worker.run(operation)).rejects.toThrow('inactive');
  expect(operation).not.toHaveBeenCalled();
});

it('a native cleanup-failed command withdraws and retains its member until physical death', async () => {
  const f = await fixture();
  await expect(
    f.worker.run(async () => {
      throw Object.assign(Error('native cleanup failed'), { code: 'cleanup-failed' });
    }),
  ).rejects.toMatchObject({ code: 'cleanup-failed' });
  await expect(f.worker.close()).rejects.toThrow('native cleanup failed');
  expect(f.worker.signal.aborted).toBe(true);
  expect(f.held.some((v) => v.name === f.names.member)).toBe(true);
  expect(() => f.worker.run(async () => {})).toThrow('inactive');
});
