import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'seed-initial.spec.ts',workers:1,retries:0,timeout:300000,reporter:'list',outputDir:process.env.SYNC_OUT+'/artifacts',use:{baseURL:'http://localhost:53781',viewport:{width:1440,height:1000},actionTimeout:30000,trace:'off',screenshot:'off',video:'off'}});
