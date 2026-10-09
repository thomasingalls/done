import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url),
  vr = createRequire(require.resolve('vite'));
const { rolldown } = await import(vr.resolve('rolldown'));
const input = '\0scoped-browser-client';
const bundle = await rolldown({
  input,
  plugins: [
    {
      name: 'entry',
      resolveId: (id) => (id === input ? id : undefined),
      load: (id) =>
        id === input
          ? [
              'scopedTransport',
              'accountHttp',
              'networkLogin',
              'sessionVault',
              'enrollmentLogin',
              'privateDeliveryHttp',
            ]
              .map(
                (n) =>
                  `export * from ${JSON.stringify(fileURLToPath(new URL('../../src/account/' + n + '.ts', import.meta.url)))};`,
              )
              .join('\n')
          : undefined,
    },
  ],
});
let built;
try {
  built = await bundle.generate({ format: 'esm' });
} finally {
  await bundle.close();
}
const dir = mkdtempSync(join(tmpdir(), 'done-grant-client-'));
const path = join(dir, 'browser.mjs');
writeFileSync(path, built.output[0].code);
process.once('exit', () => rmSync(dir, { recursive: true, force: true }));
export const browser = await import(pathToFileURL(path).href);
