// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { beginLocalGenesis, listLocalWorkspaces } from '../src/crdt/localGenesis';
import { createFirstDeviceSetup } from '../src/account/firstDeviceSetup';
import { setupProgress, type SetupConfig } from '../src/account/setupProgress';
const retirement = vi.hoisted(() => ({ listeners: new Map<() => void, string>() }));
// Deliver the cooperative slot-retirement notice directly; the BroadcastChannel port is separate.
vi.mock('../src/crdt/writeSession', async (actual) => ({
  ...(await actual<typeof import('../src/crdt/writeSession')>()),
  onSlotRetirement: (slotId: string, retire: () => void) => {
    retirement.listeners.set(retire, slotId);
    return () => retirement.listeners.delete(retire);
  },
}));
const retireSlot = (slotId: string) => {
  for (const [retire, id] of [...retirement.listeners]) if (id === slotId) retire();
};

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

async function protectedSetup() {
  const creation = beginLocalGenesis('local');
  const code = creation.displayCode!;
  await creation.confirm(code);
  const config: SetupConfig = {
    networkSessions: true,
    pin: {
      v: 1,
      origin: location.origin,
      rpId: 'setup.example',
      serviceId: '01'.repeat(16),
      authRoot: '02'.repeat(32),
    },
  };
  await setupProgress({
    v: 1,
    pin: config.pin,
    slotId: 'local',
    retryKey: 'A'.repeat(43),
    view: null,
    proof: null,
  });
  const owner = createFirstDeviceSetup(config);
  owners.push(owner);
  await owner.inspect();
  return { code, owner };
}

it('distinguishes an accepted Local code from a later network setup failure and retries without another code', async () => {
  const { code, owner } = await protectedSetup();
  const routes = await listLocalWorkspaces('local', code);
  const request = vi.fn().mockRejectedValue(new TypeError('Synthetic network loss'));
  vi.stubGlobal('fetch', request);
  await owner.unlock(code);
  expect(request).toHaveBeenCalledTimes(1);
  expect(owner.getSnapshot()).toMatchObject({
    kind: 'resume-setup',
    error: expect.stringContaining('unlock code was accepted'),
  });
  // This is the independent production factor verifier, not the coordinator's status label.
  expect(await listLocalWorkspaces('local', code)).toEqual(routes);
  // The live owner may retry the same operation; a cold owner still requires the external code.
  expect(owner).toHaveProperty('resumeSetup');
  await (owner as typeof owner & { resumeSetup(): Promise<void> }).resumeSetup();
  expect(request).toHaveBeenCalledTimes(2);
  expect(owner.getSnapshot()).toMatchObject({ kind: 'resume-setup' });
  await owner.close();
  const cold = createFirstDeviceSetup({
    networkSessions: true,
    pin: {
      v: 1,
      origin: location.origin,
      rpId: 'setup.example',
      serviceId: '01'.repeat(16),
      authRoot: '02'.repeat(32),
    },
  });
  owners.push(cold);
  await cold.inspect();
  expect(cold.getSnapshot()).toMatchObject({ kind: 'unlock' });
});

it('refuses a wrong Local code before any network setup and preserves the established factor', async () => {
  const { code, owner } = await protectedSetup();
  const request = vi.fn().mockRejectedValue(new TypeError('Network must not be reached'));
  vi.stubGlobal('fetch', request);
  await owner.unlock('00000-00000-00000-00000-00000');
  expect(request).not.toHaveBeenCalled();
  expect(owner.getSnapshot()).toMatchObject({
    kind: 'unlock',
    error: expect.stringContaining('Could not unlock'),
  });
  expect(await listLocalWorkspaces('local', code)).toHaveLength(1);
});

it('rechecks a live Local handoff when resuming an existing setup instead of asking for its code again', async () => {
  const { code, owner } = await protectedSetup();
  await owner.close();
  const request = vi.fn().mockRejectedValue(new TypeError('Synthetic network loss'));
  vi.stubGlobal('fetch', request);
  const take = vi.fn(() => code);
  const resumed = createFirstDeviceSetup(
    {
      networkSessions: true,
      pin: {
        v: 1,
        origin: location.origin,
        rpId: 'setup.example',
        serviceId: '01'.repeat(16),
        authRoot: '02'.repeat(32),
      },
    },
    'local',
    take,
  );
  owners.push(resumed);
  await resumed.inspect();
  expect(take).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledTimes(1);
  expect(resumed.getSnapshot()).toMatchObject({ kind: 'resume-setup' });
});

