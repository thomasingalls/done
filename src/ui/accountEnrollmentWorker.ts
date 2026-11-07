/** Fixed device-connection presentation on the genuine Worker supervisor and canonical mirror. */
import type { EnrollmentView } from '../account/deviceEnrollment';
import { enrollmentMessages } from '../account/deviceEnrollment';
import type { SetupConfig } from '../account/setupProgress';
import {
  captureEnrollmentBootstrap,
  captureEnrollmentCommand,
  enrollmentPresentation,
  enrollmentProgressPresentation,
  enrollmentNotificationPresentation,
  type EnrollmentBootstrapData,
} from '../account/enrollmentWorkerProtocol';
import {
  reportEnrollmentProgress,
  type EnrollmentProgressListener,
} from '../lib/enrollmentProgress';
import type { NetworkLoginView } from '../crdt/accountSessionBridge';
import { createWindowCeremonyUi } from './windowCeremonyUi';
export type WorkerEnrollmentView = Omit<EnrollmentView, 'editor'> & {
  editor?: Omit<NonNullable<EnrollmentView['editor']>, 'networkLogin'> & {
    networkLogin?: NetworkLoginView;
  };
};
export async function createWorkerAccountEnrollment(
  config: SetupConfig,
  slotId: string,
  code: string,
  data: EnrollmentBootstrapData,
  signal: AbortSignal,
  onProgress?: EnrollmentProgressListener,
) {
  const captured = captureEnrollmentBootstrap(data);
  let initial: string | undefined = code;
  code = '';
  const locked: WorkerEnrollmentView = { kind: 'locked', message: enrollmentMessages.locked };
  const emptyNotifications = { generation: 0, connected: false, event: null };
  const owner = createWindowCeremonyUi<{
    state: WorkerEnrollmentView;
    error: string;
    progress: ReturnType<typeof enrollmentProgressPresentation>;
    notifications: ReturnType<typeof enrollmentNotificationPresentation>;
  }>(config, slotId, {
    initial: { state: locked, error: '', progress: null, notifications: emptyNotifications },
    closing: { state: locked, error: '', progress: null, notifications: emptyNotifications },
    failure: (poisoned) => ({
      state: {
        kind: 'locked',
        message: poisoned
          ? 'Native cleanup could not finish. Refresh before reopening. Your writing has been kept.'
          : 'Unlock this workspace again to continue. Your writing and saved connection have been kept.',
      },
      error: '',
      progress: null,
      notifications: emptyNotifications,
    }),
    fields: ['state', 'error', 'progress', 'notifications'],
    expectedJoined: captured.role === 'new',
    capture(input, session) {
      const v = input as {
          state: unknown;
          error: unknown;
          progress: unknown;
          notifications: unknown;
        },
        projected = enrollmentPresentation(v.state),
        progress = enrollmentProgressPresentation(v.progress);
      if (JSON.stringify(projected) !== JSON.stringify(v.state))
        throw Error('Enrollment display changed');
      if (typeof v.error !== 'string' || v.error.length > 4096)
        throw Error('Enrollment error changed');
      let state: WorkerEnrollmentView;
      if (projected.editor) {
        if (!session?.composedWorkspace || !session.session)
          throw Error('Canonical enrollment workspace unavailable');
        state = {
          ...projected,
          editor: {
            ...projected.editor,
            workspace: session.composedWorkspace,
            devices: session.session.devices,
            sync: session.session.sync,
            ...(session.session.networkLogin ? { networkLogin: session.session.networkLogin } : {}),
          },
        };
      } else state = projected as WorkerEnrollmentView;
      return {
        state,
        error: v.error,
        progress,
        notifications: enrollmentNotificationPresentation(v.notifications),
      };
    },
    editing: (v) => v.state.kind === 'editing',
    worker: () =>
      new Worker(new URL('../crdt/enrollmentOwner.worker.ts', import.meta.url), { type: 'module' }),
    bootstrapKind: 'enrollmentBootstrap',
    data: captured,
    captureCommand: captureEnrollmentCommand,
    takeInitialCode: () => {
      const value = initial;
      initial = undefined;
      return value;
    },
  });
  const notificationStops = new Set<() => void>();
  const close = () => {
    for (const stop of [...notificationStops]) stop();
    initial = undefined;
    return owner.close();
  };
  const abort = () => {
    void close().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const off = owner.subscribe(() =>
    reportEnrollmentProgress(onProgress, owner.getSnapshot().progress),
  );
  try {
    await owner.command({ command: 'initialize' });
    if (owner.getSnapshot().error) throw Error(owner.getSnapshot().error);
    signal.throwIfAborted();
  } catch (cause) {
    await close();
    off();
    signal.removeEventListener('abort', abort);
    throw cause;
  }
  const run = async (command: string, value?: string) => {
    await owner.command({ command, ...(value === undefined ? {} : { value }) });
    if (owner.getSnapshot().error) throw Error(owner.getSnapshot().error);
    return owner.getSnapshot().state;
  };
  return {
    refresh: () => run('refresh'),
    enroll: () => run('enroll'),
    reconnect: () => run('reconnect'),
    compare: (value: string) => run('compare', value),
    cancel: () => run('cancel'),
    openWriting: () => run('openWriting'),
    startNotifications(options: {
      signal: AbortSignal;
      wake(event: 'ready' | 'hint' | 'content' | 'resume'): void;
      health(connected: boolean): void;
    }) {
      let generation = owner.getSnapshot().notifications.generation,
        connected = false,
        stopped = false;
      const update = () => {
        if (stopped) return;
        const next = owner.getSnapshot().notifications;
        if (next.connected !== connected) {
          connected = next.connected;
          options.health(connected);
        }
        if (next.generation > generation) {
          generation = next.generation;
          if (next.event) options.wake(next.event);
        }
      };
      const off = owner.subscribe(update);
      const stop = () => {
        if (stopped) return;
        stopped = true;
        notificationStops.delete(stop);
        off();
        options.signal.removeEventListener('abort', stop);
        owner.send({ command: 'notificationsStop' });
        options.health(false);
      };
      notificationStops.add(stop);
      options.signal.addEventListener('abort', stop, { once: true });
      if (options.signal.aborted) stop();
      else {
        owner.send({ command: 'notificationsStart' });
        update();
      }
      return { close: stop };
    },
    getSnapshot: () => owner.getSnapshot().state,
    subscribe: owner.subscribe,
    registerEditor: owner.registerEditor,
    get busy() {
      return owner.busy;
    },
    get requiresUnlock() {
      return owner.requiresUnlock;
    },
    async close() {
      off();
      signal.removeEventListener('abort', abort);
      await close();
    },
  };
}
