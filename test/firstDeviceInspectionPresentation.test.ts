// @vitest-environment node
/** Presentation gating only. Fake original coordinators do not grant native permits or crypto authority. */
import { beforeEach, expect, it, vi } from 'vitest';
import { createNativeFirstDeviceController } from '../src/crdt/workerFirstDeviceSetup';
import { createWorkerFirstDeviceSetup } from '../src/ui/firstDeviceSetupWorker';
const mock = vi.hoisted(() => ({ user: vi.fn(), window: vi.fn() }));
vi.mock('../src/account/firstDeviceSetup', () => ({ createFirstDeviceCoordinator: mock.user }));
vi.mock('../src/ui/windowCeremonyUi', () => ({ createWindowCeremonyUi: mock.window }));
beforeEach(() => vi.clearAllMocks());
function native() {
  let state: import('../src/account/setupProgress').SetupState = { kind: 'intro' },
    release!: () => void;
  const user = {
    getSnapshot: () => state,
    subscribe: vi.fn(),
    visitableSteps: () => [],
    hasRecoveryDisplay: () => false,
    inspect: vi.fn(() => new Promise<void>((r) => (release = r))),
    whenIdle: vi.fn(async () => {}),
    approvePasskey: vi.fn(),
    close: vi.fn(async () => {}),
  };
  mock.user.mockReturnValue(user);
  const controller = createNativeFirstDeviceController({
    config: {},
    slotId: 'fixture',
    takeInitialCode: () => undefined,
    execution: {},
    browser: {},
    publish: vi.fn(),
  } as never);
  return {
    controller,
    user,
    release: () => release(),
    state: (v: import('../src/account/setupProgress').SetupState) => {
      state = v;
    },
  };
}
it('bootstrap and a held inspection never advertise an actionable name form; completed inspection can', async () => {
  const f = native();
  expect(f.controller.snapshot()['state']).toMatchObject({ kind: 'working' });
  const action = f.controller.command({ command: 'inspect' }),
    running = action.run();
  expect(f.controller.snapshot()['state']).toMatchObject({ kind: 'working' });
  f.release();
  await running;
  expect(f.controller.snapshot()['state']).toEqual({ kind: 'intro' });
  expect(f.user.inspect).toHaveBeenCalledOnce();
  expect(f.user.whenIdle).toHaveBeenCalledOnce();
});
it('a genuine approval requested during inspection stays visible and keeps its original out-of-band action', async () => {
  const f = native(),
    running = f.controller.command({ command: 'inspect' }).run();
  f.state({
    kind: 'approve-passkey',
    message: 'Approve the original request',
    description: 'Fictional display',
  });
  expect(f.controller.snapshot()['state']).toMatchObject({ kind: 'approve-passkey' });
  const action = f.controller.command({ command: 'approvePasskey' });
  expect(action.outOfBand).toBe(true);
  action.run();
  expect(f.user.approvePasskey).toHaveBeenCalledOnce();
  f.release();
  await running;
});
it('Window construction starts with checking display before any native bootstrap snapshot can arrive', () => {
  mock.window.mockImplementation((_c, _s, o) => ({
    getSnapshot: () => o.initial,
    subscribe: vi.fn(),
    registerEditor: vi.fn(),
    close: vi.fn(),
    whenIdle: vi.fn(),
    command: vi.fn(),
    send: vi.fn(),
  }));
  const owner = createWorkerFirstDeviceSetup({ networkSessions: true } as never, 'fixture');
  expect(owner.getSnapshot()).toMatchObject({ kind: 'working', message: 'Checking saved setup…' });
});
