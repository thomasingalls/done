import { defineConfig } from '@playwright/test';
import floor from './playwright.inbound-floor.config';
export default defineConfig({
  ...floor,
  testDir: './test/inbound-audit',
  testMatch: '*.spec.ts',
  outputDir: './test-results/inbound-audit/artifacts',
  reporter: [['list'], ['json', { outputFile: 'test-results/inbound-audit/results.json' }]],
});
