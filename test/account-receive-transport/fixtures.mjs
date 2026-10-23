import * as Y from 'yjs';
import { build } from 'vite';
import { resolve } from 'node:path';
import { ready, envelope, open } from '../account-receive-editor/fixtures.mjs';
export * from '../account-receive-editor/fixtures.mjs';
export const path = (f) => f.server.origin + '/account/delivery/read-v2';
export const next = (f, token = f.testOperatorToken) =>
  f.page.evaluate((token) => opened.receiveNext(token), token);
export const start = (f) =>
  f.page.evaluate((token) => {
    window.result = undefined;
    window.work = opened.receiveNext(token).then(
      (r) => (window.result = r),
      (e) => (window.result = { error: String(e) }),
    );
  }, f.testOperatorToken);
export async function remote(t, id) {
  const r = await ready(t, id),
    doc = new Y.Doc({ gc: false });
  Y.applyUpdate(doc, new Uint8Array(r.snapshot));
  doc.clientID = 8112041;
  let update;
  doc.on('update', (b) => {
    update = [...b];
  });
  doc.getText('master').insert(0, 'REMOTE ');
  doc.destroy();
  r.wire = await envelope(r.f.page, r.item, 1, [update]);
  await open(r.f.page, r.item);
  return r;
}
export async function local(page, text = 'LATER') {
  await page.evaluate((text) => {
    const n = editor.read().master.length;
    window.local = surface
      .input({ name: 'insert', text }, { ranges: [{ anchor: n, head: n }], main: 0 })
      .accepted.then(
        () => true,
        (e) => String(e),
      );
  }, text);
}
export async function controlBundle(control) {
  const targets = {
    queue: [
      '/src/crdt/accountReceive.ts',
      'const received = await receivePage(page, request);',
      'const received = await api.receivePage(page, () => {}, request);',
    ],
    flight: [
      '/src/crdt/accountReceive.ts',
      "if (flight) return Promise.resolve({ kind: 'busy' as const });",
      'void flight;',
    ],
    bound: ['/src/account/privateDeliveryHttp.ts', 'if (length > limit) {', 'if (false) {'],
    drain: ['/src/account/privateDeliveryHttp.ts', 'await cancellation;', 'void cancellation;'],
  };
  const target = targets[control];
  let hits = 0;
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: [
      {
        name: 'transport-omission',
        enforce: 'pre',
        transform(code, id) {
          if (!id.endsWith(target[0])) return;
          if (code.split(target[1]).length !== 2) throw Error('Missing control anchor: ' + control);
          hits++;
          return code.replace(target[1], target[2]);
        },
      },
    ],
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
  if (hits !== 1) throw Error('Mutation did not apply once');
  return (Array.isArray(result) ? result[0] : result).output.find((f) => f.type === 'chunk').code;
}
