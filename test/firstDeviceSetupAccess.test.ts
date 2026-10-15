// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { beginLocalGenesis, listLocalWorkspaces } from '../src/crdt/localGenesis';
import { createFirstDeviceSetup } from '../src/account/firstDeviceSetup';
import { setupProgress, type SetupConfig } from '../src/account/setupProgress';

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
