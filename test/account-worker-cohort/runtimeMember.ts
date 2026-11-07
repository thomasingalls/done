import { createWorkerChannel } from '../../src/crdt/workerChannel';
import { installAccountWorkerRuntime } from '../../src/crdt/accountWorkerRuntime';
import { pageRuntimePorts } from '../../src/crdt/runtimePorts';
self.addEventListener('message', (event) => {
  const m = event.data;
  if (m?.kind !== 'start') return;
  let release!: () => void, releaseFence!: () => void;
  const done = new Promise<void>((r) => (release = r)),
    seen: string[] = [];
  let activityHold: Promise<void> | undefined, releaseActivity: (() => void) | undefined;
  const channel = createWorkerChannel(
    m.port,
    m.ticket.incarnation,
    {
      read: () => runtime.journal.read('scoped.'),
      peek: () => runtime.journal.pinned('scoped.'),
      ready: () => runtime.finishOpening(),
      holdActivity: () => {
        activityHold = new Promise<void>((resolve) => {
          releaseActivity = resolve;
        });
      },
      releaseActivity: () => {
        releaseActivity?.();
        activityHold = undefined;
      },
      activity: async (input) => {
        await activityHold;
        const { kind, ...state } = input as {
          kind: string;
          visibility: DocumentVisibilityState;
          online: boolean;
        };
        runtime.update(state, kind);
        return {
          visibility: pageRuntimePorts.activity.visibilityState(),
          online: pageRuntimePorts.activity.online(),
          seen: [...seen],
        };
      },
      fence: () =>
        runtime.withFence(1, 'scoped.', async () => {
          self.postMessage({ kind: 'fenced' });
          await new Promise<void>((r) => (releaseFence = r));
          return runtime.journal.pinned('scoped.');
        }),
      releaseFence: () => releaseFence?.(),
    },
    () => {
      runtime.close();
      releaseFence?.();
      releaseActivity?.();
      release();
    },
  );
  const runtime = installAccountWorkerRuntime(m.ticket, channel, {
    visibility: 'visible',
    online: true,
  });
  for (const kind of ['visibilitychange', 'beforeinput', 'freeze', 'resume'] as const)
    pageRuntimePorts.activity.onDocument(kind, () => seen.push(kind));
  void runtime.join
    .request(
      'done/slot-writer/' + JSON.stringify(m.ticket.slotId),
      { mode: 'shared', signal: runtime.signal },
      async () => {
        self.postMessage({ kind: 'active' });
        await done;
      },
    )
    .then(
      () => self.postMessage({ kind: 'closed' }),
      () => self.postMessage({ kind: 'refused' }),
    );
});
