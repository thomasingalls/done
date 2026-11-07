// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
const activity = vi.hoisted(() => ({ subscribe: vi.fn(), stop: vi.fn() }));
vi.mock('../src/crdt/runtimePorts', () => ({
  pageRuntimePorts: {
    activity: {
      onGlobal: (kind: string, fn: () => void) => {
        activity.subscribe(kind, fn);
        return activity.stop;
      },
    },
  },
}));
import { NetworkLogin } from '../src/account/networkLogin';
import type { WriteSession } from '../src/crdt/writeSession';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it('online resumption uses the fixed runtime activity endpoint and cleans it up once', async () => {
  vi.stubGlobal('location', { origin: 'https://fixture.invalid' });
  const actual = {
    v: 1 as const,
    origin: 'https://fixture.invalid',
    rpId: 'fixture.invalid',
    authRoot: '01'.repeat(32),
    serviceId: '02'.repeat(16),
  };
  const login = new NetworkLogin(actual, 'fixture-slot'),
    stop = new AbortController();
  const owner = { signal: stop.signal } as WriteSession;
  login.activate(owner);
  login.activate(owner);
  expect(activity.subscribe).toHaveBeenCalledTimes(1);
  expect(activity.subscribe.mock.calls[0]![0]).toBe('online');
  await activity.subscribe.mock.calls[0]![1]();
  await login.access();
  login.close();
  login.close();
  expect(activity.stop).toHaveBeenCalledTimes(1);
});
