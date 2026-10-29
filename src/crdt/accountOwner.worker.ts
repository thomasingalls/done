import { createWorkerPasskey } from './workerPasskeyBridge';
import { publishAccountSession, executeAccountSessionCommand } from './accountSessionBridge';
import { followWorkerNativeLifetime } from './workerNativeLifetime';
import { createWorkerAccountComposition } from './workerAccountComposition';
import { eraseCapsule } from './sourceCapture';
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
import { copyAccountMirrorRecovery } from './accountMirrorRecovery';
import { createAccountRecoveryStream } from './accountWorkerRecoveryStream';

type Composed = Awaited<
  ReturnType<(typeof import('./accountReceive'))['openAccountWorkerReceivingWorkspace']>
>;
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
  let session: ReturnType<typeof publishAccountSession> | undefined;
  let nativeLifetime: ReturnType<typeof followWorkerNativeLifetime> | undefined;
  let login: NetworkLogin | undefined,
    composition: Composed | undefined,
    composedBridge: ReturnType<typeof createWorkerAccountComposition> | undefined;
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
    // Publish the memoized promise before abort/close can synchronously reenter this function.
    const completion = deferred<void>();
    closing = completion.promise;
    retiring = true;
    channel.close();
    void (async () => {
      const baselineWork = baseline?.work;
      session?.close();
      runtime.close();
      login?.close();
      stream?.close();
      stream = undefined;
      await opening?.catch(() => {});
      await baselineWork?.catch(() => {});
      await receives.close();
      await composedBridge?.close();
      await owner?.carrier.close();
      owner = undefined;
      nativeLifetime?.close();
    })().then(() => completion.resolve(undefined), completion.reject);
    return closing;
  };
  const live = () => {
    runtime.assertCurrent();
    if (retiring) throw Error('Account worker is closing');
  };
  const bindNativeOwner = (value: Owner) => {
    live();
    if (nativeLifetime || (owner && owner !== value)) throw Error('Worker native owner changed');
    owner = value;
    nativeLifetime = followWorkerNativeLifetime(value.carrier, runtime.signal, () =>
      channel.close(),
    );
    live();
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
      workspaceHint: (input) => {
        if (!composedBridge) throw Error('Worker workspace unavailable');
        return composedBridge.methods.workspaceHint(input);
      },
      workspaceFrames: (input) => {
        if (!composedBridge) throw Error('Worker workspace unavailable');
        return composedBridge.methods.workspaceFrames(input);
      },
      workspaceFinish: (input) => {
        if (!composedBridge) throw Error('Worker workspace unavailable');
        return composedBridge.methods.workspaceFinish(input);
      },
      workspaceCommit: (input) => {
        if (!composedBridge) throw Error('Worker workspace unavailable');
        return composedBridge.methods.workspaceCommit(input);
      },
      compositionLocalHistory: async (input) => {
        live();
        if (!composition) throw Error('Worker composition unavailable');
        const command = captureWorkerLocalBaselineCommand(input);
        const operation =
          command.expectedRevision === undefined
            ? composition.installLocalBaseline
            : command.kind === 'advance'
              ? () => composition!.advanceLocalRetention!(command.expectedRevision!)
              : () => composition!.replaceLocalBaseline!(command.expectedRevision!);
        if (
          !operation ||
          (command.expectedRevision !== undefined &&
            (command.kind === 'advance'
              ? !composition.advanceLocalRetention
              : !composition.replaceLocalBaseline))
        )
          throw Error('Local history operation unavailable');
        const result = await operation();
        live();
        return result;
      },
      sessionCommand: async (input) => {
        live();
        if (!composition || !login) throw Error('Worker session unavailable');
        try {
          return await executeAccountSessionCommand(
            { login, sync: composition.sync, devices: composition.devices },
            input,
            live,
          );
        } finally {
          session?.observe();
        }
      },
      compositionRoster: async () => {
        live();
        if (!composition) throw Error('Worker composition unavailable');
        const roster = await composition.devices.read();
        live();
        return roster;
      },
      compositionStatus: async () => {
        live();
        if (!composition) throw Error('Worker composition unavailable');
        const outbound = composition.outbound,
          captures = await composition.listCaptures();
        try {
          const delivery = outbound ? await outbound.deliveryStatus() : null;
          const spool = outbound ? await outbound.spoolStatus() : null;
          live();
          return {
            sync: composition.sync?.status ?? null,
            login: login?.getSnapshot() ?? 'closed',
            delivery,
            spool,
            captures: captures.map((c) => ({ id: c.id, count: c.sources.length })),
          };
        } finally {
          for (const c of captures) eraseCapsule(c);
        }
      },
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
          > & { joined: boolean; networkSessions?: boolean; composed?: boolean };
          if (options.slotId !== m.ticket.slotId) throw Error('Account worker slot changed');
          if (options.networkSessions !== undefined && typeof options.networkSessions !== 'boolean')
            throw Error('Invalid Worker connection mode');
          if (options.composed !== undefined && typeof options.composed !== 'boolean')
            throw Error('Invalid Worker composition mode');
          if (options.composed && !options.networkSessions)
            throw Error('Worker composition requires account sessions');
          if (options.networkSessions) {
            const { NetworkLogin } = await import('../account/networkLogin');
            login = new NetworkLogin(options.pin, options.slotId);
          }
          const { openAccountWorkerStore, openAccountWorkerReceivingWorkspace } =
            await import('./accountReceive');
          if (options.composed) {
            composedBridge = createWorkerAccountComposition({
              channel,
              runtime,
              live,
              failed: () => channel.close(),
              owned: (value, journalPrefix) => {
                bindNativeOwner(value);
                prefix = journalPrefix;
              },
            });
            composition = await openAccountWorkerReceivingWorkspace(
              {
                ...options,
                assertPasskey: passkey,
                signal: runtime.signal,
                ...(login ? { networkLogin: login } : {}),
              },
              composedBridge.factory,
              options.joined,
            );
            live();
            if (!login) throw Error('Worker session unavailable');
            session = publishAccountSession(
              { login, sync: composition.sync, devices: composition.devices },
              runtime.signal,
              (hint) => channel.request('sessionStatus', hint),
              () => channel.close(),
            );
            await session.ready;
            live();
            return {
              account: { ...owner!.account },
              deviceId: owner!.deviceId,
            };
          }
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
          bindNativeOwner(owner);
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
      ready: () => {
        if (!composedBridge?.ready) runtime.finishOpening();
      },
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
  const passkey = createWorkerPasskey(
    {
      get closed() {
        return channel.closed;
      },
      request: (method, value) => channel.request(method, value),
    },
    runtime.signal,
    live,
    () => channel.close(),
  );
  self.postMessage({ v: 1, kind: 'accountBooted', owner: m.ticket.incarnation });
});
