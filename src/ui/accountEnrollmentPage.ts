/** Explicit old service compatibility only, never a fallback from failed native execution. */
import { createAccountEnrollment } from '../account/accountEnrollment';
import { enrollmentMessages } from '../account/deviceEnrollment';
import { startNotifications } from '../account/notifications';
import type { SetupConfig } from '../account/setupProgress';
import type { EnrollmentBootstrapData } from '../account/enrollmentWorkerProtocol';
import type { EnrollmentProgressListener } from '../lib/enrollmentProgress';
import type {
  createWorkerAccountEnrollment,
  WorkerEnrollmentView,
} from './accountEnrollmentWorker';
export async function createLegacyUiEnrollment(
  config: SetupConfig,
  slot: string,
  code: string,
  data: EnrollmentBootstrapData,
  signal: AbortSignal,
  onProgress?: EnrollmentProgressListener,
): Promise<Awaited<ReturnType<typeof createWorkerAccountEnrollment>>> {
  if (config.networkSessions) throw Error('Legacy enrollment requires explicit legacy service');
  const owner = await createAccountEnrollment(
    config,
    slot,
    code,
    data.role,
    data.workspaceId,
    data.invitation,
    undefined,
    signal,
    data.begin,
    onProgress,
  );
  if (signal.aborted) {
    await owner.close();
    signal.throwIfAborted();
  }
  let state: WorkerEnrollmentView = { kind: 'locked', message: enrollmentMessages.locked },
    closed = false,
    closing: Promise<void> | undefined;
  const listeners = new Set<() => void>(),
    flights = new Set<Promise<WorkerEnrollmentView>>();
  const run = (
    method: 'refresh' | 'enroll' | 'reconnect' | 'compare' | 'cancel' | 'openWriting',
    value?: string,
  ) => {
    const work = (async () => {
      signal.throwIfAborted();
      if (closed) throw Error('Enrollment closed');
      const next = method === 'compare' ? await owner.compare(value!) : await owner[method]();
      signal.throwIfAborted();
      if (closed) throw Error('Enrollment closed');
      state = next;
      for (const fn of listeners) fn();
      return next;
    })();
    flights.add(work);
    return work.finally(() => flights.delete(work));
  };
  return {
    refresh: () => run('refresh'),
    enroll: () => run('enroll'),
    reconnect: () => run('reconnect'),
    compare: (value) => run('compare', value),
    cancel: () => run('cancel'),
    openWriting: () => run('openWriting'),
    getSnapshot: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    registerEditor: owner.registerEditor,
    get busy() {
      return owner.busy;
    },
    requiresUnlock: false,
    startNotifications: (options) =>
      startNotifications({ ...options, open: (scope) => owner.openNotifications(scope) }),
    close() {
      if (closing) return closing;
      closed = true;
      const first = owner.close();
      return (closing = (async () => {
        await Promise.allSettled([...flights]);
        await first;
        await owner.close();
        listeners.clear();
      })());
    },
  };
}
