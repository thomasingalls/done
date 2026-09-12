/** Observes a waiting release. Activation remains owned by the browser, never a UI message. */
const listeners = new Set<() => void>();
let ready = false;

export const readUpdateReady = (): boolean => ready;
export const subscribeToUpdate = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const observeAppUpdate = (registration: ServiceWorkerRegistration): void => {
  const publish = () => {
    const next = registration.waiting !== null;
    if (ready === next) return;
    ready = next;
    for (const listener of listeners) listener();
  };
  const watched = new WeakSet<ServiceWorker>();
  const watch = () => {
    const worker = registration.installing;
    if (worker && !watched.has(worker)) {
      watched.add(worker);
      worker.addEventListener('statechange', publish);
    }
    publish();
  };
  registration.addEventListener('updatefound', watch);
  watch();
};
