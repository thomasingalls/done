import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/inbound-native',
  testMatch: 'dense.spec.ts',
  outputDir: './test-results/inbound-native/artifacts',
  timeout: 120000,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/inbound-native/results.json' }]],
  use: {
    baseURL: 'http://localhost:53221',
    viewport: { width: 1280, height: 900 },
    ...(process.env['CHROMIUM_PATH']
      ? { launchOptions: { executablePath: process.env['CHROMIUM_PATH'] } }
      : {}),
  },
});
