import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'phone.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 600000,
  outputDir: process.env.DONE_PERF_RESULTS + '/artifacts',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:53771',
    actionTimeout: 30000,
    viewport: { width: 1440, height: 1000 },
  },
});
