import { defineConfig } from '@playwright/test';
/** Send-cost measurement harness (phase 554); one step per run, see harness.ts. */
export default defineConfig({
  testDir: '.',
  testMatch: 'harness.ts',
  outputDir: '../../../test-results/send-cost/artifacts',
  workers: 1,
  retries: 0,
  reporter: [['list']],
});
