/** Build a complete historical production graph; observers may stay current in the browser harness. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { build } from 'vite';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const cache = new Map();
export function historicalBundle(revision, bridge) {
  const key = revision + '\n' + bridge;
  if (!cache.has(key)) cache.set(key, buildHistorical(revision, bridge));
  return cache.get(key);
}
async function buildHistorical(revision, bridge) {
  const commit = execFileSync('git', ['rev-parse', '--verify', revision + '^{commit}'], {
    encoding: 'utf8',
  }).trim();
  const parent = resolve('test-results/historical-bundles');
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, commit.slice(0, 8) + '-'));
  const source = join(directory, 'source');
  mkdirSync(source);
  const archive = execFileSync(
    'git',
    ['archive', commit, 'src', 'account-protocol', 'wasm', 'package.json', 'pnpm-lock.yaml'],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  execFileSync('tar', ['-x', '-C', source], { input: archive });
  const declared = JSON.parse(readFileSync(join(source, 'package.json'))).dependencies;
  const current = JSON.parse(readFileSync('package.json')).dependencies;
  if (Object.entries(declared).some(([name, version]) => current[name] !== version))
    throw Error('Historical runtime dependencies differ');
  const walk = (path) =>
    readdirSync(path, { withFileTypes: true }).flatMap((item) =>
      item.isDirectory() ? walk(join(path, item.name)) : [join(path, item.name)],
    );
  const pins = walk(source).map((path) => ({
    path: relative(source, path),
    sha256: sha(readFileSync(path)),
  }));
  const entry = join(source, 'historical-harness.ts');
  writeFileSync(entry, bridge);
  let modules;
  const result = await build({
    root: source,
    configFile: false,
    logLevel: 'error',
    plugins: [
      {
        name: 'historical-source-identity',
        generateBundle(_options, output) {
          modules = [
            ...new Set(
              Object.values(output)
                .filter((file) => file.type === 'chunk')
                .flatMap((file) => file.moduleIds),
            ),
          ];
          for (const id of modules) {
            if (id.includes('/node_modules/') || id.startsWith('\0')) continue;
            if (!id.startsWith(source + '/'))
              throw Error('Historical graph escaped its snapshot: ' + id);
          }
        },
      },
    ],
    build: {
      write: false,
      minify: false,
      lib: { entry, name: 'HistoricalReader', formats: ['iife'] },
    },
  });
  for (const pin of pins)
    if (sha(readFileSync(join(source, pin.path))) !== pin.sha256)
      throw Error('Historical input changed');
  const output = (Array.isArray(result) ? result[0] : result).output;
  const chunks = output.filter((file) => file.type === 'chunk');
  if (output.length !== 1 || chunks.length !== 1 || !chunks[0].isEntry)
    throw Error('Historical browser bundle must have one complete entry without external assets');
  const code = chunks[0].code;
  const identity = {
    commit,
    archiveSha256: sha(archive),
    runtimeDependencies: declared,
    currentLockSha256: sha(readFileSync('pnpm-lock.yaml')),
    bridge,
    source: pins,
    modules: modules.map((id) => (id.startsWith(source + '/') ? relative(source, id) : id)),
    bundleSha256: sha(code),
  };
  writeFileSync(join(directory, 'identity.json'), JSON.stringify(identity, null, 2) + '\n');
  writeFileSync(join(directory, 'reader.js'), code);
  // Independent old closures replace operations, while the existing raw census observers stay available.
  return `(function () {\n${code}\nObject.assign(globalThis.Harness, HistoricalReader);\n})();`;
}
