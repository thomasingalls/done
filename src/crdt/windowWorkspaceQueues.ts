/** Window final queues for the existing composed Worker runtime; no native proof crosses this port. */
import { MAX_PENDING_BYTES, type AdmissionFence } from './admissionQueue';
import {
  requireWindowAccountMirrorController,
  type createWindowAccountMirrorController,
} from './windowAccountMirror';
import type { WindowAccountCohort } from './accountWorkerCohort';
import type { WorkerChannel } from './workerChannel';
import { eraseWorkerMessage } from './workerChannel';
import {
  readWorkerFrameStream,
  type WorkerFrameCounts,
  type WorkerFramePart,
} from './workerFrameStream';
import type { AccountMirrorOpening } from './accountMirrorMaterial';
import { workspaceQueueFields, workspaceQueueRefused } from './workerWorkspaceQueues';

type Controller = Awaited<ReturnType<typeof createWindowAccountMirrorController>>;
type Flight = {
  id: number;
  kind: 'prepared' | 'fenced';
  applied: boolean;
  apply?: () => void;
  fence?: AdmissionFence;
  publish?: (updates: readonly Uint8Array<ArrayBuffer>[]) => void;
};
export function createWindowWorkspaceQueues(
  controller: Controller,
  cohort: WindowAccountCohort,
  channel: Pick<WorkerChannel, 'request'>,
) {
  requireWindowAccountMirrorController(controller, cohort);
  let sequence = 0,
    flight: Flight | undefined;
  const live = () => {
    requireWindowAccountMirrorController(controller, cohort);
    cohort.write(() => {});
  };
  const begin = (input: unknown, names: string[], kind: Flight['kind']) => {
    live();
    workspaceQueueFields(input, names);
    const id = (input as { id: number }).id;
    if (flight || !Number.isSafeInteger(id) || id !== sequence + 1) throw workspaceQueueRefused();
    sequence = id;
    const f: Flight = { id, kind, applied: false };
    flight = f;
    return f;
  };
  const current = (input: unknown, names: string[], kind: Flight['kind']) => {
    live();
    workspaceQueueFields(input, names);
    if (
      !flight ||
      (input as { id: number }).id !== flight.id ||
      flight.kind !== kind ||
      flight.applied
    )
      throw workspaceQueueRefused();
    return flight;
  };
  const fail = (cause: unknown) => {
    void cohort.close().catch(() => {});
    throw cause;
  };
  const read = (f: Flight, counts: WorkerFrameCounts) =>
    readWorkerFrameStream(
      counts,
      MAX_PENDING_BYTES,
      () => channel.request<WorkerFramePart>('workspaceFrames', { id: f.id }),
      live,
    );
  return Object.freeze({
    async workspacePrepare(input: unknown) {
      const f = begin(input, ['id', 'counts'], 'prepared');
      try {
        await controller.prepare(new Uint8Array([1]), async (_input, stage) => {
          const updates = await read(f, (input as { counts: WorkerFrameCounts }).counts);
          try {
            stage(updates, async (apply) => {
              live();
              if (flight !== f || f.apply) throw workspaceQueueRefused();
              f.apply = apply;
              await channel.request('workspaceFinish', { id: f.id });
              live();
              if (!f.applied) throw workspaceQueueRefused();
            });
          } finally {
            for (const b of updates) b.fill(0);
          }
        });
      } catch (cause) {
        fail(cause);
      } finally {
        if (flight === f) flight = undefined;
      }
    },
    workspaceApply(input: unknown) {
      const f = current(input, ['id'], 'prepared');
      if (!f.apply) throw workspaceQueueRefused();
      f.applied = true;
      f.apply();
    },
    async workspaceFence(input: unknown) {
      const f = begin(input, ['id'], 'fenced');
      try {
        await controller.journalFence(async (fence, publish) => {
          f.fence = fence;
          f.publish = publish;
          await channel.request('workspaceCommit', { id: f.id });
          live();
          fence.check();
          if (!f.applied) throw workspaceQueueRefused();
        });
      } catch (cause) {
        fail(cause);
      } finally {
        delete f.fence;
        delete f.publish;
        if (flight === f) flight = undefined;
      }
    },
    async workspaceContext(input: unknown) {
      // Erase narrow key material even if the operation id/schema/root is refused.
      const opening =
        input && typeof input === 'object'
          ? Object.getOwnPropertyDescriptor(input, 'opening')?.value
          : undefined;
      let updates: Uint8Array<ArrayBuffer>[] | undefined;
      try {
        const f = current(input, ['id', 'counts', 'opening'], 'fenced');
        if (!f.fence || !f.publish) throw workspaceQueueRefused();
        f.fence.check();
        updates = await read(f, (input as { counts: WorkerFrameCounts }).counts);
        f.fence.check();
        await controller.rebind(f.fence, opening as AccountMirrorOpening);
        live();
        f.fence.check();
        f.applied = true;
        f.publish(updates);
      } catch (cause) {
        fail(cause);
      } finally {
        eraseWorkerMessage(opening);
        for (const b of updates ?? []) b.fill(0);
      }
    },
  });
}
