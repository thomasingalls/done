/** Fixed device-connection presentation on the genuine Worker supervisor and canonical mirror. */
import type { EnrollmentView } from '../account/deviceEnrollment';
import { enrollmentMessages } from '../account/deviceEnrollment';
import type { SetupConfig } from '../account/setupProgress';
import {
  captureEnrollmentBootstrap,
  captureEnrollmentCommand,
  enrollmentPresentation,
  enrollmentProgressPresentation,
  type EnrollmentBootstrapData,
} from '../account/enrollmentWorkerProtocol';
import type { EnrollmentProgressListener } from '../lib/enrollmentProgress';
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
  const owner = createWindowCeremonyUi<{
    state: WorkerEnrollmentView;
    progress: ReturnType<typeof enrollmentProgressPresentation>;
  }>(config, slotId, {
    initial: { state: locked, progress: null },
    closing: { state: locked, progress: null },
    failure: (poisoned) => ({
      state: {
        kind: 'locked',
        message: poisoned
          ? 'Native cleanup could not finish. Refresh before reopening. Your writing has been kept.'
          : 'Unlock this workspace again to continue. Your writing and saved connection have been kept.',
      },
      progress: null,
    }),
    fields: ['state', 'progress'],
    expectedJoined: captured.role === 'new',
    capture(input, session) {
      const v = input as { state: unknown; progress: unknown },
        projected = enrollmentPresentation(v.state),
        progress = enrollmentProgressPresentation(v.progress);
      if (JSON.stringify(projected) !== JSON.stringify(v.state))
        throw Error('Enrollment display changed');
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
      return { state, progress };
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
  const close = () => {
    initial = undefined;
    return owner.close();
  };
  const abort = () => {
    void close().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const off = owner.subscribe(() => onProgress?.(owner.getSnapshot().progress));
  try {
    await owner.command({ command: 'initialize' });
    signal.throwIfAborted();
  } catch (cause) {
    await close();
    off();
    signal.removeEventListener('abort', abort);
    throw cause;
  }
  const run = async (command: string, value?: string) => {
    await owner.command({ command, ...(value === undefined ? {} : { value }) });
    return owner.getSnapshot().state;
  };
  return {
    refresh: () => run('refresh'),
    enroll: () => run('enroll'),
    reconnect: () => run('reconnect'),
    compare: (value: string) => run('compare', value),
    cancel: () => run('cancel'),
    openWriting: () => run('openWriting'),
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
