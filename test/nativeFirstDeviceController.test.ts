// @vitest-environment node
/** Fixed command/reference adapter only. Actual native ownership is exercised separately. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createNativeFirstDeviceController } from '../src/crdt/workerFirstDeviceSetup';
import { startWorkerCeremonyUi, type NativeCeremonyUiContext } from '../src/crdt/workerCeremonyUi';
import { createWorkerChannel } from '../src/crdt/workerChannel';
const mocked = vi.hoisted(() => ({
  create: vi.fn(),
  root: undefined as
    | undefined
    | {
        signal: AbortSignal;
        assertCurrent(): void;
        beforeRelease(cleanup: () => unknown): void;
        run<T>(operation: () => Promise<T>): Promise<T>;
        close: ReturnType<typeof vi.fn>;
      },
}));
vi.mock('../src/account/firstDeviceSetup', () => ({ createFirstDeviceCoordinator: mocked.create }));
// Fixed native lifetime stand-ins for the shared host; the channels and presentation are real.
vi.mock('../src/crdt/ceremonyWorkerLifetime', () => ({
  openCeremonyWorkerLifetime: async () => mocked.root,
}));
vi.mock('../src/crdt/workerCeremonyPhase', () => ({
  createWorkerCeremonyPhase: () => ({
    handingOff: false,
    run: <T>(operation: () => Promise<T>) => operation(),
    yieldToAccount: async () => {},
  }),
}));
vi.mock('../src/crdt/ceremonyEnvironment', () => ({
  installCeremonyEnvironment: () => ({ activity: {}, events: new EventTarget() }),
}));
vi.mock('../src/crdt/protectionEnvironment', () => ({ installProtectionEnvironment: () => {} }));
vi.mock('../src/crdt/workerAccountHandoff', () => ({
  createWorkerAccountHandoff: () => ({ prepare: vi.fn(), accept: vi.fn() }),
}));
vi.mock('../src/crdt/ceremonyBrowser', () => ({ createWorkerCeremonyBrowser: () => ({}) }));
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
    onRetired: vi.fn(),
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
    slotRetired: vi.fn(),
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
it('reports the coordinator closing itself on slot retirement to the shared host', () => {
  const f = fixture();
  expect(f.user.onRetired).toHaveBeenCalledExactlyOnceWith(f.context.slotRetired);
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
    state: { kind: 'working', message: 'Checking saved setup…' },
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
async function host() {
  const incarnation = 'ab'.repeat(16),
    events: string[] = [],
    posted: Record<string, unknown>[] = [],
    states: Record<string, unknown>[] = [];
  let gate: Promise<void> = Promise.resolve();
  mocked.root = {
    signal: new AbortController().signal,
    assertCurrent: () => {},
    beforeRelease: () => {},
    run: (operation) => operation(),
    close: vi.fn(async () => {
      events.push('root closed');
    }),
  };
  vi.stubGlobal('self', {
    postMessage: (message: Record<string, unknown>) => {
      events.push(`posted ${String(message['kind'])}`);
      posted.push(message);
    },
  });
  const root = new MessageChannel(),
    ui = new MessageChannel();
  // The Window's side of both channels: it acknowledges each display only after `gate`.
  const windowControl = createWorkerChannel(
    ui.port1,
    incarnation,
    {
      setupState: async (input) => {
        await gate;
        states.push(input as Record<string, unknown>);
        events.push(`display ${(input as { state: string }).state}`);
      },
    },
    () => {},
  );
  const windowRoot = createWorkerChannel(root.port1, incarnation, {}, () => {});
  let display = 'checking',
    context!: NativeCeremonyUiContext;
  const controller = { snapshot: () => ({ state: display }), command: vi.fn(), close: vi.fn() };
  await startWorkerCeremonyUi(
    {
      ticket: { v: 1, slotId: 'local', incarnation, windowClient: 'window' },
      port: root.port2,
      controlPort: ui.port2,
      config: { networkSessions: true, pin: {} as never },
      activity: { visibility: 'visible', online: true },
    },
    (value) => {
      context = value;
      return controller;
    },
  );
  await vi.waitFor(() => expect(states).toHaveLength(1));
  return {
    incarnation,
    events,
    posted,
    states,
    controller,
    windowRoot,
    windowControl,
    get context() {
      return context;
    },
    show(value: string) {
      display = value;
    },
    hold() {
      let release!: () => void;
      gate = new Promise((resolve) => (release = resolve));
      return release;
    },
  };
}
it('a slot-retired controller is reported with its cause only after the Window acknowledged its final display, and the host waits for the Window to drain it', async () => {
  const h = await host();
  h.show('final');
  const release = h.hold();
  h.controller.close.mockResolvedValue(undefined);
  h.context.slotRetired(Promise.resolve());
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(h.posted.filter((m) => m['kind'] === 'setupClosed')).toEqual([]);
  release();
  await vi.waitFor(() => expect(h.posted.some((m) => m['kind'] === 'setupClosed')).toBe(true));
  expect(h.posted.at(-1)).toEqual({
    v: 1,
    kind: 'setupClosed',
    owner: h.incarnation,
    ok: true,
    cause: 'slot-retired',
  });
  expect(h.events.indexOf('display final')).toBeGreaterThan(-1);
  expect(h.events.indexOf('display final')).toBeLessThan(h.events.indexOf('posted setupClosed'));
  // The notice is not the cleanup acknowledgement: the host is still open until the Window drains.
  expect(mocked.root!.close).not.toHaveBeenCalled();
  h.windowRoot.close();
  await vi.waitFor(() => expect(mocked.root!.close).toHaveBeenCalledOnce());
  await vi.waitFor(() =>
    expect(h.posted.filter((m) => m['kind'] === 'setupClosed').at(-1)).toEqual({
      v: 1,
      kind: 'setupClosed',
      owner: h.incarnation,
      ok: true,
    }),
  );
  h.windowControl.close();
});
it('a slot-retired controller whose own cleanup failed reports failure with its cause', async () => {
  const h = await host();
  h.show('final');
  h.context.slotRetired(Promise.reject(Error('native cleanup failed')));
  await vi.waitFor(() => expect(h.posted.some((m) => m['kind'] === 'setupClosed')).toBe(true));
  expect(h.posted.at(-1)).toMatchObject({ kind: 'setupClosed', ok: false, cause: 'slot-retired' });
  h.windowRoot.close();
  h.windowControl.close();
});
