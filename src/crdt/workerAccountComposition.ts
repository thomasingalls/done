/** The original Account composition receives its actual native owner and a Window workspace port. */
import type {
  AccountWorkspaceFactory,
  AccountWorkspacePort,
  AccountWorkspaceOwnerContext,
} from './accountWorkspacePort';
import type { installAccountWorkerRuntime } from './accountWorkerRuntime';
import type { WorkerChannel } from './workerChannel';
import { eraseWorkerMessage } from './workerChannel';
import { createWorkerWorkspacePort } from './workspaceBridge';
import { createWorkerWorkspaceQueues } from './workerWorkspaceQueues';
import { journalPrefix } from './journalCodec';
import type { AdmissionStatus } from './admissionQueue';

export function createWorkerAccountComposition(config: {
  channel: WorkerChannel;
  runtime: ReturnType<typeof installAccountWorkerRuntime>;
  live(): void;
  failed(): void;
  owned(owner: AccountWorkspaceOwnerContext, prefix: string): void;
}) {
  let port: ReturnType<typeof createWorkerWorkspacePort> | undefined,
    queues: ReturnType<typeof createWorkerWorkspaceQueues> | undefined,
    ready = false;
  const factory: AccountWorkspaceFactory<AccountWorkspacePort> = async (
    carrier,
    deviceId,
    _options,
    owner,
  ) => {
    config.live();
    if (port || !owner || owner.carrier !== carrier) throw Error('Worker workspace owner changed');
    const material = await owner.copyMirrorOpening();
    try {
      config.live();
      const prefix = journalPrefix(material.dbName);
      config.owned(owner, prefix);
      const initial = await config.channel.request<AdmissionStatus>('workspaceOpen', {
        deviceId,
        opening: { ...material, incarnation: config.runtime.ticket.incarnation },
      });
      config.live();
      port = createWorkerWorkspacePort(config.channel, initial, config.runtime.signal, () =>
        carrier.close(),
      );
      queues = createWorkerWorkspaceQueues({
        channel: config.channel,
        signal: config.runtime.signal,
        live: config.live,
        failed: config.failed,
        incarnation: config.runtime.ticket.incarnation,
        preparedPromotion: owner.preparedPromotion,
        withFence: (id, operation) => config.runtime.withFence(id, prefix, operation),
      });
      await config.channel.request('workspaceObserve');
      config.live();
      config.runtime.finishOpening();
      ready = true;
      return { workspace: port.workspace, enqueue: queues.enqueue, prepare: queues.prepare };
    } finally {
      eraseWorkerMessage(material);
    }
  };
  return Object.freeze({
    factory,
    get ready() {
      return ready;
    },
    methods: {
      workspaceHint: (input: unknown) => {
        config.live();
        if (!port) throw Error('Worker workspace is unavailable');
        port.update(input);
      },
      workspaceFrames: (input: unknown) => {
        if (!queues) throw Error('Worker workspace is unavailable');
        return queues.methods.workspaceFrames(input);
      },
      workspaceFinish: (input: unknown) => {
        if (!queues) throw Error('Worker workspace is unavailable');
        return queues.methods.workspaceFinish(input);
      },
      workspaceCommit: (input: unknown) => {
        if (!queues) throw Error('Worker workspace is unavailable');
        return queues.methods.workspaceCommit(input);
      },
    },
    async close() {
      port?.stop();
      await queues?.close();
    },
  });
}
