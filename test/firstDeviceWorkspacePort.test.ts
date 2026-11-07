// @vitest-environment node
/** Coordinator boundary tests. They do not replace the real factor/ledger verification tests. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { createFirstDeviceCoordinator } from '../src/account/firstDeviceSetup';
import { setupProgress, type SetupConfig } from '../src/account/setupProgress';
import type { SetupWorkspaceExecution, SetupWorkspacePort } from '../src/account/setupWorkspace';
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
  owner = createFirstDeviceCoordinator(config, 'local', undefined, execution);
  await owner.inspect();
});
afterEach(async () => {
  await owner?.close();
  owner = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};

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
it('the coordinator reaches ready with lifecycle/status and asynchronous name operations, without a document or editor commands', async () => {
  const workspace = minimal();
  await owner!.unlock('fictional boundary input');
  expect(owner!.getSnapshot()).toMatchObject({ kind: 'ready', workspace });
  expect('read' in workspace).toBe(false);
  expect('command' in workspace).toBe(false);
  expect(execution.actorName).toHaveBeenCalledWith(workspace, 'principal');
  expect(execution.rename).not.toHaveBeenCalled();
});
it('name changes stay behind the explicit admitted rename operation', async () => {
  const workspace = minimal();
  await owner!.unlock('fictional');
  await owner!.saveName('New name');
  expect(execution.rename).toHaveBeenCalledExactlyOnceWith(workspace, 'principal', 'New name');
  expect(owner!.getSnapshot().kind).toBe('ready');
});
it('closing during a held name read withdraws immediately and drains the late result without ready resurrection', async () => {
  const workspace = minimal(),
    name = deferred<string | undefined>();
  vi.mocked(execution.actorName).mockReturnValueOnce(name.promise);
  const operation = owner!.unlock('fictional');
  await vi.waitFor(() => expect(execution.actorName).toHaveBeenCalled());
  const closing = owner!.close();
  expect(owner!.getSnapshot()).toMatchObject({
    kind: 'working',
    message: 'Locking and finishing storage operations…',
  });
  name.resolve('late private label');
  await Promise.all([operation, closing]);
  expect(owner!.getSnapshot().kind).not.toBe('ready');
  expect(workspace.close).toHaveBeenCalled();
});
it('shutdown uses a synchronous display hint and never waits on an unread remote name', async () => {
  const workspace = minimal();
  await owner!.unlock('fictional');
  vi.mocked(execution.actorName).mockImplementation(() => new Promise(() => {}));
  await owner!.close();
  expect(execution.closingName).toHaveBeenCalledWith(workspace, 'principal');
  expect(workspace.close).toHaveBeenCalledOnce();
});
it('failed remote name read never publishes the opened workspace and disposes the native surface', async () => {
  const workspace = minimal();
  vi.mocked(execution.actorName).mockRejectedValue(Error('name read failed'));
  await owner!.unlock('fictional');
  expect(owner!.getSnapshot().kind).not.toBe('ready');
  expect(workspace.close).toHaveBeenCalledOnce();
});
