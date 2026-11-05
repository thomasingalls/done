/** Genuine native installation; the isolated build constructs an authenticated retained reading. */
import { defineConfig } from '@playwright/test';
import floor from './playwright.inbound-floor.config';
export default defineConfig({
  ...floor,
  testDir: './test/inbound-installation',
  testMatch: '*.spec.ts',
  outputDir: './test-results/inbound-installation/artifacts',
  reporter: [['list'], ['json', { outputFile: 'test-results/inbound-installation/results.json' }]],
});
