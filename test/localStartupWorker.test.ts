// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { openLocalStartupWorker } from '../src/crdt/localStartupClient';
import { openLocalWorkerSession } from '../src/crdt/localWorkerClient';
import { createWindowLocalMirror } from '../src/crdt/windowLocalMirror';
import { createWorkerLocalStartupRuntime } from '../src/ui/localStartupWorker';
import { createLocalStartup } from '../src/ui/localStartup';
import type { LocalStartupRuntime } from '../src/ui/localStartupPort';
import type { LocalGenesisEnrollment } from '../src/crdt/localGenesis';
vi.mock('../src/crdt/localStartupClient', () => ({ openLocalStartupWorker: vi.fn() }));
vi.mock('../src/crdt/localWorkerClient', () => ({ openLocalWorkerSession: vi.fn() }));
vi.mock('../src/crdt/windowLocalMirror', () => ({ createWindowLocalMirror: vi.fn() }));
const wait = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};
const identity = {
  id: 'fictional',
  actor: { kind: 'human' as const, name: 'You', color: '#e0662f' },
  device: { id: 'local:fictional', name: 'Disposable' },
};
const fixture = () => {
  const stop = new AbortController(),
    startup = {
      inspect: vi.fn(async () => ({ kind: 'fresh' as const, reason: 'fixture' })),
      list: vi.fn(async () => []),
      beginGenesis: vi.fn(),
      resumeGenesis: vi.fn(),
      protect: vi.fn(),
      automaticCode: vi.fn(),
      close: vi.fn(async () => {}),
    },
    session = {
      cohort: { close: vi.fn(async () => {}) },
      opening: {},
      worker: {},
      ready: vi.fn(async () => {}),
    },
    workspace = { close: vi.fn() };
  vi.mocked(openLocalStartupWorker).mockResolvedValue(startup as never);
  vi.mocked(openLocalWorkerSession).mockResolvedValue(session as never);
  vi.mocked(createWindowLocalMirror).mockResolvedValue(workspace as never);
  return {
    stop,
    startup,
    session,
    workspace,
    runtime: createWorkerLocalStartupRuntime('local', { signal: stop.signal }),
  };
};
beforeEach(() => vi.resetAllMocks());
it('drains the native ceremony supervisor before opening the retained Local owner and mirror', async () => {
  const f = fixture(),
    drain = wait<void>();
  f.startup.close.mockReturnValue(drain.promise);
  await f.runtime.inspect();
  const p = f.runtime.open('fictional factor', identity);
  await Promise.resolve();
  expect(openLocalWorkerSession).not.toHaveBeenCalled();
  drain.resolve();
  const result = await p;
  expect(result).toEqual({ kind: 'ready', workspace: f.workspace });
  expect(openLocalWorkerSession).toHaveBeenCalledWith({
    slotId: 'local',
    code: 'fictional factor',
    identity,
    signal: f.stop.signal,
  });
  expect(createWindowLocalMirror).toHaveBeenCalledWith(
    f.session.cohort,
    f.session.opening,
    f.session.worker,
    { identity },
  );
  expect(f.session.ready).toHaveBeenCalledOnce();
  await f.runtime.close();
});
it('refuses opening after abort during supervisor drain without creating an editing owner', async () => {
  const f = fixture(),
    drain = wait<void>();
  f.startup.close.mockReturnValue(drain.promise);
  await f.runtime.inspect();
  const p = f.runtime.open('fictional', identity);
  f.stop.abort();
  drain.resolve();
  await expect(p).rejects.toThrow();
  expect(openLocalWorkerSession).not.toHaveBeenCalled();
  await f.runtime.close();
});
it('closes a native owner if mirror composition fails and does not signal ready', async () => {
  const f = fixture();
  vi.mocked(createWindowLocalMirror).mockRejectedValue(Error('mirror refused'));
  await expect(f.runtime.open('fictional', identity)).rejects.toThrow('mirror refused');
  expect(f.session.cohort.close).toHaveBeenCalledOnce();
  expect(f.session.ready).not.toHaveBeenCalled();
  await f.runtime.close();
});
it('joins repeated close calls while startup acquisition is still pending and drains the late supervisor', async () => {
  const f = fixture(),
    pending = wait<typeof f.startup>(),
    drain = wait<void>();
  vi.mocked(openLocalStartupWorker).mockReturnValue(pending.promise as never);
  f.startup.close.mockReturnValue(drain.promise);
  const inspecting = f.runtime.inspect().catch(() => {}),
    first = f.runtime.close(),
    second = f.runtime.close();
  expect(second).toBe(first);
  let done = false;
  void first.then(() => (done = true));
  pending.resolve(f.startup);
  await Promise.resolve();
  expect(done).toBe(false);
  drain.resolve();
  await Promise.all([first, inspecting]);
  expect(f.startup.close).toHaveBeenCalledOnce();
  await expect(f.runtime.list('fictional')).rejects.toThrow();
  expect(openLocalStartupWorker).toHaveBeenCalledOnce();
});
it('routes creation, factor checks, protection and resumption through one native startup endpoint', async () => {
  const f = fixture();
  await f.runtime.inspect();
  await f.runtime.begin(true);
  await f.runtime.list('one');
  await f.runtime.automaticCode();
  await f.runtime.protect('two');
  await f.runtime.resume('three');
  expect(openLocalStartupWorker).toHaveBeenCalledOnce();
  expect(f.startup.beginGenesis).toHaveBeenCalledWith(true);
  expect(f.startup.list).toHaveBeenCalledWith('one');
  expect(f.startup.protect).toHaveBeenCalledWith('two');
  expect(f.startup.resumeGenesis).toHaveBeenCalledWith('three');
  await f.runtime.close();
});
it('UI close drains delayed worker enrollment and cancels its code without publishing a late save screen', async () => {
  const pending = wait<LocalGenesisEnrollment>(),
    cancel = vi.fn(),
    runtime = {
      inspect: async () => ({ kind: 'fresh', reason: 'fixture' }),
      begin: () => pending.promise,
      close: vi.fn(async () => {}),
    } as unknown as LocalStartupRuntime,
    owner = createLocalStartup(false, () => runtime);
  await owner.inspect();
  const states: string[] = [];
  owner.subscribe(() => states.push(owner.getSnapshot().kind));
  const begin = owner.begin(),
    closed = owner.close();
  pending.resolve({ displayCode: 'fictional display code', confirm: vi.fn(), cancel });
  await Promise.all([begin, closed]);
  expect(cancel).toHaveBeenCalledOnce();
  expect(states).not.toContain('save-code');
  expect(owner.getSnapshot().kind).toBe('closing');
  expect(runtime.close).toHaveBeenCalledOnce();
});
