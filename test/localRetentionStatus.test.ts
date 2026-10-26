// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import {
  createAutomaticLocalRetention,
  LOCAL_RETENTION_MIN_RECORDS as MIN,
  LOCAL_RETENTION_QUIET_MS as QUIET,
  LOCAL_RETENTION_RETRY_MS as RETRY,
} from '../src/crdt/automaticLocalRetention';
afterEach(() => vi.useRealTimers());
function fixture() {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const abort = new AbortController();
  const calls: {
    revision: number;
    finish: (value: { kind: string; reason?: string }) => void;
    fail: (error: Error) => void;
  }[] = [];
  const run = createAutomaticLocalRetention({
    signal: abort.signal,
    observe: () => ({ ready: true, hint: { revision: 2, records: MIN } }),
    remove: (revision) =>
      new Promise((finish, fail) => {
        calls.push({ revision, finish, fail });
      }),
  });
  return { abort, run, calls, tick: (ms: number) => vi.advanceTimersByTimeAsync(ms) };
}
it('publishes stable owned snapshots and only notifies actual presentation changes', async () => {
  const f = fixture(),
    observer = vi.fn();
  const off = f.run.onStatus(observer);
  const initial = f.run.status;
  expect(f.run.status).toBe(initial);
  f.run.wake();
  const waiting = f.run.status;
  expect(waiting.phase).toBe('waiting');
  for (let i = 0; i < 5; i++) f.run.wake();
  expect(f.run.status).toBe(waiting);
  expect(observer).toHaveBeenCalledTimes(1);
  expect(Object.isFrozen(waiting)).toBe(true);
  await f.tick(QUIET);
  expect(f.run.status.phase).toBe('running');
  f.calls[0]!.finish({ kind: 'skipped', reason: 'capacity' });
  await f.tick(0);
  expect(f.run.status).toEqual({ phase: 'idle', reason: 'capacity' });
  expect(waiting).toEqual({ phase: 'waiting', reason: undefined });
  off();
  const count = observer.mock.calls.length;
  f.run.dispose();
  expect(observer).toHaveBeenCalledTimes(count);
});
it('explicit retry rechecks a parked refusal through the same owner and respects delay/one-flight', async () => {
  const f = fixture();
  f.run.wake();
  await f.tick(QUIET);
  f.calls[0]!.finish({ kind: 'skipped', reason: 'history-required' });
  await f.tick(0);
  expect(f.run.retry()).toBe(true);
  expect(f.run.status).toEqual({ phase: 'waiting', reason: 'history-required' });
  await f.tick(RETRY - 1);
  expect(f.calls).toHaveLength(1);
  await f.tick(1);
  expect(f.calls.map((c) => c.revision)).toEqual([2, 2]);
  expect(f.run.retry()).toBe(false);
  f.run.dispose();
  f.calls[1]!.finish({ kind: 'removed' });
  await f.tick(0);
});
it('cannot retry an owner failure or a closed lifetime', async () => {
  const f = fixture();
  f.run.wake();
  await f.tick(QUIET);
  f.calls[0]!.fail(Error('verification failed'));
  await f.tick(0);
  expect(f.run.status).toEqual({ phase: 'halted', reason: 'owner-error' });
  expect(f.run.retry()).toBe(false);
  f.run.wake();
  await f.tick(RETRY * 3);
  expect(f.calls).toHaveLength(1);
  f.abort.abort();
  expect(f.run.retry()).toBe(false);
});
it('contains observer exceptions and sends one final close snapshot, then detaches', async () => {
  const f = fixture(),
    seen: string[] = [];
  f.run.onStatus(() => {
    throw Error('UI observer');
  });
  f.run.onStatus(() => {
    seen.push(f.run.status.phase);
  });
  f.run.wake();
  await f.tick(QUIET);
  expect(f.calls).toHaveLength(1);
  f.abort.abort();
  f.run.wake();
  f.calls[0]!.finish({ kind: 'removed' });
  await f.tick(RETRY);
  expect(seen).toEqual(['waiting', 'running', 'closed']);
});
