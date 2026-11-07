// @vitest-environment node
/** Coordinator boundary tests. They do not replace the real factor/ledger verification tests. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { createFirstDeviceCoordinator } from '../src/account/firstDeviceSetup';
import { setupProgress, type SetupConfig } from '../src/account/setupProgress';
import type { SetupWorkspaceExecution, SetupWorkspacePort } from '../src/account/setupWorkspace';
import type { CeremonyBrowser } from '../src/crdt/ceremonyBrowser';
import type { DeviceRoster } from '../src/account/deviceRoster';

const mocks = vi.hoisted(() => ({ open: vi.fn(), promotion: vi.fn() }));
vi.mock('../src/crdt/accountReceive', () => ({ openOwnedSyncingAccountWorkspace: mocks.open }));
vi.mock('../src/crdt/promotionRecord', () => ({ readPromotion: mocks.promotion }));
vi.mock('../src/crdt/writeSession', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/crdt/writeSession')>()),
  withPromotionSlot: async (_slot: string, _code: string, work: (task: unknown) => unknown) =>
    work({}),
}));
const config: SetupConfig = {
  networkSessions: true,
  pin: {
    v: 1,
    origin: 'https://opening.example',
    rpId: 'opening.example',
    serviceId: '01'.repeat(16),
    authRoot: '02'.repeat(32),
  },
};
const browser: CeremonyBrowser = { authenticate: vi.fn(), register: vi.fn(), assertSlot: vi.fn() };
let owner: ReturnType<typeof createFirstDeviceCoordinator<Minimal>> | undefined;
interface Minimal extends SetupWorkspacePort {
  readonly marker: 'minimal';
}
const execution: SetupWorkspaceExecution<Minimal> = {
  open: mocks.open,
  actorName: vi.fn(),
  rename: vi.fn(),
  closingName: vi.fn(),
};
beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('location', { origin: config.pin.origin });
  const tails = new Map<string, Promise<unknown>>();
  vi.stubGlobal('navigator', {
    credentials: { get: vi.fn() },
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
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Error('offline fixture')));
  const accountId = 'A'.repeat(43);
  await setupProgress({
    v: 1,
    pin: config.pin,
    slotId: 'local',
    retryKey: 'A'.repeat(43),
    proof: null,
    view: { ok: true, stage: 'credential-confirmed', accountId, credentialId: 'fixture' },
    connected: true,
    name: 'Fixture',
  });
  mocks.promotion.mockResolvedValue({
    marker: {
      v: 9,
      stage: 'account-receiving',
      pin: config.pin,
      account: { accountId },
      source: { principalId: 'principal' },
    },
  });
  vi.mocked(execution.actorName).mockReset().mockResolvedValue('Fixture');
  vi.mocked(execution.rename).mockReset().mockResolvedValue(undefined);
  vi.mocked(execution.closingName).mockReset().mockReturnValue('Fixture');
  owner = createFirstDeviceCoordinator(config, 'local', undefined, execution, () => browser);
  await owner.inspect();
});
afterEach(async () => {
  await owner?.close();
  owner = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function minimal() {
  const workspace: Minimal = {
    marker: 'minimal',
    status: {
      state: 'active',
      revision: 0,
      pendingItems: 0,
      pendingBytes: 0,
      reservedBytes: 0,
      durable: true,
      pressure: null,
    },
    onStatus: vi.fn(() => () => {}),
    whenDurable: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  mocks.open.mockResolvedValue({ workspace, devices: {} as DeviceRoster, sync: undefined });
  return workspace;
}
it('native coordinator forwards an actual opening assertion through the explicit browser port without Window credentials', async () => {
  const workspace = minimal();
  const assertion = {
    credentialId: 'fixture',
    authenticatorData: new Uint8Array(1),
    clientDataJSON: new Uint8Array(1),
    signature: new Uint8Array(1),
    userHandle: null,
  };
  vi.mocked(browser.assertSlot).mockResolvedValue(assertion);
  const request = {
    rpId: config.pin.rpId,
    credentialId: 'fixture',
    challenge: new Uint8Array([1]),
    signal: new AbortController().signal,
  };
  mocks.open.mockImplementation(async (options) => {
    expect(await options.assertPasskey(request)).toBe(assertion);
    return { workspace, devices: {} as DeviceRoster, sync: undefined };
  });
  await owner!.unlock('fictional');
  expect(browser.assertSlot).toHaveBeenCalledExactlyOnceWith(request);
  expect(navigator.credentials.get).not.toHaveBeenCalled();
  expect(owner!.getSnapshot().kind).toBe('ready');
});
