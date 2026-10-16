// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import {
  beginLocalGenesis,
  listLocalWorkspaces,
  inspectLocalStartup,
} from '../src/crdt/localGenesis';
import { createFirstDeviceSetup } from '../src/account/firstDeviceSetup';
import { setupProgress, beginNewAccount, type SetupConfig } from '../src/account/setupProgress';
import { removeDeviceData } from '../src/crdt/deviceDataRemoval';

const owners: ReturnType<typeof createFirstDeviceSetup>[] = [];
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('location', { origin: 'https://setup.example' });
  const tails = new Map<string, Promise<unknown>>();
  vi.stubGlobal('navigator', {
    locks: {
      request(name: string, _options: unknown, work: (lock: { name: string }) => unknown) {
        const result = (tails.get(name) ?? Promise.resolve()).then(() => work({ name }));
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
afterEach(async () => {
  for (const owner of owners.splice(0)) await owner.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const config: SetupConfig = {
  networkSessions: true,
  pin: {
    v: 1,
    origin: 'https://setup.example',
    rpId: 'setup.example',
    serviceId: '01'.repeat(16),
    authRoot: '02'.repeat(32),
  },
};
function owner(slot = 'local') {
  const result = createFirstDeviceSetup(config, slot);
  owners.push(result);
  return result;
}
async function legacy() {
  const db = await new Promise<IDBDatabase>((resolve) => {
    const request = indexedDB.open('done', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('updates');
    request.onsuccess = () => resolve(request.result);
  });
  db.close();
}
async function start(current: ReturnType<typeof owner>) {
  current.start('Alex');
  await vi.waitFor(() => expect(current.getSnapshot().kind).not.toBe('working'));
}

it.each(['database', 'journal'] as const)(
  'does not ask for an unissued code when legacy %s blocks a fresh account',
  async (carrier) => {
    const slot = await beginNewAccount(config);
    if (carrier === 'database') await legacy();
    else localStorage.setItem('done.pending-update.done.legacy', 'preserve');
    const before = await indexedDB.databases();
    const saved = await setupProgress(undefined, slot);
    const current = owner(slot);
    await current.inspect();
    expect(current.getSnapshot()).toMatchObject({
      kind: 'storage-blocked',
      disposition: { kind: 'migration-required' },
    });
    expect(await setupProgress(undefined, slot)).toEqual(saved);
    expect(await indexedDB.databases()).toEqual(before);
  },
);

it('rechecks storage before issuing a code when legacy data appears after the intro', async () => {
  const slot = await beginNewAccount(config),
    current = owner(slot);
  await current.inspect();
  expect(current.getSnapshot()).toMatchObject({ kind: 'intro', fresh: true });
  await legacy();
  await start(current);
  expect(current.getSnapshot()).toMatchObject({
    kind: 'storage-blocked',
    disposition: { kind: 'migration-required' },
  });
  expect((await indexedDB.databases()).some((db) => db.name === 'done.custody')).toBe(false);
});

it('requires the established factor when genesis already committed instead of enrolling a replacement', async () => {
  const slot = await beginNewAccount(config),
    creation = beginLocalGenesis(slot),
    code = creation.displayCode!;
  await creation.confirm(code);
  const before = await listLocalWorkspaces(slot, code);
  const request = vi.fn().mockRejectedValue(Error('must not reach network'));
  vi.stubGlobal('fetch', request);
  const current = owner(slot);
  await current.inspect();
  expect(current.getSnapshot()).toMatchObject({ kind: 'unlock' });
  await current.unlock('wrong');
  expect(current.getSnapshot()).toMatchObject({
    kind: 'unlock',
    error: expect.stringContaining('Could not unlock'),
  });
  expect(request).not.toHaveBeenCalled();
  expect(await listLocalWorkspaces(slot, code)).toEqual(before);
});

it('unfinished authorized removal blocks setup instead of asking for an old or replacement code', async () => {
  const slot = await beginNewAccount(config),
    creation = beginLocalGenesis(slot);
  await creation.confirm(creation.displayCode!);
  vi.spyOn(indexedDB, 'deleteDatabase').mockImplementationOnce(() => {
    const request = {
      error: new DOMException('Injected deletion failure', 'UnknownError'),
    } as IDBOpenDBRequest;
    queueMicrotask(() => request.onerror?.call(request, new Event('error')));
    return request;
  });
  await expect(removeDeviceData(slot)).rejects.toBeDefined();
  const current = owner(slot);
  await current.inspect();
  expect(current.getSnapshot()).toMatchObject({
    kind: 'storage-blocked',
    disposition: { kind: 'clearing' },
  });
});

it('displays a generated code before confirmation and may reissue only while no genesis exists', async () => {
  const slot = await beginNewAccount(config),
    current = owner(slot);
  await current.inspect();
  await start(current);
  const shown = current.getSnapshot();
  expect(shown).toMatchObject({ kind: 'save-device-code', code: expect.any(String) });
  current.savedDeviceCode();
  expect(current.getSnapshot()).toMatchObject({ kind: 'confirm-device-code' });
  await current.confirmDeviceCode('wrong');
  expect(current.getSnapshot()).toMatchObject({
    kind: 'confirm-device-code',
    error: expect.stringContaining('does not match'),
  });
  expect(await inspectLocalStartup(slot)).toMatchObject({ kind: 'fresh' });
  expect(JSON.stringify(await setupProgress(undefined, slot))).not.toContain(
    'code' in shown ? shown.code : 'impossible',
  );
  await current.close();
  const cold = owner(slot);
  await cold.inspect();
  expect(cold.getSnapshot()).toMatchObject({ kind: 'intro' });
  await start(cold);
  expect(cold.getSnapshot()).toMatchObject({ kind: 'save-device-code' });
  expect(await inspectLocalStartup(slot)).toMatchObject({ kind: 'fresh' });
});

it('reports unreadable storage as blocked without treating it as an existing factor', async () => {
  const slot = await beginNewAccount(config);
  const db = await new Promise<IDBDatabase>((resolve) => {
    const request = indexedDB.open('done.custody', 2);
    request.onupgradeneeded = () => request.result.createObjectStore('entries');
    request.onsuccess = () => resolve(request.result);
  });
  db.close();
  const disposition = await inspectLocalStartup(slot),
    current = owner(slot);
  expect(disposition.kind).not.toBe('fresh');
  expect(disposition.kind).not.toBe('unlock-required');
  await current.inspect();
  expect(current.getSnapshot()).toMatchObject({ kind: 'storage-blocked', disposition });
});

it('missing saved setup offers account selection without asking for a nonexistent code', async () => {
  const current = owner('account-' + '33'.repeat(16));
  await current.inspect();
  expect(current.getSnapshot()).toMatchObject({
    kind: 'storage-blocked',
    error: expect.stringContaining('Choose an account'),
  });
});

it('direct Local sync entry explains migration instead of requesting a code that was never issued', async () => {
  await legacy();
  const current = owner();
  await current.inspect();
  expect(current.getSnapshot()).toMatchObject({
    kind: 'storage-blocked',
    disposition: { kind: 'migration-required' },
  });
});

it('direct sync entry for an automatic Local list returns to adding protection without asking for a code', async () => {
  const creation = beginLocalGenesis('local', { automatic: true });
  await creation.confirm(creation.displayCode!);
  const current = owner();
  await current.inspect();
  expect(current.getSnapshot()).toMatchObject({
    kind: 'storage-blocked',
    disposition: { reason: 'enable-local-protection-before-sync' },
  });
});
