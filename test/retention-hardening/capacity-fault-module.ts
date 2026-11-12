/** Test-only injection at the five real capacity guards: each forces its guard's own condition,
 * so the guard's real handling runs (a refusal, or caching that stops). Never imported by the app. */
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

export const capacitySites = [
  [
    'retentionPreparation.ts',
    'journal-check',
    '        if (\n          (!prior && entries.size >= PREPARATION_ENTRIES) ||',
  ],
  [
    'retentionPreparation.ts',
    'journal-import',
    '      if (merged.size > PREPARATION_ENTRIES || count > PREPARATION_VALUE_BYTES)',
  ],
  [
    'retentionPreparationStorage.ts',
    'storage-delta',
    '    if (\n      prior.length + 1 > PREPARATION_MAX_CHUNKS ||',
  ],
  [
    'retentionPreparationStorage.ts',
    'storage-head',
    '    if (headBytes.length > PREPARATION_CHUNK_BYTES - 16)',
  ],
  ['retentionPreparationBinding.ts', 'physical-prefix', '      if (bytes > 64 * 1024 * 1024)'],
] as const;
export type CapacityFaultSite = (typeof capacitySites)[number][1];
/** Guards that stop caching instead of refusing; the other three still refuse. */
export const uncachedSites: readonly CapacityFaultSite[] = ['journal-check', 'journal-import'];
type Api = typeof import('../../src/crdt/automaticLocalRetention') &
  typeof import('../../src/crdt/retentionPreparation') &
  typeof import('../../src/crdt/retentionPreparationStorage') &
  typeof import('../../src/crdt/retentionPreparationBinding');
export async function capacityFaultModule() {
  const dir = await mkdtemp(join(tmpdir(), 'done-capacity-regression-'));
  const seen = new Set<string>();
  const src = resolve('src/crdt');
  const entry = join(dir, 'entry.mjs');
  await writeFile(
    entry,
    [
      ...[
        'automaticLocalRetention',
        'retentionPreparation',
        'retentionPreparationStorage',
        'retentionPreparationBinding',
      ].map((n) => `export * from ${JSON.stringify(join(src, n + '.ts'))};`),
      'export const fault = site => { globalThis.__capacityRegressionSite = site; globalThis.__capacityRegressionReached = undefined; };',
      'export const reached = () => globalThis.__capacityRegressionReached;',
    ].join('\n'),
  );
  try {
    await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [
        {
          name: 'capacity-refusal-regression-only',
          enforce: 'pre',
          transform(code, id) {
            for (const [file, site, anchor] of capacitySites) {
              if (id !== join(src, file)) continue;
              if (code.split(anchor).length !== 2 || !anchor.trimStart().startsWith('if ('))
                throw Error('Capacity guard anchor changed: ' + site);
              seen.add(site);
              const name = JSON.stringify(site);
              code = code.replace(
                anchor,
                anchor.replace(
                  'if (',
                  `if ((globalThis.__capacityRegressionSite === ${name} && (globalThis.__capacityRegressionReached = ${name})) || `,
                ),
              );
            }
            return code;
          },
        },
      ],
      build: {
        outDir: join(dir, 'out'),
        emptyOutDir: true,
        target: 'esnext',
        minify: false,
        lib: { entry, formats: ['es'], fileName: () => 'capacity.mjs' },
      },
    });
    if (seen.size !== capacitySites.length) throw Error('Missing capacity guard injection');
    const api = (await import(
      /* @vite-ignore */ pathToFileURL(join(dir, 'out/capacity.mjs')).href
    )) as Api & {
      fault(site?: CapacityFaultSite): void;
      reached(): CapacityFaultSite | undefined;
    };
    return { api, dispose: () => rm(dir, { recursive: true, force: true }) };
  } catch (cause) {
    await rm(dir, { recursive: true, force: true });
    throw cause;
  }
}
