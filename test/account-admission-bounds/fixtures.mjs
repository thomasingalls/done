import { build } from 'vite';
import { resolve } from 'node:path';
import { historicalBundle } from '../../scripts/lib/historical-bundle.mjs';
import { native as base } from '../account-admission/fixtures.mjs';
export * from '../account-admission/fixtures.mjs';
export async function bundle(control) {
  if (control === 'old') {
    return historicalBundle(
      '6398e33da4fd4b5b413de23078a04707557599bf',
      `
export { admitLocalPromotion } from './src/crdt/promotionAdmission';
export { verifyCompletion } from './account-protocol/admission';
import { withPromotionSlot } from './src/crdt/writeSession';
import { readPromotion } from './src/crdt/promotionRecord';
export function readRetained(slotId: string, code: string) {
  return withPromotionSlot(slotId, code, async task =>
    (await readPromotion(task, slotId, code)).marker?.stage);
}
`,
    );
  }
  let hits = 0;
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: control
      ? [
          {
            name: 'bounds-control',
            enforce: 'pre',
            transform(code, id) {
              if (control === 'small-bound' && id.endsWith('/account-protocol/admission.ts')) {
                const needle = 'export const COVERAGE_LIMIT = GENESIS_LIMIT;';
                if (code.split(needle).length !== 2) throw Error('Missing bound anchor');
                hits++;
                return code.replace(needle, 'export const COVERAGE_LIMIT = 32;');
              }
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-admission-bounds/browser.ts'),
        name: 'Harness',
        formats: ['iife'],
      },
    },
  });
  if (control && hits !== 1) throw Error('Control did not apply');
  return (Array.isArray(result) ? result[0] : result).output.find((f) => f.type === 'chunk').code;
}
const script = await bundle();
export async function native(t) {
  const f = await base(t),
    setup = f.setup;
  f.setup = async (page) => {
    await setup(page);
    await page.evaluate(script);
  };
  await f.setup(f.page);
  return f;
}
