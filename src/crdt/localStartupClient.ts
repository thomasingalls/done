import { createWindowAccountHandoff } from './windowAccountHandoff';
import { createWindowCeremonyJournal } from './windowCeremonyJournal';
/** Window endpoint for fixed native Local startup/enrollment commands; no factor/root persistence. */
import { openWindowCeremonyCohort, requireWindowCeremonyCohort } from './accountWorkerCohort';
import { createWorkerChannel, type WorkerChannel } from './workerChannel';
import { watchWindowWorkerLifetime } from './windowWorkerLifetime';
import { StartupError, type StartupDisposition } from './startupState';
import type {
  listLocalWorkspaces,
  LocalGenesisReceipt,
  LocalGenesisEnrollment,
} from './localGenesis';
export async function openLocalStartupWorker(slotId: string, signal?: AbortSignal) {
  let worker: Worker | undefined,
    channel: WorkerChannel | undefined,
    nativeEnded = false,
    handingOff = false,
    preserveWorker = false,
    acknowledged: (ok: boolean) => void = () => {};
  const stopped = new Promise<boolean>((resolve) => (acknowledged = resolve));
  const cohort = await openWindowCeremonyCohort(
    slotId,
    async () => {
      if (!worker) return;
      channel?.close();
      if (preserveWorker && !signal?.aborted) return;
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
    const ports = new MessageChannel(),
      journal = createWindowCeremonyJournal(cohort),
      retirement = journal.retirement;
    worker = new Worker(new URL('./localStartup.worker.ts', import.meta.url), { type: 'module' });
    channel = createWorkerChannel(ports.port1, cohort.ticket.incarnation, journal.methods, () => {
      if (cohort.state === 'active') void cohort.close().catch(() => {});
    });
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
          if (cohort.state === 'active' && (!handingOff || v.ok === false))
            void cohort.close().catch(() => {});
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
      if (handingOff && released) return;
      channel?.close();
      void cohort.close().catch(() => {});
    });
    const ready = <T extends { kind: string }>(reply: T | StartupDisposition): T => {
      requireWindowCeremonyCohort(cohort);
      if (reply.kind !== 'ready') throw new StartupError(reply as StartupDisposition);
      return reply as T;
    };
    let genesisSequence = 0,
      protectionSequence = 0;
    const created = (reply: LocalGenesisReceipt | StartupDisposition): LocalGenesisReceipt => {
      requireWindowCeremonyCohort(cohort);
      if (reply.kind !== 'created') throw new StartupError(reply as StartupDisposition);
      return reply;
    };
    return Object.freeze({
      cohort,
      async protect(code: string) {
        requireWindowCeremonyCohort(cohort);
        if (protectionSequence === Number.MAX_SAFE_INTEGER)
          throw Error('Protection sequence exhausted');
        const id = ++protectionSequence;
        retirement.start(id);
        try {
          const reply = await channel!.request<{ kind: 'protected' } | StartupDisposition>(
            'protect',
            { id, code },
          );
          requireWindowCeremonyCohort(cohort);
          if (reply.kind !== 'protected') throw new StartupError(reply as StartupDisposition);
        } finally {
          retirement.stop(id);
        }
      },
      async beginGenesis(automatic = false): Promise<LocalGenesisEnrollment> {
        requireWindowCeremonyCohort(cohort);
        if (genesisSequence === Number.MAX_SAFE_INTEGER)
          throw Error('Local enrollment order exhausted');
        const id = genesisSequence + 1;
        const result = await channel!.request<{ code: string }>('beginGenesis', { id, automatic });
        requireWindowCeremonyCohort(cohort);
        if (typeof result.code !== 'string' || !result.code)
          throw Error('Local enrollment did not issue a code');
        genesisSequence = id;
        let display: string | null = result.code;
        const erase = () => {
          display = null;
          cohort.signal.removeEventListener('abort', erase);
        };
        cohort.signal.addEventListener('abort', erase, { once: true });
        return Object.freeze({
          get displayCode() {
            return display;
          },
          async confirm(code: string) {
            requireWindowCeremonyCohort(cohort);
            try {
              const receipt = created(
                await channel!.request<LocalGenesisReceipt | StartupDisposition>('confirmGenesis', {
                  id,
                  code,
                }),
              );
              erase();
              return receipt;
            } catch (cause) {
              if (
                !(
                  cause instanceof Error &&
                  'code' in cause &&
                  cause.code === 'confirmation-required'
                )
              )
                erase();
              throw cause;
            }
          },
          cancel() {
            erase();
            void channel!.request('cancelGenesis', { id }).catch(() => {});
          },
        });
      },
      async resumeGenesis(code: string) {
        requireWindowCeremonyCohort(cohort);
        return created(
          await channel!.request<LocalGenesisReceipt | StartupDisposition>('resumeGenesis', {
            code,
          }),
        );
      },
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
      async handoffAccount() {
        requireWindowCeremonyCohort(cohort);
        if (handingOff) throw Error('Account handoff already requested');
        handingOff = true;
        const nonce = [...crypto.getRandomValues(new Uint8Array(16))]
          .map((v) => v.toString(16).padStart(2, '0'))
          .join('');
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const reply = await Promise.race([
            channel!.request<{ nonce: string }>('prepareHandoff', { nonce }),
            new Promise<never>((_yes, no) => {
              timer = setTimeout(() => no(Error('Native handoff did not drain')), 5000);
            }),
          ]);
          if (reply.nonce !== nonce) throw Error('Native handoff changed');
          requireWindowCeremonyCohort(cohort);
          preserveWorker = true;
          await cohort.close();
          signal?.throwIfAborted();
          return createWindowAccountHandoff(worker!, cohort, nonce, signal);
        } catch (cause) {
          preserveWorker = false;
          worker?.terminate();
          await cohort.close();
          throw cause;
        } finally {
          clearTimeout(timer);
          handingOff = false;
        }
      },
      close: () => cohort.close(),
    });
  } catch (cause) {
    await cohort.close();
    throw cause;
  }
}
