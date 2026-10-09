import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/device-enrollment',
  outputDir: './test-results/device-enrollment/artifacts',
  timeout: 90000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:53218',
    viewport: { width: 1280, height: 900 },
    ...(process.env['CHROMIUM_PATH']
      ? { launchOptions: { executablePath: process.env['CHROMIUM_PATH'] } }
      : {}),
  },
  webServer: {
    command: 'node scripts/dev-account-setup.mjs',
    env: {
      ACCOUNT_SETUP_PORT: '53218',
      ACCOUNT_SETUP_STATE:
        process.env['ACCOUNT_ENROLLMENT_TEST_STATE'] ??
        'test-results/device-enrollment/service-' + Date.now(),
    },
    url: 'http://localhost:53218/private/account-enrollment.html',
    timeout: 30000,
    reuseExistingServer: false,
  },
});
