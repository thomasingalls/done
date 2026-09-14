import { build } from 'vite';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { native as base } from '../account-admission/fixtures.mjs';
export * from '../account-admission/fixtures.mjs';
export async function bundle(control) {
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
              if (
                control === 'old' &&
                (id.endsWith('/account-protocol/admission.ts') ||
                  id.endsWith('/src/crdt/promotionAdmission.ts'))
              ) {
                hits++;
                return execFileSync(
                  'git',
                  [
                    'show',
                    '6398e33:' +
                      (id.endsWith('/account-protocol/admission.ts')
                        ? 'account-protocol/admission.ts'
                        : 'src/crdt/promotionAdmission.ts'),
                  ],
                  { encoding: 'utf8', timeout: 5000, maxBuffer: 2 * 1024 * 1024 },
                );
              }
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
  if (control && hits !== (control === 'old' ? 2 : 1)) throw Error('Control did not apply');
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
