import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/first-device-upgrade',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results/account-setup-upgrade/artifacts',
  timeout: 120000,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/account-setup-upgrade/results.json' }]],
  use: {
    ...(process.env['CHROMIUM_PATH']
      ? { launchOptions: { executablePath: process.env['CHROMIUM_PATH'] } }
      : {}),
  },
});
