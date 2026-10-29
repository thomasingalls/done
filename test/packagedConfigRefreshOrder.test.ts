// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { loadPackagedConfig } from '../src/account/packagedConfig';
import { installDiscoveryEnvironment } from './helpers/discoveryEnvironment';
afterEach(() => {
  vi.unstubAllGlobals();
});
it('live discovery does not wait for the metadata permit while persistence still waits for it', async () => {
  installDiscoveryEnvironment();
  const pin = {
      v: 1,
      serviceId: '11'.repeat(16),
      origin: 'http://localhost:4999',
      rpId: 'localhost',
      authRoot: '22'.repeat(32),
    },
    values = new Map<string, string>([
      ['done.account-service.pin.v1', JSON.stringify(pin)],
      ['done.account-service.transport.v1', 'sessions'],
    ]);
  vi.stubGlobal('location', { origin: pin.origin });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  let unlock!: () => void,
    entered = false,
    respond!: (r: Response) => void;
  const gate = new Promise<void>((resolve) => (unlock = resolve));
  vi.stubGlobal('navigator', {
    locks: {
      request: async (_name: string, _options: unknown, work: () => Promise<unknown>) => {
        entered = true;
        await gate;
        return work();
      },
    },
  });
  vi.stubGlobal('fetch', () => new Promise<Response>((resolve) => (respond = resolve)));
  const config = await loadPackagedConfig();
  respond(
    new Response(
      JSON.stringify({ v: 2, pin, networkSessions: true, membershipContinuation: true }),
      { headers: { 'Content-Type': 'application/json' } },
    ),
  );
  try {
    await vi.waitFor(() => expect(entered).toBe(true));
    expect(config?.membershipContinuation).toBe(true);
    expect(values.get('done.account-service.membership.v2')).toBeUndefined();
  } finally {
    unlock();
  }
  await vi.waitFor(() => expect(values.get('done.account-service.membership.v2')).toBe('1'));
});
