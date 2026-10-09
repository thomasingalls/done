import { build } from 'vite';
import { resolve } from 'node:path';
import { native as base, selected, args } from '../account-receive/fixtures.mjs';
export * from '../account-receive/fixtures.mjs';
export async function editorBundle(control) {
  let hits = 0;
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: control
      ? [
          {
            name: 'owned-editor-control',
            enforce: 'pre',
            transform(code, id) {
              if (!id.endsWith('/src/crdt/accountReceive.ts')) return;
              if (control === 'early') {
                const anchor = '          await owner.carrier.appendInbound(';
                if (code.split(anchor).length !== 2) throw Error('Missing early promotion control');
                hits++;
                return code.replace(
                  anchor,
                  '          task.step(() => promote(updates));\n' + anchor,
                );
              }
              if (control === 'relabel') {
                const anchor = '            promote(updates);';
                if (code.split(anchor).length !== 2) throw Error('Missing relabel control');
                hits++;
                return code.replace(
                  anchor,
                  `            for(const update of updates) {
          const capsule=carrier.captureLocal!(update,[{actor:base.publisher.principal,kind:'human',bytes:update}]);
          try { carrier.appendLocal(capsule); } finally { capsule.fill(0); }
        }\n` + anchor,
                );
              }
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-receive-editor/browser.ts'),
        name: 'Harness',
        formats: ['iife'],
      },
    },
  });
  if (control && hits !== 1) throw Error('Mutation did not apply');
  return (Array.isArray(result) ? result[0] : result).output.find((f) => f.type === 'chunk').code;
}
const script = await editorBundle();
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
      window.opened = await Harness.openOwnedReceivingAccountWorkspace(optionsFor(item));
      window.editor = opened.workspace;
      window.surface = editor.text({ kind: 'master' });
      return editor.read();
    };
  });
}
export const open = (page, item) => page.evaluate((item) => openEditor(item), args(item));
export const receive = (page, bytes) =>
  page.evaluate((b) => opened.receivePage(new Uint8Array(b)), [...bytes]);
export const request = (page, after) =>
  page.evaluate(async (after) => [...(await opened.prepareRead(after))], after);
export const status = (page) => page.evaluate(() => opened.receiveStatus());
export const view = (page) => page.evaluate(() => editor.read().master);
export const captures = (page) =>
  page.evaluate(async () =>
    (await opened.listCaptures()).map((c) => ({
      id: c.id,
      sources: c.sources.map((s) => ({ ...s, bytes: [...s.bytes] })),
    })),
  );
export async function ready(t, id) {
  const f = await native(t),
    item = await selected(f, id);
  await open(f.page, item);
  const initial = await view(f.page),
    snapshot = await f.page.evaluate(() => [...editor.snapshot()]);
  await f.page.evaluate(() => editor.close());
  return { f, item, initial, snapshot };
}
