import { defineConfig, devices } from '@playwright/test';
const root = '/Users/thomasingalls/.codex/worktrees/7fda/done';
const scratch = '/private/tmp/done-ux-20261023-patches';
export default defineConfig({
 testDir: root + '/test/geometry', outputDir: scratch + '/artifacts-53-built',
 timeout:30000, workers:1,retries:0,
 reporter:[['list'],['json',{outputFile:scratch + '/checks-53/geometry-report.json'}]],
 use:{baseURL:'http://localhost:54181',launchOptions:{executablePath:'/Users/thomasingalls/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'}},
 projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'android',use:{...devices['Pixel 7']}}],
 webServer:{command:process.execPath + ' ' + root + '/node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 54181 --strictPort',cwd:root,port:54181,reuseExistingServer:false}
});
