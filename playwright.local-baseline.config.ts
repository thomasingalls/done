import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/local-baseline',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results/local-baseline-transitions/native',
  timeout: 120000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://localhost:53221', viewport: { width: 1280, height: 900 } },
});
