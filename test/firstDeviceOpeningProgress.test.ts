// @vitest-environment node
/** Coordinator boundary tests. They do not replace the real factor/ledger verification tests. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { createFirstDeviceSetup } from '../src/account/firstDeviceSetup';
import { setupProgress, type SetupConfig } from '../src/account/setupProgress';

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
let owner: ReturnType<typeof createFirstDeviceSetup> | undefined;
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
  owner = createFirstDeviceSetup(config);
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
function credential() {
  return {
    id: 'fixture',
    response: {
      authenticatorData: new ArrayBuffer(0),
      clientDataJSON: new ArrayBuffer(0),
      signature: new ArrayBuffer(0),
      userHandle: null,
    },
  };
}
function opened() {
  const workspace = {
    read: () => ({ actors: [{ id: 'principal', name: 'Fixture' }] }),
    onStatus: vi.fn(() => () => {}),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { workspace, devices: {}, sync: {} };
}

it('changes the passkey prompt to saved-writing progress before a held owner opening completes', async () => {
  const provider = deferred<ReturnType<typeof credential>>(),
    replay = deferred<ReturnType<typeof opened>>();
  vi.mocked(navigator.credentials.get).mockReturnValue(provider.promise as never);
  mocks.open.mockImplementation(async (options) => {
    await options.assertPasskey({
      rpId: config.pin.rpId,
      credentialId: 'Zg',
      challenge: new Uint8Array(32),
    });
    return replay.promise;
  });
  const operation = owner!.unlock('fixture input, not a real code');
  try {
    await vi.waitFor(() => expect(navigator.credentials.get).toHaveBeenCalledTimes(1));
    expect(owner!.getSnapshot()).toMatchObject({
      kind: 'working',
      message: 'Use your passkey to unlock',
    });
    provider.resolve(credential());
    await vi.waitFor(() =>
      expect(owner!.getSnapshot()).toMatchObject({
        kind: 'working',
        message: 'Opening your encrypted writing…',
      }),
    );
  } finally {
    provider.resolve(credential());
    replay.resolve(opened());
    await operation;
  }
  expect(owner!.getSnapshot()).toMatchObject({ kind: 'ready' });
});

it('Back aborts opening and drains a late owner without publishing ready or deleting saved setup', async () => {
  vi.mocked(navigator.credentials.get).mockResolvedValue(credential() as never);
  const replay = deferred<ReturnType<typeof opened>>();
  let signal!: AbortSignal;
  mocks.open.mockImplementation(async (options) => {
    signal = options.signal;
    await options.assertPasskey({
      rpId: config.pin.rpId,
      credentialId: 'Zg',
      challenge: new Uint8Array(32),
    });
    return replay.promise;
  });
  const operation = owner!.unlock('fixture input, not a real code');
  try {
    await vi.waitFor(() =>
      expect(owner!.getSnapshot()).toMatchObject({ message: 'Opening your encrypted writing…' }),
    );
    const saved = await setupProgress();
    const states: string[] = [];
    owner!.subscribe(() => states.push(owner!.getSnapshot().kind));
    let closed = false;
    const closing = owner!.close().then(() => {
      closed = true;
    });
    expect(signal.aborted).toBe(true);
    await Promise.resolve();
    expect(closed).toBe(false);
    const result = opened();
    replay.resolve(result);
    await operation;
    await closing;
    expect(result.workspace.close).toHaveBeenCalled();
    expect(states).not.toContain('ready');
    expect(await setupProgress()).toEqual(saved);
  } finally {
    replay.resolve(opened());
    await operation;
  }
});

it('a refused provider never reaches saved-writing progress', async () => {
  vi.mocked(navigator.credentials.get).mockRejectedValue(
    new DOMException('cancelled', 'NotAllowedError'),
  );
  mocks.open.mockImplementation(async (options) =>
    options.assertPasskey({
      rpId: config.pin.rpId,
      credentialId: 'Zg',
      challenge: new Uint8Array(32),
    }),
  );
  const messages: string[] = [];
  owner!.subscribe(() => {
    const state = owner!.getSnapshot();
    if (state.kind === 'working') messages.push(state.message);
  });
  await owner!.unlock('fixture input, not a real code');
  expect(messages).not.toContain('Opening your encrypted writing…');
  expect(owner!.getSnapshot()).toMatchObject({
    kind: 'unlock',
    error: expect.stringContaining('cancelled'),
  });
});
