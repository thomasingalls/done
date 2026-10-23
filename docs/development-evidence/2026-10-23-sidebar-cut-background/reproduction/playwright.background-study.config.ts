import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'/Users/thomasingalls/.codex/worktrees/7fda/done/docs/development-evidence/2026-10-23-sidebar-cut-background/reproduction',
 outputDir:'/private/tmp/done-ux-20261023-patches/artifacts-51-background',timeout:120000,workers:1,retries:0,
 reporter:[['list'],['json',{outputFile:'/private/tmp/done-ux-20261023-patches/checks-51/background-report.json'}]],
 use:{baseURL:'http://localhost:53221',viewport:{width:1280,height:900},launchOptions:{executablePath:'/Users/thomasingalls/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'}}
});
