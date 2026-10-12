import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import base from '../../2026-10-12-online-typing/probe/build.config';
// Reference source is extracted from 008b2fa9; no working-tree rewrite between builds.
export default defineConfig(async (env) => {
  const config = await (typeof base === 'function' ? base(env) : base);
  return {
    ...config,
    plugins: [
      {
        name: 'owned-reservation-reference',
        enforce: 'pre' as const,
        load(id: string) {
          if (process.env.RESERVATION_REFERENCE_SOURCE && id.endsWith('/src/crdt/contentStore.ts'))
            return readFileSync(process.env.RESERVATION_REFERENCE_SOURCE, 'utf8');
        },
      },
      config.plugins,
    ],
  };
});
