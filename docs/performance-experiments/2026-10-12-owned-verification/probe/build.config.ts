import MagicString from '../../../../node_modules/.pnpm/magic-string@0.30.21/node_modules/magic-string/dist/magic-string.es.mjs';
import { defineConfig } from 'vite';
import base from '../../2026-10-12-warm-ledger/probe/build.config';
export default defineConfig(async (env) => {
  const config = await (typeof base === 'function' ? base(env) : base);
  return {
    ...config,
    plugins: [
      {
        name: 'copy-call-attribution',
        enforce: 'pre' as const,
        transform(code: string, id: string) {
          if (!id.endsWith('/src/crdt/verifiedRecords.ts')) return;
          const anchor =
            'export const copyRecords = (rows: readonly OpenedRecord[]): OpenedRecord[] => {';
          if (!code.includes(anchor)) throw Error('Record-copy anchor changed');
          const out = new MagicString(code);
          out.appendLeft(
            code.indexOf(anchor) + anchor.length,
            `
            (globalThis as any).__recordCopyCalls?.push({ at: performance.now(), rows: rows.length,
              bytes: rows.reduce((n, r) => n + r.bytes.length, 0), stack: new Error().stack });`,
          );
          return {
            code: out.toString(),
            map: out.generateMap({ source: id, includeContent: true, hires: true }),
          };
        },
      },
      config.plugins,
    ],
  };
});
