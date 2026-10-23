// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHistoryReadRetry } from '../src/account/historyReadRetry';
import {
  privateDeliveryPost,
  clearPrivateTransportDiagnostics,
  readPrivateTransportDiagnostics,
} from '../src/account/privateDeliveryHttp';
import {
  NetworkAuthorityChanged,
  NetworkSignInRequired,
  NetworkThrottled,
} from '../src/account/scopedTransport';
import type { AuthorityPin } from '../account-protocol/authority';
import { SERVICE_HINTS } from '../account-protocol/diagnostics';
import { INBOUND_BATCH_REQUEST_LIMIT } from '../account-protocol/inboundBatch';
const pin = { origin: 'http://localhost:53221' } as AuthorityPin;
const changed = () =>
  Response.json({ v: 1, kind: 'unknown', reason: 'state-changed' }, { status: 409 });
const good = () =>
  new Response(new Uint8Array([8]), { headers: { 'Content-Type': 'application/octet-stream' } });
const access = (fetch: (_path: string, init: RequestInit) => Promise<Response>) => ({
  kind: 'scoped-account' as const,
  pin,
  fetch,
});
function harness(
  fetch: (_path: string, init: RequestInit) => Promise<Response>,
  stop = new AbortController(),
) {
  const retry = createHistoryReadRetry(stop.signal),
    scoped = access(fetch);
  const run = (
    body = new Uint8Array([7]),
    path: 'read-v2' | 'read-v2-batch' | 'submit' | 'read' = 'read-v2',
  ) =>
    retry(body, (copy, signal, observe) =>
      privateDeliveryPost(pin, scoped, path, copy, 1024, signal, observe, true),
    );
  return { retry, run, stop };
}
async function finish<T>(work: Promise<T>) {
  await vi.runAllTimersAsync();
  return work;
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  clearPrivateTransportDiagnostics();
});

it('retries only an explicit read state change and resends captured bytes despite caller or dispatch mutation', async () => {
  const body = new Uint8Array([7, 9]),
    sent: number[][] = [],
    outgoing: Uint8Array[] = [];
  const h = harness(async (_path, init) => {
    const bytes = init.body as Uint8Array;
    outgoing.push(bytes);
    sent.push([...bytes]);
    body.fill(0);
    bytes.fill(55);
    return sent.length === 1 ? changed() : good();
  });
  expect(await finish(h.run(body))).toEqual(new Uint8Array([8]));
  expect(sent).toEqual([
    [7, 9],
    [7, 9],
  ]);
  expect(outgoing.every((bytes) => bytes.every((value) => value === 0))).toBe(true);
  expect(readPrivateTransportDiagnostics()).toContainEqual({
    operation: 'read-v2',
    phase: 'response',
    code: 'state-changed',
  });
});

it('shares four extra attempts across distinct pages without replenishing them after success', async () => {
  let calls = 0;
  const h = harness(async () => (++calls % 2 ? changed() : good()));
  for (let i = 0; i < 4; i++)
    expect(await finish(h.run(new Uint8Array([i])))).toEqual(new Uint8Array([8]));
  expect(await finish(h.run(new Uint8Array([99])))).toBeNull();
  expect(calls).toBe(9);
});

it('exhausts persistent state changes after five attempts, retaining the same exact body', async () => {
  const sent: number[][] = [];
  const h = harness(async (_path, init) => {
    sent.push([...(init.body as Uint8Array)]);
    return changed();
  });
  expect(await finish(h.run())).toBeNull();
  expect(sent).toEqual(Array.from({ length: 5 }, () => [7]));
  expect(await finish(h.run(new Uint8Array([9])))).toBeNull();
  expect(sent).toHaveLength(6);
});

