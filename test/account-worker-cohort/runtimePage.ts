import { openWindowAccountCohort } from '../../src/crdt/accountWorkerCohort';
import { createWorkerChannel } from '../../src/crdt/workerChannel';
import { installAccountWorkerRuntime } from '../../src/crdt/accountWorkerRuntime';
let data: [string, string][] = [];
let member: Worker,
  channel: ReturnType<typeof createWorkerChannel>,
  fence: Promise<unknown>,
  fenced: () => void = () => {},
  closed: () => void = () => {};
const removed = new Promise<void>((r) => (closed = r));
const root = await openWindowAccountCohort('runtime-slot', async () => {
  channel.close();
  await removed;
  member.terminate();
});
member = new Worker(new URL('./runtimeMember.ts', import.meta.url), { type: 'module' });
const pair = new MessageChannel();
let id = 0;
const snapshots = new Map<number, [string, string][]>();
channel = createWorkerChannel(
  pair.port1,
  root.ticket.incarnation,
  {
    journalBegin: () => {
      snapshots.set(
        ++id,
        data.map((v) => [...v] as [string, string]),
      );
      return id;
    },
    journalPage: (input) => {
      const value = snapshots.get((input as { id: number }).id)!;
      return {
        entries: value,
        characters: value.reduce((n, [k, v]) => n + k.length + v.length, 0),
        done: true,
      };
    },
    journalFinish: (input) => snapshots.delete((input as { id: number }).id),
  },
  () => {
    if (root.state === 'active') void root.close();
  },
);
const ready = new Promise<void>((resolve) =>
  member.addEventListener('message', (e) => {
    if (e.data.kind === 'active') resolve();
    if (['closed', 'refused'].includes(e.data.kind)) closed();
    if (e.data.kind === 'fenced') fenced();
  }),
);
member.postMessage({ kind: 'start', ticket: root.ticket, port: pair.port2 }, [pair.port2]);
await ready;
(window as any).runtimeLab = {
  read: () => channel.request('read'),
  peek: () => channel.request('peek'),
  ready: () => channel.request('ready'),
  data: (value: [string, string][]) => {
    data = value;
  },
  async fence() {
    const started = new Promise<void>((r) => (fenced = r));
    fence = channel.request('fence');
    await started;
  },
  async release() {
    await channel.request('releaseFence');
    await fence;
  },
  activity: (kind: string, visibility: DocumentVisibilityState, online: boolean) =>
    channel.request('activity', { kind, visibility, online }),
  pageInstallerRefused() {
    try {
      installAccountWorkerRuntime(root.ticket, channel, { visibility: 'visible', online: true });
      return false;
    } catch {
      return true;
    }
  },
  close: () => root.close(),
};
