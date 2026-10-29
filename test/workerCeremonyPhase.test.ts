// @vitest-environment node
/** Native lock wiring model; real handoff evidence exercises actual browser locks. */
import { afterEach, expect, it, vi } from 'vitest';
import { openWindowCeremonyCohort } from '../src/crdt/accountWorkerCohort';
import { openCeremonyWorkerLifetime } from '../src/crdt/ceremonyWorkerLifetime';
import { createWorkerCeremonyPhase } from '../src/crdt/workerCeremonyPhase';
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

it('rejects forged roots before calling a supplied operation', () => {
  const asserted = vi.fn();
  expect(() => createWorkerCeremonyPhase({ assertCurrent: asserted } as never)).toThrow();
  expect(asserted).not.toHaveBeenCalled();
});
it('normal phase retains its actual native member until its operation drains', async () => {
  const f = await model(),
    phase = createWorkerCeremonyPhase(f.worker),
    gate = wait(),
    started = wait();
  const work = phase.run(async () => {
    started.resolve();
    await gate.promise;
    return 1;
  });
  await started.promise;
  let closed = false;
  const closing = f.worker.close().then(() => (closed = true));
  await Promise.resolve();
  expect(closed).toBe(false);
  gate.resolve();
  await expect(work).rejects.toThrow('inactive');
  await closing;
  expect(closed).toBe(true);
});
it('trusted opening hook releases only the root job while preserving the pending UI operation', async () => {
  const f = await model(),
    phase = createWorkerCeremonyPhase(f.worker),
    gate = wait(),
    yielded = wait();
  const result = phase.run(async () => {
    await phase.yieldToAccount();
    yielded.resolve();
    await gate.promise;
    return 2;
  });
  await yielded.promise;
  expect(phase.handingOff).toBe(true);
  await f.worker.close();
  expect(() => phase.run(async () => 3)).toThrow();
  gate.resolve();
  expect(await result).toBe(2);
});
it('opening hook is one-shot and refuses outside an actual active operation', async () => {
  const f = await model(),
    phase = createWorkerCeremonyPhase(f.worker);
  await expect(phase.yieldToAccount()).rejects.toThrow('unavailable');
  const gate = wait(),
    started = wait(),
    job = phase.run(async () => {
      started.resolve();
      await gate.promise;
      return 1;
    });
  expect(() => phase.run(async () => 2)).toThrow('unavailable');
  await started.promise;
  await phase.yieldToAccount();
  await expect(phase.yieldToAccount()).rejects.toThrow('unavailable');
  gate.resolve();
  await job;
});
it('a failed ordinary operation releases the phase for a fresh command without hiding its failure', async () => {
  const f = await model(),
    phase = createWorkerCeremonyPhase(f.worker);
  await expect(
    phase.run(async () => {
      throw Error('fixture failure');
    }),
  ).rejects.toThrow('fixture failure');
  expect(await phase.run(async () => 4)).toBe(4);
});
