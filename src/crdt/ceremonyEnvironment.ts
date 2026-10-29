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
  const environment = Object.freeze({
    events,
    activity,
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
