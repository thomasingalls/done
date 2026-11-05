import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const packaged = process.env['LOCAL_STARTUP_PREVIEW'] === '1';
const releaseRoot = process.env['LOCAL_STARTUP_PREVIEW_ROOT'];
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
if (releaseRoot && !packaged) throw Error('A release root requires packaged preview mode.');

export default defineConfig({
  testDir: './test/local-app',
  testMatch: packaged ? '**/packaged.spec.ts' : ['**/startup.spec.ts', '**/editor.spec.ts'],
  outputDir: './test-results/local-app/artifacts',
  timeout: 30_000,
  workers: 1,
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile:
          process.env['LOCAL_STARTUP_REPORT'] ??
          `test-results/local-app/${packaged ? 'packaged' : 'native'}.json`,
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
    command: `node node_modules/vite/bin/vite.js ${packaged ? 'preview' : '--config vite/localStartupFixture.config.ts'}${releaseRoot ? ` --outDir ${quote(resolve(releaseRoot))}` : ''} --host 127.0.0.1 --port 4181 --strictPort`,
    url: 'http://127.0.0.1:4181/local.html',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
