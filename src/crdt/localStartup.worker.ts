/** Native Local startup/enrollment commands. Native protection; no clear, application doc or network owner. */
import { createWorkerAccountHandoff } from './workerAccountHandoff';
import { createWorkerChannel, eraseWorkerMessage, type WorkerChannel } from './workerChannel';
import { openCeremonyWorkerLifetime } from './ceremonyWorkerLifetime';
import { protectLocalWorkspace } from './localProtection';
import { installCeremonyEnvironment } from './ceremonyEnvironment';
import { protectionEnvironment, installProtectionEnvironment } from './protectionEnvironment';
import { inspectLocalStartup, listLocalWorkspaces, resumeLocalGenesis } from './localGenesis';
import { createWorkerLocalGenesis } from './workerLocalGenesis';
import { StartupError } from './startupState';
import { openWriteSession } from './writeSession';
import { readLocalClaim } from './localGenesisRecord';
import { automaticCode } from './automaticOpening';
import { startupRefusal } from './ownedStartup';
import type { AccountWorkerTicket } from './nativeCoordination';
import type { WorkerActivity } from './accountWorkerRuntime';
let initialized = false;
let handoff: ReturnType<typeof createWorkerAccountHandoff> | undefined;
self.addEventListener('message', (event: MessageEvent) => {
  if (initialized) {
    if (handoff?.accept(event.data)) return;
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
    busy = false,
    preparingHandoff = false,
    genesis: ReturnType<typeof createWorkerLocalGenesis> | undefined;
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
      prepareHandoff: async (input) => {
        live();
        const nonce = (input as { nonce: string })?.nonce;
        if (busy || typeof nonce !== 'string' || !/^[a-f0-9]{32}$/.test(nonce))
          throw Error('Startup handoff unavailable');
        preparingHandoff = true;
        try {
          return await handoff!.prepare(nonce);
        } catch (cause) {
          preparingHandoff = false;
          channel.close();
          throw cause;
        }
      },
      inspect: () => run(() => inspectLocalStartup(m.ticket.slotId, { signal: root!.signal })),
      protect: (input) =>
        run(async () => {
          const value = input as { id: number; code: string };
          if (typeof value.code !== 'string') throw Error('Protection factor missing');
          return protectionEnvironment()!.withProtection(value.id, async () => {
            await protectLocalWorkspace(m.ticket.slotId, value.code, { signal: root!.signal });
            return { kind: 'protected' };
          });
        }).catch((cause: unknown) => {
          if (cause instanceof StartupError) return cause.disposition;
          throw cause;
        }),
      beginGenesis: (input) =>
        run(async () => genesis!.begin(input as { id: number; automatic: boolean })),
      confirmGenesis: (input) =>
        run(() => genesis!.confirm(input as { id: number; code: string })).catch(
          (cause: unknown) => {
            if (cause instanceof StartupError) return cause.disposition;
            throw cause;
          },
        ),
      // Cancellation must reach the original enrollment even while confirmation owns native work.
      cancelGenesis: (input) => {
        live();
        genesis!.cancel(input as { id: number });
      },
      resumeGenesis: (input) =>
        run(async () => {
          const code = (input as { code: string }).code;
          if (typeof code !== 'string') throw Error('Local factor missing');
          return resumeLocalGenesis(m.ticket.slotId, code, { signal: root!.signal });
        }).catch((cause: unknown) => {
          if (cause instanceof StartupError) return cause.disposition;
          throw cause;
        }),
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
    installProtectionEnvironment(root, channel);
    genesis = createWorkerLocalGenesis(m.ticket.slotId, root.signal);
    root.beforeRelease(() => genesis!.close());
    handoff = createWorkerAccountHandoff(root, channel);
    root.signal.addEventListener(
      'abort',
      () => {
        if (!preparingHandoff) channel.close();
      },
      { once: true },
    );
    root.assertCurrent();
    self.postMessage({ v: 1, kind: 'startupBooted', owner: m.ticket.incarnation });
  })();
  void bootstrap.catch(() => channel.close());
});
