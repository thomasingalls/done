import MagicString from '../../../../node_modules/.pnpm/magic-string@0.30.21/node_modules/magic-string/dist/magic-string.es.mjs';
import { defineConfig } from 'vite';
import base from '../../2026-10-12-owned-verification/probe/build.config';
export default defineConfig(async (env) => {
  const config = await (typeof base === 'function' ? base(env) : base);
  return {
    ...config,
    plugins: [
      {
        name: 'online-text-attribution',
        enforce: 'pre' as const,
        transform(code: string, id: string) {
          const out = new MagicString(code);
          const before = (anchor: string, text: string) => {
            if (code.split(anchor).length !== 2) throw Error('Ambiguous probe anchor: ' + anchor);
            out.appendLeft(code.indexOf(anchor), text);
          };
          const after = (anchor: string, text: string) => {
            if (code.split(anchor).length !== 2) throw Error('Ambiguous probe anchor: ' + anchor);
            out.appendLeft(code.indexOf(anchor) + anchor.length, text);
          };
          if (id.endsWith('/src/crdt/workspaceCommands.ts')) {
            before(
              '  const text = targetText(doc, command.target),',
              `const __planAt = performance.now(); let __chars = 0; try {\n`,
            );
            before(
              '  const state = EditorState.create({',
              `__chars = text.length; const __stateAt = performance.now();\n`,
            );
            before(
              '  let transaction: Transaction | undefined,',
              `(globalThis as any).__textWork?.push({kind:'planState', at:__stateAt, ms:performance.now()-__stateAt, chars:__chars});\n`,
            );
            after(
              '  return { text, key, transaction, rest };',
              `\n} finally { (globalThis as any).__textWork?.push({kind:'plan', at:__planAt, ms:performance.now()-__planAt, chars:__chars}); }`,
            );
          } else if (id.endsWith('/src/editor/admittedEditor.ts')) {
            before(
              '  function project(force = false) {',
              `(globalThis as any).__perfEditors ??= []; (globalThis as any).__perfEditors.push(view);\n`,
            );
            after('  function project(force = false) {', `\nconst __at=performance.now(); try {`);
            before('  function renderStatus() {', ` `);
            const end = '  }\n  function renderStatus() {';
            before(
              end,
              `} finally { (globalThis as any).__textWork?.push({kind:'project',at:__at,ms:performance.now()-__at,chars:view.state.doc.length,surface:options.surface??'document'}); }\n`,
            );
            before(
              '      const snapshot = document.read();',
              `const __readAt=performance.now();\n`,
            );
            after(
              '      const snapshot = document.read();',
              `\n(globalThis as any).__textWork?.push({kind:'projectRead',at:__readAt,ms:performance.now()-__readAt,chars:snapshot.text.length,surface:options.surface??'document'}); const __stringAt=performance.now();`,
            );
            after(
              '        after = snapshot.text;',
              `\n(globalThis as any).__textWork?.push({kind:'projectString',at:__stringAt,ms:performance.now()-__stringAt,chars:after.length,surface:options.surface??'document'});`,
            );
            before(
              '      let changes: { from: number; to: number; insert: string } | undefined;',
              `const __diffAt=performance.now();\n`,
            );
            before(
              '      projecting = true;\n      try {\n        view.dispatch({\n          ...(changes',
              `(globalThis as any).__textWork?.push({kind:'projectDiff',at:__diffAt,ms:performance.now()-__diffAt,chars:after.length,surface:options.surface??'document'});\n`,
            );
          } else if (id.endsWith('/src/crdt/accountSyncDriver.ts')) {
            before(
              "  options.signal.addEventListener('abort', stop, { once: true });",
              `(globalThis as any).__perfSync = () => structuredClone(value);\n`,
            );
          } else return;
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
