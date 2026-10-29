// @vitest-environment node
/** Read-only observation lifetime, independent of native retention proof validation. */
import { expect, it, vi } from 'vitest';
import { withPreparationJournalObservation } from '../src/crdt/preparationJournalObservation';
import { MaintenanceInterrupted } from '../src/crdt/contentMaintenance';
import type { SessionTask } from '../src/crdt/writeSession';
const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
function fixture() {
  const stop = new AbortController();
  let input = false;
  const task = {
    signal: stop.signal,
    step(fn: any) {
      stop.signal.throwIfAborted();
      if (input) throw new MaintenanceInterrupted();
      return fn();
    },
    async wait(fn: any) {
      stop.signal.throwIfAborted();
      return fn();
    },
  } as SessionTask;
  return {
    task,
    stop,
    input: () => {
      input = true;
    },
  };
}
it('uses only the asynchronous authenticated read and never a synchronous journal writer', async () => {
  const f = fixture(),
    read = vi.fn(async () => []),
    snapshot = vi.fn(() => {
      throw Error('not at final head');
    });
  let captured: (() => void) | undefined;
  const result = await withPreparationJournalObservation(
    f.task,
    { readSnapshot: read, snapshot } as any,
    async (check) => {
      captured = check;
      check();
      return { kind: 'isolated-evidence' };
    },
  );
  expect(result).toEqual({ kind: 'isolated-evidence' });
  expect(read).toHaveBeenCalledExactlyOnceWith(f.task);
  expect(snapshot).not.toHaveBeenCalled();
  expect(() => captured!()).toThrow(MaintenanceInterrupted);
});
it('refuses nonempty input before preparation and erases owned decoded bytes', async () => {
  const f = fixture(),
    bytes = new Uint8Array([4]),
    operation = vi.fn(),
    journal = { readSnapshot: async () => [{ key: 'key', value: 'sealed', generation: 1, bytes }] };
  await expect(withPreparationJournalObservation(f.task, journal, operation)).rejects.toThrow(
    MaintenanceInterrupted,
  );
  expect(operation).not.toHaveBeenCalled();
  expect(bytes[0]).toBe(0);
});
it('retains the original task activity guard while read-only preparation awaits', async () => {
  const f = fixture(),
    held = gate(),
    entered = gate();
  const work = withPreparationJournalObservation(
    f.task,
    { readSnapshot: async () => [] },
    async (check) => {
      entered.resolve();
      await held.promise;
      check();
      return true;
    },
  );
  await entered.promise;
  f.input();
  held.resolve();
  await expect(work).rejects.toThrow(MaintenanceInterrupted);
});
it('expires the observation on refusal as well as success', async () => {
  const f = fixture();
  let held: (() => void) | undefined;
  await expect(
    withPreparationJournalObservation(f.task, { readSnapshot: async () => [] }, async (check) => {
      held = check;
      throw Error('original verification refused');
    }),
  ).rejects.toThrow('original verification refused');
  expect(() => held!()).toThrow(MaintenanceInterrupted);
});
it('checks native task retirement after the asynchronous journal read', async () => {
  const f = fixture(),
    held = gate(),
    operation = vi.fn(),
    work = withPreparationJournalObservation(
      f.task,
      {
        readSnapshot: async () => {
          await held.promise;
          return [];
        },
      },
      operation,
    );
  f.stop.abort();
  held.resolve();
  await expect(work).rejects.toThrow();
  expect(operation).not.toHaveBeenCalled();
});
it('does not turn observation freshness into final permission or keep the old check usable', async () => {
  const f = fixture();
  let stale: (() => void) | undefined;
  await withPreparationJournalObservation(
    f.task,
    { readSnapshot: async () => [] },
    async (check) => {
      stale = check;
      return null;
    },
  );
  let commits = 0;
  const mutation = () => {
    stale!();
    commits++;
  };
  expect(mutation).toThrow(MaintenanceInterrupted);
  expect(commits).toBe(0);
});
