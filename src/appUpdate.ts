/** Event-driven release discovery; activation and reload require a user action. */
const listeners = new Set<() => void>();
let ready = false;
let observed: ServiceWorkerRegistration | undefined;
let stopObserving: (() => void) | undefined;
let applying: Promise<void> | undefined;

export const readUpdateReady = (): boolean => ready;
export const subscribeToUpdate = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const publish = (next: boolean): void => {
  if (ready === next) return;
  ready = next;
  for (const listener of listeners) listener();
};

export const observeAppUpdate = (registration: ServiceWorkerRegistration): (() => void) => {
  stopObserving?.();
  observed = registration;
  const initialController = navigator.serviceWorker.controller;
  let controllerChanged = false;
  let checking = false;
  let lastCheck = Date.now(); // register() has just checked for a release.
  const workers = new Set<ServiceWorker>();
  const refresh = () => publish(registration.waiting !== null || controllerChanged);
  const watch = () => {
    for (const worker of [registration.installing, registration.waiting]) {
      if (!worker || workers.has(worker)) continue;
      workers.add(worker);
      worker.addEventListener('statechange', refresh);
    }
    refresh();
  };
  const controllerChange = () => {
    // Another tab may activate the release. Offer this tab its own reload,
    // without interrupting its writing or an unfinished setup ceremony.
    if (initialController && navigator.serviceWorker.controller !== initialController)
      controllerChanged = true;
    refresh();
  };
  const check = (force = false) => {
    if (document.visibilityState === 'hidden' || navigator.onLine === false || checking) return;
    // Focus and visibility often arrive together; coalesce them without a timer.
    if (!force && Date.now() - lastCheck < 60_000) return;
    checking = true;
    lastCheck = Date.now();
    void registration
      .update()
      .catch(() => {})
      .finally(() => {
        checking = false;
      });
  };
  const foreground = () => check();
  const online = () => check(true);
  const pageshow = (event: PageTransitionEvent) => {
    if (event.persisted) check(true);
  };
  registration.addEventListener('updatefound', watch);
  navigator.serviceWorker.addEventListener('controllerchange', controllerChange);
  document.addEventListener('visibilitychange', foreground);
  window.addEventListener('focus', foreground);
  window.addEventListener('online', online);
  window.addEventListener('pageshow', pageshow);
  watch();
  const stop = () => {
    registration.removeEventListener('updatefound', watch);
    navigator.serviceWorker.removeEventListener('controllerchange', controllerChange);
    document.removeEventListener('visibilitychange', foreground);
    window.removeEventListener('focus', foreground);
    window.removeEventListener('online', online);
    window.removeEventListener('pageshow', pageshow);
    for (const worker of workers) worker.removeEventListener('statechange', refresh);
    if (observed === registration) observed = undefined;
  };
  stopObserving = stop;
  return stop;
};

const activate = (worker: ServiceWorker): Promise<void> =>
  new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      worker.removeEventListener('statechange', changed);
      if (error) reject(error);
      else resolve();
    };
    const changed = () => {
      if (worker.state === 'activated') finish();
      else if (worker.state === 'redundant')
        finish(new Error('The update was replaced. Try again.'));
    };
    const timeout = window.setTimeout(
      () => finish(new Error('The update did not finish. Try again.')),
      15_000,
    );
    worker.addEventListener('statechange', changed);
    try {
      worker.postMessage({ type: 'ACTIVATE_UPDATE' });
      changed();
    } catch {
      finish(new Error('The update could not start. Try again.'));
    }
  });

/** Save both before activation and immediately before navigation, including intervening input. */
export const reloadToUpdate = (beforeReload: () => Promise<void>): Promise<void> => {
  if (applying) return applying;
  applying = (async () => {
    if (!ready || !observed) throw new Error('No update is ready.');
    await beforeReload();
    const worker = observed.waiting;
    if (worker) await activate(worker);
    await beforeReload();
    window.location.reload();
  })().finally(() => {
    applying = undefined;
  });
  return applying;
};
