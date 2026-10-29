import type { Bytes } from './custodyCrypto';
import { MAX_PENDING_BYTES } from './admissionQueue';
import { READ_PAGE_LIMIT, READ_REQUEST_LIMIT } from '../../account-protocol/deliveryTransport';
import {
  createWorkerFrameStream,
  readWorkerFrameStream,
  type WorkerFrameCounts,
  type WorkerFramePart,
} from './workerFrameStream';
import { parseAuthorityPin } from '../../account-protocol/authority';
import {
  captureWorkerLocalBaselineCommand,
  type WorkerLocalBaselineCommand,
} from './workerLocalBaseline';
import {
  requireWindowAccountMirrorController,
  type createWindowAccountMirrorController,
} from './windowAccountMirror';
/** Window endpoints for a dedicated account owner. No blocking wait or fake storage is involved. */
import { createWorkerActivityForwarder, type WorkerActivityKind } from './workerActivity';
import { openWindowAccountCohort } from './accountWorkerCohort';
import { createWindowJournalBridge } from './windowJournalBridge';
import { createWorkerChannel, eraseWorkerMessage } from './workerChannel';
import { readAccountRecoveryStream, type RecoveryPage } from './accountWorkerRecoveryStream';
import type { AccountWorkspaceOptions } from './accountWorkspace';
import type { AccountMirrorOpening } from './windowAccountMirror';
import type { ContentInput } from './contentRecord';
import type { ContentReceipt } from './contentStore';
import type { JournalFlushReceipt } from './journalStore';
import type { LocalPasskeyRequest } from './accountAccess';

