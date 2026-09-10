import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/local-app',
  testMatch:
    process.env['LOCAL_STARTUP_PREVIEW'] === '1' ? '**/packaged.spec.ts' : '**/startup.spec.ts',
  outputDir: './test-results/local-app/artifacts',
  timeout: 30_000,
  workers: 1,
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: `test-results/local-app/${process.env['LOCAL_STARTUP_PREVIEW'] === '1' ? 'packaged' : 'native'}.json`,
      },
    ],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4181',
    headless: true,
    ...(process.env['CHROMIUM_PATH']
      ? { launchOptions: { executablePath: process.env['CHROMIUM_PATH'] } }
      : {}),
  },
  webServer: {
    command: `node node_modules/vite/bin/vite.js ${process.env['LOCAL_STARTUP_PREVIEW'] === '1' ? 'preview' : ''} --host 127.0.0.1 --port 4181 --strictPort`,
    url: 'http://127.0.0.1:4181/local.html',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
