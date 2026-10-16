// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { LegacyRemovalRequired, removeDeviceData } from '../src/crdt/deviceDataRemoval';
import { setupProgress, createSetupProgress, type Retained } from '../src/account/setupProgress';

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('isSecureContext', true);
  const tails = new Map<string, Promise<unknown>>();
  vi.stubGlobal('navigator', {
    locks: {
      request(name: string, _options: unknown, work: () => unknown) {
        const result = (tails.get(name) ?? Promise.resolve()).then(work);
        tails.set(
          name,
          result.catch(() => {}),
        );
        return result;
      },
    },
  });
  const values: Record<string, string> = {};
  vi.stubGlobal(
    'localStorage',
    new Proxy(values, {
      get(target, key) {
        if (key === 'getItem') return (name: string) => target[name] ?? null;
        if (key === 'setItem')
          return (name: string, value: string) => {
            target[name] = value;
          };
        if (key === 'removeItem')
          return (name: string) => {
            delete target[name];
          };
        return target[key as string];
      },
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

it.each(['database', 'journal'] as const)(
  'refuses unassigned legacy %s removal before creating any intent or changing its carriers',
  async (carrier) => {
    if (carrier === 'database') {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open('done', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('updates');
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise<void>((resolve) => {
        const tx = db.transaction('updates', 'readwrite');
        tx.objectStore('updates').put(new Uint8Array([1, 2, 3]), 'retained');
        tx.oncomplete = () => resolve();
      });
      db.close();
    } else localStorage.setItem('done.pending-update.done.legacy', 'keep this journal');
    const before = await indexedDB.databases();
    await expect(removeDeviceData('local')).rejects.toBeInstanceOf(LegacyRemovalRequired);
    expect(await indexedDB.databases()).toEqual(before);
    if (carrier === 'journal')
      expect(localStorage.getItem('done.pending-update.done.legacy')).toBe('keep this journal');
    else {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open('done');
        request.onsuccess = () => resolve(request.result);
      });
      const value = await new Promise<unknown>((resolve) => {
        const tx = db.transaction('updates');
        const request = tx.objectStore('updates').get('retained');
        tx.oncomplete = () => resolve(request.result);
      });
      db.close();
      expect(value).toEqual(new Uint8Array([1, 2, 3]));
    }
  },
);

it('distinguishes an absent workspace without creating removal progress or reporting that erasure started', async () => {
  await expect(removeDeviceData('local')).rejects.toMatchObject({ name: 'WorkspaceDataAbsent' });
  expect(await indexedDB.databases()).toEqual([]);
});

it('removes an identified setup-only attempt without inventing encrypted content or affecting another attempt', async () => {
  const slotId = 'account-' + '11'.repeat(16),
    other = 'account-' + '22'.repeat(16);
  const attempt = (slotId: string): Retained => ({
    v: 1,
    slotId,
    fresh: true,
    pin: {
      v: 1,
      origin: 'https://setup.example',
      rpId: 'setup.example',
      serviceId: '01'.repeat(16),
      authRoot: '02'.repeat(32),
    },
    retryKey: 'A'.repeat(43),
    view: null,
    proof: null,
  });
  const stale = createSetupProgress(slotId);
  await stale(attempt(slotId));
  await setupProgress(attempt(other), other);
  await removeDeviceData(slotId);
  expect(await setupProgress(undefined, slotId)).toBeNull();
  expect(await setupProgress(undefined, other)).toEqual(attempt(other));
  await expect(stale(attempt(slotId))).rejects.toThrow();
  expect((await indexedDB.databases()).some((db) => /^done\.[a-f0-9]{32}$/.test(db.name!))).toBe(
    false,
  );
});

it.each(['registered', 'not-fresh', 'malformed'] as const)(
  'preserves %s setup metadata when no content identity can establish complete removal',
  async (state) => {
    const slotId = 'account-' + '44'.repeat(16);
    const attempt = {
      v: state === 'malformed' ? 2 : 1,
      slotId,
      ...(state === 'not-fresh' ? {} : { fresh: true }),
      pin: {
        v: 1,
        origin: 'https://setup.example',
        rpId: 'setup.example',
        serviceId: '01'.repeat(16),
        authRoot: '02'.repeat(32),
      },
      retryKey: 'A'.repeat(43),
      view:
        state === 'registered'
          ? {
              ok: true,
              stage: 'credential-confirmed',
              accountId: 'B'.repeat(43),
              credentialId: 'credential',
            }
          : null,
      proof: null,
    } as Retained;
    await setupProgress(attempt, slotId);
    const before = await indexedDB.databases();
    await expect(removeDeviceData(slotId)).rejects.toThrow('cannot identify');
    expect(await setupProgress(undefined, slotId)).toEqual(attempt);
    expect(await indexedDB.databases()).toEqual(before);
  },
);