it('does not retry other domain refusals, malformed/oversized hints, wrong media/status, or network errors', async () => {
  const responses = [
    ...SERVICE_HINTS.filter((reason) => reason !== 'state-changed').map(
      (reason) => () => Response.json({ v: 1, kind: 'unknown', reason }, { status: 409 }),
    ),
    () =>
      Response.json(
        { v: 1, kind: 'unknown', reason: 'state-changed', extra: true },
        { status: 409 },
      ),
    () => Response.json({ v: 2, kind: 'unknown', reason: 'state-changed' }, { status: 409 }),
    () =>
      new Response('x'.repeat(513), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
    () =>
      new Response('{"v":1,"kind":"unknown","reason":"state-changed"}', {
        status: 409,
        headers: { 'Content-Type': 'text/plain' },
      }),
    () => Response.json({ v: 1, kind: 'unknown', reason: 'state-changed' }, { status: 403 }),
    () => Response.json({ v: 1, kind: 'unknown', reason: 'state-changed' }, { status: 500 }),
    () => Response.json({ v: 1, kind: 'unknown', reason: 'state-changed' }, { status: 429 }),
    () => {
      throw Error('network');
    },
  ];
  for (const response of responses) {
    const fetch = vi.fn(async () => response());
    const h = harness(fetch);
    expect(await finish(h.run())).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  }
});

it('never repeats submissions or the unrelated v1 read route on a state-change hint', async () => {
  for (const path of ['submit', 'read'] as const) {
    const fetch = vi.fn(async () => changed());
    expect(await finish(harness(fetch).run(undefined, path))).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  }
});

it('propagates sign-in, authority and throttling outcomes without consuming automatic retries', async () => {
  for (const error of [
    new NetworkSignInRequired(),
    new NetworkAuthorityChanged(),
    new NetworkThrottled(),
  ]) {
    const fetch = vi.fn(async () => {
      throw error;
    });
    await expect(harness(fetch).run()).rejects.toBe(error);
    expect(fetch).toHaveBeenCalledTimes(1);
  }
});

it('does not retry a successful byte reply; authentication and cursor advancement stay with the verifier', async () => {
  const fetch = vi.fn(async () => good());
  expect(await finish(harness(fetch).run())).toEqual(new Uint8Array([8]));
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('aborts backoff without dispatching a late request', async () => {
  const fetch = vi.fn(async () => changed()),
    h = harness(fetch);
  const work = h.run();
  await vi.advanceTimersByTimeAsync(100);
  h.stop.abort();
  expect(await finish(work)).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('a pre-aborted load sends nothing and cancellation erases a late successful response', async () => {
  const stopped = new AbortController();
  stopped.abort();
  const fetch = vi.fn(async () => good());
  expect(await finish(harness(fetch, stopped).run())).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  let release!: (response: Response) => void,
    cancelled = false;
  const pending = new Promise<Response>((resolve) => (release = resolve));
  const h = harness(async () => pending),
    work = h.run();
  h.stop.abort();
  release(
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
      { headers: { 'Content-Type': 'application/octet-stream' } },
    ),
  );
  expect(await finish(work)).toBeNull();
  expect(cancelled).toBe(true);
});

it('one logical ten-second deadline includes retries and their streaming bodies', async () => {
  const deadline = new AbortController(),
    original = AbortSignal.timeout.bind(AbortSignal);
  const timeout = vi
    .spyOn(AbortSignal, 'timeout')
    .mockImplementationOnce(() => deadline.signal)
    .mockImplementation(original);
  let calls = 0,
    cancelled = false,
    arrived!: () => void;
  const streaming = new Promise<void>((resolve) => (arrived = resolve));
  const h = harness(async () =>
    ++calls === 1
      ? changed()
      : new Response(
          new ReadableStream({
            pull() {
              arrived();
            },
            cancel() {
              cancelled = true;
            },
          }),
          { headers: { 'Content-Type': 'application/octet-stream' } },
        ),
  );
  const work = h.run();
  await vi.advanceTimersByTimeAsync(200);
  await streaming;
  deadline.abort();
  expect(await finish(work)).toBeNull();
  expect(cancelled).toBe(true);
  expect(calls).toBe(2);
  expect(timeout).toHaveBeenNthCalledWith(1, 10000);
});

it('an in-flight logical read cannot overlap another use of its load-wide retry budget', async () => {
  let release!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>((resolve) => (release = resolve))),
    h = harness(fetch);
  const work = h.run();
  await expect(h.run(new Uint8Array([9]))).rejects.toThrow(/overlapping/i);
  release(good());
  expect(await finish(work)).toEqual(new Uint8Array([8]));
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('rejects empty or oversized captured requests before dispatch', async () => {
  const fetch = vi.fn(async () => good()),
    h = harness(fetch);
  for (const body of [new Uint8Array(), new Uint8Array(INBOUND_BATCH_REQUEST_LIMIT + 1)])
    await expect(h.run(body)).rejects.toThrow(/history read/i);
  expect(fetch).not.toHaveBeenCalled();
});

it('a retried read stops on later authority loss, invalid expiry or ledger-integrity refusal', async () => {
  const changedAuthority = new NetworkAuthorityChanged();
  const responses = [
    {
      error: true,
      next: () => {
        throw changedAuthority;
      },
    },
    {
      error: false,
      next: () =>
        Response.json({ v: 1, kind: 'unknown', reason: 'invalid-request' }, { status: 409 }),
    },
    {
      error: false,
      next: () =>
        Response.json({ v: 1, kind: 'unknown', reason: 'ledger-integrity' }, { status: 409 }),
    },
  ];
  for (const { error, next } of responses) {
    let calls = 0;
    const h = harness(async () => (++calls === 1 ? changed() : next()));
    // Attach rejection handling before advancing the timer that resumes the request.
    const result = h.run().then(
      (value) => ({ value }),
      (cause: unknown) => ({ error: cause }),
    );
    await vi.runAllTimersAsync();
    const outcome = await result;
    if (error) {
      expect('error' in outcome && outcome.error).toBe(changedAuthority);
    } else expect(outcome).toEqual({ value: null });
    expect(calls).toBe(2);
  }
});

it('captures Buffer-backed requests without retaining their aliasing slice views', async () => {
  const body = Buffer.from([7, 9]),
    sent: number[][] = [];
  const h = harness(async (_path, init) => {
    sent.push([...(init.body as Uint8Array)]);
    body.fill(0);
    return sent.length === 1 ? changed() : good();
  });
  expect(await finish(h.run(body))).toEqual(new Uint8Array([8]));
  expect(sent).toEqual([
    [7, 9],
    [7, 9],
  ]);
});
