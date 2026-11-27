/** Send-cost measurement build (phase 554): the application config plus one driver input.
 * Build from the repository root, for example:
 *   VITE_ACCOUNT_LEDGER_PROFILE=1 VITE_ACCOUNT_RETENTION_AUTO=1 VITE_ACCOUNT_RETENTION_RESUME=1 \
 *   VITE_ACCOUNT_RANGE_RECEIVE=1 pnpm exec vite build \
 *     --config scripts/performance/send-cost/vite.config.ts --outDir <absolute scratch path>
 */
import { defineConfig, type ConfigEnv, type UserConfig } from 'vite';
import application from '../../../vite.config';

export default defineConfig(async (env: ConfigEnv) => {
  const base = (await (typeof application === 'function'
    ? application(env)
    : application)) as UserConfig;
  const input = base.build?.rollupOptions?.input as Record<string, string>;
  return {
    ...base,
    build: {
      ...base.build,
      emptyOutDir: true,
      rollupOptions: {
        ...base.build?.rollupOptions,
        input: { ...input, sendCost: 'scripts/performance/send-cost/driver.html' },
      },
    },
  };
});