type WorkerReceiveReply = {
  id: number;
  counts: WorkerFrameCounts;
  result:
    | Awaited<ReturnType<Opened['api']['receivePage']>>
    | { kind: 'unknown'; recorded: false; status: Awaited<ReturnType<Opened['api']['status']>> };
};
type WindowReceiveFlight = { id: number; apply?: () => void; applied: boolean };
type MirrorController = Awaited<ReturnType<typeof createWindowAccountMirrorController>>;
type Opened = Awaited<ReturnType<(typeof import('./accountReceive'))['openAccountWorkerStore']>>;
export async function openAccountWorkerSession(
  input: AccountWorkspaceOptions,
  joined = false,
  connection: { networkSessions?: boolean } = {},
) {
  if (input.networkLogin || input.promotionOpening || input.recoveryOpening)
    throw Error('This worker opening requires the coordinated ceremony adapter');
  const requestedSessions = connection.networkSessions;
  const networkSessions = requestedSessions === true;
  if (requestedSessions !== undefined && typeof requestedSessions !== 'boolean')
    throw Error('Invalid Worker connection mode');
  const slotId = input.slotId,
    pin = parseAuthorityPin(input.pin),
    identity = structuredClone(input.identity),
    assertPasskey = input.assertPasskey,
    signal = input.signal;
  const continuation = input.membershipContinuation;
  const membershipContinuation = typeof continuation === 'function' ? continuation() : continuation;
  let code = input.code,
    ready = false,
    baselineSequence = 0;
  let readyFlight: Promise<void> | undefined;
  let receiveSequence = 0;
  let receiving: WindowReceiveFlight | undefined;
  let worker: Worker | undefined,
    channel: ReturnType<typeof createWorkerChannel> | undefined,
    killed = false,
    material: AccountMirrorOpening | undefined;
  let closedWorker: (ok: boolean) => void = () => {};
  const stoppedWorker = new Promise<boolean>((resolve) => (closedWorker = resolve));
  const cohort = await openWindowAccountCohort(
    slotId,
    async () => {
      if (worker) {
        channel?.close();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const closed = killed
          ? true
          : await Promise.race([
              stoppedWorker,
              new Promise<null>((resolve) => {
                timer = setTimeout(() => resolve(null), 5000);
              }),
            ]);
        clearTimeout(timer);
        worker.terminate();
        if (closed === false) throw Error('Worker cleanup failed; refresh before reopening');
      }
    },
    signal,
  );
  cohort.signal.addEventListener('abort', () => channel?.close(), { once: true });
  cohort.disposeWith(() => eraseWorkerMessage(material));
  const changeContext = <T extends object>(
    controller: MirrorController,
    method: 'baselineStart' | 'authorityStart',
    command?: WorkerLocalBaselineCommand,
  ) => {
    requireWindowAccountMirrorController(controller, cohort);
    if (!ready || receiving) throw Error('Worker context change is not ready');
    return controller.journalFence(async (fence) => {
      requireWindowAccountMirrorController(controller, cohort);
      const id = ++baselineSequence;
      let reply:
        | {
            id: number;
            result: T;
            opening: AccountMirrorOpening;
          }
        | undefined;
      try {
        reply = await channel!.request(method, { id, ...(command ? { command } : {}) });
        cohort.write(() => {});
        if (reply!.id !== id) throw Error('Worker local-history operation changed');
        await controller.rebind(fence, reply!.opening);
        await channel!.request('baselineFinish', { id });
        cohort.write(() => {});
        const revision = reply!.opening.binding?.era.revision;
        return {
          ...reply!.result,
          ...(revision !== undefined ? { journalEraRevision: revision } : {}),
        };
      } catch (cause) {
        // A missing reply can follow a native commit. Abort now and let owned drain finish;
        // waiting on our own queue head here would deadlock root cleanup.
        void cohort.close().catch(() => {});
        throw cause;
      } finally {
        eraseWorkerMessage(reply?.opening);
      }
    });
  };
  const receiveOwned = (
    controller: MirrorController,
    acquire: (id: number) => Promise<WorkerReceiveReply>,
    cleanup: () => void = () => {},
  ) => {
    requireWindowAccountMirrorController(controller, cohort);
    if (!ready || receiving) throw Error('Window receive unavailable');
    const state: WindowReceiveFlight = { id: ++receiveSequence, applied: false };
    receiving = state;
    return Promise.resolve()
      .then(() =>
        controller.prepare(new Uint8Array([1]), async (_input, stage) => {
          let updates: Bytes[] | undefined;
          try {
            const reply = await acquire(state.id);
            cohort.write(() => {});
            if (reply.id !== state.id) throw Error('Worker receive changed');
            updates = await readWorkerFrameStream(
              reply.counts,
              MAX_PENDING_BYTES,
              () => channel!.request<WorkerFramePart>('receiveOutput', { id: state.id }),
              () => cohort.write(() => {}),
            );
            stage(updates, async (apply) => {
              cohort.write(() => {});
              if (receiving !== state || state.apply) throw Error('Window receive changed');
              state.apply = apply;
              await channel!.request('receiveFinish', { id: state.id });
              cohort.write(() => {});
              if (!state.applied) throw Error('Worker omitted Window application');
            });
            return reply.result;
          } finally {
            for (const bytes of updates ?? []) bytes.fill(0);
          }
        }),
      )
      .catch((cause) => {
        void cohort.close().catch(() => {});
        throw cause;
      })
      .finally(() => {
        cleanup();
        if (receiving === state) receiving = undefined;
      });
  };
  try {
    const journal = await createWindowJournalBridge(cohort);
    worker = new Worker(new URL('./accountOwner.worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (e) => {
      if (
        e.data?.v === 1 &&
        e.data.kind === 'accountClosed' &&
        e.data.owner === cohort.ticket.incarnation
      )
        closedWorker(e.data.ok === true);
    });
    const ports = new MessageChannel();
    const activity = () => ({
      visibility: document.visibilityState,
      online: navigator.onLine !== false,
    });
    const activityForwarder = createWorkerActivityForwarder({
      signal: cohort.signal,
      snapshot: activity,
      send: (message) => channel!.request('activity', message),
      failed: () => {
        void cohort.close().catch(() => {});
      },
    });
    cohort.disposeWith(activityForwarder.close);
    const postActivity = (event: Event) =>
      activityForwarder.notify(event.type as WorkerActivityKind);
    channel = createWorkerChannel(
      ports.port1,
      cohort.ticket.incarnation,
      {
        receiveApply: (input) => {
          cohort.write(() => {});
          if (
            !input ||
            typeof input !== 'object' ||
            Object.keys(input).join(',') !== 'id' ||
            !receiving ||
            (input as { id: number }).id !== receiving.id ||
            !receiving.apply ||
            receiving.applied
          )
            throw Error('Window receive handoff changed');
          receiving.applied = true;
          receiving.apply();
        },
        journalBegin: (input) => {
          cohort.write(() => {});
          if ((input as { prefix: string }).prefix !== journal.prefix)
            throw Error('Journal prefix changed');
          return journal.begin();
        },
        journalPage: (input) => journal.page((input as { id: number }).id),
        journalFinish: (input) => journal.finish((input as { id: number }).id),
        journalRemove: (input) => {
          const value = input as { prefix: string; entries: [string, string][] };
          if (value.prefix !== journal.prefix) throw Error('Journal prefix changed');
          return journal.remove(value.entries);
        },
        passkey: async (value) => {
          cohort.write(() => {});
          const request = value as LocalPasskeyRequest;
          const assertion = await assertPasskey({ ...request, signal: cohort.signal });
          cohort.write(() => {});
          return structuredClone(assertion);
        },
      },
      () => {
        if (cohort.state === 'active') void cohort.close().catch(() => {});
      },
    );
    const booted = new Promise<void>((resolve, reject) => {
      const abort = () => reject(Error('Worker opening canceled'));
      cohort.signal.addEventListener('abort', abort, { once: true });
      worker!.addEventListener(
        'message',
        (e) => {
          if (
            e.data?.v === 1 &&
            e.data.kind === 'accountBooted' &&
            e.data.owner === cohort.ticket.incarnation
          ) {
            cohort.signal.removeEventListener('abort', abort);
            resolve();
          }
        },
        { once: true },
      );
      worker!.addEventListener(
        'error',
        () => {
          killed = true;
          reject(Error('Worker did not open'));
          void cohort.close().catch(() => {});
        },
        { once: true },
      );
    });
    // The ticket joins actual native holders; no input field bypasses original Account authentication.
    worker.postMessage(
      {
        v: 1,
        kind: 'accountBootstrap',
        ticket: cohort.ticket,
        activity: activity(),
        port: ports.port2,
      },
      [ports.port2],
    );
    await booted;
    const openingRequest = channel.request<{
      account: Opened['account'];
      deviceId: string;
      opening: AccountMirrorOpening;
    }>('open', {
      slotId,
      code,
      pin,
      identity,
      joined,
      networkSessions,
      ...(membershipContinuation !== undefined ? { membershipContinuation } : {}),
    });
    code = '';
    const opened = await openingRequest;
    material = opened.opening;
    cohort.write(() => {});
    for (const kind of [
      'visibilitychange',
      'keydown',
      'beforeinput',
      'pointerdown',
      'freeze',
      'resume',
    ] as const)
      document.addEventListener(kind, postActivity, true);
    for (const kind of ['online', 'offline', 'pageshow'] as const)
      window.addEventListener(kind, postActivity);
    cohort.disposeWith(() => {
      for (const kind of [
        'visibilitychange',
        'keydown',
        'beforeinput',
        'pointerdown',
        'freeze',
        'resume',
      ] as const)
        document.removeEventListener(kind, postActivity, true);
      for (const kind of ['online', 'offline', 'pageshow'] as const)
        window.removeEventListener(kind, postActivity);
    });
    return Object.freeze({
      cohort,
      account: opened.account,
      deviceId: opened.deviceId,
      opening: opened.opening,
      worker: Object.freeze({
        async loadRecovery() {
          const read = await channel!.request<{ id: number; records: number; journal: number }>(
            'beginRecovery',
          );
          try {
            return await readAccountRecoveryStream(
              read,
              () => channel!.request<RecoveryPage>('recoveryPage', { id: read.id }),
              () => cohort.write(() => {}),
            );
          } finally {
            if (!channel!.closed)
              await channel!.request('finishRecovery', { id: read.id }).catch(() => {});
          }
        },
        appendBatch: (input: readonly ContentInput[]) =>
          channel!.request<ContentReceipt>('appendBatch', input),
        flushJournal: () => channel!.request<JournalFlushReceipt>('flushJournal'),
      }),
      ready: () => {
        cohort.write(() => {});
        readyFlight ??= (async () => {
          try {
            await channel!.request('ready');
            cohort.write(() => {});
            ready = true;
          } catch (cause) {
            void cohort.close().catch(() => {});
            throw cause;
          }
        })();
        return readyFlight;
      },
      receiveNext: (controller: MirrorController) =>
        receiveOwned(controller, (id) =>
          channel!.request<WorkerReceiveReply>('receiveFetch', { id }),
        ),
      prepareRead: () => channel!.request<Uint8Array>('receiveRequest'),
      receivePage: (controller: MirrorController, page: Uint8Array, request: Uint8Array) => {
        requireWindowAccountMirrorController(controller, cohort);
        if (
          !ready ||
          receiving ||
          !(page instanceof Uint8Array) ||
          !page.length ||
          page.length > READ_PAGE_LIMIT ||
          !(request instanceof Uint8Array) ||
          !request.length ||
          request.length > READ_REQUEST_LIMIT
        )
          throw Error('Window receive unavailable');
        const source = createWorkerFrameStream([page.slice()], READ_PAGE_LIMIT),
          expected = request.slice();
        return receiveOwned(
          controller,
          async (id) => {
            await channel!.request('receiveBegin', {
              id,
              counts: source.counts,
              request: expected,
            });
            for (;;) {
              const part = source.next();
              try {
                await channel!.request('receiveInput', { id, part });
              } finally {
                part.bytes.fill(0);
              }
              if (part.done) break;
            }
            return channel!.request<WorkerReceiveReply>('receiveVerify', { id });
          },
          () => {
            source.close();
            expected.fill(0);
          },
        );
      },
      localHistoryStatus: () =>
        channel!.request<{ revision: number; records: number } | null>('baselineStatus'),
      maintainLocalHistory: (controller: MirrorController, input: WorkerLocalBaselineCommand) =>
        changeContext<Awaited<ReturnType<NonNullable<Opened['installLocalBaseline']>>>>(
          controller,
          'baselineStart',
          captureWorkerLocalBaselineCommand(input),
        ),
      refreshAuthority: (controller: MirrorController) =>
        changeContext<Awaited<ReturnType<Opened['refreshAuthority']>>>(
          controller,
          'authorityStart',
        ),
      status: () => channel!.request('status'),
      close: () => cohort.close(),
    });
  } catch (cause) {
    code = '';
    eraseWorkerMessage(material);
    await cohort.close();
    throw cause;
  }
}
