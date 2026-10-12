import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import base from '../../../../vite.config';

const dependency = createRequire(createRequire(import.meta.url).resolve('vite'));
const { parse } = dependency('@babel/parser');
const MagicString = dependency('magic-string');

// Build-only diagnostics. Runtime source, persisted evidence and authority decisions are unchanged.
export default defineConfig(async (env) => {
  const config = typeof base === 'function' ? await base(env) : await base;
  return {
    ...config,
    plugins: [
      {
        name: 'receive-attribution',
        enforce: 'pre' as const,
        transform(source: string, id: string) {
          const wanted = id.endsWith('/src/crdt/accountReceive.ts')
            ? new Set(['state', 'prepareRead', 'assertCurrent'])
            : id.endsWith('/src/crdt/accountInbound.ts')
              ? new Set(['verify'])
              : id.endsWith('/src/crdt/inboundLedger.ts')
                ? new Set(['verifyInboundLedger'])
                : undefined;
          if (!wanted) return;
          const file = parse(source, { sourceType: 'module', plugins: ['typescript'] });
          const edited = new MagicString(source);
          const found = new Set<string>();
          const visit = (node: any) => {
            if (!node || typeof node !== 'object') return;
            let name: string | undefined;
            let body: any;
            if (node.type === 'FunctionDeclaration' && node.id && node.body) {
              name = node.id.name;
              body = node.body;
            } else if (
              node.type === 'VariableDeclarator' &&
              node.id?.type === 'Identifier' &&
              node.init?.type === 'ArrowFunctionExpression' &&
              node.init.body?.type === 'BlockStatement'
            ) {
              name = node.id.name;
              body = node.init.body;
            }
            if (name && body && wanted.has(name)) {
              found.add(name);
              edited.appendLeft(
                body.start + 1,
                `const __attributionEnd = (globalThis as any).__attribution?.start(${JSON.stringify(id.split('/').at(-1) + '.' + name)}); try {`,
              );
              edited.appendLeft(body.end - 1, '} finally { __attributionEnd?.(); }');
            }
            for (const [key, value] of Object.entries(node)) {
              if (['loc', 'comments', 'tokens'].includes(key)) continue;
              if (Array.isArray(value)) value.forEach(visit);
              else if (value && typeof value === 'object') visit(value);
            }
          };
          visit(file);
          for (const name of wanted)
            if (!found.has(name)) throw Error('Missing diagnostic function: ' + name);
          return {
            code: edited.toString(),
            map: edited.generateMap({ hires: true, source: id, includeContent: true }),
          };
        },
      },
      ...(config.plugins ?? []),
    ],
  };
});
