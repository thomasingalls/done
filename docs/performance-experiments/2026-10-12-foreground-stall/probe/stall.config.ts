import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'stall.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 1800000,
  reporter: 'list',
  outputDir: process.env.DONE_PERF_RESULTS + '/artifacts',
  use: {
    baseURL: 'http://localhost:53771',
    viewport: { width: 1440, height: 1000 },
    actionTimeout: 30000,
  },
});
