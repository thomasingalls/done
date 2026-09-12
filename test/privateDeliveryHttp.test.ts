// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { privateDeliveryPost } from '../src/account/privateDeliveryHttp';
import {
  clearPrivateTransportDiagnostics,
  readPrivateTransportDiagnostics,
} from '../src/account/privateDeliveryHttp';
import type { AuthorityPin } from '../account-protocol/authority';
const pin = { origin: 'http://127.0.0.1:12345' } as AuthorityPin;
const headers = { 'Content-Type': 'application/octet-stream' };
const token = 'A'.repeat(43);
const send = (signal = new AbortController().signal, limit = 1024) =>
  privateDeliveryPost(pin, token, 'read-v2', new Uint8Array([7]), limit, signal);
afterEach(() => {
  vi.unstubAllGlobals();
  clearPrivateTransportDiagnostics();
});
it('preserves bounded service hints without returning authoritative bytes; ignores arbitrary error bodies', async () => {
  for (const reason of ['storage-unavailable', 'state-changed', 'out-of-order']) {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ v: 1, kind: 'unknown', reason }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    expect(await send()).toBeNull();
    expect(readPrivateTransportDiagnostics().at(-1)).toEqual({
      operation: 'read-v2',
      phase: 'response',
      code: reason,
    });
  }
  for (const body of [
    'secret-writing-and-factor',
    JSON.stringify({
      v: 1,
      kind: 'unknown',
      reason: 'storage-unavailable',
      extra: 'secret-writing-and-factor',
    }),
    'x'.repeat(513),
  ]) {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(body, { status: 409, headers: { 'Content-Type': 'application/json' } }),
    );
    expect(await send()).toBeNull();
  }
  expect(JSON.stringify(readPrivateTransportDiagnostics())).not.toContain('secret');
  expect(readPrivateTransportDiagnostics().at(-1)?.code).toBe('response-too-large');
  vi.stubGlobal('fetch', async () => {
    throw Error('token-and-writing');
  });
  expect(await send()).toBeNull();
  expect(readPrivateTransportDiagnostics().at(-1)?.code).toBe('network-unavailable');
});
it('a diagnostic observer failure does not alter the signed-byte transport', async () => {
  vi.stubGlobal('fetch', async () => new Response(new Uint8Array([8]), { headers }));
  expect(
    await privateDeliveryPost(
      pin,
      token,
      'submit',
      new Uint8Array([1]),
      1024,
      new AbortController().signal,
      () => {
        throw Error('observer');
      },
    ),
  ).toEqual(new Uint8Array([8]));
  vi.stubGlobal('fetch', async () => {
    throw Error('network');
  });
  expect(
    await privateDeliveryPost(
      pin,
      token,
      'submit',
      new Uint8Array([1]),
      1024,
      new AbortController().signal,
      () => {
        throw Error('observer');
      },
    ),
  ).toBeNull();
});
it('uses the fixed v2 route, no ambient credentials or redirects, and refuses inactive dispatch', async () => {
  const fetch = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(new Uint8Array([8]), { headers }),
  );
  vi.stubGlobal('fetch', fetch);
  expect(await send()).toEqual(new Uint8Array([8]));
  expect(String(fetch.mock.calls[0]![0])).toBe(pin.origin + '/account/delivery/read-v2');
  expect(fetch.mock.calls[0]![1]).toMatchObject({
    method: 'POST',
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    headers: { ...headers, Authorization: 'Bearer ' + token },
  });
  const controller = new AbortController();
  controller.abort();
  expect(await send(controller.signal)).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('bounds actual streaming bytes independently of headers and cancels overrun', async () => {
  let cancelled = false;
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array(1025));
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers },
      ),
  );
  expect(await send()).toBeNull();
  expect(cancelled).toBe(true);
});
it('waits for stream cancellation to settle and cannot return partial bytes after close', async () => {
  let release!: () => void, pulled!: () => void;
  const waiting = new Promise<void>((r) => {
    pulled = r;
  });
  const controller = new AbortController();
  let cancelled = false,
    settled = false;
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(
        new ReadableStream({
          pull() {
            pulled();
          },
          cancel() {
            cancelled = true;
            return new Promise<void>((r) => {
              release = r;
            });
          },
        }),
        { headers },
      ),
  );
  const work = send(controller.signal).then((r) => {
    settled = true;
    return r;
  });
  await waiting;
  controller.abort();
  await Promise.resolve();
  await Promise.resolve();
  expect(cancelled).toBe(true);
  expect(settled).toBe(false);
  release();
  expect(await work).toBeNull();
});
it('cancels a late successful response from a fetch that ignores abort', async () => {
  let release!: (r: Response) => void,
    cancelled = false;
  const controller = new AbortController();
  vi.stubGlobal(
    'fetch',
    () =>
      new Promise<Response>((r) => {
        release = r;
      }),
  );
  const work = send(controller.signal);
  controller.abort();
  release(
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
      { headers },
    ),
  );
  expect(await work).toBeNull();
  expect(cancelled).toBe(true);
});
it('enforces the deadline during a streaming body', async () => {
  const controller = new AbortController();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
  let release!: () => void,
    cancelled = false;
  const hit = new Promise<void>((r) => {
    release = r;
  });
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(
        new ReadableStream({
          pull() {
            release();
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers },
      ),
  );
  try {
    const work = send();
    await hit;
    controller.abort();
    expect(await work).toBeNull();
    expect(timeout).toHaveBeenCalledWith(10000);
    expect(cancelled).toBe(true);
  } finally {
    timeout.mockRestore();
  }
});
it('generated stream partitions return detached exact bytes only for complete bounded responses', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.uint8Array({ minLength: 1, maxLength: 160 }),
      fc.integer({ min: 1, max: 30 }),
      fc.constantFrom('exact', 'absent', 'short', 'long', 'invalid', 'limit'),
      async (bytes, width, mode) => {
        const data = new Uint8Array(bytes),
          limit = mode === 'limit' ? data.length - 1 : 160;
        const declared =
          mode === 'absent' || mode === 'limit'
            ? {}
            : {
                'Content-Length':
                  mode === 'invalid'
                    ? 'no'
                    : String(data.length + (mode === 'short' ? -1 : mode === 'long' ? 1 : 0)),
              };
        vi.stubGlobal(
          'fetch',
          async () =>
            new Response(
              new ReadableStream({
                start(c) {
                  for (let i = 0; i < data.length; i += width)
                    c.enqueue(data.subarray(i, i + width));
                  c.close();
                },
              }),
              { headers: { ...headers, ...declared } },
            ),
        );
        const result = await send(undefined, limit);
        if (mode === 'exact' || mode === 'absent') {
          expect(result).toEqual(data);
          data.fill(0);
          expect(result).toEqual(bytes);
        } else expect(result).toBeNull();
      },
    ),
    { seed: 9112041, numRuns: 200 },
  );
});
