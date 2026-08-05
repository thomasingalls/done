/**
 * Service worker registration.
 *
 * The worker is precache-only (TRD §1): it serves the app shell from cache so
 * a cold start with no network is an ordinary start, not a degraded one
 * (PRD principle 3). It caches nothing at runtime — the data lives in
 * IndexedDB and there is no API to cache responses from.
 */

export const registerServiceWorker = (): void => {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => {
        // An app that works offline because of a service worker still has to
        // work when registration fails. Nothing here is load-bearing.
      });
  });
};
