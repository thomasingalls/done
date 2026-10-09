import assert from 'node:assert/strict';
import { build } from 'vite';
import { resolve } from 'node:path';
import { native as base } from '../account-admission/fixtures.mjs';
export * from '../account-admission/fixtures.mjs';
export { report, resultJSON } from '../account-checkpoint-contract/report.mjs';
const admission = 'src/crdt/promotionAdmission.ts',
  genesis = 'src/crdt/promotionGenesis.ts';
const changes = {
  receiptParts: [
    admission,
    'verifyReceipt(marker.admission!.receipt, request, options.pin, parts)',
    'verifyReceipt(marker.admission!.receipt, request, options.pin)',
  ],
  coverageGuard: [admission, 'coverageParts(parts);', 'void parts;'],
  snapshotGuard: [
    genesis,
    "throw Error('Genesis checkpoint exceeds private preparation bound');",
    'void 0;',
  ],
};
const cache = new Map();
export async function bundle(control = '', injectParts = false) {
  const key = control + ':' + injectParts;
  if (cache.has(key)) return cache.get(key);
  let hits = 0,
    injected = 0;
  const built = await build({
    configFile: false,
    logLevel: 'error',
    plugins: [
      {
        name: 'admission-evidence',
        enforce: 'pre',
        transform(code, id) {
          if (injectParts && id.endsWith('/' + genesis)) {
            const from = 'parts: { sv: hex(parts.sv), ds: hex(parts.ds) },';
            assert.equal(code.split(from).length, 2);
            code = code.replace(from, 'parts: (globalThis as any).testCoverageParts,');
            injected++;
          }
          if (control && id.endsWith('/' + changes[control][0])) {
            const [, from, to] = changes[control];
            assert.equal(code.split(from).length, 2);
            code = code.replace(from, to);
            hits++;
          }
          return code;
        },
      },
    ],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-admission-evidence/browser.ts'),
        name: 'Harness',
        formats: ['iife'],
      },
    },
  });
  assert.equal(hits, control ? 1 : 0);
  assert.equal(injected, injectParts ? 1 : 0);
  const script = (Array.isArray(built) ? built[0] : built).output.find(
    (x) => x.type === 'chunk',
  ).code;
  cache.set(key, script);
  return script;
}
export async function native(t) {
  const f = await base(t),
    setup = f.setup;
  f.setup = async (page, control = '', injectParts = false) => {
    await setup(page);
    await page.evaluate(await bundle(control, injectParts));
  };
  await f.setup(f.page);
  return f;
}
export const census = (f, omit = false) => f.page.evaluate((omit) => Harness.census(omit), omit);
export const watch = (f) =>
  f.page.evaluate(() => {
    window.observations = Harness.observe();
  });
export const observations = (f) => f.page.evaluate(() => observations());
export const cold = async (f, control = '', inject = false) => {
  await f.page.close();
  f.page = await f.context.newPage();
  await f.setup(f.page, control, inject);
};
