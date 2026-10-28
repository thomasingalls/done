// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createAutomaticLocalRetention,
  LOCAL_RETENTION_QUIET_MS as QUIET,
  LOCAL_RETENTION_RETRY_MS as RETRY,
} from '../src/crdt/automaticLocalRetention';
import { LocalHistoryMaintenance } from '../src/ui/LocalHistoryMaintenance';
import type { RetentionProgressSink } from '../src/crdt/contentMaintenance';
afterEach(() => {
  vi.useRealTimers();
});
function fixture() {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const controller = new AbortController(),
    calls: {
      report: RetentionProgressSink;
      finish: (r: { kind: string; reason?: string }) => void;
    }[] = [];
  const run = createAutomaticLocalRetention({
    signal: controller.signal,
    observe: () => ({ ready: true, hint: { revision: 1, records: 1024 } }),
    remove: (_revision, report) =>
      new Promise((finish) => {
        calls.push({ report, finish });
      }),
  });
  run.wake();
  return { run, calls, controller, tick: (ms: number) => vi.advanceTimersByTimeAsync(ms) };
}
it('the real attempt receives an isolated numeric reporter and exposes a stable owned progress snapshot', async () => {
  const f = fixture();
  await f.tick(QUIET);
  expect(f.calls[0]!.report).toBeTypeOf('function');
  const update = { stage: 'opening' as const, completed: 1, total: 100 };
  f.calls[0]!.report(update);
  const status = f.run.status;
  expect(status.progress).toMatchObject({ stage: 'opening', completed: 1, total: 100, attempt: 1 });
  update.completed = 99;
  expect(status.progress?.completed).toBe(1);
  expect(Object.isFrozen(status.progress)).toBe(true);
  expect(f.run.status).toBe(status);
  f.run.dispose();
});
it('record notifications are coalesced while stage changes and completed counts publish immediately', async () => {
  const f = fixture();
  await f.tick(QUIET);
  const listener = vi.fn();
  f.run.onStatus(listener);
  const report = f.calls[0]!.report;
  for (let i = 0; i < 99; i++) report({ stage: 'opening', completed: i, total: 100 });
  expect(listener).toHaveBeenCalledTimes(1);
  report({ stage: 'opening', completed: 100, total: 100 });
  expect(listener).toHaveBeenCalledTimes(2);
  report({ stage: 'verifying' });
  expect(listener).toHaveBeenCalledTimes(3);
  f.run.dispose();
});
it('an interrupted attempt is counted and its old reporter cannot overwrite a later attempt', async () => {
  const f = fixture();
  await f.tick(QUIET);
  const first = f.calls[0]!.report;
  first({ stage: 'verifying' });
  f.calls[0]!.finish({ kind: 'skipped', reason: 'activity-or-journal' });
  await f.tick(0);
  expect(f.run.diagnostics).toMatchObject({ attempts: 1, interruptions: 1, completions: 0 });
  f.run.retry();
  await f.tick(RETRY);
  f.calls[1]!.report({ stage: 'reading' });
  first({ stage: 'installing' });
  expect(f.run.status.progress).toMatchObject({ stage: 'reading', attempt: 2 });
  f.run.dispose();
});
it('bad counts and unknown fields cannot be retained and observer failures cannot stop the owner', async () => {
  const f = fixture();
  await f.tick(QUIET);
  const report = f.calls[0]!.report;
  report({ stage: 'opening', completed: Infinity, total: 4 });
  expect(f.run.status.progress).toBeUndefined();
  f.run.onStatus(() => {
    throw Error('presentation observer');
  });
  report({
    stage: 'opening',
    completed: 1,
    total: 4,
    private: 'FAKE-PRIVATE-SENTINEL',
  } as Parameters<RetentionProgressSink>[0]);
  expect(JSON.stringify(f.run.status)).not.toContain('SENTINEL');
  f.calls[0]!.finish({ kind: 'removed' });
  await f.tick(0);
  expect(f.run.diagnostics.completions).toBe(1);
  f.run.dispose();
});
it('closing the owner ignores late progress and does not publish a successful late result', async () => {
  const f = fixture();
  await f.tick(QUIET);
  const report = f.calls[0]!.report;
  f.controller.abort();
  const closed = f.run.status;
  report({ stage: 'installing' });
  f.calls[0]!.finish({ kind: 'removed' });
  await f.tick(0);
  expect(f.run.status).toBe(closed);
  expect(f.run.diagnostics.completions).toBe(0);
});

it('a progress message cannot claim completion before the real removal result', async () => {
  const f = fixture();
  await f.tick(QUIET);
  const report = f.calls[0]!.report;
  report({ stage: 'reading' });
  report({ stage: 'complete' });
  expect(f.run.status.progress?.stage).toBe('reading');
  expect(f.run.diagnostics.completions).toBe(0);
  f.calls[0]!.finish({ kind: 'removed' });
  await f.tick(0);
  expect(f.run.status.progress?.stage).toBe('complete');
  expect(f.run.diagnostics.completions).toBe(1);
  f.run.dispose();
});
it('sidebar reports the real stage and uses a subphase count without claiming total percentage', async () => {
  const f = fixture();
  await f.tick(QUIET);
  f.calls[0]!.report({ stage: 'verifying' });
  let html = renderToStaticMarkup(
    createElement(LocalHistoryMaintenance, { runtime: f.run, status: f.run.status }),
  );
  expect(html).toContain('Verifying saved history');
  expect(html).not.toContain('%');
  f.calls[0]!.report({ stage: 'opening', completed: 22, total: 57 });
  html = renderToStaticMarkup(
    createElement(LocalHistoryMaintenance, { runtime: f.run, status: f.run.status }),
  );
  expect(html).toContain('22 of 57');
  expect(html).toContain('<progress');
  f.run.dispose();
});

it('malformed and changing getter payloads cannot inject arbitrary text or throw into maintenance', async () => {
  const f = fixture();
  await f.tick(QUIET);
  const report = f.calls[0]!.report;
  report(null as unknown as Parameters<RetentionProgressSink>[0]);
  report({
    get stage() {
      throw Error('bad getter');
    },
  } as unknown as Parameters<RetentionProgressSink>[0]);
  expect(f.run.status.progress).toBeUndefined();
  let reads = 0;
  report({
    get stage() {
      return ++reads === 1 ? 'reading' : 'FAKE-PRIVATE-SENTINEL';
    },
  } as Parameters<RetentionProgressSink>[0]);
  expect(reads).toBe(1);
  expect(f.run.status.progress?.stage).toBe('reading');
  expect(JSON.stringify(f.run.diagnostics)).not.toContain('SENTINEL');
  f.run.dispose();
});
