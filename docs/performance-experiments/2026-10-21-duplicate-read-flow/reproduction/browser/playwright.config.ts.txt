import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'live-sync.spec.ts', workers: 1, retries: 0, timeout: 1200000,
  reporter: [['list'], ['json',{outputFile:process.env.SYNC_OUT+'/runner.json'}]],
  outputDir:process.env.SYNC_OUT+'/artifacts',
  use:{baseURL:'http://localhost:53781',viewport:{width:1440,height:1000},actionTimeout:30000,trace:'off',screenshot:'off',video:'off'},
});
