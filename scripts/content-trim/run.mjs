/** Immutable-source real-browser content carrier schedules, not whole-store certification. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import {
  validateReport,
  mutationStatus,
  exitCode,
  render,
} from '../storage-conformance/report.mjs';
import { cases, mutants } from './catalog.mjs';
import { runCase } from './scenarios.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const hash = (b) => createHash('sha256').update(b).digest('hex');
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const argv = process.argv.slice(2);
const option = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
for (let i = 0; i < argv.length; i++) {
  if (['--case', '--output'].includes(argv[i])) {
    if (!argv[++i] || argv[i].startsWith('--')) throw Error('Missing option value');
  } else if (argv[i] !== '--no-mutants') throw Error('Unknown option: ' + argv[i]);
}
const selected = option('--case')
  ? cases.filter((c) => option('--case').split(',').includes(c.id))
  : cases;
if (
  !selected.length ||
  (option('--case') && selected.length !== new Set(option('--case').split(',')).size)
)
  throw Error('Unknown case');
const output = resolve(
  root,
  option('--output') ??
    `test-results/content-trim/${new Date().toISOString().replaceAll(':', '-')}`,
);
if (existsSync(output)) throw Error('Refusing existing output: ' + output);
mkdirSync(output, { recursive: true });
const walk = (dir) =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(dir + '/' + e.name) : [dir + '/' + e.name],
  );
const sourcePaths = [...walk('src'), ...walk('account-protocol')];
const sources = Object.fromEntries(
  sourcePaths.map((name) => [name, readFileSync(join(root, name), 'utf8')]),
);
sources['wasm/journal-seal/seal.generated.ts'] = readFileSync(
  join(root, 'wasm/journal-seal/seal.generated.ts'),
  'utf8',
);
const recordedFiles = [
  'wasm/journal-seal/seal.generated.ts',
  'wasm/journal-seal/src/lib.rs',
  'wasm/journal-seal/Cargo.toml',
  'wasm/journal-seal/Cargo.lock',
  'scripts/build-wasm-seal.mjs',
  ...sourcePaths,
  'docs/storage-contract.md',
  'pnpm-lock.yaml',
  'package.json',
  'test/contentRecord.test.ts',
  'test/contentCompaction.test.ts',
  'test/content/browser.mjs',
  'docs/content-trim.md',
  'test/vectors/record-format.json',
  'docs/content-store.md',
  'scripts/storage-conformance/report.mjs',
  ...['scripts/content-trim', 'test/content-trim'].flatMap((dir) =>
    readdirSync(join(root, dir)).map((name) => `${dir}/${name}`),
  ),
];
const files = () =>
  Object.fromEntries(recordedFiles.map((path) => [path, hash(readFileSync(join(root, path)))]));
const result = {
  schema: 1,
  scope: 'content-trim-browser',
  started: new Date().toISOString(),
  requestedCandidates: ['trim'],
  requestedCases: selected.map((c) => c.id),
  harness: {
    commit: git('rev-parse', 'HEAD'),
    dirty: Boolean(git('status', '--porcelain')),
    files: files(),
    node: process.version,
    vite: JSON.parse(readFileSync(join(root, 'node_modules/vite/package.json'), 'utf8')).version,
  },
  browser: {},
  candidates: [],
  mutations: [],
  limits: [
    'Explicit JournalSession content compaction in generation 1. No default UI/scheduler, Account admission, destructive day archival, key retirement or seeded legacy cutover.',
    'Real IndexedDB/Web Locks/WebCrypto/WASM and renderer death on one Chromium/macOS host. Controlled native callbacks and adapter faults are identified; no power-loss or supported-population claim.',
    'Synthetic required identity and creation checkers; actual custody enrollment/content initialization and journal owners. No caller-supplied document or coverage authority.',
    'Input byte merging retains unresolved structs/delete sets. Bounded state size and eight-census contention limit; full scan memory/performance and independent review remain owed.',
  ],
};
const executablePath = process.env.CHROMIUM_PATH ?? chromium.executablePath();
let browser;
const save = () => {
  writeFileSync(join(output, 'report.json'), JSON.stringify(result, null, 2) + '\n');
  writeFileSync(join(output, 'report.md'), render(result));
};
async function run(mutation = null) {
  const label = mutation?.id ?? 'trim',
    folder = join(output, label);
  mkdirSync(folder);
  const tested = { ...sources };
  if (mutation) {
    const file = 'src/crdt/' + mutation.file;
    if (tested[file].split(mutation.from).length !== 2)
      throw Error('Mutation anchor is not unique: ' + label);
    tested[file] = tested[file].replace(mutation.from, mutation.to);
  }
  for (const [name, source] of Object.entries(tested)) {
    mkdirSync(dirname(join(folder, name)), { recursive: true });
    writeFileSync(join(folder, name), source);
  }
  const server = await createServer({
    configFile: false,
    root,
    logLevel: 'error',
    cacheDir: join(folder, 'vite-cache'),
    resolve: {
      alias: {
        '../../wasm/journal-seal/seal.generated': join(
          folder,
          'wasm/journal-seal/seal.generated.ts',
        ),
        '@custody': join(folder, 'src/crdt/custody.ts'),
        '@custody-record': join(folder, 'src/crdt/custodyRecord.ts'),
        '@custody-crypto': join(folder, 'src/crdt/custodyCrypto.ts'),
        '@write-session': join(folder, 'src/crdt/writeSession.ts'),
        '@content-record': join(folder, 'src/crdt/contentRecord.ts'),
      },
    },
    optimizeDeps: { noDiscovery: true },
    server: { host: '127.0.0.1', port: 0, strictPort: true, fs: { allow: [root] } },
  });
  const report = {
    id: label,
    source: {
      files: Object.fromEntries(Object.entries(tested).map(([name, s]) => [name, hash(s)])),
    },
    mutation: mutation ? { file: mutation.file, from: mutation.from, to: mutation.to } : null,
    cases: [],
  };
  try {
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const inventory = mutation ? cases.filter((c) => c.id === mutation.case) : selected;
    for (const definition of inventory) {
      const row = await runCase(definition, {
        browser,
        origin,
        url: origin + '/test/content-trim/index.html',
      });
      report.cases.push(row);
      console.log(
        `${label} ${row.id}: ${row.status}${row.error ? ' — ' + row.error.message.split('\n')[0] : ''}`,
      );
    }
    validateReport(
      report,
      inventory.map((c) => c.id),
    );
    for (const [name, s] of Object.entries(tested))
      if (hash(readFileSync(join(folder, name))) !== hash(s)) throw Error('Tested source changed');
    return report;
  } finally {
    await server.close();
  }
}
try {
  browser = await chromium.launch({ headless: true, executablePath });
  result.browser = {
    version: browser.version(),
    executablePath,
    platform: process.platform,
    arch: process.arch,
    playwright: JSON.parse(
      readFileSync(join(root, 'node_modules/@playwright/test/package.json'), 'utf8'),
    ).version,
  };
  result.candidates.push(await run());
  save();
  if (!argv.includes('--no-mutants'))
    for (const spec of mutants.filter((m) => selected.some((c) => c.id === m.case))) {
      const runResult = await run(spec),
        baseline = result.candidates[0].cases.find((c) => c.id === spec.case);
      result.mutations.push({
        id: spec.id,
        assertion: spec.assertion,
        status: mutationStatus(baseline, runResult.cases[0], spec.assertion),
        result: runResult,
      });
      save();
    }
  if (JSON.stringify(files()) !== JSON.stringify(result.harness.files))
    throw Error('Source/harness inputs changed during execution');
  result.exitCode = exitCode(result.candidates, result.mutations);
  result.finished = new Date().toISOString();
  save();
  console.log(
    `Report: ${join(output, 'report.md')}\nExit ${result.exitCode} (bounded exact-coverage content compaction)`,
  );
  process.exitCode = result.exitCode;
} catch (error) {
  result.fatal = { message: error.message, stack: error.stack };
  result.exitCode = 2;
  save();
  console.error(error);
  process.exitCode = 2;
} finally {
  await browser?.close();
}
