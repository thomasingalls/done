// @vitest-environment node
import { expect, it, vi } from 'vitest';
import {
  createWorkerActivityForwarder,
  workerActivityKinds,
  type WorkerActivityMessage,
} from '../src/crdt/workerActivity';
import { pageRuntimePorts } from '../src/crdt/runtimePorts';
function fixture() {
  const stop = new AbortController();
  const sent: WorkerActivityMessage[] = [];
  const deferred: { resolve(): void; reject(): void }[] = [];
  const state = { visibility: 'visible' as DocumentVisibilityState, online: true };
  const failed = vi.fn();
  const forwarder = createWorkerActivityForwarder({
    signal: stop.signal,
    snapshot: () => state,
    failed,
    send: (message) => {
      sent.push(message);
      return new Promise<void>((resolve, reject) =>
        deferred.push({ resolve, reject: () => reject(Error('transport refused')) }),
      );
    },
  });
  return { stop, sent, deferred, state, failed, ...forwarder };
}
it('ten thousand input events occupy one request while the worker is busy', async () => {
  const f = fixture();
  for (let i = 0; i < 10000; i++) f.notify('beforeinput');
  expect(f.sent).toEqual([{ kind: 'beforeinput', visibility: 'visible', online: true }]);
  f.deferred[0]!.resolve();
  await vi.waitFor(() => expect(f.sent).toHaveLength(2));
  f.deferred[1]!.resolve();
  await Promise.resolve();
  expect(f.sent).toHaveLength(2);
  f.close();
});
it('coalesced transitions retain observed order and finish with the latest actual state', async () => {
  const f = fixture();
  f.notify('beforeinput');
  f.state.visibility = 'hidden';
  f.notify('visibilitychange');
  f.notify('freeze');
  f.state.online = false;
  f.notify('offline');
  f.state.visibility = 'visible';
  f.notify('resume');
  f.notify('visibilitychange');
  f.state.online = true;
  f.notify('online');
  f.notify('beforeinput');
  for (let i = 0; i < 7; i++) {
    f.deferred[i]!.resolve();
    await vi.waitFor(() => expect(f.sent).toHaveLength(i + 2));
  }
  expect(f.sent.map((m) => m.kind)).toEqual([
    'beforeinput',
    'visibilitychange',
    'freeze',
    'offline',
    'resume',
    'visibilitychange',
    'online',
    'beforeinput',
  ]);
  expect(f.sent.at(-1)).toEqual({ kind: 'beforeinput', visibility: 'visible', online: true });
  expect(f.sent[1]!.visibility).toBe('hidden');
  expect(f.sent[3]!.online).toBe(false);
  f.close();
});
it('every kind/state combination has bounded retained credit even after repeated cycles', async () => {
  const f = fixture();
  f.notify('keydown');
  for (let i = 0; i < 100; i++)
    for (const visibility of ['visible', 'hidden'] as const)
      for (const online of [false, true])
        for (const kind of workerActivityKinds) {
          f.state.visibility = visibility;
          f.state.online = online;
          f.notify(kind);
        }
  const bound = workerActivityKinds.length * 4;
  for (let i = 0; i < bound; i++) {
    f.deferred[i]!.resolve();
    await vi.waitFor(() => expect(f.sent).toHaveLength(i + 2));
  }
  f.deferred[bound]!.resolve();
  await Promise.resolve();
  expect(f.sent).toHaveLength(bound + 1);
  f.close();
});
it('abort clears queued activity and late completion cannot revive forwarding', async () => {
  const f = fixture();
  f.notify('keydown');
  f.notify('beforeinput');
  f.stop.abort();
  f.deferred[0]!.resolve();
  await Promise.resolve();
  f.notify('resume');
  expect(f.sent).toHaveLength(1);
  expect(f.failed).not.toHaveBeenCalled();
});
it('a rejected call closes the forwarding lifetime and reports failure exactly once', async () => {
  const f = fixture();
  f.notify('keydown');
  f.notify('freeze');
  f.deferred[0]!.reject();
  await vi.waitFor(() => expect(f.failed).toHaveBeenCalledOnce());
  f.notify('resume');
  expect(f.sent).toHaveLength(1);
});
it('snapshots are detached from later mutable Window state', () => {
  const f = fixture();
  f.notify('keydown');
  f.state.online = false;
  f.state.visibility = 'hidden';
  expect(f.sent[0]).toEqual({ kind: 'keydown', visibility: 'visible', online: true });
  f.close();
});
it('fixed page activity ports are inert in Node without inventing an owner or listener target', () => {
  expect(pageRuntimePorts.activity.visibilityState()).toBe('visible');
  const listener = vi.fn();
  const stop = pageRuntimePorts.activity.onDocument('visibilitychange', listener);
  stop();
  const shown = pageRuntimePorts.activity.onPageShow(listener);
  shown();
  expect(listener).not.toHaveBeenCalled();
});

it('real MessagePort activity leaves seven request credits available to owner operations', async () => {
  const { createWorkerChannel } = await import('../src/crdt/workerChannel');
  const { port1, port2 } = new MessageChannel();
  const waiting: (() => void)[] = [];
  let releaseActivity!: () => void;
  let first = true;
  const left = createWorkerChannel(port1, '12'.repeat(16), {}, () => {});
  const right = createWorkerChannel(
    port2,
    '12'.repeat(16),
    {
      activity: () =>
        first
          ? ((first = false),
            new Promise<void>((r) => {
              releaseActivity = r;
            }))
          : undefined,
      ownerOperation: () => new Promise<void>((r) => waiting.push(r)),
    },
    () => {},
  );
  const stop = new AbortController();
  const failed = vi.fn();
  const forwarder = createWorkerActivityForwarder({
    signal: stop.signal,
    snapshot: () => ({ visibility: 'visible', online: true }),
    send: (value) => left.request('activity', value),
    failed,
  });
  try {
    for (let i = 0; i < 10000; i++) forwarder.notify('beforeinput');
    expect(left.pending).toBe(1);
    const work = Array.from({ length: 7 }, () => left.request('ownerOperation'));
    expect(left.pending).toBe(8);
    await expect(left.request('ownerOperation')).rejects.toMatchObject({ code: 'queue-full' });
    await vi.waitFor(() => expect(waiting).toHaveLength(7));
    for (const release of waiting) release();
    await Promise.all(work);
    releaseActivity();
    await vi.waitFor(() => expect(left.pending).toBe(0));
    expect(failed).not.toHaveBeenCalled();
  } finally {
    forwarder.close();
    left.close();
    right.close();
  }
});
