// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { bootstrapFetch } from '../src/account/bootstrapHttp';
const pin = {
  v: 1 as const,
  serviceId: '11'.repeat(16),
  origin: 'http://localhost:4999',
  rpId: 'localhost',
  authRoot: '22'.repeat(32),
};
afterEach(() => vi.unstubAllGlobals());
it('legacy protected enrollment uses its bearer while session bootstrap cannot borrow that route', async () => {
  vi.stubGlobal('location', { origin: pin.origin });
  const transport = vi.fn().mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal('fetch', transport);
  const body = JSON.stringify({ attemptId: 'retained' }),
    init = { method: 'POST', body };
  for (const route of [
    'enrollment/admit',
    'ceremony/exchange',
    'ceremony/transfer',
    'content/checkpoint',
  ]) {
    await bootstrapFetch({ pin, token: 'a'.repeat(43) }, route, init);
    const [url, request] = transport.mock.calls.at(-1)!;
    expect(String(url)).toBe(pin.origin + '/__account-setup/' + route);
    expect(new Headers(request.headers).get('Authorization')).toBe('Bearer ' + 'a'.repeat(43));
    expect(request.body).toBe(body);
    const count = transport.mock.calls.length;
    expect(() => bootstrapFetch({ pin, networkSessions: true }, route, init)).toThrow(
      'Unsupported account bootstrap',
    );
    expect(transport).toHaveBeenCalledTimes(count);
  }
  expect(() => bootstrapFetch({ pin, token: 'a'.repeat(43) }, 'unknown', init)).toThrow(
    'Unsupported',
  );
});
