import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { observeAppUpdate, readUpdateReady, reloadToUpdate } from '../src/appUpdate';

let stop: (() => void) | undefined;
let container: EventTarget & { controller: ServiceWorker | null };
let registration: ServiceWorkerRegistration;
let update: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  container = Object.assign(new EventTarget(), { controller: {} as ServiceWorker });
  update = vi.fn().mockResolvedValue(undefined);
  registration = Object.assign(new EventTarget(), {
    waiting: null,
    installing: null,
    update,
  }) as unknown as ServiceWorkerRegistration;
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => {
  stop?.();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('checks on foreground and reconnect, coalesces focus/visibility, and never polls', async () => {
  stop = observeAppUpdate(registration);
  await vi.advanceTimersByTimeAsync(60_001);
  expect(update).not.toHaveBeenCalled();
  window.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));
  await Promise.resolve();
  expect(update).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(3_600_000);
  expect(update).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event('online'));
  await Promise.resolve();
  expect(update).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(60_001);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  window.dispatchEvent(new Event('focus'));
  expect(update).toHaveBeenCalledTimes(2);
});

it('offers a reload when another tab activates a release, and removes its event listeners', () => {
  stop = observeAppUpdate(registration);
  expect(readUpdateReady()).toBe(false);
  container.controller = {} as ServiceWorker;
  container.dispatchEvent(new Event('controllerchange'));
  expect(readUpdateReady()).toBe(true);
  stop();
  window.dispatchEvent(new Event('online'));
  expect(update).not.toHaveBeenCalled();
});

it('refuses activation when pending writing cannot be saved', async () => {
  const postMessage = vi.fn();
  Object.assign(registration, {
    waiting: Object.assign(new EventTarget(), { postMessage, state: 'installed' }),
  });
  stop = observeAppUpdate(registration);
  expect(readUpdateReady()).toBe(true);
  await expect(reloadToUpdate(() => Promise.reject(Error('storage unavailable')))).rejects.toThrow(
    'storage unavailable',
  );
  expect(postMessage).not.toHaveBeenCalled();
});
