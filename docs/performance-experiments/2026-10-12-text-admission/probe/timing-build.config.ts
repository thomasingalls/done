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
          return code
            .replace(start, start + '\n    const probeStart = performance.now();\n    try {')
            .replace(
              end,
              '    return true;\n    } finally { (globalThis as any).__textHandlers?.push(performance.now()-probeStart); }\n  };\n  const bind',
            );
        },
      },
      config.plugins,
    ],
  };
});
