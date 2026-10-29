/** Local dedicated owner: original retained identity/census/factor/crypto and native shared phases. */
import { createWorkerChannel, eraseWorkerMessage, type WorkerChannel } from './workerChannel';
import { installLocalWorkerRuntime, type WorkerActivity } from './accountWorkerRuntime';
import { createWorkerRecoveryOwner } from './workerRecoveryOwner';
import { followWorkerNativeLifetime } from './workerNativeLifetime';
import type { AccountWorkerTicket } from './nativeCoordination';
import type { WorkspaceActorIdentity } from './actors';
import type { ContentInput } from './contentRecord';
import type { openLocalWorkerStore } from './localGenesis';

type Opened = Extract<Awaited<ReturnType<typeof openLocalWorkerStore>>, { kind: 'ready' }>;
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
  if (m?.v !== 1 || m.kind !== 'localBootstrap' || !(m.port instanceof MessagePort)) return;
  initialized = true;
  let channel!: WorkerChannel,
    native: Awaited<ReturnType<typeof installLocalWorkerRuntime>> | undefined,
    owner: Opened | undefined,
    opening: Promise<unknown> | undefined,
    bootstrap: Promise<void> | undefined,
    closing: Promise<void> | undefined,
    follower: ReturnType<typeof followWorkerNativeLifetime> | undefined;
  const live = () => {
    if (!native || closing) throw Error('Local Worker unavailable');
    native.runtime.assertCurrent();
  };
  const close = () => {
    if (closing) return closing;
    let resolve!: () => void, reject!: (cause: unknown) => void;
    closing = new Promise<void>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    channel.close();
    native?.runtime.close();
    recovery.close();
    void (async () => {
      await bootstrap?.catch(() => {});
      await opening?.catch(() => {});
      await owner?.journal.close();
      owner = undefined;
      follower?.close();
      await native?.root.close();
    })().then(resolve, reject);
    return closing;
  };
  const recovery = createWorkerRecoveryOwner(async () => {
    live();
    if (!owner) throw Error('Local Worker not opened');
    return owner.journal.loadRecovery();
  }, live);
  channel = createWorkerChannel(
    m.port,
    m.ticket.incarnation,
    {
      open(input) {
        live();
        if (opening) throw Error('Local Worker already opened');
        opening = (async () => {
          const options = input as {
            slotId: string;
            code: string;
            identity: WorkspaceActorIdentity;
          };
          if (options.slotId !== m.ticket.slotId || typeof options.code !== 'string')
            throw Error('Local scope changed');
          const { openLocalWorkerStore } = await import('./localGenesis');
          const result = await openLocalWorkerStore(options.slotId, options.code, {
            identity: options.identity,
            signal: native!.runtime.signal,
            validateReceive: () => {
              throw Error('Network delivery is not enabled for Local');
            },
          });
          if (result.kind !== 'ready') return result;
          owner = result;
          live();
          follower = followWorkerNativeLifetime(owner.journal, native!.runtime.signal, () =>
            channel.close(),
          );
          const material = await owner.copyOpening();
          try {
            live();
            return { kind: 'ready', opening: { ...material, incarnation: m.ticket.incarnation } };
          } catch (cause) {
            eraseWorkerMessage(material);
            throw cause;
          }
        })();
        return opening;
      },
      ready() {
        live();
        if (!owner) throw Error('Local Worker not opened');
        native!.runtime.finishOpening();
      },
      beginRecovery: () => recovery.begin(),
      recoveryPage: (input) => recovery.page(input),
      finishRecovery: (input) => recovery.finish(input),
      async appendBatch(input) {
        live();
        if (!owner) throw Error('Local Worker not opened');
        if (!Array.isArray(input) || input.some((v) => !v || v.kind !== 'update'))
          throw Error('Local admission accepts update records only');
        const result = await owner.journal.appendBatch(input as ContentInput[]);
        live();
        return result;
      },
      async flushJournal() {
        live();
        if (!owner) throw Error('Local Worker not opened');
        const result = await owner.journal.flushJournal();
        live();
        return result;
      },
      activity(input) {
        live();
        const value = input as WorkerActivity & { kind: string };
        native!.runtime.update(value, value.kind);
      },
    },
    () => {
      void close().then(
        () =>
          self.postMessage({ v: 1, kind: 'localClosed', owner: m.ticket.incarnation, ok: true }),
        () =>
          self.postMessage({ v: 1, kind: 'localClosed', owner: m.ticket.incarnation, ok: false }),
      );
    },
  );
  bootstrap = (async () => {
    native = await installLocalWorkerRuntime(m.ticket, channel, m.activity);
    native.root.beforeRelease(async () => {
      await opening?.catch(() => {});
      await owner?.journal.close();
    });
    await channel.request('localBind');
    live();
    self.postMessage({ v: 1, kind: 'localBooted', owner: m.ticket.incarnation });
  })();
  void bootstrap.catch(() => channel.close());
});
