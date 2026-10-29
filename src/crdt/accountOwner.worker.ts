/** Dedicated account owner entry. Ordinary native/account verification remains inside this worker. */
import { createWorkerChannel, eraseWorkerMessage, type WorkerChannel } from './workerChannel';
import { installAccountWorkerRuntime, type WorkerActivity } from './accountWorkerRuntime';
import type { AccountWorkerTicket } from './accountWorkerCohort';
import type { AccountWorkspaceOptions } from './accountWorkspace';
import type { ContentInput } from './contentRecord';
import type { LocalPasskeyRequest } from './accountAccess';
import { copyAccountMirrorRecovery } from './accountMirrorRecovery';
import { createAccountRecoveryStream } from './accountWorkerRecoveryStream';
import type { SlotAssertion } from '../account/slotUnlock';

type Owner = Awaited<ReturnType<(typeof import('./accountReceive'))['openAccountWorkerStore']>>;
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
  if (m?.v !== 1 || m.kind !== 'accountBootstrap' || !(m.port instanceof MessagePort)) return;
  initialized = true;
  let owner: Owner | undefined,
    opening: Promise<unknown> | undefined,
    retiring = false,
    streamId = 0,
    closing: Promise<void> | undefined;
  let stream: ReturnType<typeof createAccountRecoveryStream> | undefined;
  let channel!: WorkerChannel;
  const close = () => {
    if (closing) return closing;
    retiring = true;
    closing = (async () => {
      runtime.close();
      stream?.close();
      stream = undefined;
      await opening?.catch(() => {});
      await owner?.carrier.close();
      owner = undefined;
    })();
    return closing;
  };
  const live = () => {
    runtime.assertCurrent();
    if (retiring) throw Error('Account worker is closing');
  };
  const passkey = async (request: LocalPasskeyRequest) => {
    live();
    const value = await channel.request<SlotAssertion>('passkey', {
      rpId: request.rpId,
      credentialId: request.credentialId,
      challenge: request.challenge,
    });
    live();
    return value;
  };
  channel = createWorkerChannel(
    m.port,
    m.ticket.incarnation,
    {
      open: (input) => {
        if (opening) throw Error('Account worker already opened');
        opening = (async () => {
          const options = input as Omit<
            AccountWorkspaceOptions,
            'assertPasskey' | 'signal' | 'networkLogin' | 'today'
          > & { joined: boolean };
          if (options.slotId !== m.ticket.slotId) throw Error('Account worker slot changed');
          const { openAccountWorkerStore } = await import('./accountReceive');
          owner = await openAccountWorkerStore(
            { ...options, assertPasskey: passkey, signal: runtime.signal },
            options.identity.id,
            options.joined,
          );
          live();
          const material = await owner.copyMirrorOpening();
          try {
            live();
            return {
              account: { ...owner.account },
              deviceId: owner.deviceId,
              opening: { ...material, incarnation: m.ticket.incarnation },
            };
          } catch (cause) {
            eraseWorkerMessage(material);
            throw cause;
          }
        })();
        return opening;
      },
      beginRecovery: async () => {
        live();
        if (!owner || stream) throw Error('Recovery stream unavailable');
        const recovery = await owner.carrier.loadRecovery();
        try {
          live();
          stream = createAccountRecoveryStream(copyAccountMirrorRecovery(recovery));
          return { id: ++streamId, ...stream.counts };
        } finally {
          for (const r of [...recovery.records, ...recovery.journal]) r.bytes.fill(0);
        }
      },
      recoveryPage: (input) => {
        live();
        if (!stream || (input as { id: number }).id !== streamId)
          throw Error('Recovery stream changed');
        return stream.next();
      },
      finishRecovery: (input) => {
        live();
        if ((input as { id: number }).id !== streamId) throw Error('Recovery stream changed');
        stream?.close();
        stream = undefined;
      },
      appendBatch: async (input) => {
        live();
        if (!owner) throw Error('Account owner unavailable');
        const value = await owner.carrier.appendBatch(input as ContentInput[]);
        live();
        return value;
      },
      flushJournal: async () => {
        live();
        if (!owner) throw Error('Account owner unavailable');
        const value = await owner.carrier.flushJournal();
        live();
        return value;
      },
      status: async () => {
        live();
        if (!owner) throw Error('Account owner unavailable');
        const value = await owner.api.status();
        live();
        return value;
      },
      activity: (input) => {
        const { kind, ...activity } = input as WorkerActivity & { kind: string };
        runtime.update(activity, kind);
      },
      ready: () => runtime.finishOpening(),
      close,
    },
    () => {
      void close().then(
        () =>
          self.postMessage({ v: 1, kind: 'accountClosed', owner: m.ticket.incarnation, ok: true }),
        () =>
          self.postMessage({ v: 1, kind: 'accountClosed', owner: m.ticket.incarnation, ok: false }),
      );
    },
  );
  const runtime = installAccountWorkerRuntime(m.ticket, channel, m.activity);
  self.postMessage({ v: 1, kind: 'accountBooted', owner: m.ticket.incarnation });
});
