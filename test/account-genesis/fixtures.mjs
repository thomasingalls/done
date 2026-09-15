import { execFileSync } from 'node:child_process';
import { build } from 'vite';
import { resolve } from 'node:path';
import { native as base, args as originalArgs } from '../account-promotion/fixtures.mjs';
export * from '../account-promotion/fixtures.mjs';
export async function genesisBundle(control) {
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: control
      ? [
          {
            name: 'semantic-control',
            enforce: 'pre',
            transform(code, id) {
              if (control === 'old-reader') {
                if (id.endsWith('/src/crdt/promotionRecord.ts'))
                  return execFileSync('git', ['show', 'a4e1c15:src/crdt/promotionRecord.ts'], {
                    encoding: 'utf8',
                    timeout: 5000,
                    maxBuffer: 2 * 1024 * 1024,
                  });
                return;
              }
              if (!id.endsWith('/src/crdt/promotionGenesis.ts')) return;
              const needle =
                control === 'wrap'
                  ? "throw Error('Genesis wrap contains wrong generation');"
                  : "throw Error('Genesis checkpoint does not cover source');";
              if (!code.includes(needle)) throw Error('Missing control target');
              return code.replace(needle, 'void 0;');
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-genesis/browser.ts'),
        name: 'Harness',
        formats: ['iife'],
      },
    },
  });
  return (Array.isArray(result) ? result[0] : result).output.find((f) => f.type === 'chunk').code;
}
const script = await genesisBundle();
export async function native(t, harness) {
  const f = await base(t, harness),
    setup = f.setup;
  f.setup = async (page) => {
    await setup(page);
    if (!harness) await page.evaluate(script);
  };
  await f.setup(f.page);
  return f;
}
export const args = (item) => ({ ...originalArgs(item), recoveryCode: item.recoveryCode });
export const genesis = (page, item) =>
  page.evaluate(
    (item) => Harness.preparePromotionGenesis({ ...item, pin, proveAuthority: prove, transport }),
    args(item),
  );
export const seed = (page, item, ops, reverse = false, invalid = '') =>
  page.evaluate(
    ({ item, ops, reverse, invalid }) => Harness.seed(item.scope, item.code, ops, reverse, invalid),
    { item: args(item), ops, reverse, invalid },
  );
export const poison = (page, item, kind, initial) =>
  page.evaluate(
    ({ item, kind, initial }) => Harness.poison(item.slotId, item.code, kind, initial),
    { item: args(item), kind, initial },
  );
