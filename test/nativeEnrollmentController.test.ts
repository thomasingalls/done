// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { createNativeEnrollmentController } from '../src/crdt/workerEnrollment';
import type { NativeCeremonyUiContext } from '../src/crdt/workerCeremonyUi';
import {
  captureEnrollmentBootstrap,
  captureEnrollmentCommand,
  enrollmentPresentation,
  enrollmentProgressPresentation,
} from '../src/account/enrollmentWorkerProtocol';
const mocks = vi.hoisted(() => ({ create: vi.fn(), loginClose: vi.fn() }));
vi.mock('../src/account/accountEnrollment', () => ({
  createAccountEnrollmentCoordinator: mocks.create,
}));
vi.mock('../src/account/networkLogin', () => ({
  NetworkLogin: class {
    close = mocks.loginClose;
  },
}));
beforeEach(() => {
  mocks.create.mockReset();
  mocks.loginClose.mockReset();
});
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((yes) => (resolve = yes));
  return { promise, resolve };
};
function fixture() {
  const stop = new AbortController();
  const user = {
    refresh: vi.fn(async () => ({ kind: 'waiting', message: 'Waiting' })),
    compare: vi.fn(async () => ({ kind: 'approved', message: 'Approved' })),
    close: vi.fn(async () => {}),
  };
  mocks.create.mockResolvedValue(user);
  const context = {
    config: { pin: {} },
    slotId: 'local',
    signal: stop.signal,
    takeInitialCode: vi.fn(() => 'fixture-factor'),
    data: { role: 'new', workspaceId: 'fictional' },
    browser: {},
    execution: {},
    publish: vi.fn(),
    runBackground: (operation: () => Promise<unknown>) => operation(),
    beforeAccountOpen: vi.fn(),
  } as unknown as NativeCeremonyUiContext;
  const controller = createNativeEnrollmentController(context);
  const invoke = (command: string, value?: string) =>
    (async () => {
      const result = await controller
        .command(value === undefined ? { command } : { command, value })
        .run();
      const error = controller.snapshot()['error'];
      if (error) throw Error(String(error));
      return result;
    })();
  return { stop, user, context, controller, invoke };
}
it('does not begin native initialization outside the tracked command', async () => {
  const f = fixture();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(f.context.takeInitialCode).not.toHaveBeenCalled();
  const action = f.controller.command({ command: 'initialize' });
  expect(action.outOfBand).toBe(false);
  await action.run();
  const args = mocks.create.mock.calls[0]!;
  expect(args[0]).toBe(f.context.execution);
  expect(args[1]()).toBe(f.context.browser);
  expect(args[2]()).toBe(f.context.browser);
  expect(args.slice(3, 10)).toEqual([
    f.context.config,
    'local',
    'fixture-factor',
    'new',
    'fictional',
    undefined,
    expect.any(Object),
  ]);
  expect(args[10]).toBe(f.context.signal);
  expect(f.context.takeInitialCode).toHaveBeenCalledTimes(1);
  await expect(f.invoke('initialize')).rejects.toThrow('already initialized');
});
it('exports only display identities and never exports native workspace login or roster objects', async () => {
  const workspace = { secret: () => {} },
    login = { secret: () => {} };
  expect(
    enrollmentPresentation({
      kind: 'editing',
      message: 'Ready',
      editor: { workspace, login, devices: workspace, actorId: 'actor', accountId: 'account' },
    }),
  ).toEqual({
    kind: 'editing',
    message: 'Ready',
    editor: { actorId: 'actor', accountId: 'account' },
  });
  const f = fixture();
  await f.invoke('initialize');
  await f.invoke('compare', 'ABCDE');
  expect(f.user.compare).toHaveBeenCalledWith('ABCDE');
  expect(f.controller.snapshot()).toEqual({
    state: { kind: 'approved', message: 'Approved' },
    error: '',
    progress: null,
    notifications: { generation: 0, connected: false, event: null },
  });
});
it('rejects accessor/extended commands and bootstrap data before invoking a native owner', () => {
  const read = vi.fn();
  for (const v of [
    { command: 'refresh', value: 'x' },
    { command: 'compare' },
    { command: 'anything' },
    {
      command: 'refresh',
      get extra() {
        return read();
      },
    },
  ])
    expect(() => captureEnrollmentCommand(v)).toThrow();
  expect(() =>
    captureEnrollmentBootstrap({
      role: 'new',
      get invitation() {
        return read();
      },
    }),
  ).toThrow();
  expect(read).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
it('validates progress independently from any authority and rejects impossible counters', () => {
  expect(enrollmentProgressPresentation({ stage: 'history', completed: 2, total: null })).toEqual({
    stage: 'history',
    completed: 2,
    total: null,
  });
  for (const p of [
    { stage: 'sources', completed: 2, total: 1 },
    { stage: 'history', completed: -1, total: null },
    { stage: 'anything' },
    { stage: 'checking', proof: true },
  ])
    expect(() => enrollmentProgressPresentation(p)).toThrow();
});
it('joins a late initialization and closes the acquired coordinator before closing completes', async () => {
  const f = fixture(),
    gate = deferred<typeof f.user>();
  mocks.create.mockReturnValue(gate.promise);
  const pending = Promise.resolve(f.invoke('initialize'));
  const rejected = expect(pending).rejects.toThrow('closed');
  let done = false;
  const closing = f.controller.close().then(() => (done = true));
  await Promise.resolve();
  expect(done).toBe(false);
  gate.resolve(f.user);
  await rejected;
  await closing;
  expect(f.user.close).toHaveBeenCalled();
  expect(mocks.loginClose).toHaveBeenCalled();
});
it('close joins active work and retires a late workspace instead of returning early', async () => {
  const f = fixture();
  await f.invoke('initialize');
  const gate = deferred<{ kind: string; message: string }>();
  f.user.refresh.mockReturnValue(gate.promise);
  const work = Promise.resolve(f.invoke('refresh'));
  const rejected = expect(work).rejects.toThrow('closed');
  let done = false;
  const closing = f.controller.close().then(() => (done = true));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(done).toBe(false);
  gate.resolve({ kind: 'waiting', message: 'late' });
  await rejected;
  await closing;
  expect(f.user.close.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(f.controller.snapshot()).toEqual({
    state: { kind: 'locked', message: expect.any(String) },
    error: '',
    progress: null,
    notifications: { generation: 0, connected: false, event: null },
  });
});
