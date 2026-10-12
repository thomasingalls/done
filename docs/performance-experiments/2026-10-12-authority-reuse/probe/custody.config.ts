import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'custody.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 120000,
  reporter: 'list',
  outputDir: process.env.DONE_PERF_RESULTS + '/artifacts',
  use: { baseURL: 'http://localhost:53221', viewport: { width: 1280, height: 900 } },
});
