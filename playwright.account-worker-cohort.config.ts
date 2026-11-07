import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'test/account-worker-cohort',
  testMatch: '*.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 30000,
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
  ],
  use: { headless: true, trace: 'off', screenshot: 'off', video: 'off' },
  outputDir: process.env['COHORT_OUTPUT'] ?? 'test-results/account-worker-cohort',
});
