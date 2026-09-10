import { build } from 'vite';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { native as base } from '../account-editing/fixtures.mjs';
export * from '../account-editing/fixtures.mjs';
export async function captureBundle(control) {
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: control
      ? [
          {
            name: 'capture-control',
            enforce: 'pre',
            transform(code, id) {
              if (control === 'old-reader' && id.endsWith('/src/crdt/promotionRecord.ts'))
                return execFileSync('git', ['show', '18ceb40:src/crdt/promotionRecord.ts'], {
                  encoding: 'utf8',
                });
              const targets = {
                retention: [
                  '/src/crdt/accountCapture.ts',
                  "{ kind: 'outbound', bytes: bytes.slice() }",
                  '...[]',
                ],
                route: [
                  '/src/crdt/sourceCapture.ts',
                  "if (result[key] !== route[key]) throw Error('route');",
                  'void 0;',
                ],
              };
              const target = targets[control];
              if (target && id.endsWith(target[0])) {
                if (code.split(target[1]).length !== 2)
                  throw Error('Missing/ambiguous capture control');
                return code.replace(target[1], target[2]);
              }
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-capture/browser.ts'),
        name: 'Harness',
        formats: ['iife'],
      },
    },
  });
  return (Array.isArray(result) ? result[0] : result).output.find((f) => f.type === 'chunk').code;
}
const script = await captureBundle();
export async function native(t) {
  const f = await base(t),
    setup = f.setup;
  f.setup = async (page) => {
    await setup(page);
    await page.evaluate(script);
    await configure(page);
  };
  await f.setup(f.page);
  return f;
}
export async function configure(page) {
  await page.evaluate(() => {
    window.openEditor = async (item) => {
      window.opened = await Harness.openOwnedCapturedAccountWorkspace(optionsFor(item));
      window.editor = opened.workspace;
      window.surface = editor.text({ kind: 'master' });
      return editor.read();
    };
  });
}
export const captures = (page) =>
  page.evaluate(async () => {
    const list = await opened.listCaptures();
    try {
      return list.map((c) => ({
        ...c,
        sources: c.sources.map((s) => ({ ...s, bytes: [...s.bytes] })),
      }));
    } finally {
      for (const c of list) Harness.eraseCapsule(c);
    }
  });
export const crash = async (f) => {
  const cdp = await f.context.newCDPSession(f.page),
    crashed = f.page.waitForEvent('crash');
  void cdp.send('Page.crash').catch(() => {});
  await crashed;
};
export const freezeFlush = (page) =>
  page.evaluate(() => {
    const timeout = window.setTimeout;
    window.setTimeout = function (fn, ms, ...args) {
      return timeout.call(this, fn, ms === 250 ? 60000 : ms, ...args);
    };
  });
