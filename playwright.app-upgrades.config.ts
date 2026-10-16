import { defineConfig } from '@playwright/test';
const output = process.env['APP_UPGRADE_OUTPUT'];
const origin = process.env['APP_UPGRADE_ORIGIN'];
if (origin && !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(origin))
  throw Error('Upgrade fixture requires its owned loopback origin');
if (!output) throw Error('Run pnpm storage:app-upgrades to prepare isolated releases.');
export default defineConfig({
  testDir: './test/app-upgrades',
  timeout: 35_000,
  workers: 1,
  outputDir: `${output}/artifacts`,
  reporter: [['list'], ['json', { outputFile: `${output}/native.json` }]],
  use: {
    baseURL: origin ?? 'http://127.0.0.1:4197',
    headless: true,
    viewport: { width: 1280, height: 900 },
    ...(process.env['CHROMIUM_PATH']
      ? { launchOptions: { executablePath: process.env['CHROMIUM_PATH'] } }
      : {}),
  },
  webServer: origin
    ? undefined
    : {
        command: 'node scripts/app-upgrades/server.mjs',
        url: 'http://127.0.0.1:4197/',
        reuseExistingServer: false,
      },
});
