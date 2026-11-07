// @vitest-environment node
import { expect, it } from 'vitest';
import {
  forwardWindowWorkspace,
  createWorkerWorkspacePort,
  workspaceSchedulingStatus,
} from '../src/crdt/workspaceBridge';
import { listenToLocalWorkspaceChanges } from '../src/crdt/accountWorkspacePort';
import type { AdmissionStatus } from '../src/crdt/admissionQueue';
import type { AdmittedWorkspace } from '../src/crdt/admittedWorkspace';
import type { WorkerChannel } from '../src/crdt/workerChannel';
const status = (revision = 0): AdmissionStatus => ({
  state: 'active',
  revision,
  pendingItems: 0,
  pendingBytes: 0,
  reservedBytes: 0,
  durable: true,
  pressure: null,
});
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
function source() {
  let current = status();
  const changes = new Set<() => void>(),
    states = new Set<() => void>(),
    outgoing = new Set<(b: Uint8Array<ArrayBuffer>) => void>();
  const workspace = {
    get status() {
      return current;
    },
    subscribe: (fn: () => void) => {
      changes.add(fn);
      return () => changes.delete(fn);
    },
    onStatus: (fn: () => void) => {
      states.add(fn);
      return () => states.delete(fn);
    },
    outgoing: (fn: (b: Uint8Array<ArrayBuffer>) => void) => {
      outgoing.add(fn);
      return () => outgoing.delete(fn);
    },
  } as unknown as AdmittedWorkspace;
  return {
    workspace,
    set: (s: AdmissionStatus) => (current = s),
    change: () => changes.forEach((fn) => fn()),
    state: () => states.forEach((fn) => fn()),
    local: () => {
      const b = new Uint8Array([3, 7]);
      const subscribed = outgoing.size > 0;
      for (const fn of outgoing) fn(b);
      expect(b.every((v) => v === 0)).toBe(subscribed);
    },
    counts: () => [changes.size, states.size, outgoing.size],
  };
}
const turn = () => new Promise<void>((r) => setTimeout(r, 0));
it('does not send inside a local input handler and coalesces the latest status and event kinds', async () => {
  const s = source(),
    stop = new AbortController(),
    sent: unknown[] = [],
    hold = deferred();
  const b = forwardWindowWorkspace(
    s.workspace,
    stop.signal,
    async (h) => {
      sent.push(h);
      await hold.promise;
    },
    () => {},
  );
  s.set(status(1));
  s.change();
  s.local();
  expect(sent).toHaveLength(0);
  await turn();
  expect(sent).toEqual([{ sequence: 1, status: status(1), changed: true, local: true }]);
  for (let i = 2; i < 10002; i++) {
    s.set(status(i));
    s.state();
    s.change();
    if (i % 2 === 0) s.local();
  }
  expect(sent).toHaveLength(1);
  hold.resolve();
  await turn();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toEqual({ sequence: 2, status: status(10001), changed: true, local: true });
  b.close();
  expect(s.counts()).toEqual([0, 0, 0]);
});
it('closing an in-flight sender drops pending observations without another call', async () => {
  const s = source(),
    stop = new AbortController(),
    hold = deferred();
  let calls = 0,
    failures = 0;
  forwardWindowWorkspace(
    s.workspace,
    stop.signal,
    async () => {
      calls++;
      await hold.promise;
    },
    () => failures++,
  );
  await turn();
  s.local();
  stop.abort();
  hold.resolve();
  await turn();
  expect(calls).toBe(1);
  expect(failures).toBe(0);
  expect(s.counts()).toEqual([0, 0, 0]);
});
it('a failed observation withdraws subscriptions and does not retry by polling', async () => {
  const s = source(),
    stop = new AbortController();
  let calls = 0,
    failures = 0;
  forwardWindowWorkspace(
    s.workspace,
    stop.signal,
    async () => {
      calls++;
      throw Error('closed channel');
    },
    () => failures++,
  );
  await turn();
  s.local();
  await turn();
  expect(calls).toBe(1);
  expect(failures).toBe(1);
  expect(s.counts()).toEqual([0, 0, 0]);
});
it('an already-aborted owner never subscribes or dispatches', async () => {
  const s = source(),
    stop = new AbortController();
  stop.abort();
  let calls = 0;
  forwardWindowWorkspace(
    s.workspace,
    stop.signal,
    async () => {
      calls++;
    },
    () => {},
  );
  await turn();
  expect(calls).toBe(0);
  expect(s.counts()).toEqual([0, 0, 0]);
});
it('pressure causes stay in the Window while scheduling observes the actual code', () => {
  expect(
    workspaceSchedulingStatus({
      ...status(),
      pressure: { code: 'quota', cause: 'private diagnostic' },
    }).pressure,
  ).toEqual({ code: 'quota' });
});
it('real durability awaits the Window RPC even while an observation says durable', async () => {
  const hold = deferred(),
    stop = new AbortController();
  let calls = 0;
  const channel = {
    request: async (method: string) => {
      expect(method).toBe('workspaceDurable');
      calls++;
      await hold.promise;
    },
  } as unknown as WorkerChannel;
  const p = createWorkerWorkspacePort(channel, status(), stop.signal, async () => {});
  let done = false;
  const w = p.workspace.whenDurable().then(() => {
    done = true;
  });
  await turn();
  expect(calls).toBe(1);
  expect(done).toBe(false);
  hold.resolve();
  await w;
  expect(done).toBe(true);
});
it('cancelled durability never returns success and stale hints cannot revive it', async () => {
  const hold = deferred(),
    stop = new AbortController(),
    channel = { request: async () => hold.promise } as unknown as WorkerChannel;
  const p = createWorkerWorkspacePort(channel, status(), stop.signal, async () => {});
  const w = p.workspace.whenDurable();
  stop.abort();
  hold.resolve();
  await expect(w).rejects.toThrow('observation changed');
  expect(p.workspace.status.state).toBe('closed');
  expect(() => p.update({ sequence: 1, status: status(), changed: false, local: false })).toThrow();
});
it('delivers status, document changes and local hints to their distinct actual subscribers', () => {
  const stop = new AbortController(),
    p = createWorkerWorkspacePort(
      { request: async () => {} } as unknown as WorkerChannel,
      status(),
      stop.signal,
      async () => {},
    );
  let changed = 0,
    local = 0,
    states = 0;
  p.workspace.subscribe(() => changed++);
  listenToLocalWorkspaceChanges(p.workspace, () => local++);
  p.workspace.onStatus(() => states++);
  p.update({ sequence: 1, status: status(2), changed: true, local: false });
  expect([states, changed, local]).toEqual([1, 1, 0]);
  p.update({ sequence: 2, status: status(3), changed: false, local: true });
  expect([states, changed, local]).toEqual([2, 1, 1]);
  expect(p.workspace.status.revision).toBe(3);
  expect(p.workspace.outgoing).toBeUndefined();
});
it('replayed, skipped, malformed or accessor hints grant no state change', () => {
  const stop = new AbortController(),
    p = createWorkerWorkspacePort(
      { request: async () => {} } as unknown as WorkerChannel,
      status(),
      stop.signal,
      async () => {},
    );
  const h = { sequence: 1, status: status(1), changed: false, local: false };
  p.update(h);
  expect(() => p.update(h)).toThrow();
  expect(() => p.update({ ...h, sequence: 3 })).toThrow();
  let touched = false;
  expect(() =>
    p.update({
      ...h,
      sequence: 2,
      status: {
        get state() {
          touched = true;
          return 'active';
        },
      },
    }),
  ).toThrow();
  expect(touched).toBe(false);
  expect(p.workspace.status.revision).toBe(1);
  for (const s of [
    { ...status(), pendingItems: -1 },
    { ...status(), durable: 'yes' },
    { ...status(), maintenance: undefined },
    { ...status(), pressure: { code: 'x', cause: 'must not cross' } },
  ])
    expect(() => p.update({ ...h, sequence: 2, status: s })).toThrow();
});
it('closing is idempotent and waits for the actual native close', async () => {
  const hold = deferred(),
    stop = new AbortController();
  let closes = 0;
  const p = createWorkerWorkspacePort(
    { request: async () => {} } as unknown as WorkerChannel,
    status(),
    stop.signal,
    async () => {
      closes++;
      await hold.promise;
    },
  );
  let closed = false;
  const a = p.workspace.close().then(() => {
      closed = true;
    }),
    b = p.workspace.close();
  await turn();
  expect(closes).toBe(1);
  expect(closed).toBe(false);
  hold.resolve();
  await Promise.all([a, b]);
  expect(closed).toBe(true);
});
it('the Page local-change adapter retains byte ownership and does not invent update frames', () => {
  let listener: ((b: Uint8Array<ArrayBuffer>) => void) | undefined,
    called = 0;
  const w = {
    ...source().workspace,
    outgoing: (fn: (b: Uint8Array<ArrayBuffer>) => void) => {
      listener = fn;
      return () => {
        listener = undefined;
      };
    },
  };
  const stop = listenToLocalWorkspaceChanges(w, () => called++);
  const b = new Uint8Array([4, 8]);
  listener!(b);
  expect([...b]).toEqual([0, 0]);
  expect(called).toBe(1);
  stop();
  expect(listener).toBeUndefined();
});
