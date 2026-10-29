/** Read-only Local startup commands. No genesis, protection, clear, application doc or network owner. */
import { createWorkerChannel, eraseWorkerMessage, type WorkerChannel } from './workerChannel';
import { openCeremonyWorkerLifetime } from './ceremonyWorkerLifetime';
import { installCeremonyEnvironment } from './ceremonyEnvironment';
import { inspectLocalStartup, listLocalWorkspaces } from './localGenesis';
import { openWriteSession } from './writeSession';
import { readLocalClaim } from './localGenesisRecord';
import { automaticCode } from './automaticOpening';
import { startupRefusal } from './ownedStartup';
import type { AccountWorkerTicket } from './nativeCoordination';
import type { WorkerActivity } from './accountWorkerRuntime';
let initialized = false;
self.addEventListener('message', (event: MessageEvent) => {
  if (initialized) {
    eraseWorkerMessage(event.data);
    return;
  }
  const m = event.data as {
    v: number;
    kind: string;
    ticket: AccountWorkerTicket;
    port: MessagePort;
    activity: WorkerActivity;
  };
  if (m?.v !== 1 || m.kind !== 'localStartupBootstrap' || !(m.port instanceof MessagePort)) return;
  initialized = true;
  let channel!: WorkerChannel,
    root: Awaited<ReturnType<typeof openCeremonyWorkerLifetime>> | undefined,
    bootstrap: Promise<void> | undefined,
    closing: Promise<void> | undefined,
    busy = false;
  const live = () => {
    if (!root || closing) throw Error('Local startup Worker unavailable');
    root.assertCurrent();
  };
  const close = () => {
    if (closing) return closing;
    let resolve!: () => void, reject!: (cause: unknown) => void;
    closing = new Promise<void>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    channel.close();
    void (async () => {
      await bootstrap?.catch(() => {});
      await root?.close();
    })().then(resolve, reject);
    return closing;
  };
  const run = async <T>(operation: () => Promise<T>) => {
    live();
    if (busy) throw Error('Local startup command already active');
    busy = true;
    try {
      return await root!.run(operation);
    } finally {
      busy = false;
    }
  };
  channel = createWorkerChannel(
    m.port,
    m.ticket.incarnation,
    {
      inspect: () => run(() => inspectLocalStartup(m.ticket.slotId, { signal: root!.signal })),
      list: (input) =>
        run(async () => {
          const code = (input as { code: string }).code;
          if (typeof code !== 'string') throw Error('Local factor missing');
          const routes = await listLocalWorkspaces(m.ticket.slotId, code, { signal: root!.signal });
          return { kind: 'ready', routes };
        }).catch((cause: unknown) => startupRefusal(cause, root!.signal)),
      automatic: () =>
        run(async () => {
          const session = await openWriteSession(m.ticket.slotId, { signal: root!.signal });
          try {
            const code = await session.run(async (task) => {
              const claim = await readLocalClaim(task, m.ticket.slotId);
              return claim ? automaticCode(task, claim) : null;
            });
            return { kind: 'ready', code };
          } finally {
            await session.close();
          }
        }).catch((cause: unknown) => startupRefusal(cause, root!.signal)),
    },
    () => {
      void close().then(
        () =>
          self.postMessage({ v: 1, kind: 'startupClosed', owner: m.ticket.incarnation, ok: true }),
        () =>
          self.postMessage({ v: 1, kind: 'startupClosed', owner: m.ticket.incarnation, ok: false }),
      );
    },
  );
  bootstrap = (async () => {
    root = await openCeremonyWorkerLifetime(m.ticket);
    installCeremonyEnvironment(root, channel, m.activity);
    root.signal.addEventListener('abort', () => channel.close(), { once: true });
    root.assertCurrent();
    self.postMessage({ v: 1, kind: 'startupBooted', owner: m.ticket.incarnation });
  })();
  void bootstrap.catch(() => channel.close());
});
