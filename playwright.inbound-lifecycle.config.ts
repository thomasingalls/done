import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/inbound-lifecycle',
  testMatch: '*.spec.ts',
  timeout: 120000,
  workers: 1,
  retries: 0,
  outputDir: './test-results/inbound-lifecycle/artifacts',
  reporter: [['list'], ['json', { outputFile: 'test-results/inbound-lifecycle/results.json' }]],
  use: {
    baseURL: 'http://localhost:53221',
    viewport: { width: 1280, height: 900 },
    actionTimeout: 15000,
    navigationTimeout: 15000,
  },
});
