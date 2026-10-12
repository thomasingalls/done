import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'controls.spec.ts',workers:1,retries:0,timeout:120000,
 outputDir:process.env.DONE_PERF_RESULTS+'/artifacts',reporter:'list',use:{baseURL:'http://localhost:53771',actionTimeout:30000}});
