/**
 * Installed-app integration.
 *
 * The worker is precache-only (TRD §1): it serves the app shell from cache so
 * a cold start with no network is an ordinary start, not a degraded one
 * (PRD principle 3). It caches nothing at runtime — the data lives in
 * IndexedDB and there is no API to cache responses from.
 */

import { observeAppUpdate } from './appUpdate';
import { browserEnvironment } from './lib/browser';

export type InstallState = 'installed' | 'available' | 'unavailable';

interface InstallChoice {
  outcome: 'accepted' | 'dismissed';
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
}

const subscribers = new Set<() => void>();
let installPrompt: BeforeInstallPromptEvent | null = null;
let prepared = false;

const inInstalledMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches ||
    navigatorWithStandalone.standalone === true
  );
};

let installState: InstallState = inInstalledMode() ? 'installed' : 'unavailable';

const publish = (next: InstallState): void => {
  if (installState === next) return;
  installState = next;
  for (const subscriber of subscribers) subscriber();
};

export const prepareInstallPrompt = (): void => {
  if (prepared || typeof window === 'undefined') return;
  prepared = true;

  // The manifest start URL identifies a homescreen launch without leaving a
  // browser-looking query string behind if a platform ignores display mode.
  const url = new URL(window.location.href);
  if (url.searchParams.get('source') === 'pwa') {
    url.searchParams.delete('source');
    window.history.replaceState(window.history.state, '', url);
  }

  window.addEventListener('beforeinstallprompt', (rawEvent) => {
    const event = rawEvent as BeforeInstallPromptEvent;
    event.preventDefault();
    installPrompt = event;
    publish('available');
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    publish('installed');
  });

  window
    .matchMedia('(display-mode: standalone), (display-mode: fullscreen)')
    .addEventListener('change', () => publish(inInstalledMode() ? 'installed' : 'unavailable'));
};

export const subscribeToInstallState = (subscriber: () => void): (() => void) => {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
};

export const readInstallState = (): InstallState => installState;

export const installHelp = (): string => {
  if (typeof window === 'undefined') return '';
  if (!window.isSecureContext) return '';
  const { browser, os, version } = browserEnvironment();
  if (os === 'iOS' || os === 'iPadOS') return 'Use Share, then Add to Home Screen to install done.';
  if (browser === 'Safari' && os === 'macOS' && version >= 17)
    return 'If File → Add to Dock is available, use it to install done.';
  if (browser === 'Firefox') {
    if (os === 'Android') return 'Use Install in Firefox’s menu to install done.';
    if (os === 'Windows' && version >= 143)
      return 'Use Firefox’s web app button in the address bar, if available.';
    return '';
  }
  if (browser === 'Chrome' || browser === 'Edge' || browser === 'Samsung Internet')
    return 'You can also install done from your browser’s menu.';
  return '';
};

/** Must be called from a click: browsers require a user gesture for the prompt. */
export const requestInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
  const prompt = installPrompt;
  if (!prompt) return 'unavailable';

  installPrompt = null;
  publish('unavailable');
  await prompt.prompt();
  const choice = await prompt.userChoice;
  if (choice.outcome === 'accepted') publish('installed');
  return choice.outcome;
};

export const registerServiceWorker = (): void => {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
        updateViaCache: 'none',
      })
      .then(observeAppUpdate)
      .catch(() => {
        // An app that works offline because of a service worker still has to
        // work when registration fails. Nothing here is load-bearing.
      });
  });
};
