// @vitest-environment node
/** Native-lock effect routing model only; actual browser handoff is checked separately. */
import { afterEach, expect, it, vi } from 'vitest';
import {
  openWindowCeremonyCohort,
  requireClosedWindowCeremonyCohort,
} from '../src/crdt/accountWorkerCohort';
import {
  openCeremonyWorkerLifetime,
  requireClosedCeremonyWorkerLifetime,
} from '../src/crdt/ceremonyWorkerLifetime';
import {
  createWindowAccountHandoff,
  takeWindowAccountHandoff,
  discardWindowAccountHandoff,
} from '../src/crdt/windowAccountHandoff';
import {
  installCeremonyEnvironment,
  ceremonyEnvironment,
  retireCeremonyEnvironment,
} from '../src/crdt/ceremonyEnvironment';
import {
  installProtectionEnvironment,
  protectionEnvironment,
} from '../src/crdt/protectionEnvironment';
import { createWorkerAccountHandoff } from '../src/crdt/workerAccountHandoff';
import type { WorkerChannel } from '../src/crdt/workerChannel';
let serial = 0;
const dispose: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of dispose.splice(0)) await fn();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const wait = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { resolve, promise };
};
async function model() {
  const held: LockInfo[] = [];
  let client = 'window';
  vi.stubGlobal('window', {});
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('BroadcastChannel', undefined);
  vi.stubGlobal('navigator', {
    locks: {
      query: async () => ({ held, pending: [] }),
      request: async (name: string, options: LockOptions, fn: (lock: Lock | null) => unknown) => {
        if (held.some((v) => v.name === name && v.mode === 'exclusive')) {
          if (options.ifAvailable) return fn(null);
          return new Promise((_yes, no) =>
            options.signal?.addEventListener(
              'abort',
              () => no(new DOMException('Cancelled', 'AbortError')),
              { once: true },
            ),
          );
        }
        const row = { name, mode: options.mode ?? 'exclusive', clientId: client };
        held.push(row);
        try {
          return await fn({ name, mode: row.mode } as Lock);
        } finally {
          const i = held.indexOf(row);
          if (i >= 0) held.splice(i, 1);
        }
      },
    },
  });
  const window = await openWindowCeremonyCohort('handoff-' + ++serial, async () => {});
  client = 'worker';
  vi.stubGlobal('window', undefined);
  const worker = await openCeremonyWorkerLifetime(window.ticket);
  dispose.push(async () => {
    try {
      await worker.close();
    } catch {
      held.splice(0);
    }
    await window.close();
  });
  return { window, worker, held };
}
class TestWorker {
  terminate = vi.fn();
}
const fakeWorker = () => {
  vi.stubGlobal('Worker', TestWorker);
  return new TestWorker() as unknown as Worker;
};
it('forged closed markers cannot pass either native or Window identity guards', () => {
  const get = vi.fn();
  const forged = {
    get state() {
      get();
      return 'closed';
    },
  };
  expect(() => requireClosedWindowCeremonyCohort(forged as never)).toThrow();
  expect(() => requireClosedCeremonyWorkerLifetime(forged as never)).toThrow();
  expect(get).not.toHaveBeenCalled();
});
it('native abort is insufficient until the actual command and member have drained', async () => {
  const f = await model(),
    gate = wait();
  const job = f.worker.run(async () => gate.promise);
  await Promise.resolve();
  await Promise.resolve();
  const closing = f.worker.close();
  expect(f.worker.signal.aborted).toBe(true);
  expect(() => requireClosedCeremonyWorkerLifetime(f.worker)).toThrow();
  gate.resolve();
  await expect(job).rejects.toThrow();
  await closing;
  expect(() => requireClosedCeremonyWorkerLifetime(f.worker)).not.toThrow();
  expect(() => requireClosedWindowCeremonyCohort(f.window)).toThrow();
  await f.window.close();
  expect(() => requireClosedWindowCeremonyCohort(f.window)).not.toThrow();
});
it('cleanup failure never establishes completed native retirement', async () => {
  const f = await model();
  f.worker.beforeRelease(() => {
    throw Error('retained cleanup fault');
  });
  await expect(f.worker.close()).rejects.toThrow('retained cleanup fault');
  expect(() => requireClosedCeremonyWorkerLifetime(f.worker)).toThrow();
});
it('a handoff is unforgeable by copying data and is consumed once for the same slot and user lifetime', async () => {
  const f = await model();
  await f.worker.close();
  await f.window.close();
  const worker = fakeWorker(),
    stop = new AbortController(),
    nonce = 'ab'.repeat(16);
  vi.useFakeTimers();
  const token = createWindowAccountHandoff(worker, f.window, nonce, stop.signal);
  expect(() =>
    takeWindowAccountHandoff({ ...token }, f.window.ticket.slotId, stop.signal),
  ).toThrow();
  expect(() => takeWindowAccountHandoff(token, 'other', stop.signal)).toThrow();
  expect(() =>
    takeWindowAccountHandoff(token, f.window.ticket.slotId, new AbortController().signal),
  ).toThrow();
  const value = takeWindowAccountHandoff(token, f.window.ticket.slotId, stop.signal);
  expect(value.worker).toBe(worker);
  expect(value.nonce).toBe(nonce);
  value.complete();
  await vi.advanceTimersByTimeAsync(6000);
  expect(worker.terminate).not.toHaveBeenCalled();
  expect(() => takeWindowAccountHandoff(token, f.window.ticket.slotId, stop.signal)).toThrow();
});
it('abandoned transfer expires and cannot leave an unowned Worker indefinitely alive', async () => {
  const f = await model();
  await f.worker.close();
  await f.window.close();
  const worker = fakeWorker();
  vi.useFakeTimers();
  const token = createWindowAccountHandoff(worker, f.window, 'ab'.repeat(16));
  await vi.advanceTimersByTimeAsync(5000);
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(() => takeWindowAccountHandoff(token, f.window.ticket.slotId)).toThrow();
});
it('expiry remains armed after consumption until actual Account bootstrap acknowledges', async () => {
  const f = await model();
  await f.worker.close();
  await f.window.close();
  const worker = fakeWorker();
  vi.useFakeTimers();
  const value = takeWindowAccountHandoff(
    createWindowAccountHandoff(worker, f.window, 'ab'.repeat(16)),
    f.window.ticket.slotId,
  );
  await vi.advanceTimersByTimeAsync(5000);
  expect(value.signal.aborted).toBe(true);
  expect(worker.terminate).toHaveBeenCalledOnce();
});
it('caller abort or explicit discard withdraws an unconsumed transfer', async () => {
  const f = await model();
  await f.worker.close();
  await f.window.close();
  const worker = fakeWorker(),
    stop = new AbortController(),
    token = createWindowAccountHandoff(worker, f.window, 'ab'.repeat(16), stop.signal);
  stop.abort();
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(() => takeWindowAccountHandoff(token, f.window.ticket.slotId, stop.signal)).toThrow();
  discardWindowAccountHandoff(token);
  expect(worker.terminate).toHaveBeenCalledOnce();
});
it('native handoff retires only its actually closed environments and rejects a foreign bootstrap until grace expiry', async () => {
  const f = await model();
  vi.stubGlobal('postMessage', vi.fn());
  vi.stubGlobal('close', vi.fn());
  let closed = false;
  const channel = {
    get closed() {
      return closed;
    },
    close: vi.fn(() => (closed = true)),
  } as unknown as WorkerChannel;
  installCeremonyEnvironment(f.worker, channel, { visibility: 'visible', online: true });
  installProtectionEnvironment(f.worker, channel);
  expect(() => retireCeremonyEnvironment(f.worker)).toThrow();
  const handoff = createWorkerAccountHandoff(f.worker, channel);
  vi.useFakeTimers();
  const nonce = 'ab'.repeat(16);
  expect(await handoff.prepare(nonce)).toEqual({ nonce });
  expect(ceremonyEnvironment()).toBeUndefined();
  expect(protectionEnvironment()).toBeUndefined();
  expect(() =>
    installCeremonyEnvironment(f.worker, channel, { visibility: 'visible', online: true }),
  ).toThrow();
  expect(handoff.accept({ v: 1, kind: 'accountBootstrap', handoffId: 'cd'.repeat(16) })).toBe(
    false,
  );
  await vi.advanceTimersByTimeAsync(5000);
  expect(channel.close).toHaveBeenCalledOnce();
  expect(globalThis.close).toHaveBeenCalledOnce();
});
