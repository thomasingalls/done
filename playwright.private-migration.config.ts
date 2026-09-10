import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/private-migration',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results/private-migration/artifacts',
  timeout: 90_000,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/private-migration/report.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4193',
    viewport: { width: 1280, height: 900 },
    headless: true,
    serviceWorkers: 'block',
    ...(process.env['CHROMIUM_PATH']
      ? { launchOptions: { executablePath: process.env['CHROMIUM_PATH'] } }
      : {}),
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4193 --strictPort',
    url: 'http://127.0.0.1:4193/private/migration.html',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