it('does not offer an unlock form from a retired owner while its outstanding operation drains', async () => {
  const { code, owner } = await protectedSetup();
  let rejectRequest!: (error: Error) => void;
  const request = vi.fn(
    () => new Promise<Response>((_resolve, reject) => (rejectRequest = reject)),
  );
  vi.stubGlobal('fetch', request);
  const opening = owner.unlock(code);
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  const notifications: string[] = [];
  const unsubscribe = owner.subscribe(() => notifications.push(owner.getSnapshot().kind));
  const closing = owner.close();
  try {
    expect(owner.getSnapshot().kind).not.toBe('unlock');
    expect(notifications).not.toContain('unlock');
    await owner.unlock(code);
    expect(request).toHaveBeenCalledTimes(1);
  } finally {
    rejectRequest(new TypeError('The retired request has drained'));
    await opening;
    await closing;
    unsubscribe();
  }
  expect(await listLocalWorkspaces('local', code)).toHaveLength(1);
  const cold = createFirstDeviceSetup({
    networkSessions: true,
    pin: {
      v: 1,
      origin: location.origin,
      rpId: 'setup.example',
      serviceId: '01'.repeat(16),
      authRoot: '02'.repeat(32),
    },
  });
  owners.push(cold);
  await cold.inspect();
  expect(cold.getSnapshot()).toMatchObject({ kind: 'unlock' });
  expect(request).toHaveBeenCalledTimes(1);
});

const stopped =
  'Sync setup stopped because another tab began removing this device’s data. Reload this tab to continue.';
it('a slot retirement ends a waiting setup on its final notice at once, never on the closing screen, and the retired owner accepts nothing', async () => {
  const { code, owner } = await protectedSetup();
  const before = await setupProgress();
  let rejectRequest!: (error: Error) => void;
  const request = vi.fn(
    () => new Promise<Response>((_resolve, reject) => (rejectRequest = reject)),
  );
  vi.stubGlobal('fetch', request);
  const waiting = owner.unlock(code);
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  const shown: unknown[] = [];
  const unsubscribe = owner.subscribe(() => shown.push(owner.getSnapshot()));
  try {
    retireSlot('local');
    expect(owner.getSnapshot()).toEqual({ kind: 'unlock', error: stopped });
    expect(shown).toEqual([{ kind: 'unlock', error: stopped }]);
  } finally {
    rejectRequest(new DOMException('The retired request has drained', 'AbortError'));
    await waiting;
  }
  await owner.close();
  await owner.unlock(code);
  expect(request).toHaveBeenCalledTimes(1);
  expect(owner.getSnapshot()).toEqual({ kind: 'unlock', error: stopped });
  expect(shown).toEqual([{ kind: 'unlock', error: stopped }]);
  expect(await setupProgress()).toEqual(before);
  unsubscribe();
});
it('reports its own retirement close once, with that close', async () => {
  const { owner } = await protectedSetup();
  const heard = vi.fn();
  owner.onRetired(heard);
  retireSlot('local');
  retireSlot('local');
  expect(heard).toHaveBeenCalledOnce();
  expect(heard.mock.calls[0]![0]).toBe(owner.close());
  await expect(heard.mock.calls[0]![0]).resolves.toBeUndefined();
});
it('an explicit close still shows the closing screen and is not reported as a retirement', async () => {
  const { owner } = await protectedSetup();
  const heard = vi.fn();
  owner.onRetired(heard);
  const closing = owner.close();
  expect(owner.getSnapshot()).toMatchObject({
    kind: 'working',
    message: 'Locking and finishing storage operations…',
  });
  retireSlot('local');
  await closing;
  expect(heard).not.toHaveBeenCalled();
  expect(owner.getSnapshot()).toMatchObject({
    kind: 'working',
    message: 'Locking and finishing storage operations…',
  });
});
