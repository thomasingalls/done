// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import {
  NotificationFrames,
  readNotifications,
  startNotifications,
} from '../src/account/notifications';
const bytes = (s: string) => new TextEncoder().encode(s);
const ready = 'event: ready\ndata: {}\n\n',
  hint = 'event: hint\ndata: {}\n\n';
const response = (body: ReadableStream<Uint8Array>) =>
  new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
const flush = async () => {
  for (let n = 0; n < 30; n++) await Promise.resolve();
};
afterEach(() => vi.useRealTimers());

it('accepts fragmented fixed frames and heartbeats; rejects payloads, scope fields and invalid order', () => {
  const p = new NotificationFrames(),
    events: string[] = [];
  for (const byte of bytes(ready + ': heartbeat\n\n' + hint + hint))
    p.push(new Uint8Array([byte]), (e) => events.push(e));
  expect(events).toEqual(['ready', 'hint', 'hint']);
  for (const malformed of [
    hint,
    ready + ready,
    'event: ready\ndata: {"head":3}\n\n',
    'id: abc\n' + ready,
    '\u00ff',
    'a'.repeat(4097),
  ]) {
    expect(() => new NotificationFrames().push(bytes(malformed), () => {})).toThrow();
  }
});
it('bounds an idle stream and cancels its reader; owner abort rejects late input', async () => {
  vi.useFakeTimers();
  let cancelled = 0;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled++;
    },
  });
  const stop = new AbortController();
  const read = readNotifications(response(body), stop.signal, () => {
    throw Error('late');
  });
  await vi.advanceTimersByTimeAsync(25000);
  await read;
  expect(cancelled).toBe(1);
  const queued = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes(ready));
    },
    cancel() {
      cancelled++;
    },
  });
  stop.abort();
  await expect(
    readNotifications(response(queued), stop.signal, () => {
      throw Error('late');
    }),
  ).rejects.toThrow();
  expect(cancelled).toBe(2);
});
it('ready always wakes catch-up, reconnects back off, and close clears timers and the active reader', async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const stop = new AbortController(),
    events: string[] = [];
  let opens = 0,
    cancelled = 0;
  const owner = startNotifications({
    signal: stop.signal,
    async open() {
      opens++;
      return response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(bytes(ready));
            if (opens < 3) c.close();
          },
          cancel() {
            cancelled++;
          },
        }),
      );
    },
    wake: () => events.push('wake'),
    health: (v) => events.push(String(v)),
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(opens).toBe(1);
  await vi.advanceTimersByTimeAsync(1999);
  expect(opens).toBe(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(opens).toBe(2);
  await vi.advanceTimersByTimeAsync(4000);
  expect(opens).toBe(3);
  expect(events.filter((e) => e === 'wake')).toHaveLength(3);
  stop.abort();
  await owner.dispose();
  expect(cancelled).toBe(1);
  expect(vi.getTimerCount()).toBe(0);
  vi.restoreAllMocks();
});
it('closing during an unresolved handshake cancels the late response without waking a retired owner', async () => {
  vi.useFakeTimers();
  let finish!: (r: Response) => void,
    cancelled = false;
  const wake = vi.fn();
  const owner = startNotifications({
    signal: new AbortController().signal,
    open: () =>
      new Promise((r) => {
        finish = r;
      }),
    wake,
    health: vi.fn(),
  });
  await vi.advanceTimersByTimeAsync(0);
  owner.close();
  finish(
    response(
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(bytes(ready));
        },
        cancel() {
          cancelled = true;
        },
      }),
    ),
  );
  await flush();
  await owner.dispose();
  expect(wake).not.toHaveBeenCalled();
  expect(cancelled).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
