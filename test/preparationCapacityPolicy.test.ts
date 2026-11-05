// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createAutomaticLocalRetention,
  LOCAL_RETENTION_MIN_RECORDS as MIN,
  LOCAL_RETENTION_QUIET_MS as QUIET,
  LOCAL_RETENTION_RETRY_MS as RETRY,
} from '../src/crdt/automaticLocalRetention';
import { PreparationCapacity } from '../src/crdt/preparationCapacity';
import { PreparationCapacity as JournalCapacity } from '../src/crdt/retentionPreparation';
import { LocalBaselineError } from '../src/crdt/localBaselineReplay';
import {
  LocalHistoryMaintenance,
  localHistoryNeedsAttention,
} from '../src/ui/LocalHistoryMaintenance';

afterEach(() => vi.useRealTimers());
function fixture(error: unknown = new PreparationCapacity()) {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  let hint = { revision: 3, records: MIN };
  const remove = vi.fn(async () => {
    throw error;
  });
  const open = () =>
    createAutomaticLocalRetention({
      signal: new AbortController().signal,
      observe: () => ({ ready: true, hint }),
      remove,
    });
  return {
    open,
    remove,
    change: () => {
      hint = { ...hint, records: hint.records + 1 };
    },
  };
}
it('keeps a single closed capacity class across journal and scheduler imports', () => {
  expect(JournalCapacity).toBe(PreparationCapacity);
  expect(new PreparationCapacity()).toBeInstanceOf(JournalCapacity);
});
it('parks a preparation ceiling, presents it in Data and does not spin on unchanged hints', async () => {
  const f = fixture(),
    run = f.open();
  run.wake();
  await vi.advanceTimersByTimeAsync(QUIET);
  expect(run.status).toEqual({ phase: 'idle', reason: 'capacity' });
  expect(run.diagnostics?.ownerError).toBeUndefined();
  expect(localHistoryNeedsAttention(run.status)).toBe(true);
  const text = renderToStaticMarkup(
    createElement(LocalHistoryMaintenance, { runtime: run, status: run.status }),
  );
  expect(text).toContain('preparation or snapshot size limit');
  expect(text).toContain('Your existing history is still in place');
  for (let i = 0; i < 4; i++) {
    run.refresh();
    await vi.advanceTimersByTimeAsync(RETRY);
  }
  expect(f.remove).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  run.dispose();
});
it('a new authenticated ledger hint retries behind the existing clock and parks again', async () => {
  const f = fixture(),
    run = f.open();
  run.wake();
  await vi.advanceTimersByTimeAsync(QUIET);
  f.change();
  run.refresh();
  await vi.advanceTimersByTimeAsync(RETRY - 1);
  expect(f.remove).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(f.remove).toHaveBeenCalledTimes(2);
  expect(run.status).toEqual({ phase: 'idle', reason: 'capacity' });
  expect(vi.getTimerCount()).toBe(0);
  run.dispose();
});
it('a reopened owner may try the same ceiling once and must park again', async () => {
  const f = fixture(),
    first = f.open();
  first.wake();
  await vi.advanceTimersByTimeAsync(QUIET);
  first.dispose();
  const cold = f.open();
  cold.wake();
  await vi.advanceTimersByTimeAsync(QUIET);
  expect(f.remove).toHaveBeenCalledTimes(2);
  for (let i = 0; i < 3; i++) {
    cold.refresh();
    await vi.advanceTimersByTimeAsync(RETRY);
  }
  expect(f.remove).toHaveBeenCalledTimes(2);
  expect(cold.status).toEqual({ phase: 'idle', reason: 'capacity' });
  cold.dispose();
});
it('integrity remains halted with a content-free application code, never message or stack', async () => {
  const error = new LocalBaselineError('integrity');
  error.message = 'PRIVATE WRITING';
  error.stack = 'PRIVATE STACK';
  const f = fixture(error),
    run = f.open();
  run.wake();
  await vi.advanceTimersByTimeAsync(QUIET);
  expect(run.status).toEqual({ phase: 'halted', reason: 'owner-error' });
  expect(run.diagnostics?.ownerError).toBe('LocalBaselineError:integrity');
  expect(JSON.stringify(run.diagnostics)).not.toContain('PRIVATE');
  f.change();
  run.refresh();
  run.wake();
  await vi.advanceTimersByTimeAsync(RETRY * 3);
  expect(f.remove).toHaveBeenCalledTimes(1);
  expect(run.retry()).toBe(false);
  run.dispose();
});
it('a capacity-looking storage error or plain object does not get capacity permission', async () => {
  for (const error of [
    Object.assign(Error('Preparation receipt budget exceeded'), { name: 'PreparationCapacity' }),
    { name: 'PreparationCapacity' },
  ]) {
    const f = fixture(error),
      run = f.open();
    run.wake();
    await vi.advanceTimersByTimeAsync(QUIET);
    expect(run.status).toEqual({ phase: 'halted', reason: 'owner-error' });
    expect(vi.getTimerCount()).toBe(0);
    run.dispose();
  }
});
it('does not invoke diagnostic getters or accept arbitrary text as a refusal code', async () => {
  const error = new LocalBaselineError('scope'),
    getter = vi.fn(() => 'PRIVATE WRITING');
  Object.defineProperty(error, 'reason', { get: getter });
  const f = fixture(error),
    run = f.open();
  run.wake();
  await vi.advanceTimersByTimeAsync(QUIET);
  expect(run.diagnostics?.ownerError).toBe('LocalBaselineError');
  expect(getter).not.toHaveBeenCalled();
  run.dispose();
});
