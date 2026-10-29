import { requireExclusiveSessionTask, type SessionTask } from './writeSession';
import { RAW_JOURNAL_REMOVE_ITEMS } from './workerJournalProtocol';
import { createWorkerJournalReader } from './workerJournalRead';
import type { RawJournalSnapshot, RawJournalRemoval } from './workerJournalProtocol';
/** Fixed startup/ceremony environment. Original native slot operations and their tasks remain owners. */
import {
  requireCeremonyWorkerLifetime,
  type openCeremonyWorkerLifetime,
} from './ceremonyWorkerLifetime';
import { WorkerChannelError, type WorkerChannel } from './workerChannel';
import type { WorkerActivity } from './accountWorkerRuntime';
let current: ReturnType<typeof installCeremonyEnvironment> | undefined;
export function ceremonyEnvironment() {
  return current;
}
export function installCeremonyEnvironment(
  root: Awaited<ReturnType<typeof openCeremonyWorkerLifetime>>,
  channel: WorkerChannel,
  initial: WorkerActivity,
) {
  requireCeremonyWorkerLifetime(root);
  if (
    current ||
    typeof window !== 'undefined' ||
    typeof globalThis.postMessage !== 'function' ||
    globalThis.isSecureContext !== true ||
    !['visible', 'hidden'].includes(initial.visibility) ||
    typeof initial.online !== 'boolean'
  )
    throw new WorkerChannelError('worker-lifetime');
  const events = new EventTarget(),
    activity = { ...initial };
  const live = () => {
    root.assertCurrent();
    if (channel.closed) throw new WorkerChannelError('worker-lifetime');
  };
  const close = () => events.dispatchEvent(new Event('pagehide'));
  root.signal.addEventListener('abort', close, { once: true });
  const reader = createWorkerJournalReader(channel, live);
  let protectionSequence = 0,
    protection: number | undefined;
  const environment = Object.freeze({
    events,
    activity,
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
    journal: Object.freeze({
      read: reader.read,
      observe: reader.observe,
      pinned(_prefix: string): RawJournalSnapshot {
        live();
        throw new WorkerChannelError('worker-lifetime');
      },
      remove(
        _prefix: string,
        _entries: readonly (readonly [string, string])[],
      ): Promise<RawJournalRemoval> {
        live();
        return Promise.reject(new WorkerChannelError('operation-refused'));
      },
    }),
    async countJournal(prefix: string, legacy = false) {
      live();
      const result = await channel.request<number>(
        legacy ? 'legacyJournalCount' : 'journalCount',
        legacy ? undefined : { prefix },
      );
      live();
      if (!Number.isSafeInteger(result) || result < 0)
        throw new WorkerChannelError('message-shape');
      return result;
    },
  });
  current = environment;
  return environment;
}
