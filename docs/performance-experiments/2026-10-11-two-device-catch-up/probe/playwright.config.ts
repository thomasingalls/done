import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'catchup.spec.ts',
  workers: 1,
  retries: 0,
  timeout: Number(process.env.CATCHUP_TEST_TIMEOUT ?? 3600000),
  outputDir: process.env.CATCHUP_OUTPUT + '/artifacts',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:' + (process.env.DONE_CATCHUP_PORT ?? '53781'),
    actionTimeout: 15000,
    viewport: { width: 1280, height: 900 },
  },
});
