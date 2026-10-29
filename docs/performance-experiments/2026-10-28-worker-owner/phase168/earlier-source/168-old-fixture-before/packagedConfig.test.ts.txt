// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadPackagedConfig } from '../src/account/packagedConfig';
import { installDiscoveryEnvironment } from './helpers/discoveryEnvironment';
beforeEach(installDiscoveryEnvironment);
const pin = {
  v: 1 as const,
  serviceId: '11'.repeat(16),
  origin: 'http://localhost:4999',
  rpId: 'localhost',
  authRoot: '22'.repeat(32),
};
function storage(retained = true) {
  const values = new Map<string, string>();
  if (retained) {
    values.set('done.account-service.pin.v1', JSON.stringify(pin));
    values.set('done.account-service.transport.v1', 'sessions');
  }
  vi.stubGlobal('location', { origin: pin.origin });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  return values;
}
const response = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());
it('cached account opens before the service responds and its protocol hint can refresh afterward', async () => {
  const values = storage();
  let finish!: (v: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const config = await loadPackagedConfig();
  expect(config?.networkSessions).toBe(true);
  expect(config?.membershipContinuation).toBe(false);
  finish(response({ v: 2, pin, networkSessions: true, membershipContinuation: true }));
  await vi.waitFor(() => expect(config?.membershipContinuation).toBe(true));
  expect(values.get('done.account-service.membership.v2')).toBe('1');
});
it('offline or wrong-pin configuration cannot erase or replace the retained capability', async () => {
  const values = storage();
  values.set('done.account-service.membership.v2', '1');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Error('offline')));
  expect((await loadPackagedConfig())?.membershipContinuation).toBe(true);
  await Promise.resolve();
  values.set('done.account-service.membership.v2', '0');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      response({
        v: 2,
        pin: { ...pin, authRoot: '33'.repeat(32) },
        networkSessions: true,
        membershipContinuation: true,
      }),
    ),
  );
  const config = await loadPackagedConfig();
  await new Promise((r) => setTimeout(r, 0));
  expect(config?.membershipContinuation).toBe(false);
  expect(values.get('done.account-service.membership.v2')).toBe('0');
});
it('fresh configuration accepts only the explicit session-host continuation capability', async () => {
  const values = storage(false);
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        response({ v: 2, pin, networkSessions: true, membershipContinuation: true }),
      ),
  );
  expect((await loadPackagedConfig())?.membershipContinuation).toBe(true);
  expect(values.get('done.account-service.membership.v2')).toBe('1');
  storage(false);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(response({ v: 1, pin, membershipContinuation: true })),
  );
  await expect(loadPackagedConfig()).rejects.toThrow('Invalid account service configuration');
});
