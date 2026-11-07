import { openWindowAccountCohort } from '../../src/crdt/accountWorkerCohort';
import {
  openWriteSession,
  withExclusiveSlot,
  requireAccountFormatSessionTask,
  type SessionTask,
  type WriteSession,
} from '../../src/crdt/writeSession';
import { createWorkerChannel } from '../../src/crdt/workerChannel';
let root: Awaited<ReturnType<typeof openWindowAccountCohort>>,
  worker: Worker,
  channel: ReturnType<typeof createWorkerChannel>;
let start: Promise<void>, close: Promise<void>, shared: WriteSession;
let spawned = false,
  ready = false,
  id = 0;
const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
const command = (kind: string) =>
  new Promise<unknown>((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    worker.postMessage({ kind, id });
  });
const api = {
  async pageChecks() {
    let old!: SessionTask;
    const result = (task: SessionTask, slot: string) => {
      try {
        requireAccountFormatSessionTask(task, slot);
        return 'allowed';
      } catch (e) {
        return (e as { code: string }).code;
      }
    };
    const value = await withExclusiveSlot('format-native', async (task) => {
      old = task;
      return {
        original: result(task, 'format-native'),
        copy: result({ ...task }, 'format-native'),
        wrong: result(task, 'other'),
      };
    });
    return { ...value, expired: result(old, 'format-native') };
  },
  async holdShared() {
    shared = await openWriteSession('format-native');
  },
  releaseShared: () => shared.close(),
  start() {
    start = (async () => {
      let stopped!: () => void, active!: () => void, failure!: (e: Error) => void;
      const removed = new Promise<void>((resolve) => {
          stopped = resolve;
        }),
        joined = new Promise<void>((resolve, reject) => {
          active = resolve;
          failure = reject;
        });
      root = await openWindowAccountCohort('format-native', async () => {
        worker.postMessage({ kind: 'stop' });
        await removed;
        channel.close();
        worker.terminate();
      });
      worker = new Worker(new URL('./format-member.ts', import.meta.url), { type: 'module' });
      spawned = true;
      worker.onerror = (event) => failure(Error(event.message));
      worker.onmessage = (event) => {
        const m = event.data;
        if (m.kind === 'active') {
          ready = true;
          active();
        } else if (m.kind === 'closed') stopped();
        else if (m.kind === 'error') {
          const p = pending.get(m.id);
          if (p) {
            pending.delete(m.id);
            p.reject(Error(m.message));
          } else failure(Error(m.message));
        } else if (m.kind === 'reply') {
          pending.get(m.id)?.resolve(m.value);
          pending.delete(m.id);
        }
      };
      const pair = new MessageChannel();
      channel = createWorkerChannel(pair.port1, root.ticket.incarnation, {}, () => {});
      worker.postMessage({ kind: 'start', ticket: root.ticket, port: pair.port2 }, [pair.port2]);
      await joined;
    })();
    void start.catch(() => {});
  },
  started: () => ({ spawned, ready }),
  awaitStart: () => start,
  command,
  beginClose() {
    close = root.close();
  },
  awaitClose: () => close,
  async locks() {
    const q = await navigator.locks.query();
    return {
      held: q.held?.filter((x) => x.name === 'done/slot-writer/"format-native"').map((x) => x.mode),
      pending: q.pending
        ?.filter((x) => x.name === 'done/slot-writer/"format-native"')
        .map((x) => x.mode),
    };
  },
};
(globalThis as any).formatNative = api;
