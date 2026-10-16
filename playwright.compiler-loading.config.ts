import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/compiler-loading',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results/compiler-loading/artifacts',
  timeout: 60_000,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/compiler-loading/report.json' }]],
  use: {
    headless: true,
    serviceWorkers: 'block',
    ...(process.env['CHROMIUM_PATH']
      ? { launchOptions: { executablePath: process.env['CHROMIUM_PATH'] } }
      : {}),
  },
});
