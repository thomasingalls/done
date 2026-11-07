/** Native regression control only; all geometry test bounds and browser settings stay inherited. */
import { defineConfig } from '@playwright/test';
import geometry from './playwright.config';

const webServer = geometry.webServer;
if (!webServer || Array.isArray(webServer))
  throw Error('Expected the original geometry web server');

export default defineConfig({
  ...geometry,
  outputDir: './test-results/geometry-focus-control',
  reporter: [['list'], ['json', { outputFile: 'test-results/geometry-focus-control-report.json' }]],
  webServer: {
    ...webServer,
    command:
      'pnpm yjs:check && pnpm typecheck && pnpm exec vite build --config vite/geometryFocusFixture.config.ts && pnpm budget && node scripts/check-origin-isolation.mjs && pnpm exec vite preview --port 4173 --strictPort',
    reuseExistingServer: false,
  },
});
