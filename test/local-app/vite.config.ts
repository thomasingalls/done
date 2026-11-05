import { defineConfig, mergeConfig } from 'vite';
import application from '../../vite.config';

/** Frozen dev-fixture assets must remain loadable when this test goes offline.
 * Production offline installation is covered separately by packaged.spec.ts.
 * Keep the actual Worker modules, lifecycle and storage implementation intact. */
export default defineConfig(async (environment) =>
  mergeConfig(await application(environment), {
    server: { headers: { 'Cache-Control': 'public, max-age=3600' } },
  }),
);
