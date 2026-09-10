import { build } from 'vite';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { native as base } from '../account-genesis/fixtures.mjs';
export * from '../account-genesis/fixtures.mjs';
import { args } from '../account-genesis/fixtures.mjs';
export async function admissionBundle(control) {
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: control
      ? [
          {
            name: 'admission-control',
            enforce: 'pre',
            transform(code, id) {
              if (control === 'old-reader' && id.endsWith('/src/crdt/promotionRecord.ts'))
                return execFileSync('git', ['show', '280f616:src/crdt/promotionRecord.ts'], {
                  encoding: 'utf8',
                });
              if (control === 'receipt' && id.endsWith('/src/crdt/promotionAdmission.ts')) {
                const needle = 'verifyReceipt(answer, request, options.pin, parts)';
                if (!code.includes(needle)) throw Error('Control anchor missing');
                return code.replace(needle, 'Promise.resolve(answer as AdmissionReceipt)');
              }
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-admission/browser.ts'),
        name: 'Harness',
        formats: ['iife'],
      },
    },
  });
  return (Array.isArray(result) ? result[0] : result).output.find((f) => f.type === 'chunk').code;
}
const script = await admissionBundle();
export async function native(t) {
  const f = await base(t),
    setup = f.setup;
  f.setup = async (page) => {
    await setup(page);
    await page.evaluate(script);
    await page.evaluate(() => {
      window.admissionTransport = {
        begin: (input) => request('/account/promotion/begin', input),
        finish: (input) => request('/account/promotion/finish', input),
      };
    });
  };
  await f.setup(f.page);
  return f;
}
export const admit = (page, item) =>
  page.evaluate(
    (item) =>
      Harness.admitLocalPromotion({
        ...item,
        pin,
        proveAuthority: prove,
        transport,
        admissionTransport,
      }),
    args(item),
  );
