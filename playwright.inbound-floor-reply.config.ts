import { defineConfig } from '@playwright/test';
import floor from './playwright.inbound-floor.config';
export default defineConfig({
  ...floor,
  testDir: './test/inbound-floor-reply',
  testMatch: '*.spec.ts',
  outputDir: './test-results/inbound-floor-reply/artifacts',
  reporter: [['list'], ['json', { outputFile: 'test-results/inbound-floor-reply/results.json' }]],
});
