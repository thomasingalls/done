import { build } from 'vite';
import { resolve } from 'node:path';
export async function bundle() {
  const r = await build({
    configFile: false,
    logLevel: 'error',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-reservation-durability/browser.ts'),
        name: 'Durability',
        formats: ['iife'],
      },
    },
  });
  return (Array.isArray(r) ? r[0] : r).output.find((f) => f.type === 'chunk').code;
}
