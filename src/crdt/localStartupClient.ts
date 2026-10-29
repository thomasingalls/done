/** Window endpoint for fixed read-only Local startup commands; no factor/root persistence here. */
import { openWindowCeremonyCohort, requireWindowCeremonyCohort } from './accountWorkerCohort';
import { createWorkerChannel, type WorkerChannel } from './workerChannel';
import { countJournalEntries, countLegacyJournalEntries } from './startupStorage';
import { watchWindowWorkerLifetime } from './windowWorkerLifetime';
import { StartupError, type StartupDisposition } from './startupState';
import type { listLocalWorkspaces } from './localGenesis';
export async function openLocalStartupWorker(slotId: string, signal?: AbortSignal) {
  let worker: Worker | undefined,
    channel: WorkerChannel | undefined,
    nativeEnded = false,
    acknowledged: (ok: boolean) => void = () => {};
  const stopped = new Promise<boolean>((resolve) => (acknowledged = resolve));
  const cohort = await openWindowCeremonyCohort(
    slotId,
    async () => {
      if (!worker) return;
      channel?.close();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const result = nativeEnded
        ? true
        : await Promise.race([
            stopped,
            new Promise<null>((resolve) => {
              timer = setTimeout(() => resolve(null), 5000);
            }),
          ]);
      clearTimeout(timer);
      worker.terminate();
      if (result === false) throw Error('Local startup Worker cleanup failed');
    },
    signal,
  );
  cohort.signal.addEventListener('abort', () => channel?.close(), { once: true });
  try {
    const ports = new MessageChannel();
    worker = new Worker(new URL('./localStartup.worker.ts', import.meta.url), { type: 'module' });
    channel = createWorkerChannel(
      ports.port1,
      cohort.ticket.incarnation,
      {
        journalCount(input) {
          requireWindowCeremonyCohort(cohort);
          const prefix = (input as { prefix: string }).prefix;
          if (
            typeof prefix !== 'string' ||
            !/^done\.pending-update\.done(?:\.[a-f0-9]{32})?\.$/u.test(prefix)
          )
            throw Error('Startup journal scope changed');
          return cohort.write(() => countJournalEntries(prefix));
        },
        legacyJournalCount() {
          requireWindowCeremonyCohort(cohort);
          return cohort.write(countLegacyJournalEntries);
        },
      },
      () => {
        if (cohort.state === 'active') void cohort.close().catch(() => {});
      },
    );
    const booted = new Promise<void>((resolve, reject) => {
      const abort = () => reject(Error('Local startup cancelled'));
      cohort.signal.addEventListener('abort', abort, { once: true });
      worker!.addEventListener('message', (e) => {
        const v = e.data;
        if (v?.v !== 1 || v.owner !== cohort.ticket.incarnation) return;
        if (v.kind === 'startupBooted') {
          cohort.signal.removeEventListener('abort', abort);
          resolve();
        }
        if (v.kind === 'startupClosed' && typeof v.ok === 'boolean') {
          acknowledged(v.ok);
          if (cohort.state === 'active') void cohort.close().catch(() => {});
        }
      });
      worker!.addEventListener(
        'error',
        () => {
          reject(Error('Local startup Worker failed'));
          void cohort.close().catch(() => {});
        },
        { once: true },
      );
    });
    worker.postMessage(
      {
        v: 1,
        kind: 'localStartupBootstrap',
        ticket: cohort.ticket,
        port: ports.port2,
        activity: { visibility: document.visibilityState, online: navigator.onLine !== false },
      },
      [ports.port2],
    );
    await booted;
    await watchWindowWorkerLifetime(cohort, (released) => {
      nativeEnded ||= released;
      channel?.close();
      void cohort.close().catch(() => {});
    });
    const ready = <T extends { kind: string }>(reply: T | StartupDisposition): T => {
      requireWindowCeremonyCohort(cohort);
      if (reply.kind !== 'ready') throw new StartupError(reply as StartupDisposition);
      return reply as T;
    };
    return Object.freeze({
      cohort,
      async inspect() {
        const value = await channel!.request<StartupDisposition>('inspect');
        requireWindowCeremonyCohort(cohort);
        return value;
      },
      async list(code: string) {
        return ready(
          await channel!.request<
            | { kind: 'ready'; routes: Awaited<ReturnType<typeof listLocalWorkspaces>> }
            | StartupDisposition
          >('list', { code }),
        ).routes;
      },
      async automaticCode() {
        return ready(
          await channel!.request<{ kind: 'ready'; code: string | null } | StartupDisposition>(
            'automatic',
          ),
        ).code;
      },
      close: () => cohort.close(),
    });
  } catch (cause) {
    await cohort.close();
    throw cause;
  }
}
