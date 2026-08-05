import { defineConfig, devices } from '@playwright/test';

/**
 * The geometry suite (TRD §5.2, §8.2).
 *
 * Separate from `npm test` because these assertions are about layout, and
 * layout needs a browser that lays things out. jsdom would pass them all
 * without measuring anything.
 */
export default defineConfig({
  testDir: './test/geometry',
  fullyParallel: true,
  reporter: process.env['CI'] ? 'github' : 'list',
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
  use: {
    baseURL: 'http://localhost:4173',
    // Set where a Chromium is already on disk and `playwright install` is not
    // wanted (a sandbox, a container image that ships one).
    ...(process.env['CHROMIUM_PATH']
      ? { launchOptions: { executablePath: process.env['CHROMIUM_PATH'] } }
      : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Android Chrome is the primary target (TRD §1). Emulation is not a device
    // — the Phase 1 exit criterion still needs a real one — but it is the
    // closest thing that can run on every commit.
    { name: 'android', use: { ...devices['Pixel 7'] } },
  ],
});
