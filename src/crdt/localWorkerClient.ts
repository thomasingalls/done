/** Window endpoints for retained Local Worker carriers; original UI admission is composed separately. */
import { openWindowLocalCohort } from './accountWorkerCohort';
import { createWindowJournalBridge } from './windowJournalBridge';
import { createWorkerChannel, eraseWorkerMessage, type WorkerChannel } from './workerChannel';
import { readAccountRecoveryStream, type RecoveryPage } from './accountWorkerRecoveryStream';
import type { WorkspaceOptions } from './admittedWorkspace';
import type { ContentInput, ContentIdentity } from './contentRecord';
import type { ContentReceipt } from './contentStore';
import type { JournalFlushReceipt } from './journalStore';
import type { Bytes } from './custodyCrypto';
import type { StartupDisposition } from './startupState';
import { StartupError } from './startupState';
import { createWindowLocalTrim, type LocalTrimCensus } from './windowLocalTrim';
import {
  requireMaintenanceFence,
  type AdmissionCarrier,
  type MaintenanceFence,
} from './admissionQueue';
import { MaintenanceInterrupted } from './contentMaintenance';
import type { LocalMaintenanceReply } from './workerLocalTrim';
import type { WorkerFramePart } from './workerFrameStream';

export interface LocalMirrorOpening {
  readonly incarnation: string;
  readonly scope: ContentIdentity;
  readonly dbName: string;
  readonly generation: number;
  readonly key: Bytes;
  readonly previous: readonly (readonly [number, Bytes])[];
}
export async function openLocalWorkerSession(
  input: { slotId: string; code: string } & Pick<WorkspaceOptions, 'identity' | 'signal'>,
) {
  const slotId = input.slotId,
    identity = structuredClone(input.identity),
    signal = input.signal;
  let code = input.code,
    worker: Worker | undefined,
    channel: WorkerChannel | undefined,
    material: LocalMirrorOpening | undefined,
    acknowledged: (ok: boolean) => void = () => {};
  let maintenance:
      | { id: number; stop: AbortSignal; fence: MaintenanceFence; carrier: AdmissionCarrier }
      | undefined,
    trim: ReturnType<typeof createWindowLocalTrim> | undefined,
    trimFlight: Promise<boolean> | undefined,
    maintenanceSequence = 0;
  const requireMaintenance = () => {
    cohort.write(() => {});
    if (!maintenance || !material) throw Error('Local maintenance is not active');
    requireMaintenanceFence(maintenance.fence, maintenance.carrier);
    return maintenance;
  };
  const stopped = new Promise<boolean>((resolve) => (acknowledged = resolve));
  const cohort = await openWindowLocalCohort(
    slotId,
    async () => {
      if (!worker) return;
      channel?.close();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const closed = await Promise.race([
        stopped,
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), 5000);
        }),
      ]);
      clearTimeout(timer);
      worker.terminate();
      if (closed === false) throw Error('Local Worker cleanup failed; refresh before reopening');
    },
    signal,
  );
  cohort.signal.addEventListener('abort', () => channel?.close(), { once: true });
  cohort.beforeRelease(async () => {
    await trimFlight?.catch(() => {});
  });
  cohort.disposeWith(() => {
    trim?.close();
    eraseWorkerMessage(material);
  });
  try {
    const journal = await createWindowJournalBridge(cohort),
      ports = new MessageChannel();
    worker = new Worker(new URL('./localOwner.worker.ts', import.meta.url), { type: 'module' });
    channel = createWorkerChannel(
      ports.port1,
      cohort.ticket.incarnation,
      {
        localBind: () => cohort.bindLocalWorker(),
        trimBegin(input) {
          const current = requireMaintenance();
          if (trim) throw Error('Local trim census already in progress');
          trim = createWindowLocalTrim(
            cohort,
            current.carrier,
            current.fence,
            current.stop,
            material!.scope,
            material!.dbName,
            material!.generation,
            journal,
          );
          trim.begin(input as LocalTrimCensus);
        },
        trimRow(input) {
          requireMaintenance();
          if (!trim) throw Error('Local trim not started');
          trim.row(input as Parameters<typeof trim.row>[0]);
        },
        trimPart(input) {
          requireMaintenance();
          if (!trim) throw Error('Local trim not started');
          trim.part(input as WorkerFramePart);
        },
        async trimCommit(input) {
          requireMaintenance();
          if (!trim) throw Error('Local trim not started');
          try {
            trimFlight = trim.commit((input as { observation: number }).observation);
            return await trimFlight;
          } finally {
            trim.close();
            trim = undefined;
            trimFlight = undefined;
          }
        },
        journalObservationBegin(input) {
          cohort.write(() => {});
          if ((input as { prefix: string }).prefix !== journal.prefix)
            throw Error('Local journal changed');
          return journal.beginObservation();
        },
        journalBegin(input) {
          cohort.write(() => {});
          if ((input as { prefix: string }).prefix !== journal.prefix)
            throw Error('Local journal changed');
          return journal.begin();
        },
        journalPage: (input) => journal.page((input as { id: number }).id),
        journalFinish: (input) => journal.finish((input as { id: number }).id),
        journalRemove(input) {
          const v = input as { prefix: string; entries: [string, string][] };
          if (v.prefix !== journal.prefix) throw Error('Local journal changed');
          return journal.remove(v.entries);
        },
      },
      () => {
        if (cohort.state === 'active') void cohort.close().catch(() => {});
      },
    );
    const booted = new Promise<void>((resolve, reject) => {
      const abort = () => reject(Error('Local Worker opening cancelled'));
      cohort.signal.addEventListener('abort', abort, { once: true });
      worker!.addEventListener('message', (e) => {
        const m = e.data;
        if (m?.v !== 1 || m.owner !== cohort.ticket.incarnation) return;
        if (m.kind === 'localBooted') {
          cohort.signal.removeEventListener('abort', abort);
          resolve();
        }
        if (m.kind === 'localClosed' && typeof m.ok === 'boolean') {
          acknowledged(m.ok);
          if (cohort.state === 'active') void cohort.close().catch(() => {});
        }
      });
      worker!.addEventListener(
        'error',
        () => {
          reject(Error('Local Worker did not open'));
          void cohort.close().catch(() => {});
        },
        { once: true },
      );
    });
    worker.postMessage(
      {
        v: 1,
        kind: 'localBootstrap',
        ticket: cohort.ticket,
        port: ports.port2,
        activity: { visibility: document.visibilityState, online: navigator.onLine !== false },
      },
      [ports.port2],
    );
    await booted;
    const request = channel.request<
      { kind: 'ready'; opening: LocalMirrorOpening } | StartupDisposition
    >('open', { slotId, code, identity });
    code = '';
    const reply = await request;
    if (reply.kind !== 'ready') throw new StartupError(reply);
    material = reply.opening;
    cohort.write(() => {});
    let ready = false,
      readyFlight: Promise<void> | undefined;
    return Object.freeze({
      cohort,
      opening: material,
      ready() {
        cohort.write(() => {});
        if (ready) return Promise.resolve();
        return (readyFlight ??= (async () => {
          await channel!.request('ready');
          cohort.write(() => {});
          ready = true;
        })());
      },
      worker: Object.freeze({
        async loadRecovery() {
          cohort.write(() => {});
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
        async compactContent(
          interrupt: AbortSignal,
          fence: MaintenanceFence,
          carrier: AdmissionCarrier,
        ) {
          cohort.write(() => {});
          requireMaintenanceFence(fence, carrier);
          if (maintenance || maintenanceSequence === Number.MAX_SAFE_INTEGER)
            throw Error('Local maintenance already active');
          const flight = { id: ++maintenanceSequence, stop: interrupt, fence, carrier };
          maintenance = flight;
          const cancel = () => {
            void channel!.request('cancelCompact', { id: flight.id }).catch(() => {});
          };
          try {
            // Queue the run first, so cancellation cannot overtake its monotone owner ID.
            const request = channel!.request<LocalMaintenanceReply>('compactContent', {
              id: flight.id,
            });
            interrupt.addEventListener('abort', cancel, { once: true });
            if (interrupt.aborted) cancel();
            const reply = await request;
            cohort.write(() => {});
            if (reply.kind === 'interrupted') throw new MaintenanceInterrupted();
            if (reply.kind !== 'complete') throw Error('Local maintenance reply changed');
            return reply.receipt;
          } finally {
            interrupt.removeEventListener('abort', cancel);
            trim?.close();
            trim = undefined;
            if (maintenance === flight) maintenance = undefined;
          }
        },
        appendBatch: (input: readonly ContentInput[]) =>
          channel!.request<ContentReceipt>('appendBatch', input),
        flushJournal: () => channel!.request<JournalFlushReceipt>('flushJournal'),
      }),
      close: () => cohort.close(),
    });
  } catch (cause) {
    code = '';
    await cohort.close();
    throw cause;
  }
}
