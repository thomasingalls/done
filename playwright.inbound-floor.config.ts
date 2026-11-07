/** Disposable genuine Account-owner tests; no parser/native/authentication replacement. */
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/inbound-receipt-floor',
  testMatch: 'worker.spec.ts',
  outputDir: './test-results/inbound-receipt-floor/artifacts',
  timeout: 120000,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/inbound-receipt-floor/results.json' }]],
  use: {
    baseURL: 'http://localhost:53221',
    viewport: { width: 1280, height: 900 },
    ...(process.env['CHROMIUM_PATH']
      ? { launchOptions: { executablePath: process.env['CHROMIUM_PATH'] } }
      : {}),
  },
});
