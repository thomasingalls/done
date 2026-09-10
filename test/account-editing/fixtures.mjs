import { build } from 'vite';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  native as base,
  seed,
  prepare,
  genesis,
  admit,
  handoff,
  args,
} from '../account-handoff/fixtures.mjs';
export * from '../account-handoff/fixtures.mjs';
export async function editingBundle(control) {
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: control
      ? [
          {
            name: 'editing-control',
            enforce: 'pre',
            transform(code, id) {
              if (control === 'old-reader' && id.endsWith('/src/crdt/promotionRecord.ts'))
                return execFileSync('git', ['show', '649925f:src/crdt/promotionRecord.ts'], {
                  encoding: 'utf8',
                });
              const targets = {
                passkey: [
                  '/src/crdt/accountAccess.ts',
                  "throw Error('Account passkey refused: ' + result.refusal);",
                  'void 0;',
                ],
                ancestry: [
                  '/src/crdt/accountStartup.ts',
                  '!coversGenesis(doc, checkpoint)',
                  'false',
                ],
                identity: [
                  '/src/crdt/accountJournal.ts',
                  "throw Error('Account actor identity changed');",
                  'void 0;',
                ],
              };
              const target = targets[control];
              if (target && id.endsWith(target[0])) {
                if (code.split(target[1]).length !== 2)
                  throw Error('Missing or ambiguous control anchor');
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
        entry: resolve('test/account-editing/browser.ts'),
        name: 'Harness',
        formats: ['iife'],
      },
    },
  });
  return (Array.isArray(result) ? result[0] : result).output.find((f) => f.type === 'chunk').code;
}
const script = await editingBundle();
export async function native(t) {
  const f = await base(t),
    setup = f.setup;
  f.setup = async (page) => {
    await setup(page);
    await page.evaluate(script);
    await page.evaluate(() => {
      window.optionsFor = (item) => ({
        slotId: item.slotId,
        code: item.code,
        pin,
        assertPasskey,
        identity: {
          id: item.scope.principalId,
          actor: { kind: 'human', name: 'Private author', color: '#123456' },
          device: { id: 'test-device', name: 'fixture' },
        },
        today: () => '2026-09-10',
      });
      window.openEditor = async (item) => {
        window.opened = await Harness.openOwnedAccountWorkspace(optionsFor(item));
        window.editor = opened.workspace;
        window.surface = editor.text({ kind: 'master' });
        return editor.read();
      };
    });
  };
  // The base genesis fixture retains its original page for creation. Keep that page alive while
  // editing pages are killed/replaced during generated histories.
  f.page = await f.context.newPage();
  await f.setup(f.page);
  return f;
}
export async function selected(f, id) {
  const item = await f.ready(id);
  await seed(f.page, item, [{ at: 4, remove: 0, insert: ' original', disk: false }]);
  await prepare(f.page, item);
  await genesis(f.page, item);
  await admit(f.page, item);
  await handoff(f.page, item);
  return item;
}
export const open = (page, item) => page.evaluate((item) => openEditor(item), args(item));
export const edit = (page, at, remove, insert) =>
  page.evaluate(
    async ({ at, remove, insert }) => {
      const ticket = surface.input(
        { name: 'insert', text: insert },
        { ranges: [{ anchor: at, head: at + remove }], main: 0 },
      );
      await ticket.accepted;
      return editor.read().master;
    },
    { at, remove, insert },
  );
export const close = (page) => page.evaluate(() => editor.close());
export async function cold(f) {
  await f.page.close();
  f.page = await f.context.newPage();
  await f.setup(f.page);
}
