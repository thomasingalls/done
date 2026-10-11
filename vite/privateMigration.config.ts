import { defineConfig, mergeConfig } from 'vite';
import app from '../vite.config';

// Keep rehearsal optimization separate from the operator's running development server, and
// discover the fixture's dependencies alongside the UI so seeding does not introduce new ones.
export default defineConfig((env) =>
  mergeConfig(app(env), {
    cacheDir: 'test-results/private-migration/vite-cache',
    optimizeDeps: {
      entries: [
        'index.html',
        'local.html',
        'private/migration.html',
        'test/legacy-export/index.html',
      ],
    },
  }),
);
