import { defineConfig, devices } from '@playwright/test';

/**
 * The latency suite (TRD §12, sequencing.md §3.1).
 *
 * Separate from `playwright.config.ts` because it is run on a different
 * occasion and under a different discipline. The geometry suite asserts
 * layout invariants and belongs on every commit; this one takes measurements,
 * and a measurement taken while something else is running is a measurement of
 * the something else. Hence one worker, no parallelism and no retries — a
 * retried measurement is a second sample silently reported as the first.
 *
 * It is deliberately absent from `pnpm check`. Recording is an act, not a
 * side effect of a build, which is the same argument `docs/performance.md`
 * makes for the bundle budget's `--record`.
 */
export default defineConfig({
  testDir: './test/latency',
  globalSetup: './test/latency/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Seeding the corpus through the interface is not fast, and it is the part
  // that makes the start-up numbers mean anything.
  timeout: 300_000,
  reporter: process.env['CI'] ? 'github' : 'list',
  webServer: {
    command: 'pnpm build && pnpm exec vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
  use: {
    baseURL: 'http://localhost:4173',
    ...(process.env['CHROMIUM_PATH']
      ? { launchOptions: { executablePath: process.env['CHROMIUM_PATH'] } }
      : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // The closest thing to TRD §12's "low-end device" that runs without one.
    // Device emulation alone changes the viewport and the user agent and
    // nothing else, so the suite additionally throttles the CPU — see
    // CPU_THROTTLE in latency.spec.ts. That is a convention, not a handset:
    // Stage 1's low-end journal AEAD budget still wants a real device, and
    // PRD Phase 1's exit criterion already says emulation is not one.
    { name: 'android', use: { ...devices['Pixel 7'] } },
  ],
});
