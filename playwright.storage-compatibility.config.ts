import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/storage-compatibility',
  outputDir: './test-results/storage-compatibility/artifacts',
  timeout: 35_000,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/storage-compatibility/native.json' }]],
  use: { baseURL: 'http://127.0.0.1:4198', headless: true },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4198 --strictPort',
    url: 'http://127.0.0.1:4198/test/storage-compatibility/',
    reuseExistingServer: false,
  },
});
