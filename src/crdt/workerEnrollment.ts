/** Original protocol selector and coordinators execute only inside the genuine native UI phase. */
import { createAccountEnrollmentCoordinator } from '../account/accountEnrollment';
import { enrollmentMessages, type EnrollmentView } from '../account/deviceEnrollment';
import {
  captureEnrollmentBootstrap,
  captureEnrollmentCommand,
  enrollmentPresentation,
  enrollmentProgressPresentation,
} from '../account/enrollmentWorkerProtocol';
import { createWorkerEnrollmentNotifications } from './workerEnrollmentNotifications';
import { NetworkLogin } from '../account/networkLogin';
import type { SetupWorkspacePort } from '../account/setupWorkspace';
import type { EnrollmentProgress } from '../lib/enrollmentProgress';
import {
  startWorkerCeremonyUi,
  type WorkerCeremonyUiBootstrap,
  type NativeCeremonyUiContext,
  type NativeCeremonyUiController,
} from './workerCeremonyUi';
export function createNativeEnrollmentController(
  context: NativeCeremonyUiContext,
): NativeCeremonyUiController {
  const data = captureEnrollmentBootstrap(context.data),
    actions = new Set<Promise<void>>();
  let owner:
      | Awaited<ReturnType<typeof createAccountEnrollmentCoordinator<SetupWorkspacePort>>>
      | undefined,
    initialization: Promise<void> | undefined,
    closed = false,
    closing: Promise<void> | undefined,
    login: NetworkLogin | undefined,
    state: EnrollmentView<SetupWorkspacePort> = {
      kind: 'locked',
      message: enrollmentMessages.locked,
    },
    progress: EnrollmentProgress | null = null;
  const live = () => {
    context.signal.throwIfAborted();
    if (closed) throw Error('Enrollment closed');
  };
  const notifications = createWorkerEnrollmentNotifications(context, (signal) => {
    live();
    if (!owner) throw Error('Enrollment not initialized');
    return owner.openNotifications(signal);
  });
  const initialize = async () => {
    live();
    if (initialization) throw Error('Enrollment already initialized');
    initialization = (async () => {
      let code = context.takeInitialCode();
      if (typeof code !== 'string' || !code || code.length > 4096)
        throw Error('Enrollment unlock required');
      login = new NetworkLogin(context.config.pin, context.slotId);
      try {
        const acquired = await createAccountEnrollmentCoordinator(
          context.execution,
          () => context.browser,
          () => context.browser,
          context.config,
          context.slotId,
          code,
          data.role,
          data.workspaceId,
          data.invitation,
          login,
          context.signal,
          data.begin,
          (value) => {
            if (!closed && !context.signal.aborted) {
              progress = enrollmentProgressPresentation(value);
              context.publish();
            }
          },
        );
        if (closed || context.signal.aborted) {
          await acquired.close();
          live();
        }
        owner = acquired;
      } catch (cause) {
        login.close();
        throw cause;
      } finally {
        code = undefined;
      }
    })();
    await initialization;
    live();
  };
  const close = () => {
    if (closing) return closing;
    closed = true;
    progress = null;
    state = { kind: 'locked', message: enrollmentMessages.locked };
    login?.close();
    const immediate = owner?.close();
    return (closing = (async () => {
      await notifications.stop();
      await initialization?.catch(() => {});
      await Promise.allSettled([...actions]);
      await immediate;
      await owner?.close();
      owner = undefined;
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
    snapshot: () => ({
      state: enrollmentPresentation(state),
      progress: enrollmentProgressPresentation(progress),
      notifications: notifications.snapshot(),
    }),
    command(input) {
      const value = captureEnrollmentCommand(input);
      if (value.command === 'notificationsStart' || value.command === 'notificationsStop')
        return {
          outOfBand: true,
          run: () => {
            live();
            if (value.command === 'notificationsStart') notifications.start();
            else void notifications.stop();
          },
        };
      const command = value.command;
      return {
        outOfBand: false,
        run: () => {
          const work = (async () => {
            live();
            if (command === 'initialize') {
              await initialize();
              return;
            }
            if (!owner) throw Error('Enrollment not initialized');
            const result =
              command === 'compare' ? await owner.compare(value.value!) : await owner[command]();
            live();
            state = result;
          })();
          actions.add(work);
          return work.finally(() => actions.delete(work));
        },
      };
    },
    close,
  };
}
export const startWorkerEnrollment = (m: WorkerCeremonyUiBootstrap) =>
  startWorkerCeremonyUi(m, createNativeEnrollmentController);
