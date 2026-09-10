/** Immutable-source real-browser admission schedules, not whole-store certification. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
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
  option('--output') ?? `test-results/admission/${new Date().toISOString().replaceAll(':', '-')}`,
);
if (existsSync(output)) throw Error('Refusing existing output: ' + output);
mkdirSync(output, { recursive: true });
const sourcePaths = [
  'admission.ts',
  'admissionQueue.ts',
  'admissionDocument.ts',
  'yjs.ts',
  'custody.ts',
  'localClearState.ts',
  'legacyImportState.ts',
  'startupStorage.ts',
  'startupState.ts',
  'custodyCrypto.ts',
  'custodyRecord.ts',
  'writeSession.ts',
  'storageCompatibility.ts',
  'contentRecord.ts',
  'contentDatabase.ts',
  'contentStore.ts',
  'contentCompaction.ts',
  'storeName.ts',
  'journalCodec.ts',
  'journalStore.ts',
];
const sources = Object.fromEntries(
  sourcePaths.map((name) => [name, readFileSync(join(root, 'src/crdt', name), 'utf8')]),
);
sources['seal.generated.ts'] = readFileSync(
  join(root, 'wasm/journal-seal/seal.generated.ts'),
  'utf8',
);
const recordedFiles = [
  'wasm/journal-seal/seal.generated.ts',
  'wasm/journal-seal/src/lib.rs',
  'wasm/journal-seal/Cargo.toml',
  'wasm/journal-seal/Cargo.lock',
  'scripts/build-wasm-seal.mjs',
  ...sourcePaths.map((name) => 'src/crdt/' + name),
  'docs/storage-contract.md',
  'pnpm-lock.yaml',
  'package.json',
  'test/admissionQueue.test.ts',
  'test/journal/browser.mjs',
  'test/vectors/journal-aead.json',
  'test/content/browser.mjs',
  'docs/ordered-admission.md',
  'scripts/storage-conformance/report.mjs',
  ...['scripts/admission', 'test/admission'].flatMap((dir) =>
    readdirSync(join(root, dir)).map((name) => `${dir}/${name}`),
  ),
];
const files = () =>
  Object.fromEntries(recordedFiles.map((path) => [path, hash(readFileSync(join(root, path)))]));
const result = {
  schema: 1,
  scope: 'ordered-admission-browser',
  started: new Date().toISOString(),
  requestedCandidates: ['admission'],
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
    'Ordered admission with private Yjs canonical state and actual generation-1 carriers. Synthetic command/receive adapters and accepted-event projections; no actual CodeMirror, undo, transport, trim or complete startup integration.',
    'Synthetic identity and other-carrier checkers. Chromium on one macOS host; no low-end-device, supported-platform or OS/power-loss guarantee.',
    'Queue capacity reserves bounded input/remainder/update bytes; command semantics and slicing come from a required synchronous trusted adapter. Draft cloning cost is not a low-end performance receipt.',
    'Exact cleanup assumes conforming immutable, never-reused entry identities. No localStorage compare-and-delete transaction or arbitrary hostile-writer protection is claimed.',
    'Raw rollback/cloning and old-writer cutover remain outside this component evidence; no release debt is paid.',
  ],
};
const executablePath = process.env.CHROMIUM_PATH ?? chromium.executablePath();
let browser;
const save = () => {
  writeFileSync(join(output, 'report.json'), JSON.stringify(result, null, 2) + '\n');
  writeFileSync(join(output, 'report.md'), render(result));
};
async function run(mutation = null) {
  const label = mutation?.id ?? 'admission',
    folder = join(output, label);
  mkdirSync(folder);
  const tested = { ...sources };
  if (mutation) {
    if (tested[mutation.file].split(mutation.from).length !== 2)
      throw Error('Mutation anchor is not unique: ' + label);
    tested[mutation.file] = tested[mutation.file].replace(mutation.from, mutation.to);
  }
  for (const [name, source] of Object.entries(tested)) writeFileSync(join(folder, name), source);
  const server = await createServer({
    configFile: false,
    root,
    logLevel: 'error',
    cacheDir: join(folder, 'vite-cache'),
    resolve: {
      alias: {
        '../../wasm/journal-seal/seal.generated': join(folder, 'seal.generated.ts'),
        '@admission': join(folder, 'admission.ts'),
        '@custody': join(folder, 'custody.ts'),
        '@custody-record': join(folder, 'custodyRecord.ts'),
        '@custody-crypto': join(folder, 'custodyCrypto.ts'),
        '@write-session': join(folder, 'writeSession.ts'),
        '@content-record': join(folder, 'contentRecord.ts'),
        '@journal-codec': join(folder, 'journalCodec.ts'),
        '@store-name': join(folder, 'storeName.ts'),
      },
    },
    optimizeDeps: { noDiscovery: true },
    server: { host: '127.0.0.1', port: 5179, strictPort: true, fs: { allow: [root] } },
  });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const report = {
    id: label,
    source: {
      files: Object.fromEntries(Object.entries(tested).map(([name, s]) => [name, hash(s)])),
    },
    mutation: mutation ? { file: mutation.file, from: mutation.from, to: mutation.to } : null,
    cases: [],
  };
  try {
    const inventory = mutation ? cases.filter((c) => c.id === mutation.case) : selected;
    for (const definition of inventory) {
      const row = await runCase(definition, {
        browser,
        origin,
        url: origin + '/test/admission/index.html',
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
    `Report: ${join(output, 'report.md')}\nExit ${result.exitCode} (bounded ordered admission)`,
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
