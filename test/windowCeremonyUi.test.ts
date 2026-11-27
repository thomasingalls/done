// @vitest-environment node
/** Constructor/data boundary only; native lifetime and mirror paths use real browser checks. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createWindowCeremonyUi, type WindowCeremonyUiOptions } from '../src/ui/windowCeremonyUi';
import type { SetupConfig } from '../src/account/setupProgress';
import { createWorkerChannel } from '../src/crdt/workerChannel';
const mocked = vi.hoisted(() => ({ cohorts: [] as { close: ReturnType<typeof vi.fn> }[] }));
// Stand-ins for the native Window cohort, journal, provider and lifetime watch. The Worker channels
// and the Window owner's own message handling are the real code.
vi.mock('../src/crdt/accountWorkerCohort', async (actual) => ({
  ...(await actual<typeof import('../src/crdt/accountWorkerCohort')>()),
  openWindowCeremonyCohort: async (_slotId: string, stopWorker: () => Promise<void>) => {
    const cohort = {
      ticket: { v: 1, slotId: 'fixture', incarnation: 'cd'.repeat(16), windowClient: 'window' },
      close: vi.fn(() => stopWorker()),
    };
    mocked.cohorts.push(cohort);
    return cohort;
  },
}));
vi.mock('../src/crdt/windowCeremonyJournal', () => ({
  createWindowCeremonyJournal: () => ({ methods: {} }),
}));
vi.mock('../src/crdt/ceremonyBrowser', () => ({
  createWindowCeremonyBrowser: () => ({ close: () => {}, cancel: () => {}, prompt: () => {} }),
}));
vi.mock('../src/crdt/windowWorkerLifetime', () => ({
  watchWindowWorkerLifetime: async () => ({ close: () => {} }),
}));
const config: SetupConfig = {
  networkSessions: true,
  pin: {
    v: 1,
    origin: 'https://ceremony.test',
    rpId: 'ceremony.test',
    serviceId: 'ab'.repeat(16),
    authRoot: 'cd'.repeat(32),
  },
};
beforeEach(() => vi.stubGlobal('location', { origin: config.pin.origin }));
afterEach(() => vi.unstubAllGlobals());
function options(data: unknown): WindowCeremonyUiOptions<{ kind: string }> {
  return {
    initial: { kind: 'initial' },
    closing: { kind: 'closing' },
    failure: () => ({ kind: 'failed' }),
    fields: ['state'],
    capture: () => ({ kind: 'captured' }),
    editing: () => false,
    worker: vi.fn(),
    bootstrapKind: 'fixed-test-bootstrap',
    expectedJoined: false,
    captureCommand: (v) => v,
    data,
  };
}
it('rejects oversized backing allocation before a Worker or Window root can be started', () => {
  const input = options({ bytes: new Uint8Array(new ArrayBuffer(1024 * 1024 + 1), 0, 1) });
  expect(() => createWindowCeremonyUi(config, 'fixture', input)).toThrow();
  expect(input.worker).not.toHaveBeenCalled();
});
it('rejects accessors in untrusted bootstrap data without invoking them', () => {
  const getter = vi.fn(),
    input = options({
      get route() {
        return getter();
      },
    });
  expect(() => createWindowCeremonyUi(config, 'fixture', input)).toThrow();
  expect(getter).not.toHaveBeenCalled();
  expect(input.worker).not.toHaveBeenCalled();
});
it('constructing a valid presentation creates no Worker and closing before first command clears display state', async () => {
  const input = options({ route: 'fictional' }),
    owner = createWindowCeremonyUi(config, 'fixture', input);
  expect(owner.getSnapshot()).toEqual({ kind: 'initial' });
  expect(input.worker).not.toHaveBeenCalled();
  await owner.close();
  expect(owner.getSnapshot()).toEqual({ kind: 'closing' });
  expect(input.worker).not.toHaveBeenCalled();
});
/** One fake dedicated Worker per incarnation, answering on the real channels as the host does. */
function workers() {
  const created: {
    terminate: ReturnType<typeof vi.fn>;
    commands: unknown[];
    closes: number;
    bootstrap: Record<string, unknown>;
    emit(data: unknown): void;
    show(state: string): Promise<unknown>;
  }[] = [];
  const factory = vi.fn(() => {
    const listeners = new Set<(event: { data: unknown }) => void>();
    let control: ReturnType<typeof createWorkerChannel> | undefined,
      sequence = 0;
    const worker = {
      terminate: vi.fn(),
      commands: [] as unknown[],
      closes: 0,
      bootstrap: {} as Record<string, unknown>,
      emit: (data: unknown) => {
        for (const listener of [...listeners]) listener({ data });
      },
      show: (state: string) => control!.request('setupState', { sequence: ++sequence, state }),
      addEventListener(type: string, listener: (event: { data: unknown }) => void) {
        if (type === 'message') listeners.add(listener);
      },
      postMessage(message: Record<string, unknown>) {
        worker.bootstrap = message;
        const owner = (message['ticket'] as { incarnation: string }).incarnation;
        // A closed root channel makes the host close and acknowledge, as the real one does.
        createWorkerChannel(message['port'] as MessagePort, owner, {}, () =>
          queueMicrotask(() => worker.emit({ v: 1, kind: 'setupClosed', owner, ok: true })),
        );
        control = createWorkerChannel(
          message['controlPort'] as MessagePort,
          owner,
          {
            setupCommand: (input) => {
              worker.commands.push(input);
            },
            setupClose: () => {
              worker.closes++;
            },
            activity: () => {},
          },
          () => {},
        );
        queueMicrotask(() => worker.emit({ v: 1, kind: 'setupBooted', owner }));
      },
    };
    created.push(worker);
    return worker as unknown as Worker;
  });
  return { created, factory };
}
function booted() {
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal('navigator', { onLine: true });
  mocked.cohorts.length = 0;
  const w = workers(),
    failure = vi.fn((poisoned: boolean) => ({ kind: poisoned ? 'poisoned' : 'failed' })),
    owner = createWindowCeremonyUi(config, 'fixture', {
      ...options(undefined),
      failure,
      capture: (input) => ({ kind: (input as { state: string }).state }),
      worker: w.factory,
      retryCommand: { command: 'retry' },
    }),
    seen: string[] = [];
  owner.subscribe(() => seen.push(owner.getSnapshot().kind));
  return { ...w, owner, failure, seen };
}
it('a Worker whose controller closed itself on slot retirement keeps its final display through the drain, and only a new command starts a fresh Worker', async () => {
  const f = booted();
  await f.owner.command({ command: 'first' });
  const first = f.created[0]!;
  await first.show('final');
  expect(f.owner.getSnapshot()).toEqual({ kind: 'final' });
  first.emit({
    v: 1,
    kind: 'setupClosed',
    owner: 'cd'.repeat(16),
    ok: true,
    cause: 'slot-retired',
  });
  await vi.waitFor(() => expect(first.terminate).toHaveBeenCalled());
  await vi.waitFor(() => expect(f.owner.requiresUnlock).toBe(true));
  expect(f.owner.getSnapshot()).toEqual({ kind: 'final' });
  expect(f.seen.slice(f.seen.indexOf('final'))).not.toContain('closing');
  expect(f.seen).not.toContain('failed');
  expect(f.failure).not.toHaveBeenCalled();
  expect(first.closes).toBe(1);
  expect(mocked.cohorts[0]!.close).toHaveBeenCalledOnce();
  expect(f.factory).toHaveBeenCalledOnce();
  await f.owner.command({ command: 'next' });
  expect(f.factory).toHaveBeenCalledTimes(2);
  expect(f.created[1]!.bootstrap).not.toHaveProperty('initialCode');
  expect(f.created[1]!.commands).toEqual([{ command: 'retry' }, { command: 'next' }]);
  await f.owner.close();
});
it('a setupClosed without that cause still drains to the failure display exactly as before', async () => {
  const f = booted();
  await f.owner.command({ command: 'first' });
  const first = f.created[0]!;
  await first.show('final');
  first.emit({ v: 1, kind: 'setupClosed', owner: 'cd'.repeat(16), ok: true });
  await vi.waitFor(() => expect(f.owner.getSnapshot()).toEqual({ kind: 'failed' }));
  expect(f.seen.slice(f.seen.indexOf('final'))).toEqual(['final', 'closing', 'failed']);
  expect(f.failure).toHaveBeenCalledWith(false, undefined);
  expect(first.terminate).toHaveBeenCalled();
  await f.owner.close();
});
it('a slot-retired close whose own cleanup failed takes the ordinary failed-cleanup path', async () => {
  const f = booted();
  await f.owner.command({ command: 'first' });
  const first = f.created[0]!;
  await first.show('final');
  first.emit({
    v: 1,
    kind: 'setupClosed',
    owner: 'cd'.repeat(16),
    ok: false,
    cause: 'slot-retired',
  });
  await vi.waitFor(() => expect(f.owner.getSnapshot()).toEqual({ kind: 'poisoned' }));
  expect(f.seen.slice(f.seen.indexOf('final'))).toEqual(['final', 'closing', 'poisoned']);
  expect(f.failure).toHaveBeenCalledWith(true);
  await f.owner.close().catch(() => {});
});
