import { defineConfig, devices } from '@playwright/test';
const root = '/Users/thomasingalls/.codex/worktrees/7fda/done';
const scratch = '/private/tmp/done-ux-20261023-patches';
const phase = process.env.UX_PHASE ?? '48';
const candidate = !process.env.UX_REFERENCE;
export default defineConfig({
 testDir: root + '/test/geometry', outputDir: scratch + '/artifacts-' + phase + (candidate ? '-candidate' : '-reference'),
 timeout:30000, workers:1,retries:0,
 reporter:[['list'],['json',{outputFile:scratch + '/checks-' + phase + '/' + (candidate ? 'candidate' : 'reference') + '-browser.json'}]],
 use:{baseURL:'http://localhost:54176',launchOptions:{executablePath:'/Users/thomasingalls/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'}},
 projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'android',use:{...devices['Pixel 7']}}],
 webServer:{command:process.execPath + ' ' + root + '/node_modules/vite/bin/vite.js --host 127.0.0.1 --port 54176 --strictPort',cwd:candidate ? root : scratch+'/reference-47',port:54176,reuseExistingServer:false,env:{APP_BUILD_REVISION:'c4a66c79ddfc924c4c1f9b978428f544b16b4a61-dirty',APP_BUILD_DATE:'2026-10-23'}}
});
