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

type MirrorController = Awaited<ReturnType<typeof createWindowAccountMirrorController>>;
type Opened = Awaited<ReturnType<(typeof import('./accountReceive'))['openAccountWorkerStore']>>;
export async function openAccountWorkerSession(input: AccountWorkspaceOptions, joined = false) {
  if (input.networkLogin || input.promotionOpening || input.recoveryOpening)
    throw Error('This worker opening requires the coordinated ceremony adapter');
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
      localHistoryStatus: () =>
        channel!.request<{ revision: number; records: number } | null>('baselineStatus'),
      maintainLocalHistory: (controller: MirrorController, input: WorkerLocalBaselineCommand) => {
        requireWindowAccountMirrorController(controller, cohort);
        const command = captureWorkerLocalBaselineCommand(input);
        if (!ready) throw Error('Worker editor is not ready for history maintenance');
        return controller.journalFence(async (fence) => {
          requireWindowAccountMirrorController(controller, cohort);
          const id = ++baselineSequence;
          let reply:
            | {
                id: number;
                result: Awaited<ReturnType<NonNullable<Opened['installLocalBaseline']>>>;
                opening: AccountMirrorOpening;
              }
            | undefined;
          try {
            reply = await channel!.request('baselineStart', { id, command });
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
      },
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
