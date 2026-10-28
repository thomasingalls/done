// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import {
  createAutomaticLocalRetention,
  LOCAL_RETENTION_QUIET_MS as QUIET,
  LOCAL_RETENTION_MIN_RECORDS as MIN,
} from '../src/crdt/automaticLocalRetention';
afterEach(() => vi.useRealTimers());
it('continues after saved progress with an event-loop yield, and new input restores the quiet wait', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  let calls = 0,
    finish: ((v: { kind: string }) => void) | undefined;
  const run = createAutomaticLocalRetention({
    signal: new AbortController().signal,
    observe: () => ({ ready: true, hint: { revision: 0, records: MIN } }),
    remove: async () => {
      calls++;
      return new Promise((resolve) => (finish = resolve));
    },
  });
  run.wake();
  await vi.advanceTimersByTimeAsync(QUIET);
  expect(calls).toBe(1);
  finish!({ kind: 'preparation-saved' });
  await vi.advanceTimersByTimeAsync(0);
  expect(run.status.reason).toBe('preparation-saved');
  await vi.advanceTimersByTimeAsync(1);
  expect(calls).toBe(2);
  run.wake();
  finish!({ kind: 'preparation-saved' });
  await vi.advanceTimersByTimeAsync(QUIET - 1);
  expect(calls).toBe(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(calls).toBe(3);
  run.dispose();
});
it('does not continue saved preparation while hidden or blocked and needs a new readiness event', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  let ready = true,
    calls = 0,
    finish: ((v: { kind: string }) => void) | undefined;
  const run = createAutomaticLocalRetention({
    signal: new AbortController().signal,
    observe: () => ({ ready, hint: { revision: 0, records: MIN } }),
    remove: async () => {
      calls++;
      return new Promise((resolve) => (finish = resolve));
    },
  });
  run.wake();
  await vi.advanceTimersByTimeAsync(QUIET);
  ready = false;
  finish!({ kind: 'preparation-saved' });
  await vi.advanceTimersByTimeAsync(60000);
  expect(calls).toBe(1);
  ready = true;
  run.wake();
  await vi.advanceTimersByTimeAsync(QUIET);
  expect(calls).toBe(2);
  run.dispose();
});
it('readiness notifications from the slice durability barrier do not manufacture editing activity', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  let ready = true,
    calls = 0,
    finish: ((v: { kind: string }) => void) | undefined;
  const run = createAutomaticLocalRetention({
    signal: new AbortController().signal,
    observe: () => ({ ready, hint: { revision: 0, records: MIN } }),
    remove: async () => {
      calls++;
      return new Promise((resolve) => (finish = resolve));
    },
  });
  run.wake();
  await vi.advanceTimersByTimeAsync(QUIET);
  expect(calls).toBe(1);
  ready = false;
  run.refresh();
  ready = true;
  run.refresh();
  finish!({ kind: 'preparation-saved' });
  await vi.advanceTimersByTimeAsync(1);
  expect(calls).toBe(2);
  run.dispose();
});
