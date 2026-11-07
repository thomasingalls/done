// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createWorkerEnrollmentNotifications } from '../src/crdt/workerEnrollmentNotifications';
import { enrollmentNotificationPresentation } from '../src/account/enrollmentWorkerProtocol';
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((yes) => (resolve = yes));
  return { resolve, promise };
};
function fixture(open: (signal: AbortSignal) => Promise<Response>) {
  const stop = new AbortController(),
    publish = vi.fn(),
    runBackground = vi.fn();
  let before!: () => Promise<void>;
  const owner = createWorkerEnrollmentNotifications(
    {
      signal: stop.signal,
      publish,
      runBackground: (operation) => {
        runBackground();
        return operation();
      },
      beforeAccountOpen: (fn) => {
        before = fn;
      },
    },
    open,
  );
  return { owner, publish, runBackground, stop, before: () => before() };
}
it('runs original stream authorization through the actual background lifetime port and emits only advisory progress', async () => {
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const cancel = vi.fn();
  const open = vi.fn(
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            stream = c;
          },
          cancel,
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
  );
  const f = fixture(open);
  f.owner.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(open).toHaveBeenCalledTimes(1);
  expect(f.runBackground).toHaveBeenCalledTimes(1);
  stream.enqueue(new TextEncoder().encode('event: ready\ndata: {}\n\nevent: hint\ndata: {}\n\n'));
  await vi.advanceTimersByTimeAsync(0);
  expect(f.owner.snapshot()).toEqual({ generation: 2, connected: true, event: 'hint' });
  await f.before();
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(f.owner.snapshot().connected).toBe(false);
  await vi.advanceTimersByTimeAsync(60000);
  expect(open).toHaveBeenCalledTimes(1);
});
it('pre-opening cleanup joins a late header response and cancels its body before it can complete', async () => {
  const response = deferred<Response>();
  let signal!: AbortSignal;
  const f = fixture((s) => {
    signal = s;
    return response.promise;
  });
  f.owner.start();
  await vi.advanceTimersByTimeAsync(0);
  let done = false;
  const closing = f.before().then(() => (done = true));
  await Promise.resolve();
  expect(signal.aborted).toBe(true);
  expect(done).toBe(false);
  const cancel = vi.fn();
  response.resolve(
    new Response(new ReadableStream({ cancel }), {
      headers: { 'Content-Type': 'text/event-stream' },
    }),
  );
  await closing;
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(f.owner.snapshot()).toEqual({ generation: 0, connected: false, event: null });
});
it('serializes replacement behind actual prior cleanup and discards late wakeups', async () => {
  const gate = deferred<Response>(),
    open = vi.fn(() => gate.promise),
    f = fixture(open);
  f.owner.start();
  await vi.advanceTimersByTimeAsync(0);
  const close = f.owner.stop();
  const calls = f.publish.mock.calls.length;
  f.owner.start();
  f.owner.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(open).toHaveBeenCalledTimes(1);
  gate.resolve(
    new Response(new ReadableStream({ cancel() {} }), {
      headers: { 'Content-Type': 'text/event-stream' },
    }),
  );
  await close;
  await vi.advanceTimersByTimeAsync(0);
  expect(open).toHaveBeenCalledTimes(2);
  await f.owner.stop();
  expect(f.publish.mock.calls.length).toBe(calls);
});
it('rejects forged or extended notification displays without interpreting them as authority', () => {
  expect(
    enrollmentNotificationPresentation({ generation: 1, connected: false, event: 'content' }),
  ).toEqual({ generation: 1, connected: false, event: 'content' });
  for (const value of [
    { generation: 0, connected: false, event: 'ready' },
    { generation: 1, connected: false, event: null },
    { generation: NaN, connected: false, event: 'hint' },
    { generation: 1, connected: true, event: 'hint', authorization: true },
  ])
    expect(() => enrollmentNotificationPresentation(value)).toThrow();
});
