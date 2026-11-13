/** Probe-only Vitest configuration: the application's own Vite config, Node environment, and only
 * the phase 559 codec probe. Never part of `pnpm test`. */
import { defineConfig, type UserConfig } from 'vite';
import application from '../../../vite.config';

export default defineConfig((env) => {
  const base = (typeof application === 'function' ? application(env) : application) as UserConfig;
  return {
    ...base,
    test: {
      include: ['scripts/performance/hex-cost/*.probe.ts'],
      environment: 'node',
      setupFiles: ['./test/setup.ts'],
      maxWorkers: 1,
      fileParallelism: false,
      testTimeout: 600_000,
    },
  } as UserConfig;
});
