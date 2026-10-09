import { build } from 'vite';
import { resolve } from 'node:path';
import * as Y from 'yjs';
import {
  native as base,
  selected,
  open,
  close,
  view,
  envelope,
  args,
} from '../account-receive-transport/fixtures.mjs';
export * from '../account-receive-transport/fixtures.mjs';
export async function driverBundle(mode) {
  let hits = 0;
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: mode
      ? [
          {
            name: 'receive-dispatch-control',
            enforce: 'pre',
            transform(code, id) {
              if (!id.endsWith('/src/crdt/accountReceive.ts')) return;
              const anchor = 'page = canReceive()';
              if (code.split(anchor).length !== 2) throw Error('Missing dispatch anchor');
              hits++;
              return code.replace(
                anchor,
                `page = (globalThis.receiveDispatchBoundary?.(), ${mode === 'dispatch' ? 'true' : 'canReceive()'})`,
              );
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-receive-driver/browser.ts'),
        name: 'Harness',
        formats: ['iife'],
      },
    },
  });
  if (mode && hits !== 1) throw Error('Dispatch mutation not applied once');
  return (Array.isArray(result) ? result[0] : result).output.find((f) => f.type === 'chunk').code;
}
const script = await driverBundle();
export async function native(t) {
  const f = await base(t),
    setup = f.setup;
  f.setup = async (page) => {
    await setup(page);
    await page.evaluate(script);
    await configure(page, f.testOperatorToken);
  };
  await f.setup(f.page);
  return f;
}
export const configure = (page, token) =>
  page.evaluate((token) => {
    window.openPoll = async (item) => {
      window.opened = await Harness.openOwnedPollingAccountWorkspace(optionsFor(item), token);
      window.editor = opened.workspace;
      window.surface = editor.text({ kind: 'master' });
      return editor.read();
    };
  }, token);
export const polling = (page, item) => page.evaluate((item) => openPoll(item), args(item));
export const driverStatus = (page) => page.evaluate(() => opened.receiver.status);
export const retry = (page) => page.evaluate(() => opened.receiver.retry());
export const online = (page, value) =>
  page.evaluate((value) => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
    dispatchEvent(new Event(value ? 'online' : 'offline'));
  }, value);
export async function remote(t, id, count = 1) {
  const f = await native(t),
    item = await selected(f, id);
  await open(f.page, item);
  const initial = await view(f.page),
    snapshot = await f.page.evaluate(() => [...editor.snapshot()]);
  await close(f.page);
  const d = new Y.Doc({ gc: false });
  Y.applyUpdate(d, new Uint8Array(snapshot));
  d.clientID = 8112051;
  const updates = [];
  d.on('update', (b) => updates.push([...b]));
  for (let n = 0; n < count; n++) d.getText('master').insert(0, `REMOTE${n} `);
  d.destroy();
  const wires = [];
  for (let n = 0; n < count; n++) wires.push(await envelope(f.page, item, n + 1, [updates[n]]));
  return { f, item, initial, wires };
}
