// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { privateDiscoveryPost } from '../src/account/privateDiscoveryHttp';
import {
  clearPrivateTransportDiagnostics,
  readPrivateTransportDiagnostics,
} from '../src/account/privateDeliveryHttp';
import {
  DISCOVERY_RESPONSE_LIMIT,
  type AuthorityDiscoveryRequest,
} from '../account-protocol/successor';
const pin = {
  v: 1 as const,
  serviceId: '11'.repeat(16),
  origin: 'http://localhost:4999',
  rpId: 'localhost',
  authRoot: '22'.repeat(32),
};
const request: AuthorityDiscoveryRequest = {
  v: 1,
  kind: 'authority-discovery-request',
  pin,
  workspaceId: '33'.repeat(16),
  lineageId: '44'.repeat(32),
  credentialId: '55'.repeat(16),
  epoch: 1,
  head: '66'.repeat(32),
  nonce: '77'.repeat(32),
  expiresAt: Date.now() + 30000,
  signature: '88'.repeat(64),
};
const token = 'A'.repeat(43),
  headers = { 'Content-Type': 'application/json' };
const send = (signal = new AbortController().signal) =>
  privateDiscoveryPost(pin, token, request, signal);
afterEach(() => {
  vi.unstubAllGlobals();
  clearPrivateTransportDiagnostics();
});
it('uses the pinned endpoint, owns the request bytes and omits credentials, caches and redirects', async () => {
  const fetch = vi.fn(async () => new Response('{"reply":1}', { headers }));
  vi.stubGlobal('fetch', fetch);
  const input = structuredClone(request),
    work = privateDiscoveryPost(pin, token, input, new AbortController().signal);
  input.nonce = '99'.repeat(32);
  expect(await work).toEqual({ reply: 1 });
  const [url, options] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
  expect(url.href).toBe(pin.origin + '/account/authority/discover');
  expect(options).toMatchObject({
    method: 'POST',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    body: JSON.stringify(request),
  });
  expect(await privateDiscoveryPost(pin, 'bad', request, new AbortController().signal)).toBeNull();
  expect(
    await privateDiscoveryPost(
      pin,
      token,
      { ...request, pin: { ...pin, origin: 'https://other.invalid', rpId: 'other.invalid' } },
      new AbortController().signal,
    ),
  ).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('refuses wrong status/type, invalid UTF-8/JSON, declared or streamed overflow and length mismatch without exposing data', async () => {
  const cases = [
    new Response('private-factor', { status: 409, headers }),
    new Response('{}', { headers: { 'Content-Type': 'text/plain' } }),
    new Response(new Uint8Array([255]), { headers }),
    new Response('not json', { headers }),
    new Response('{}', {
      headers: { ...headers, 'Content-Length': String(DISCOVERY_RESPONSE_LIMIT + 1) },
    }),
    new Response('{}', { headers: { ...headers, 'Content-Length': '3' } }),
    new Response('x'.repeat(DISCOVERY_RESPONSE_LIMIT + 1), { headers }),
  ];
  for (const response of cases) {
    vi.stubGlobal('fetch', async () => response);
    expect(await send()).toBeNull();
  }
  expect(JSON.stringify(readPrivateTransportDiagnostics())).not.toContain('private-factor');
});
it('generated fragmentation preserves exact bounded JSON with a UTF-8 split and rejects one byte over the bound', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.integer({ min: 1, max: 127 }), { minLength: 1, maxLength: 16 }),
      async (chunks) => {
        const value = { text: 'é'.repeat(700) },
          bytes = new TextEncoder().encode(JSON.stringify(value));
        let at = 0,
          index = 0;
        vi.stubGlobal(
          'fetch',
          async () =>
            new Response(
              new ReadableStream({
                pull(controller) {
                  if (at === bytes.length) {
                    controller.close();
                    return;
                  }
                  const size = chunks[index++ % chunks.length]!;
                  controller.enqueue(bytes.slice(at, (at += Math.min(size, bytes.length - at))));
                },
              }),
              { headers },
            ),
        );
        expect(await send()).toEqual(value);
      },
    ),
    { seed: 16091606, numRuns: 60 },
  );
  vi.stubGlobal(
    'fetch',
    async () => new Response('"' + 'x'.repeat(DISCOVERY_RESPONSE_LIMIT - 2) + '"', { headers }),
  );
  expect(typeof (await send())).toBe('string');
  vi.stubGlobal(
    'fetch',
    async () => new Response('"' + 'x'.repeat(DISCOVERY_RESPONSE_LIMIT - 1) + '"', { headers }),
  );
  expect(await send()).toBeNull();
});
it('close drains stream cancellation before returning and never publishes partial JSON', async () => {
  let release!: () => void,
    pulled!: () => void,
    cancelled = false;
  const ready = new Promise<void>((resolve) => (pulled = resolve)),
    drain = new Promise<void>((resolve) => (release = resolve));
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(
        new ReadableStream({
          pull() {
            pulled();
            return new Promise(() => {});
          },
          cancel() {
            cancelled = true;
            return drain;
          },
        }),
        { headers },
      ),
  );
  const controller = new AbortController();
  let done = false;
  const work = send(controller.signal).then((value) => {
    done = true;
    return value;
  });
  await ready;
  controller.abort();
  await Promise.resolve();
  await Promise.resolve();
  expect(cancelled).toBe(true);
  expect(done).toBe(false);
  release();
  expect(await work).toBeNull();
});
