/** Window endpoints for a dedicated account owner. No blocking wait or fake storage is involved. */
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

type Opened = Awaited<ReturnType<(typeof import('./accountReceive'))['openAccountWorkerStore']>>;
export async function openAccountWorkerSession(input: AccountWorkspaceOptions, joined = false) {
  if (input.networkLogin || input.promotionOpening || input.recoveryOpening)
    throw Error('This worker opening requires the coordinated ceremony adapter');
  let worker: Worker | undefined,
    channel: ReturnType<typeof createWorkerChannel> | undefined,
    killed = false,
    material: AccountMirrorOpening | undefined;
  let closedWorker: (ok: boolean) => void = () => {};
  const stoppedWorker = new Promise<boolean>((resolve) => (closedWorker = resolve));
  const cohort = await openWindowAccountCohort(
    input.slotId,
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
    input.signal,
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
    const postActivity = (event: Event) => {
      void channel?.request('activity', { ...activity(), kind: event.type }).catch(() => {});
    };
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
          const assertion = await input.assertPasskey({ ...request, signal: cohort.signal });
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
    const opened = await channel.request<{
      account: Opened['account'];
      deviceId: string;
      opening: AccountMirrorOpening;
    }>('open', {
      slotId: input.slotId,
      code: input.code,
      pin: structuredClone(input.pin),
      identity: structuredClone(input.identity),
      joined,
      ...(input.membershipContinuation !== undefined
        ? {
            membershipContinuation:
              typeof input.membershipContinuation === 'function'
                ? input.membershipContinuation()
                : input.membershipContinuation,
          }
        : {}),
    });
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
      ready: () => channel!.request('ready'),
      status: () => channel!.request('status'),
      close: () => cohort.close(),
    });
  } catch (cause) {
    eraseWorkerMessage(material);
    await cohort.close();
    throw cause;
  }
}
