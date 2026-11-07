import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/inbound-index',
  testMatch: '*.spec.ts',
  outputDir: './test-results/inbound-index/artifacts',
  timeout: 120000,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/inbound-index/results.json' }]],
  use: { baseURL: 'http://localhost:54371', viewport: { width: 1280, height: 900 } },
});
