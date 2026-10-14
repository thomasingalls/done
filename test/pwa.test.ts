import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { requestPersistentStorage } from '../src/lib/storagePersistence';
let pwa: typeof import('../src/pwa');
beforeAll(async () => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener() {} }),
  });
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  pwa = await import('../src/pwa');
  pwa.prepareInstallPrompt();
});
afterEach(() => vi.restoreAllMocks());
const browser = (userAgent: string) => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
};
it('omits installation instructions on macOS Firefox but retains them on Android Chrome', () => {
  browser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15) Firefox/150.0');
  expect(pwa.installHelp()).toBe('');
  browser('Mozilla/5.0 (Linux; Android 14) Chrome/150.0 Mobile Safari/537.36');
  expect(pwa.installHelp()).toContain('browser’s menu');
});
it('gives applicable manual instructions for iOS, Safari and modern Windows Firefox', () => {
  browser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Version/18.0 Safari/605.1');
  expect(pwa.installHelp()).toContain('Add to Home Screen');
  browser('Macintosh Version/18.0 Safari/605.1');
  expect(pwa.installHelp()).toContain('Add to Dock');
  browser('Windows NT 10.0 Firefox/150.0');
  expect(pwa.installHelp()).toContain('address bar');
});
it('reports persistent storage grants, denials and unavailable permission APIs', async () => {
  const persist = vi.fn().mockResolvedValue(true);
  const storage = { persisted: vi.fn().mockResolvedValue(false), persist };
  Object.defineProperty(navigator, 'storage', { configurable: true, value: storage });
  expect(await requestPersistentStorage()).toBe('granted');
  persist.mockResolvedValue(false);
  expect(await requestPersistentStorage()).toBe('denied');
  storage.persisted.mockResolvedValue(true);
  expect(await requestPersistentStorage()).toBe('granted');
  expect(persist).toHaveBeenCalledTimes(2);
  Object.defineProperty(navigator, 'storage', { configurable: true, value: {} });
  expect(await requestPersistentStorage()).toBe('unsupported');
});
it('uses a captured native prompt directly from the click path', async () => {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(pwa.readInstallState()).toBe('available');
  const result = pwa.requestInstall();
  expect(prompt).toHaveBeenCalledTimes(1);
  expect(await result).toBe('accepted');
  expect(pwa.readInstallState()).toBe('installed');
});
