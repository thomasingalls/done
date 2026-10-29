/** Advisory stream stays native; authorization/header jobs join the real Root, not the UI phase. */
import { startNotifications } from '../account/notifications';
import type { NativeCeremonyUiContext } from './workerCeremonyUi';
import type { EnrollmentNotificationPresentation } from '../account/enrollmentWorkerProtocol';
export function createWorkerEnrollmentNotifications(
  context: Pick<
    NativeCeremonyUiContext,
    'signal' | 'runBackground' | 'publish' | 'beforeAccountOpen'
  >,
  open: (signal: AbortSignal) => Promise<Response>,
) {
  let driver: ReturnType<typeof startNotifications> | undefined,
    scope: AbortController | undefined,
    stopped = false,
    draining: Promise<void> = Promise.resolve(),
    generation = 0,
    connected = false,
    event: EnrollmentNotificationPresentation['event'] = null;
  const stop = () => {
    stopped = true;
    scope?.abort();
    driver?.close();
    const prior = driver;
    driver = undefined;
    draining = Promise.all([draining, prior?.dispose()]).then(() => {});
    void draining.catch(() => {});
    return draining;
  };
  context.beforeAccountOpen(stop);
  context.signal.addEventListener(
    'abort',
    () => {
      void stop().catch(() => {});
    },
    { once: true },
  );
  return {
    snapshot: (): EnrollmentNotificationPresentation => ({ generation, connected, event }),
    start() {
      context.signal.throwIfAborted();
      if (driver) return;
      stopped = false;
      const next = new AbortController();
      scope = next;
      // Serialize replacement behind actual cancellation/read cleanup; no duplicated open flight.
      void draining
        .then(() => {
          if (stopped || scope !== next || context.signal.aborted) return;
          driver = startNotifications({
            signal: AbortSignal.any([context.signal, next.signal]),
            open: (signal) => context.runBackground(() => open(signal)),
            wake(value) {
              if (stopped || next.signal.aborted) return;
              if (!Number.isSafeInteger(generation + 1)) {
                void stop();
                return;
              }
              generation++;
              event = value;
              context.publish();
            },
            health(value) {
              connected = value;
              if (!stopped && !next.signal.aborted) context.publish();
            },
          });
        })
        .catch(() => {
          void stop();
        });
    },
    stop,
  };
}
