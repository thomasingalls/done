import MagicString from '../../../../node_modules/.pnpm/magic-string@0.30.21/node_modules/magic-string/dist/magic-string.es.mjs';
import { defineConfig } from 'vite';
import base from '../../2026-10-12-text-admission/probe/build.config';
export default defineConfig(async (env) => {
  const config = await (typeof base === 'function' ? base(env) : base);
  return {
    ...config,
    plugins: [
      {
        name: 'warm-load-spans',
        enforce: 'pre' as const,
        transform(code: string, id: string) {
          if (!id.endsWith('/src/crdt/accountLedgerMetrics.ts')) return;
          const anchor = 'row.maxMs = Math.max(row.maxMs, ms);';
          if (!code.includes(anchor)) throw Error('Work span anchor changed');
          const transformed = new MagicString(code);
          const at = code.indexOf(anchor) + anchor.length;
          transformed.appendLeft(
            at,
            ' (globalThis as any).__warmWork?.push({ name, at: since, ms });',
          );
          return {
            code: transformed.toString(),
            map: transformed.generateMap({ source: id, includeContent: true, hires: true }),
          };
        },
      },
      config.plugins,
    ],
  };
});
