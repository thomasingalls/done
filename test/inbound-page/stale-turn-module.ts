/** Fault control only. No app entry imports this module or its transformed bundle. */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
type Api = typeof import('./stale-turn-entry');
export async function staleTurnModule(fault: boolean) {
  const dir = await mkdtemp(join(tmpdir(), 'done-stale-page-control-'));
  let seen = false;
  const before = '  const localCoverage = reuse',
    original =
      '              envelope: selected.original.envelope,\n              proof: selected.original.proof,';
  try {
    await build({
      configFile: false,
      logLevel: 'silent',
      ssr: { noExternal: true },
      plugins: [
        {
          name: 'record-scoped-page-negative-control',
          enforce: 'pre',
          transform(code, id) {
            // Bundling relocates test-oracle schemas/vectors. Retain each source file's URL.
            // Application modules never take this branch.
            if (id.startsWith(resolve('test') + '/') && code.includes('import.meta.url'))
              return code.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(id).href));
            if (id !== resolve('src/crdt/inboundLedger.ts')) return;
            if (code.split(before).length !== 2 || code.split(original).length !== 2)
              throw Error('Stale-turn control anchor changed');
            seen = true;
            return fault
              ? code
                  .replace(
                    before,
                    '  let staleOriginal: { envelope: Bytes; proof: Bytes } | undefined;\n' +
                      before,
                  )
                  .replace(
                    original,
                    '              envelope: (entry.extent ? (staleOriginal = selected.original) : (staleOriginal ?? selected.original)).envelope,\n              proof: (staleOriginal ?? selected.original).proof,',
                  )
              : code;
          },
        },
      ],
      build: {
        ssr: resolve('test/inbound-page/stale-turn-entry.ts'),
        outDir: dir,
        emptyOutDir: true,
        target: 'esnext',
        minify: false,
        rollupOptions: { output: { entryFileNames: 'control.mjs' } },
      },
    });
    if (!seen) throw Error('Missing stale-turn injection target');
    const api = (await import(
      /* @vite-ignore */ pathToFileURL(join(dir, 'control.mjs')).href
    )) as Api;
    return { api, dispose: () => rm(dir, { recursive: true, force: true }) };
  } catch (cause) {
    await rm(dir, { recursive: true, force: true });
    throw cause;
  }
}
