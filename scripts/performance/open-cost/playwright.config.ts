import { defineConfig } from '@playwright/test';
/** Open-cost measurement harness (phase 555); see harness.ts. */
export default defineConfig({
  testDir: '.',
  testMatch: 'harness.ts',
  outputDir: '../../../test-results/open-cost/artifacts',
  workers: 1,
  retries: 0,
  reporter: [['list']],
});
