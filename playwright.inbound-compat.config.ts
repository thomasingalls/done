import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/inbound-compat',
  testMatch: '*.spec.ts',
  timeout: 120000,
  workers: 1,
  retries: 0,
  outputDir: './test-results/inbound-compat/artifacts',
  reporter: [['list'], ['json', { outputFile: 'test-results/inbound-compat/results.json' }]],
});
