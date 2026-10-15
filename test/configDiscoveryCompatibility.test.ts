// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadPackagedConfig } from '../src/account/packagedConfig';
import { storageUpgradeKey } from '../src/crdt/storageCompatibility';
import { installDiscoveryEnvironment } from './helpers/discoveryEnvironment';

const pin = {
  v: 1 as const,
  serviceId: '11'.repeat(16),
  origin: 'http://localhost:4999',
  rpId: 'localhost',
  authRoot: '22'.repeat(32),
};
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  installDiscoveryEnvironment();
  vi.stubGlobal('location', { origin: pin.origin });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const answer = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
async function interlock(value: unknown) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('done.custody', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('entries');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('entries', 'readwrite');
      tx.objectStore('entries').put(value, storageUpgradeKey('local'));
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
for (const hosted of [false, true])
  it(`blocked discovery preserves every public hint (${hosted ? 'account service' : 'Local-only service'})`, async () => {
    await interlock({ v: 999, state: 'ready' });
    values.set('unrelated', 'keep');
    const before = [...values];
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          hosted
            ? answer({ v: 2, pin, networkSessions: true, membershipContinuation: true })
            : answer({}, 404),
        ),
    );
    const config = await loadPackagedConfig();
    if (hosted) {
      expect(config?.pin).toEqual(pin);
      expect(config?.membershipContinuation).toBe(true);
    } else expect(config).toBeNull();
    expect([...values]).toEqual(before);
  });
it('an undefined retained interlock still prevents discovery metadata writes', async () => {
  await interlock(undefined);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer({}, 404)));
  expect(await loadPackagedConfig()).toBeNull();
  expect([...values]).toEqual([]);
});
it('a failed compatibility probe never becomes permission to save discovery metadata', async () => {
  vi.spyOn(indexedDB, 'open').mockImplementation(() => {
    throw Error('storage denied');
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer({}, 404)));
  await expect(loadPackagedConfig()).rejects.toThrow('storage denied');
  expect([...values]).toEqual([]);
});
it('compatible discovery remembers Local-only offline access without leaving a new custody database', async () => {
  const fetch = vi.fn().mockResolvedValue(answer({}, 404));
  vi.stubGlobal('fetch', fetch);
  expect(await loadPackagedConfig()).toBeNull();
  expect(values.get('done.application.local-only')).toBe('1');
  expect(await indexedDB.databases()).toEqual([]);
  fetch.mockRejectedValue(new TypeError('offline'));
  expect(await loadPackagedConfig()).toBeNull();
});
it('compatible account discovery caches the pin and capability but never an access token', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        answer({ v: 2, pin, networkSessions: true, membershipContinuation: true }),
      ),
  );
  expect((await loadPackagedConfig())?.membershipContinuation).toBe(true);
  expect(values.get('done.account-service.pin.v1')).toBe(JSON.stringify(pin));
  expect(values.get('done.account-service.transport.v1')).toBe('sessions');
  expect(values.get('done.account-service.membership.v2')).toBe('1');
  expect(values.size).toBe(3);
  expect(await indexedDB.databases()).toEqual([]);
});
it('a blocked background refresh keeps stored hints unchanged while refreshing its live scheduling hint', async () => {
  await interlock(null);
  values.set('done.account-service.pin.v1', JSON.stringify(pin));
  values.set('done.account-service.transport.v1', 'sessions');
  values.set('done.account-service.membership.v2', '0');
  let finish!: (response: Response) => void;
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
  finish(answer({ v: 2, pin, networkSessions: true, membershipContinuation: true }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(config?.membershipContinuation).toBe(true);
  expect(values.get('done.account-service.membership.v2')).toBe('0');
});
it('a discovery writer queued behind an upgrade rechecks compatibility before saving hints', async () => {
  let release!: () => void;
  const granted = new Promise<void>((resolve) => {
    release = resolve;
  });
  const request = vi.fn(async (_name: string, _options: unknown, work: () => Promise<unknown>) => {
    await granted;
    return work();
  });
  vi.stubGlobal('navigator', { locks: { request } });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer({}, 404)));
  const pending = loadPackagedConfig();
  const result = expect(pending).resolves.toBeNull();
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  expect(values.size).toBe(0);
  await interlock({ v: 1, state: 'migrating' });
  release();
  await result;
  expect(values.size).toBe(0);
});
for (const hosted of [false, true])
  it(`a delayed ${hosted ? 'hosted' : 'Local-only'} reply cannot overwrite a newly retained account pin`, async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const pending = loadPackagedConfig();
    const refusal = expect(pending).rejects.toThrow('configuration changed during discovery');
    const newer = { ...pin, authRoot: '33'.repeat(32) };
    values.set('done.account-service.pin.v1', JSON.stringify(newer));
    const before = [...values];
    finish(hosted ? answer({ v: 2, pin, networkSessions: true }) : answer({}, 404));
    await refusal;
    expect([...values]).toEqual(before);
  });
