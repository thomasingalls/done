import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'requests.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 300000,
  outputDir: process.env.REQUEST_OUTPUT + '/artifacts',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:53221',
    actionTimeout: 15000,
    viewport: { width: 1280, height: 900 },
  },
});
