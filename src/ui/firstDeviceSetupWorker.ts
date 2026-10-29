/** First-device display/actions on the shared genuine Window Worker supervisor. */
import type { FirstDeviceSetup } from '../account/firstDeviceSetup';
import type { SetupConfig, SetupState } from '../account/setupProgress';
import {
  captureSetupCommand,
  setupPresentation,
  type SetupCommandInput,
} from '../account/setupWorkerProtocol';
import type { NetworkLoginView } from '../crdt/accountSessionBridge';
import { createWindowCeremonyUi, type WindowCeremonySession } from './windowCeremonyUi';
type UiSetup = Omit<FirstDeviceSetup, 'networkLogin'> & {
  readonly networkLogin: NetworkLoginView | undefined;
};
interface Display {
  state: SetupState;
  visitable: readonly string[];
  recoveryDisplay: boolean;
}
function capture(input: unknown, session: WindowCeremonySession | undefined): Display {
  const v = input as { state: unknown; visitable: string[]; recoveryDisplay: boolean },
    projected = setupPresentation(v.state);
  if (
    !Array.isArray(v.visitable) ||
    v.visitable.length > 3 ||
    v.visitable.some(
      (s) =>
        ![
          'intro',
          'save-device-code',
          'confirm-device-code',
          'save-recovery',
          'confirm-recovery',
        ].includes(s),
    ) ||
    typeof v.recoveryDisplay !== 'boolean' ||
    Object.keys(v.state as object)
      .sort()
      .join(',') !== Object.keys(projected).sort().join(',')
  )
    throw Error('Setup state changed');
  let state: SetupState;
  if (projected.kind === 'ready') {
    if (!session?.composedWorkspace || !session.session)
      throw Error('Canonical setup workspace unavailable');
    state = {
      ...projected,
      workspace: session.composedWorkspace,
      devices: session.session.devices,
      sync: session.session.sync,
    };
  } else state = projected;
  return { state, visitable: Object.freeze([...v.visitable]), recoveryDisplay: v.recoveryDisplay };
}
export function createWorkerFirstDeviceSetup(
  config: SetupConfig,
  slotId = 'local',
  takeInitialCode?: () => string | undefined,
): UiSetup {
  const owner = createWindowCeremonyUi<Display>(config, slotId, {
    initial: { state: { kind: 'intro' }, visitable: [], recoveryDisplay: false },
    closing: {
      state: { kind: 'working', message: 'Locking and finishing storage operations…' },
      visitable: [],
      recoveryDisplay: false,
    },
    failure: (poisoned) => ({
      state: poisoned
        ? {
            kind: 'storage-blocked',
            error:
              'Native cleanup could not finish. Refresh before reopening. Your writing has been kept.',
          }
        : {
            kind: 'unlock',
            error:
              'The passkey step could not finish. Try unlocking again. Your saved setup and writing have been kept.',
          },
      visitable: [],
      recoveryDisplay: false,
    }),
    fields: ['state', 'visitable', 'recoveryDisplay'],
    capture,
    editing: (v) => v.state.kind === 'ready',
    worker: () =>
      new Worker(new URL('../crdt/firstDeviceOwner.worker.ts', import.meta.url), {
        type: 'module',
      }),
    bootstrapKind: 'firstDeviceBootstrap',
    expectedJoined: false,
    retryCommand: { command: 'inspect' },
    captureCommand: captureSetupCommand,
    ...(takeInitialCode ? { takeInitialCode } : {}),
  });
  const command = owner.command;
  const send = (input: SetupCommandInput) => owner.send(input);
  return {
    get networkLogin() {
      return owner.networkLogin;
    },
    getSnapshot: () => owner.getSnapshot().state,
    subscribe: owner.subscribe,
    registerEditor: owner.registerEditor,
    close: owner.close,
    whenIdle: owner.whenIdle,
    hasRecoveryDisplay: () => owner.getSnapshot().recoveryDisplay,
    visitableSteps: () => owner.getSnapshot().visitable,
    visit(step) {
      if (owner.busy || !owner.getSnapshot().visitable.includes(step)) return false;
      send({ command: 'visit', value: step });
      return true;
    },
    inspect: async () => {
      await command({ command: 'inspect' });
    },
    start: (name) => send({ command: 'start', value: name }),
    savedDeviceCode: () => send({ command: 'savedDeviceCode' }),
    confirmDeviceCode: async (code) => {
      await command({ command: 'confirmDeviceCode', value: code });
    },
    unlock: async (code) => {
      await command({ command: 'unlock', value: code });
    },
    passkey: async () => {
      await command({ command: 'passkey' });
    },
    resumeSetup: async () => {
      await command({ command: 'resumeSetup' });
    },
    savedRecovery: () => send({ command: 'savedRecovery' }),
    confirmRecovery: async (code) => {
      await command({ command: 'confirmRecovery', value: code });
    },
    saveName: async (name) => {
      await command({ command: 'saveName', value: name });
    },
    restart: async () => {
      await command({ command: 'restart' });
    },
    approvePasskey: () => send({ command: 'approvePasskey' }),
  };
}
