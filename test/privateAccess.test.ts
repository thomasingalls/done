import { afterEach, expect, it, vi } from 'vitest';
import { loadPackagedConfig } from '../src/account/packagedConfig';
import { privateServiceFetch } from '../src/account/privateAccess';
const pin = {
  v: 1 as const,
  origin: 'http://localhost:3000',
  rpId: 'localhost',
  serviceId: '01'.repeat(16),
  authRoot: '02'.repeat(32),
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
function origin() {
  vi.stubGlobal('location', { origin: pin.origin });
}
it('opens from the retained public pin offline without fetching or retaining adapter access', async () => {
  origin();
  const fetch = vi.fn().mockResolvedValue(response({ v: 1, pin }));
  vi.stubGlobal('fetch', fetch);
  await loadPackagedConfig();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(localStorage.length).toBe(1);
  fetch.mockRejectedValue(Error('offline'));
  const config = await loadPackagedConfig();
  expect(config?.pin).toEqual(pin);
  expect(typeof config?.token).toBe('function');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('renews private access after restart and retries the identical request once', async () => {
  origin();
  const seen: { url: string; body: BodyInit | null | undefined; auth: string | null }[] = [];
  let token = 'a'.repeat(43);
  const fetch = vi.fn(async (url: string | URL, init: RequestInit) => {
    const path = String(url);
    if (path.endsWith('/config')) return response({ v: 1, pin });
    if (path.endsWith('/access')) return response({ v: 1, pin, token });
    const auth = new Headers(init.headers).get('Authorization');
    seen.push({ url: path, body: init.body, auth });
    return response({}, auth === 'Bearer ' + token ? 200 : 403);
  });
  vi.stubGlobal('fetch', fetch);
  const config = (await loadPackagedConfig())!;
  const body = new Uint8Array([1, 2, 3]);
  await privateServiceFetch(pin, config.token, '/account/delivery/submit', {
    method: 'POST',
    body,
  });
  token = 'b'.repeat(43);
  expect(
    (
      await privateServiceFetch(pin, config.token, '/account/delivery/submit', {
        method: 'POST',
        body,
      })
    ).status,
  ).toBe(200);
  expect(seen.map((x) => x.auth)).toEqual([
    'Bearer ' + 'a'.repeat(43),
    'Bearer ' + 'a'.repeat(43),
    'Bearer ' + token,
  ]);
  expect(seen.every((x) => x.body === body)).toBe(true);
  expect(localStorage.getItem('done.account-service.pin.v1')).not.toContain(token);
});
it('refuses a replacement service pin before sending account bytes', async () => {
  origin();
  localStorage.setItem('done.account-service.pin.v1', JSON.stringify(pin));
  const config = (await loadPackagedConfig())!;
  const fetch = vi
    .fn()
    .mockResolvedValue(
      response({ v: 1, pin: { ...pin, authRoot: '03'.repeat(32) }, token: 'a'.repeat(43) }),
    );
  vi.stubGlobal('fetch', fetch);
  await expect(
    privateServiceFetch(pin, config.token, '/account/delivery/submit', {
      method: 'POST',
      body: 'private',
    }),
  ).rejects.toThrow('identity changed');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]![0]).toBe('/__account-setup/access');
  expect(JSON.parse(localStorage.getItem('done.account-service.pin.v1')!)).toEqual(pin);
});
it('never refreshes raw fixture tokens or retries uncertain network outcomes', async () => {
  const fetch = vi.fn().mockResolvedValue(response({}, 403));
  vi.stubGlobal('fetch', fetch);
  expect(
    (await privateServiceFetch(pin, 'a'.repeat(43), '/account/delivery/submit', { method: 'POST' }))
      .status,
  ).toBe(403);
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockRejectedValue(Error('lost response'));
  const access = vi.fn().mockResolvedValue('a'.repeat(43));
  await expect(
    privateServiceFetch(pin, access, '/account/delivery/submit', { method: 'POST' }),
  ).rejects.toThrow('lost response');
  expect(access).toHaveBeenCalledTimes(1);
});
it('preserves an existing Local-only installation offline and discovers a later account service', async () => {
  origin();
  const fetch = vi.fn().mockResolvedValue(response({}, 404));
  vi.stubGlobal('fetch', fetch);
  expect(await loadPackagedConfig()).toBeNull();
  fetch.mockRejectedValue(new TypeError('offline'));
  expect(await loadPackagedConfig()).toBeNull();
  fetch.mockResolvedValue(response({ v: 1, pin }));
  expect((await loadPackagedConfig())?.pin).toEqual(pin);
  expect(localStorage.getItem('done.application.local-only')).toBeNull();
});
it('explains a network failure without retrying an uncertain mutation', async () => {
  const fetch = vi.fn().mockRejectedValue(new TypeError('offline'));
  vi.stubGlobal('fetch', fetch);
  await expect(
    privateServiceFetch(pin, 'a'.repeat(43), '/__account-setup/begin', {
      method: 'POST',
      body: '{}',
    }),
  ).rejects.toThrow('needs a connection');
  expect(fetch).toHaveBeenCalledTimes(1);
});
