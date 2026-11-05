/** Test-only counter boundary and uniquely anchored omission. No application imports this module. */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
type Api = typeof import('../account-membership/replacement-checkpoint-entry');
export async function replacementCapacityModule(omitLogicalBound = false) {
  const dir = await mkdtemp(join(tmpdir(), 'done-replacement-capacity-'));
  let seen = false;
  const anchor = `          if (events + work > REPLACEMENT_SOURCE_EVENTS)\n            throw Error('Replacement replay is outside its accepted cut');`;
  try {
    await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [
        {
          name: 'replacement-capacity-regression-only',
          enforce: 'pre',
          transform(code, id) {
            if (id !== resolve('src/crdt/replacementSource.ts')) return;
            if (code.split('events = 0;').length !== 2 || code.split(anchor).length !== 2)
              throw Error('Replacement capacity anchor changed');
            seen = true;
            return code
              .replace('events = 0;', 'events = 4095;')
              .replace(anchor, omitLogicalBound ? '' : anchor);
          },
        },
      ],
      build: {
        outDir: dir,
        emptyOutDir: true,
        target: 'esnext',
        minify: false,
        lib: {
          entry: resolve('test/account-membership/replacement-checkpoint-entry.ts'),
          formats: ['es'],
          fileName: () => 'capacity.mjs',
        },
      },
    });
    if (!seen) throw Error('Missing replacement capacity injection');
    const api = (await import(
      /* @vite-ignore */ pathToFileURL(join(dir, 'capacity.mjs')).href
    )) as Api;
    return { api, dispose: () => rm(dir, { recursive: true, force: true }) };
  } catch (cause) {
    await rm(dir, { recursive: true, force: true });
    throw cause;
  }
}
