import type { NetworkLogin } from '../account/networkLogin';
import { createAccountWorkerReceive } from './accountWorkerReceive';
import { captureWorkerLocalBaselineCommand } from './workerLocalBaseline';
import { journalPrefix } from './journalCodec';
import type { AccountMirrorOpening } from './windowAccountMirror';
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
const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  void promise.catch(() => {});
  return { promise, resolve, reject };
};
type BaselineResult = Awaited<ReturnType<NonNullable<Owner['installLocalBaseline']>>>;
type ContextResult = BaselineResult | Awaited<ReturnType<Owner['refreshAuthority']>>;
type BaselineReply = { id: number; result: ContextResult; opening: AccountMirrorOpening };
type BaselineFlight = {
  id: number;
  phase: 'working' | 'waiting' | 'finishing';
  ready: ReturnType<typeof deferred<BaselineReply>>;
  ack: ReturnType<typeof deferred<void>>;
  work: Promise<void>;
  material?: AccountMirrorOpening;
};
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
  let login: NetworkLogin | undefined;
  let owner: Owner | undefined,
    opening: Promise<unknown> | undefined,
    retiring = false,
    streamId = 0,
    closing: Promise<void> | undefined;
  let stream: ReturnType<typeof createAccountRecoveryStream> | undefined;
  let channel!: WorkerChannel, prefix: string | undefined, baseline: BaselineFlight | undefined;
  let baselineSequence = 0;
  const close = () => {
    if (closing) return closing;
    retiring = true;
    closing = (async () => {
      const baselineWork = baseline?.work;
      runtime.close();
      login?.close();
      stream?.close();
      stream = undefined;
      await opening?.catch(() => {});
      await baselineWork?.catch(() => {});
      await receives.close();
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
  const startContext = (id: number, operation: () => Promise<ContextResult>) => {
    live();
    if (!owner || !prefix || baseline) throw Error('Worker context operation unavailable');
    if (!Number.isSafeInteger(id) || id !== baselineSequence + 1)
      throw Error('Worker local-history operation changed');
    const state: BaselineFlight = {
      id: id,
      phase: 'working',
      ready: deferred<BaselineReply>(),
      ack: deferred<void>(),
      work: Promise.resolve(),
    };
    baselineSequence = id;
    baseline = state;
    const cancel = () => {
      state.ready.reject(Error('Worker local-history operation closed'));
      state.ack.reject(Error('Worker local-history acknowledgment closed'));
    };
    runtime.signal.addEventListener('abort', cancel, { once: true });
    state.work = Promise.resolve().then(async () => {
      try {
        await runtime.withFence(state.id, prefix!, async () => {
          live();
          const result = await operation();
          live();
          // The mutation task has settled. Its fresh final task copies narrow context directly,
          // never queues copyMirrorOpening behind itself, and stays held through Window rebinding.
          const finish = owner!.preparedPromotion();
          if (!finish.acknowledgedWithContext) throw Error('Worker context handoff unavailable');
          await finish.acknowledgedWithContext(async (context) => {
            const material: AccountMirrorOpening = {
              ...context,
              incarnation: m.ticket.incarnation,
            };
            state.material = material;
            live();
            state.phase = 'waiting';
            state.ready.resolve({ id: state.id, result, opening: material });
            await state.ack.promise;
            live();
          });
        });
      } catch (cause) {
        state.ready.reject(cause);
        if (state.phase !== 'working') channel.close();
        throw cause;
      } finally {
        runtime.signal.removeEventListener('abort', cancel);
        eraseWorkerMessage(state.material);
        if (baseline === state) baseline = undefined;
      }
    });
    void state.work.catch(() => {});
    return state.ready.promise;
  };
  channel = createWorkerChannel(
    m.port,
    m.ticket.incarnation,
    {
      receiveRequest: () => receives.methods.receiveRequest(),
      receiveFetch: (input) => receives.methods.receiveFetch(input),
      receiveBegin: (input) => receives.methods.receiveBegin(input),
      receiveInput: (input) => receives.methods.receiveInput(input),
      receiveVerify: (input) => receives.methods.receiveVerify(input),
      receiveOutput: (input) => receives.methods.receiveOutput(input),
      receiveFinish: (input) => receives.methods.receiveFinish(input),
      open: (input) => {
        if (opening) throw Error('Account worker already opened');
        opening = (async () => {
          const options = input as Omit<
            AccountWorkspaceOptions,
            'assertPasskey' | 'signal' | 'networkLogin' | 'today'
          > & { joined: boolean; networkSessions?: boolean };
          if (options.slotId !== m.ticket.slotId) throw Error('Account worker slot changed');
          if (options.networkSessions !== undefined && typeof options.networkSessions !== 'boolean')
            throw Error('Invalid Worker connection mode');
          if (options.networkSessions) {
            const { NetworkLogin } = await import('../account/networkLogin');
            login = new NetworkLogin(options.pin, options.slotId);
          }
          const { openAccountWorkerStore } = await import('./accountReceive');
          owner = await openAccountWorkerStore(
            {
              ...options,
              assertPasskey: passkey,
              signal: runtime.signal,
              ...(login ? { networkLogin: login } : {}),
            },
            options.identity.id,
            options.joined,
          );
          live();
          const material = await owner.copyMirrorOpening();
          prefix = journalPrefix(material.dbName);
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
      baselineStatus: async () => {
        live();
        if (!owner) throw Error('Account owner unavailable');
        await owner.api.status();
        live();
        const hint = owner.localRetentionHint();
        return hint ? { revision: hint.revision, records: hint.records } : null;
      },
      baselineStart: (input) => {
        live();
        if (
          !owner?.installLocalBaseline ||
          !prefix ||
          baseline ||
          !input ||
          typeof input !== 'object' ||
          Object.keys(input).sort().join(',') !== 'command,id'
        )
          throw Error('Worker local-history operation unavailable');
        const value = input as { id: number; command: unknown };
        const command = captureWorkerLocalBaselineCommand(value.command);
        return startContext(value.id, () =>
          owner!.installLocalBaseline!(command.expectedRevision, command.kind === 'advance'),
        );
      },
      authorityStart: (input) => {
        live();
        if (
          !owner?.access ||
          !input ||
          typeof input !== 'object' ||
          Object.keys(input).join(',') !== 'id'
        )
          throw Error('Worker authority refresh unavailable');
        return startContext((input as { id: number }).id, () =>
          owner!.refreshAuthority(owner!.access!),
        );
      },
      baselineFinish: async (input) => {
        live();
        if (
          !input ||
          typeof input !== 'object' ||
          Object.keys(input).join(',') !== 'id' ||
          !baseline ||
          baseline.phase !== 'waiting' ||
          (input as { id: number }).id !== baseline.id
        )
          throw Error('Worker local-history acknowledgment changed');
        const state = baseline;
        state.phase = 'finishing';
        state.ack.resolve();
        await state.work;
        live();
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
  const receives = createAccountWorkerReceive(() => owner, channel, live);
  const runtime = installAccountWorkerRuntime(m.ticket, channel, m.activity);
  self.postMessage({ v: 1, kind: 'accountBooted', owner: m.ticket.incarnation });
});
