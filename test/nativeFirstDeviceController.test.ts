// @vitest-environment node
/** Fixed command/reference adapter only. Actual native ownership is exercised separately. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createNativeFirstDeviceController } from '../src/crdt/workerFirstDeviceSetup';
import { startWorkerCeremonyUi, type NativeCeremonyUiContext } from '../src/crdt/workerCeremonyUi';
const mocked = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../src/account/firstDeviceSetup', () => ({ createFirstDeviceCoordinator: mocked.create }));
beforeEach(() => mocked.create.mockReset());
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const user = {
    inspect: vi.fn(async () => {}),
    start: vi.fn(),
    savedDeviceCode: vi.fn(),
    confirmDeviceCode: vi.fn(async () => {}),
    unlock: vi.fn(async () => {}),
    passkey: vi.fn(async () => {}),
    resumeSetup: vi.fn(async () => {}),
    savedRecovery: vi.fn(),
    confirmRecovery: vi.fn(async () => {}),
    saveName: vi.fn(async () => {}),
    restart: vi.fn(async () => {}),
    approvePasskey: vi.fn(),
    visit: vi.fn(() => true),
    whenIdle: vi.fn(async () => {}),
    getSnapshot: () => ({ kind: 'intro' }),
    visitableSteps: () => [],
    hasRecoveryDisplay: () => false,
    subscribe: vi.fn(),
    close: vi.fn(async () => {}),
  };
  mocked.create.mockReturnValue(user);
  const context = {
    config: {},
    slotId: 'fixture',
    takeInitialCode: vi.fn(),
    execution: {},
    browser: {},
    signal: new AbortController().signal,
    publish: vi.fn(),
    data: undefined,
  } as unknown as NativeCeremonyUiContext;
  return { user, context, controller: createNativeFirstDeviceController(context) };
}
it('passes the original coordinator exact native configuration execution browser and input references', () => {
  const f = fixture();
  const args = mocked.create.mock.calls[0]!;
  expect(args.slice(0, 4)).toEqual([
    f.context.config,
    'fixture',
    f.context.takeInitialCode,
    f.context.execution,
  ]);
  expect(args[4]()).toBe(f.context.browser);
  expect(f.user.subscribe).toHaveBeenCalledExactlyOnceWith(f.context.publish);
  expect(f.controller.close).toBe(f.user.close);
});
it('ordinary Start stays tracked through the original asynchronous idle barrier', async () => {
  const f = fixture();
  let release!: () => void;
  f.user.whenIdle.mockReturnValue(new Promise((resolve) => (release = resolve)));
  const action = f.controller.command({ command: 'start', value: 'Fixture' });
  expect(action.outOfBand).toBe(false);
  let done = false;
  const running = Promise.resolve(action.run()).then(() => (done = true));
  await Promise.resolve();
  expect(f.user.start).toHaveBeenCalledExactlyOnceWith('Fixture');
  expect(done).toBe(false);
  release();
  await running;
  expect(done).toBe(true);
});
it('approval and navigation remain synchronous out-of-band effects without awaiting their own operation', () => {
  const f = fixture(),
    approval = f.controller.command({ command: 'approvePasskey' }),
    visit = f.controller.command({ command: 'visit', value: 'save-recovery' });
  expect(approval.outOfBand).toBe(true);
  expect(approval.run()).toBeUndefined();
  expect(visit.outOfBand).toBe(true);
  expect(visit.run()).toBe(true);
  expect(f.user.whenIdle).not.toHaveBeenCalled();
  expect(f.user.visit).toHaveBeenCalledWith('save-recovery');
});
it('unknown or accessor commands cannot invoke an original action', () => {
  const f = fixture(),
    get = vi.fn();
  expect(() => f.controller.command({ command: 'arbitrary' })).toThrow();
  expect(() =>
    f.controller.command({
      command: 'unlock',
      get value() {
        return get();
      },
    }),
  ).toThrow();
  expect(get).not.toHaveBeenCalled();
  expect(f.user.unlock).not.toHaveBeenCalled();
  expect(f.controller.snapshot()).toEqual({
    state: { kind: 'intro' },
    visitable: [],
    recoveryDisplay: false,
  });
});
it('shared native host refuses Window execution without reading its bootstrap or invoking a factory', async () => {
  vi.stubGlobal('window', {});
  const read = vi.fn(),
    factory = vi.fn();
  await expect(
    startWorkerCeremonyUi(
      {
        get config() {
          read();
          throw Error('untrusted');
        },
      } as never,
      factory,
    ),
  ).rejects.toThrow('Native public setup required');
  expect(read).not.toHaveBeenCalled();
  expect(factory).not.toHaveBeenCalled();
});
