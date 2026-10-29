import { createWorkerJournalReader } from './workerJournalRead';
import type { RawJournalSnapshot, RawJournalRemoval } from './workerJournalProtocol';
/** Fixed startup/ceremony environment. Original native slot operations and their tasks remain owners. */
import {
  requireCeremonyWorkerLifetime,
  requireClosedCeremonyWorkerLifetime,
  type openCeremonyWorkerLifetime,
} from './ceremonyWorkerLifetime';
import { WorkerChannelError, type WorkerChannel } from './workerChannel';
import type { WorkerActivity } from './accountWorkerRuntime';
let current: ReturnType<typeof installCeremonyEnvironment> | undefined;
let reserved = false,
  owner: Awaited<ReturnType<typeof openCeremonyWorkerLifetime>> | undefined;
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
    reserved ||
    current ||
    typeof window !== 'undefined' ||
    typeof globalThis.postMessage !== 'function' ||
    globalThis.isSecureContext !== true ||
    !['visible', 'hidden'].includes(initial.visibility) ||
    typeof initial.online !== 'boolean'
  )
    throw new WorkerChannelError('worker-lifetime');
  reserved = true;
  const events = new EventTarget(),
    activity = { ...initial };
  const live = () => {
    root.assertCurrent();
    if (channel.closed) throw new WorkerChannelError('worker-lifetime');
  };
  const close = () => events.dispatchEvent(new Event('pagehide'));
  root.signal.addEventListener('abort', close, { once: true });
  const reader = createWorkerJournalReader(channel, live);
  const environment = Object.freeze({
    events,
    activity,
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
  owner = root;
  current = environment;
  return environment;
}

/** A retired environment is not permission for a new native owner. Account verifies its own join. */
export function retireCeremonyEnvironment(
  root: Awaited<ReturnType<typeof openCeremonyWorkerLifetime>>,
): void {
  requireClosedCeremonyWorkerLifetime(root);
  if (owner !== root || !current) throw new WorkerChannelError('worker-lifetime');
  owner = undefined;
  current = undefined;
}
