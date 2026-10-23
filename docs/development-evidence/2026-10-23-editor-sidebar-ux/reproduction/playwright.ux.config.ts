import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
 testDir: '/Users/thomasingalls/.codex/worktrees/7fda/done' + '/test/geometry', outputDir: '/private/tmp/done-ux-20261023-patches' + '/artifacts-' + (process.env.UX_REFERENCE ? 'reference' : 'candidate'),
 timeout:30000, workers:1,retries:0,
 reporter:[['list'],['json',{outputFile:'/private/tmp/done-ux-20261023-patches' + '/checks/' + (process.env.UX_REFERENCE ? 'reference' : 'candidate') + '-browser.json'}]],
 use:{baseURL:'http://localhost:54173',viewport:{width:1280,height:900},launchOptions:{executablePath:'/Users/thomasingalls/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'}},
 projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'android',use:{...devices['Pixel 7']}}],
 webServer:{command:process.execPath + ' ' + '/Users/thomasingalls/.codex/worktrees/7fda/done' + '/node_modules/vite/bin/vite.js ' + (process.env.UX_PACKAGED ? 'preview ' : '') + '--host 127.0.0.1 --port 54173 --strictPort',cwd:process.env.UX_REFERENCE ? '/private/tmp/done-ux-20261023-patches'+'/reference' : '/Users/thomasingalls/.codex/worktrees/7fda/done',url:'http://localhost:54173',reuseExistingServer:false,timeout:30000}
});
