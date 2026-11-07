import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/inbound-continuation',
  testMatch: '*.spec.ts',
  outputDir: './test-results/inbound-continuation/artifacts',
  timeout: 120000,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/inbound-continuation/results.json' }]],
  use: { baseURL: 'http://localhost:54371', viewport: { width: 1280, height: 900 } },
});
