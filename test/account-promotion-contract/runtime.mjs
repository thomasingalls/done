import { build } from 'vite';
import { resolve } from 'node:path';
export async function bundle(control) {
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: [
      {
        name: 'promotion-contract-private-seams',
        enforce: 'pre',
        transform(code, id) {
          const replace = (from, to) => {
            if (code.split(from).length !== 2) throw Error('Seam moved: ' + from);
            code = code.replace(from, to);
          };
          if (id.endsWith('/src/crdt/promotionRecord.ts')) {
            replace('const macKey =', 'export const macKey =');
            if (control === 'source')
              replace("throw Error('Promotion source or budget changed');", 'void 0;');
          }
          if (id.endsWith('/src/crdt/promotionOwner.ts'))
            replace('const retryDigest =', 'export const retryDigest =');
          if (id.endsWith('/test/account-promotion-contract/browser.ts'))
            code +=
              "\nexport { macKey } from '../../src/crdt/promotionRecord';\nexport { retryDigest } from '../../src/crdt/promotionOwner';";
          return code;
        },
      },
    ],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-promotion-contract/browser.ts'),
        name: 'PromotionContract',
        formats: ['iife'],
      },
    },
  });
  return (Array.isArray(result) ? result[0] : result).output.find((f) => f.type === 'chunk').code;
}
export const load = async () => Function((await bundle()) + ';return PromotionContract;')();
