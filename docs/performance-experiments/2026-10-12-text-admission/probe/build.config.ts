// Retained lockfile supplies this build-only transitive dependency; it is not shipped.
import MagicString from '../../../../node_modules/.pnpm/magic-string@0.30.21/node_modules/magic-string/dist/magic-string.es.mjs';
import { defineConfig } from 'vite';
import base from '../../../../vite.config';
export default defineConfig(async (env) => {
  const config = await (typeof base === 'function' ? base(env) : base);
  return {
    ...config,
    plugins: [
      {
        name: 'bounded-input-handler-timing',
        enforce: 'pre' as const,
        transform(code: string, id: string) {
          if (!id.endsWith('/src/editor/admittedEditor.ts')) return;
          const start = 'const input = (action: TextAction, at = selection) => {',
            end = '    return true;\n  };\n  const bind';
          if (!code.includes(start) || !code.includes(end))
            throw Error('Handler probe anchor changed');
          const transformed = new MagicString(code);
          const beginAt = code.indexOf(start) + start.length;
          transformed.appendLeft(beginAt, '\n    const probeStart = performance.now();\n    try {');
          const endAt = code.indexOf(end);
          transformed.overwrite(
            endAt,
            endAt + end.length,
            '    return true;\n    } finally { (globalThis as any).__textHandlers?.push(performance.now()-probeStart); }\n  };\n  const bind',
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
