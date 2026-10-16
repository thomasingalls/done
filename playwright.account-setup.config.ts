import { defineConfig } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
const accountSetupState = resolve('.dev/account-setup-browser-tests', randomUUID());
export default defineConfig({
  testDir: './test/first-device-setup',
  metadata: { accountSetupState },
  outputDir: './test-results/account-setup/artifacts',
  timeout: 90000,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/account-setup/results.json' }]],
  use: {
    baseURL: 'http://localhost:53211',
    viewport: { width: 1280, height: 900 },
    ...(process.env['CHROMIUM_PATH']
      ? { launchOptions: { executablePath: process.env['CHROMIUM_PATH'] } }
      : {}),
  },
  webServer: {
    command: 'node scripts/dev-account-setup.mjs',
    env: { ACCOUNT_SETUP_PORT: '53211', ACCOUNT_SETUP_STATE: accountSetupState },
    url: 'http://localhost:53211/private/account-setup.html',
    timeout: 30000,
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
  },
});
