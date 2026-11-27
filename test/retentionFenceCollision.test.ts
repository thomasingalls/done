// @vitest-environment node
/** Phase 546: reduction's fenced effects meet the Worker's single handoff slot. A slot taken by a
 * prepared receive refuses before any effect; that refusal is an interruption to retry, never an
 * owner error. Everything after the slot is taken keeps failing closed. Real Worker queues, context
 * queue and scheduler; the Window side is a stub channel because no flight here reaches it. */
import { afterEach, expect, it, vi } from 'vitest';
import { createWorkerWorkspaceQueues, WorkspaceQueueBusy } from '../src/crdt/workerWorkspaceQueues';
import { createWorkerContextQueue } from '../src/crdt/workerContextQueue';
import { enterRetentionFence } from '../src/crdt/retentionFence';
import {
  MaintenanceInterrupted,
  isPriorityOnlyMaintenanceInterruption,
} from '../src/crdt/contentMaintenance';
import {
  createAutomaticLocalRetention,
  localRetentionInterrupted,
  LOCAL_RETENTION_MIN_RECORDS as MIN,
  LOCAL_RETENTION_QUIET_MS as QUIET,
  LOCAL_RETENTION_RETRY_MS as RETRY,
} from '../src/crdt/automaticLocalRetention';
import type { PreparedReceiveFinish } from '../src/crdt/admissionQueue';

afterEach(() => {
  vi.useRealTimers();
});
const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
function worker() {
  const root = new AbortController();
  let failed = 0;
  const queues = createWorkerWorkspaceQueues({
    // A flight that reaches the Window is refused by this stub: it never reports settlement.
    channel: { request: async () => undefined } as never,
    signal: root.signal,
    live: () => {},
    failed: () => {
      failed++;
    },
    incarnation: 'incarnation',
    preparedPromotion: () => (async (apply) => apply()) as PreparedReceiveFinish,
    withFence: async (_id, work) => work(),
  });
  const context = createWorkerContextQueue(root.signal);
  context.bind(queues.enqueue);
  /** A receive page verifying under the prepared slot, as the receive lane runs one. */
  const receiving = () => {
    const release = gate();
    const flight = queues.prepare(Uint8Array.of(9), async () => {
      await release.promise;
      return 'received';
    });
    void flight.catch(() => {});
    return release;
  };
  return {
    root,
    queues,
    context,
    receiving,
    failed: () => failed,
    async close() {
      root.abort();
      await queues.close();
    },
  };
}
/** The reduction removal's own mapping: an interruption becomes a skipped attempt. */
async function removal<T>(enter: () => Promise<T>) {
  try {
    return await enterRetentionFence(enter);
  } catch (cause) {
    if (cause instanceof MaintenanceInterrupted) return localRetentionInterrupted(cause);
    throw cause;
  }
}

it('a busy slot refuses with a typed error and the same message; other refusals are unchanged', async () => {
  const w = worker();
  const release = w.receiving();
  let entered = 0;
  let busy: unknown;
  try {
    w.queues.enqueue(Uint8Array.of(1), async () => {
      entered++;
    });
  } catch (cause) {
    busy = cause;
  }
  expect(busy).toBeInstanceOf(WorkspaceQueueBusy);
  expect((busy as Error).message).toBe('Worker workspace handoff changed or is unavailable');
  let second: unknown;
  try {
    w.queues.prepare(Uint8Array.of(2), async () => 'never');
  } catch (cause) {
    second = cause;
  }
  expect(second).toBeInstanceOf(WorkspaceQueueBusy);
  expect(entered).toBe(0);
  // A refused begin starts nothing and does not fail the owner.
  expect(w.failed()).toBe(0);
  expect(w.root.signal.aborted).toBe(false);
  // Malformed input is not a busy slot, even while one is taken.
  let malformed: unknown;
  try {
    w.queues.enqueue(new Uint8Array(0), async () => {});
  } catch (cause) {
    malformed = cause;
  }
  expect(malformed).toBeInstanceOf(Error);
  expect(malformed).not.toBeInstanceOf(WorkspaceQueueBusy);
  release.resolve();
  await w.close();
});

for (const site of ['progress save', 'commit'] as const)
  it(`an outstanding prepared receive at ${site} time skips the attempt instead of halting it`, async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const w = worker();
    let release: ReturnType<typeof gate> | undefined;
    let effects = 0;
    const run = createAutomaticLocalRetention({
      signal: w.root.signal,
      observe: () => ({
        ready: true,
        synchronized: true,
        hold: false,
        deferPolls: true,
        hint: { revision: 0, records: MIN },
      }),
      remove: async () => {
        // Read-only preparation has finished; a hint-driven receive took the slot meanwhile.
        release = w.receiving();
        return removal<{ kind: string }>(() =>
          site === 'progress save'
            ? w.context.run(async () => {
                effects++;
                return { kind: 'preparation-saved' as const };
              })
            : w.queues.enqueue(Uint8Array.of(1), async () => {
                effects++;
                return { kind: 'removed' as const };
              }),
        );
      },
    });
    run.wake();
    await vi.advanceTimersByTimeAsync(QUIET);
    expect(run.diagnostics).toMatchObject({ attempts: 1, interruptions: 1 });
    expect(run.status.phase).not.toBe('halted');
    expect(run.status.reason).toBe('activity-or-journal');
    expect(run.diagnostics?.ownerError).toBeUndefined();
    expect(effects).toBe(0);
    expect(w.failed()).toBe(0);
    // Not a priority-only interruption: the retry waits the full minute, then tries again.
    release!.resolve();
    run.refresh();
    await vi.advanceTimersByTimeAsync(RETRY - 1);
    expect(run.diagnostics).toMatchObject({ attempts: 1 });
    await vi.advanceTimersByTimeAsync(1);
    expect(run.diagnostics).toMatchObject({ attempts: 2 });
    release!.resolve();
    run.dispose();
    await w.close();
  });

it('the mapped interruption is not priority-only, and nothing after the slot is taken is mapped', async () => {
  const w = worker();
  const release = w.receiving();
  let interrupted: unknown;
  try {
    await enterRetentionFence(() => w.queues.enqueue(Uint8Array.of(1), async () => 1));
  } catch (cause) {
    interrupted = cause;
  }
  expect(interrupted).toBeInstanceOf(MaintenanceInterrupted);
  expect(isPriorityOnlyMaintenanceInterruption(interrupted)).toBe(false);
  release.resolve();
  await vi.waitFor(() => expect(w.failed()).toBe(1)); // the receive omitted its staged handoff
  // With the slot free, the fenced flight begins; its own refusal after begin stays an error,
  // fails the owner, and is not turned into an interruption.
  const after = await enterRetentionFence(() => w.context.run(async () => 'effect ran')).catch(
    (cause: unknown) => cause,
  );
  expect(after).toBeInstanceOf(Error);
  expect(after).not.toBeInstanceOf(MaintenanceInterrupted);
  expect(after).not.toBeInstanceOf(WorkspaceQueueBusy);
  expect(w.failed()).toBe(2);
  // A thrown non-busy error from entering is passed through unchanged.
  const thrown = Error('not ready');
  expect(() =>
    enterRetentionFence(() => {
      throw thrown;
    }),
  ).toThrow(thrown);
  await w.close();
});
