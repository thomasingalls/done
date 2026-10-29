/** Original recovery owners and fresh approval stay in one native realm through Account opening. */
import {
  beginLostDeviceRecovery,
  resumeLostDeviceRecovery,
  finishLostDeviceRecovery,
  openRecoveredWorkspaceWithExecution,
} from '../account/lostDeviceRecovery';
import { isRecoverySlot } from '../account/lostRecoveryRoutes';
import type { RecoveryOpening } from '../account/recoveryOpening';
import { inspectLocalStartup } from './localGenesis';
import type { SetupWorkspacePort } from '../account/setupWorkspace';
import {
  captureRecoveryCommand,
  recoveryPresentation,
  type RecoveryPresentation,
} from '../account/recoveryWorkerProtocol';
import {
  startWorkerCeremonyUi,
  type WorkerCeremonyUiBootstrap,
  type NativeCeremonyUiContext,
  type NativeCeremonyUiController,
} from './workerCeremonyUi';
export function createNativeLostRecoveryController(
  context: NativeCeremonyUiContext,
): NativeCeremonyUiController {
  if (!isRecoverySlot(context.slotId)) throw Error('Unknown recovery slot');
  let state: RecoveryPresentation = { step: 'checking', accountId: '', generated: '', error: '' },
    early: Awaited<ReturnType<typeof beginLostDeviceRecovery>> | undefined,
    opening: RecoveryOpening | undefined,
    code = '',
    closed = false,
    closing: Promise<void> | undefined,
    opened:
      | Awaited<ReturnType<typeof openRecoveredWorkspaceWithExecution<SetupWorkspacePort>>>
      | undefined;
  const actions = new Set<Promise<void>>();
  const live = () => {
    context.signal.throwIfAborted();
    if (closed) throw Error('Recovery closed');
  };
  const check = (...steps: RecoveryPresentation['step'][]) => {
    live();
    if (!steps.includes(state.step)) throw Error('Finish the current recovery step first.');
  };
  const open = async () => {
    check('installed');
    const fresh = opening;
    opening = undefined;
    const result = await openRecoveredWorkspaceWithExecution(
      context.execution,
      () => context.browser.assertSlot,
      context.config,
      context.slotId,
      code,
      context.signal,
      fresh,
    );
    opened = result;
    if (closed || context.signal.aborted) {
      result.login.close();
      await result.editor.workspace.close();
      live();
    }
    code = '';
    state = {
      step: 'editing',
      accountId: result.accountId,
      generated: '',
      error: '',
      editor: { actorId: result.actorId, accountId: result.accountId },
    };
  };
  const close = () => {
    if (closing) return closing;
    closed = true;
    early?.close();
    early = undefined;
    opening = undefined;
    code = '';
    state = { step: 'unlock', accountId: '', generated: '', error: '' };
    opened?.login.close();
    return (closing = (async () => {
      await Promise.allSettled([...actions]);
      opened?.login.close();
      await opened?.editor.workspace.close();
      opened = undefined;
    })());
  };
  context.signal.addEventListener(
    'abort',
    () => {
      void close().catch(() => {});
    },
    { once: true },
  );
  return {
    snapshot: () => ({ state: recoveryPresentation(state) }),
    close,
    command(input) {
      const value = captureRecoveryCommand(input);
      if (value.command === 'savedCode' || value.command === 'visit')
        return {
          outOfBand: true,
          run: () => {
            live();
            if (
              actions.size ||
              !state.generated ||
              !['save-code', 'confirm-code'].includes(state.step)
            )
              return false;
            if (value.command === 'visit' && !['save-code', 'confirm-code'].includes(value.value!))
              return false;
            state = {
              ...state,
              error: '',
              step:
                value.command === 'savedCode'
                  ? 'confirm-code'
                  : (value.value as 'save-code' | 'confirm-code'),
            };
            return true;
          },
        };
      return {
        outOfBand: false,
        run: () => {
          const work = (async () => {
            live();
            state = { ...state, error: '' };
            try {
              switch (value.command) {
                case 'inspect': {
                  check('checking');
                  const found = await inspectLocalStartup(context.slotId, {
                    signal: context.signal,
                  });
                  live();
                  state = { ...state, step: found.kind === 'fresh' ? 'start' : 'unlock' };
                  break;
                }
                case 'begin': {
                  check('start');
                  const next = await beginLostDeviceRecovery(context.config, {
                    slotId: context.slotId,
                    signal: context.signal,
                    assert: context.browser.authenticate,
                    rememberRoute: context.saveRecoveryRoute,
                  });
                  if (closed || context.signal.aborted) {
                    next.close();
                    live();
                  }
                  early = next;
                  state = { ...state, step: 'recovery-code', accountId: next.accountId };
                  break;
                }
                case 'prepare': {
                  check('recovery-code');
                  if (!early) throw Error('Use your account passkey first.');
                  const generated = await early.prepare(value.value!);
                  live();
                  state = { ...state, step: 'save-code', generated };
                  break;
                }
                case 'confirm': {
                  check('confirm-code');
                  if (!early) throw Error('Save the new unlock code first.');
                  const result = await early.confirm(value.value!);
                  live();
                  opening = result.opening;
                  code = value.value!;
                  state = { ...state, step: 'review', generated: '' };
                  break;
                }
                case 'unlock': {
                  check('unlock');
                  const result = await resumeLostDeviceRecovery(
                    context.config,
                    context.slotId,
                    value.value!,
                    context.signal,
                  );
                  live();
                  code = value.value!;
                  state = {
                    ...state,
                    step: result.stage === 'installed' ? 'installed' : 'review',
                    accountId: 'accountId' in result ? result.accountId! : state.accountId,
                  };
                  break;
                }
                case 'recover': {
                  check('review');
                  if (!code) throw Error('Unlock saved recovery first.');
                  await finishLostDeviceRecovery(
                    context.config,
                    context.slotId,
                    code,
                    context.signal,
                  );
                  live();
                  state = { ...state, step: 'installed' };
                  await open();
                  break;
                }
                case 'openWriting':
                  await open();
                  break;
                default:
                  throw Error('Out-of-band recovery command');
              }
            } catch (cause) {
              live();
              state = {
                ...state,
                error: (cause instanceof Error
                  ? cause.message
                  : 'Recovery could not finish. Retry the saved step.'
                ).slice(0, 4096),
              };
            }
          })();
          actions.add(work);
          return work.finally(() => actions.delete(work));
        },
      };
    },
  };
}
export const startWorkerLostRecovery = (m: WorkerCeremonyUiBootstrap) =>
  startWorkerCeremonyUi(m, createNativeLostRecoveryController);
