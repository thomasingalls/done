// @vitest-environment node
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import fc from 'fast-check';
import { precacheServiceWorker } from './precacheServiceWorker';

type Fault = { kind: 'missing' | 'wrong-bytes' | 'put'; position: number };
type Stores = Map<string, Map<string, string>>;
const fixture = (base: string, text: string) => {
  const root = mkdtempSync(join(tmpdir(), 'done-upgrade-property-'));
  try {
    const assets = {
      'index.html': `<title>${text}</title>`,
      'local.html': '<title>Local</title>',
      'manifest.webmanifest': '{"name":"done"}',
    };
    for (const [path, bytes] of Object.entries(assets)) writeFileSync(join(root, path), bytes);
    const plugin = precacheServiceWorker();
    const configure = plugin.configResolved!;
    Reflect.apply(typeof configure === 'function' ? configure : configure.handler, {}, [{ base }]);
    const hook = plugin.writeBundle!;
    Reflect.apply(typeof hook === 'function' ? hook : hook.handler, {}, [{ dir: root }, {}]);
    const worker = readFileSync(join(root, 'sw.js'), 'utf8');
    const prefix = `done-precache-v2-${encodeURIComponent(base)}-`;
    const old = prefix + 'old';
    const foreign = `done-precache-v2-${encodeURIComponent('/unrelated/')}-other`;
    const stores: Stores = new Map([
      [old, new Map([[base, 'old app']])],
      [foreign, new Map([['/unrelated/', 'other app']])],
      ['done-precache-legacy', new Map([['/', 'older cache retained']])],
    ]);
    return {
      worker,
      prefix,
      old,
      foreign,
      stores,
      files: new Map([
        [base, assets['index.html']],
        ...Object.entries(assets).map(([path, bytes]) => [base + path, bytes] as [string, string]),
      ]),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};
const workerRuntime = (
  source: string,
  stores: Stores,
  files: Map<string, string>,
  fault?: Fault,
) => {
  const handlers = new Map<string, (event: { waitUntil(p: Promise<unknown>): void }) => void>();
  let fetches = 0,
    puts = 0;
  runInNewContext(source, {
    self: {
      location: { origin: 'https://app.invalid' },
      addEventListener: (
        name: string,
        fn: (event: { waitUntil(p: Promise<unknown>): void }) => void,
      ) => handlers.set(name, fn),
    },
    URL,
    Response,
    Uint8Array,
    crypto: webcrypto,
    fetch: async (path: string) => {
      const hit = fetches++ === fault?.position;
      if (hit && fault?.kind === 'missing') return new Response('missing', { status: 503 });
      if (hit && fault?.kind === 'wrong-bytes') return new Response('wrong successful response');
      return new Response(files.get(path));
    },
    caches: {
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      open: async (name: string) => {
        if (!stores.has(name)) stores.set(name, new Map());
        return {
          put: async (path: string, response: Response) => {
            if (puts++ === fault?.position && fault.kind === 'put') throw Error('quota failure');
            stores.get(name)!.set(path, await response.text());
          },
        };
      },
    },
  });
  return (event: 'install' | 'activate') => {
    let result: Promise<unknown> | undefined;
    handlers.get(event)!({
      waitUntil(p) {
        result = p;
      },
    });
    if (!result) throw Error('Missing worker lifetime promise');
    return result;
  };
};

it('generated failed-download/cache-write histories retain the old app, then install exactly one complete release', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom('/', '/nested/'),
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.array(
        fc.record({
          kind: fc.constantFrom('missing' as const, 'wrong-bytes' as const, 'put' as const),
          position: fc.integer({ min: 0, max: 3 }),
        }),
        { minLength: 1, maxLength: 6 },
      ),
      async (base, text, faults) => {
        const f = fixture(base, text);
        const before = structuredClone(f.stores);
        for (const fault of faults) {
          await expect(
            workerRuntime(f.worker, f.stores, f.files, fault)('install'),
          ).rejects.toThrow();
          expect(f.stores).toEqual(before);
        }
        const run = workerRuntime(f.worker, f.stores, f.files);
        await run('install');
        // An installed waiting candidate does not evict the old release.
        for (const [name, values] of before) expect(f.stores.get(name)).toEqual(values);
        const candidate = [...f.stores.keys()].find((key) => !before.has(key))!;
        expect(f.stores.get(candidate)).toEqual(f.files);
        await run('activate');
        expect(f.stores.has(f.old)).toBe(false);
        expect(f.stores.get(f.foreign)).toEqual(before.get(f.foreign));
        expect(f.stores.get('done-precache-legacy')).toEqual(before.get('done-precache-legacy'));
        expect(f.stores.get(candidate)).toEqual(f.files);
      },
    ),
    { seed: 8941, numRuns: 120 },
  );
});

it('sensitivity controls expose omitted byte verification and unscoped cache deletion', async () => {
  const f = fixture('/', 'control');
  const unchecked = f.worker.replace('hex !== INTEGRITY[path]', 'false');
  expect(unchecked).not.toBe(f.worker);
  // The production oracle requires rejection; this mutant actually installs wrong bytes.
  await workerRuntime(unchecked, f.stores, f.files, { kind: 'wrong-bytes', position: 0 })(
    'install',
  );
  expect(
    [...f.stores.values()].some((entries) => entries.get('/') === 'wrong successful response'),
  ).toBe(true);
  const unscoped = f.worker.replace('key.startsWith(PREFIX) && ', '');
  expect(unscoped).not.toBe(f.worker);
  await workerRuntime(unscoped, f.stores, f.files)('activate');
  expect(f.stores.has(f.foreign)).toBe(false);
});
