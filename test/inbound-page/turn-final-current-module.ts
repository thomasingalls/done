/** Test-only omission of the per-result final byte guard; the whole-turn guard remains. */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
type Api = typeof import('../../src/crdt/accountInbound');
export async function turnFinalCurrentModule() {
  const dir = await mkdtemp(join(tmpdir(), 'done-turn-final-current-'));
  let seen = false;
  const anchor = '    finish(row, result) {\n      current(row);\n      row.verified = true;';
  try {
    await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [
        {
          name: 'final-byte-check-negative-control',
          enforce: 'pre',
          transform(code, id) {
            if (id !== resolve('src/crdt/accountInbound.ts')) return;
            if (code.split(anchor).length !== 2) throw Error('Final turn guard anchor changed');
            seen = true;
            return code.replace(anchor, '    finish(row, result) {\n      row.verified = true;');
          },
        },
      ],
      build: {
        outDir: dir,
        emptyOutDir: true,
        target: 'esnext',
        minify: false,
        lib: {
          entry: resolve('src/crdt/accountInbound.ts'),
          formats: ['es'],
          fileName: () => 'control.mjs',
        },
      },
    });
    if (!seen) throw Error('Missing final turn guard injection');
    const api = (await import(
      /* @vite-ignore */ pathToFileURL(join(dir, 'control.mjs')).href
    )) as Api;
    return { api, dispose: () => rm(dir, { recursive: true, force: true }) };
  } catch (cause) {
    await rm(dir, { recursive: true, force: true });
    throw cause;
  }
}
