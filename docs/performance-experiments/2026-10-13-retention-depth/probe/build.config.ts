import MagicString from '../../../../node_modules/.pnpm/magic-string@0.30.21/node_modules/magic-string/dist/magic-string.es.mjs';
import { defineConfig } from 'vite';
import base from '../../../../vite.config';
export default defineConfig(async (env) => {
  const config = await (typeof base === 'function' ? base(env) : base);
  let hits = 0;
  return {
    ...config,
    define: {
      ...config.define,
      'import.meta.env.VITE_ACCOUNT_BASELINE_INSTALL': JSON.stringify('1'),
      'import.meta.env.VITE_ACCOUNT_BASELINE_READ': JSON.stringify('1'),
      'import.meta.env.VITE_ACCOUNT_RETENTION': JSON.stringify('1'),
      'import.meta.env.VITE_ACCOUNT_LEDGER_PROFILE': JSON.stringify('1'),
    },
    build: { ...config.build, outDir: process.env.DONE_PERF_DIST, sourcemap: true },
    plugins: [
      config.plugins,
      {
        name: 'observe-real-retention-owner',
        enforce: 'pre' as const,
        transform(code: string, id: string) {
          if (!id.endsWith('/src/crdt/accountReceive.ts')) return;
          const at = '  clearAccountTransition(result.accountId);';
          if (code.split(at).length !== 2) throw Error('Owner observation anchor changed');
          hits++;
          const out = new MagicString(code);
          out.appendLeft(code.indexOf(at) + at.length, '\n globalThis.__depthOwner = result;');
          return {
            code: out.toString(),
            map: out.generateMap({ source: id, includeContent: true, hires: true }),
          };
        },
        buildEnd(error: unknown) {
          if (!error && hits !== 1) throw Error('Owner not observed once');
        },
      },
    ],
  };
});
