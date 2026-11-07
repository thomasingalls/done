/** Recovery UI has display data and actual canonical ports, never native recovery approvals. */
import type { SetupConfig } from '../account/setupProgress';
import {
  captureRecoveryCommand,
  recoveryPresentation,
  type RecoveryPresentation,
} from '../account/recoveryWorkerProtocol';
import type { WorkerEnrollmentView } from './accountEnrollmentWorker';
import { createWindowCeremonyUi } from './windowCeremonyUi';
export interface WorkerRecoveryView extends Omit<RecoveryPresentation, 'editor'> {
  editor?: NonNullable<WorkerEnrollmentView['editor']>;
  /** Window-only shutdown display. Never accepted from a native recovery projection. */
  closing?: true;
}
export function createWorkerAccountRecovery(
  config: SetupConfig,
  slotId: string,
  signal: AbortSignal,
) {
  const blank: WorkerRecoveryView = { step: 'checking', accountId: '', generated: '', error: '' };
  const owner = createWindowCeremonyUi<{ state: WorkerRecoveryView }>(config, slotId, {
    initial: { state: blank },
    closing: { state: { ...blank, closing: true } },
    failure: (poisoned) => ({
      state: {
        ...blank,
        step: 'unlock',
        error: poisoned
          ? 'Native cleanup could not finish. Refresh before reopening. Your writing has been kept.'
          : 'Unlock saved recovery again to continue. Your writing has been kept.',
      },
    }),
    fields: ['state'],
    expectedJoined: true,
    capture(input, session) {
      const projected = recoveryPresentation((input as { state: unknown }).state);
      let state: WorkerRecoveryView;
      if (projected.editor) {
        if (!session?.composedWorkspace || !session.session)
          throw Error('Canonical recovery workspace unavailable');
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
      } else state = projected as WorkerRecoveryView;
      return { state };
    },
    editing: (v) => v.state.step === 'editing',
    worker: () =>
      new Worker(new URL('../crdt/recoveryOwner.worker.ts', import.meta.url), { type: 'module' }),
    bootstrapKind: 'recoveryBootstrap',
    // Reboot only when a new user-entered command supplies the factor; inspect stores none.
    retryCommand: { command: 'inspect' },
    captureCommand: captureRecoveryCommand,
  });
  const abort = () => {
    void owner.close().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  return {
    visit(value: string) {
      const current = owner.getSnapshot().state;
      if (
        owner.busy ||
        !current.generated ||
        !['save-code', 'confirm-code'].includes(current.step) ||
        !['save-code', 'confirm-code'].includes(value)
      )
        return false;
      owner.send({ command: 'visit', value });
      return true;
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
    async command(input: unknown) {
      await owner.command(input);
      return owner.getSnapshot().state;
    },
    async close() {
      signal.removeEventListener('abort', abort);
      await owner.close();
    },
  };
}
