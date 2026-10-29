/** High-level Local protection effects. Kept out of the low-level runtime dependency closure. */
import { requireExclusiveSessionTask, type SessionTask } from './writeSession';
import {
  requireCeremonyWorkerLifetime,
  requireClosedCeremonyWorkerLifetime,
  type openCeremonyWorkerLifetime,
} from './ceremonyWorkerLifetime';
import { RAW_JOURNAL_REMOVE_ITEMS, type RawJournalRemoval } from './workerJournalProtocol';
import { WorkerChannelError, type WorkerChannel } from './workerChannel';
let current: ReturnType<typeof installProtectionEnvironment> | undefined;
let reserved = false,
  owner: Awaited<ReturnType<typeof openCeremonyWorkerLifetime>> | undefined;
export const protectionEnvironment = () => current;
export function installProtectionEnvironment(
  root: Awaited<ReturnType<typeof openCeremonyWorkerLifetime>>,
  channel: WorkerChannel,
) {
  requireCeremonyWorkerLifetime(root);
  if (
    reserved ||
    current ||
    typeof window !== 'undefined' ||
    typeof globalThis.postMessage !== 'function' ||
    globalThis.isSecureContext !== true ||
    channel.closed
  )
    throw new WorkerChannelError('worker-lifetime');
  reserved = true;
  const live = () => {
    root.assertCurrent();
    if (channel.closed) throw new WorkerChannelError('worker-lifetime');
  };
  let protectionSequence = 0,
    protection: number | undefined;
  const environment = Object.freeze({
    async withProtection<T>(id: number, operation: () => Promise<T>): Promise<T> {
      live();
      if (protection !== undefined || !Number.isSafeInteger(id) || id <= protectionSequence)
        throw new WorkerChannelError('operation-refused');
      protectionSequence = id;
      protection = id;
      try {
        const result = await operation();
        live();
        return result;
      } finally {
        protection = undefined;
      }
    },
    async retireProtectedJournal(
      task: SessionTask,
      prefix: string,
      entries: readonly (readonly [string, string])[],
    ): Promise<RawJournalRemoval> {
      live();
      requireExclusiveSessionTask(task, root.ticket.slotId);
      const id = protection;
      if (id === undefined) throw new WorkerChannelError('operation-refused');
      const total = { removed: 0, changed: 0, retained: 0 };
      for (let i = 0; i < entries.length; i += RAW_JOURNAL_REMOVE_ITEMS) {
        requireExclusiveSessionTask(task, root.ticket.slotId);
        if (protection !== id) throw new WorkerChannelError('operation-refused');
        const chunk = entries.slice(i, i + RAW_JOURNAL_REMOVE_ITEMS);
        const result = await task.wait(() =>
          channel.request<RawJournalRemoval>('retireProtectedJournal', {
            id,
            prefix,
            entries: chunk,
          }),
        );
        live();
        requireExclusiveSessionTask(task, root.ticket.slotId);
        if (
          protection !== id ||
          Object.values(result).some((n) => !Number.isSafeInteger(n) || n < 0) ||
          result.removed + result.changed + result.retained > chunk.length
        )
          throw new WorkerChannelError('message-shape');
        total.removed += result.removed;
        total.changed += result.changed;
        total.retained += result.retained;
      }
      return total;
    },
  });
  owner = root;
  current = environment;
  return environment;
}

/** A retired environment is not permission for a new native owner. Account verifies its own join. */
export function retireProtectionEnvironment(
  root: Awaited<ReturnType<typeof openCeremonyWorkerLifetime>>,
): void {
  requireClosedCeremonyWorkerLifetime(root);
  if (owner !== root || !current) throw new WorkerChannelError('worker-lifetime');
  owner = undefined;
  current = undefined;
}
