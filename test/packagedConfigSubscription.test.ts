// @vitest-environment node
/** Public same-pin discovery observations, not account authority. */
import { afterEach, expect, it, vi } from 'vitest';
import { loadPackagedConfig } from '../src/account/packagedConfig';
import { installDiscoveryEnvironment } from './helpers/discoveryEnvironment';
afterEach(() => vi.unstubAllGlobals());
const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
function fixture() {
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
    ]),
    held = gate();
  let entered = false,
    respond!: (r: Response) => void;
  vi.stubGlobal('location', { origin: pin.origin });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  });
  vi.stubGlobal('navigator', {
    locks: {
      request: async (_name: string, _options: unknown, work: () => Promise<unknown>) => {
        entered = true;
        await held.promise;
        return work();
      },
    },
  });
  vi.stubGlobal('fetch', () => new Promise<Response>((r) => (respond = r)));
  return {
    values,
    held,
    get entered() {
      return entered;
    },
    reply(value = true) {
      respond(
        new Response(
          JSON.stringify({ v: 2, pin, networkSessions: true, membershipContinuation: value }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      );
    },
  };
}
it('notifies the mounted observer before optional persistence obtains its metadata permit', async () => {
  const f = fixture(),
    config = await loadPackagedConfig();
  if (!config?.onMembershipContinuationChange) throw Error('Missing capability observer');
  const seen: boolean[] = [],
    stop = config.onMembershipContinuationChange(() =>
      seen.push(config.membershipContinuation === true),
    );
  try {
    f.reply();
    await vi.waitFor(() => expect(f.entered).toBe(true));
    expect(seen).toEqual([true]);
    expect(config.membershipContinuation).toBe(true);
    expect(f.values.get('done.account-service.membership.v2')).toBeUndefined();
  } finally {
    stop();
    f.held.resolve();
  }
  await vi.waitFor(() => expect(f.values.get('done.account-service.membership.v2')).toBe('1'));
});
it('does not keep a detached observer alive while the same-pin discovery still finishes', async () => {
  const f = fixture(),
    config = await loadPackagedConfig();
  if (!config?.onMembershipContinuationChange) throw Error('Missing capability observer');
  const seen = vi.fn(),
    stop = config.onMembershipContinuationChange(seen);
  stop();
  try {
    f.reply();
    await vi.waitFor(() => expect(f.entered).toBe(true));
    expect(config.membershipContinuation).toBe(true);
    expect(seen).not.toHaveBeenCalled();
  } finally {
    f.held.resolve();
  }
});
it('keeps observer errors from blocking metadata persistence', async () => {
  const f = fixture(),
    config = await loadPackagedConfig();
  if (!config?.onMembershipContinuationChange) throw Error('Missing capability observer');
  const first = config.onMembershipContinuationChange(() => {
      throw Error('observer owns this');
    }),
    seen = vi.fn(),
    second = config.onMembershipContinuationChange(seen);
  try {
    f.reply();
    await vi.waitFor(() => expect(f.entered).toBe(true));
    expect(seen).toHaveBeenCalledOnce();
    expect(config.membershipContinuation).toBe(true);
  } finally {
    first();
    second();
    f.held.resolve();
  }
  await vi.waitFor(() => expect(f.values.get('done.account-service.membership.v2')).toBe('1'));
});
