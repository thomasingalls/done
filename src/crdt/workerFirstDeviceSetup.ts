/** Original first-device behavior on the shared genuine native UI lifetime. */
import { createFirstDeviceCoordinator } from '../account/firstDeviceSetup';
import { captureSetupCommand, setupPresentation } from '../account/setupWorkerProtocol';
import {
  startWorkerCeremonyUi,
  type WorkerCeremonyUiBootstrap,
  type NativeCeremonyUiContext,
  type NativeCeremonyUiController,
} from './workerCeremonyUi';
export function createNativeFirstDeviceController(
  context: NativeCeremonyUiContext,
): NativeCeremonyUiController {
  const user = createFirstDeviceCoordinator(
    context.config,
    context.slotId,
    context.takeInitialCode,
    context.execution,
    () => context.browser,
  );
  user.subscribe(context.publish);
  let inspected = false;
  return {
    snapshot: () => {
      const state = setupPresentation(user.getSnapshot());
      // Initial intro is a constructor default, not a completed classification. Publishing it
      // can expose a name form that inspection immediately destroys, losing the user's input.
      const checking = !inspected && state.kind === 'intro';
      return {
        state: checking ? { kind: 'working', message: 'Checking saved setup…' } : state,
        visitable: checking ? [] : [...user.visitableSteps()],
        recoveryDisplay: user.hasRecoveryDisplay(),
      };
    },
    command(input) {
      const value = captureSetupCommand(input);
      if (value.command === 'approvePasskey') return { outOfBand: true, run: user.approvePasskey };
      if (value.command === 'visit')
        return { outOfBand: true, run: () => user.visit(value.value!) };
      return {
        outOfBand: false,
        run: async () => {
          switch (value.command) {
            case 'inspect':
              await user.inspect();
              break;
            case 'start':
              user.start(value.value!);
              break;
            case 'savedDeviceCode':
              user.savedDeviceCode();
              break;
            case 'confirmDeviceCode':
              await user.confirmDeviceCode(value.value!);
              break;
            case 'unlock':
              await user.unlock(value.value!);
              break;
            case 'passkey':
              await user.passkey();
              break;
            case 'resumeSetup':
              await user.resumeSetup();
              break;
            case 'savedRecovery':
              user.savedRecovery();
              break;
            case 'confirmRecovery':
              await user.confirmRecovery(value.value!);
              break;
            case 'saveName':
              await user.saveName(value.value!);
              break;
            case 'restart':
              await user.restart();
              break;
            default:
              throw Error('Out-of-band setup action');
          }
          await user.whenIdle();
          if (value.command === 'inspect') inspected = true;
        },
      };
    },
    close: user.close,
  };
}
export const startWorkerFirstDeviceSetup = (m: WorkerCeremonyUiBootstrap) =>
  startWorkerCeremonyUi(m, createNativeFirstDeviceController);
