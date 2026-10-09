/** Owned admission worker. Public entrypoint: scripts/admission/run.mjs. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
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
import { listenEphemeralVite } from '../release-validation/server.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
if (
  !process.env.RELEASE_BROWSER_ENDPOINT ||
  !process.env.RELEASE_CASE_REPORT ||
  !process.env.RELEASE_RUN_NONCE ||
  !process.env.RELEASE_ADMISSION_OUTPUT
)
  throw Error('Admission worker requires a release stage owner');
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
const output = resolve(root, process.env.RELEASE_ADMISSION_OUTPUT);
if (existsSync(output)) throw Error('Refusing existing output: ' + output);
mkdirSync(output, { recursive: true });
const walk = (dir) =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(dir + '/' + e.name) : [dir + '/' + e.name],
  );
const sourcePaths = [...walk('src'), ...walk('account-protocol')];
const sources = Object.fromEntries(
  [...sourcePaths, 'wasm/journal-seal/seal.generated.ts'].map((path) => [
    path,
    readFileSync(join(root, path), 'utf8'),
  ]),
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
  releaseNonce: process.env.RELEASE_RUN_NONCE,
  servers: [],
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
let browser;
const save = () => {
  writeFileSync(join(output, 'report.json'), JSON.stringify(result, null, 2) + '\n');
  writeFileSync(join(output, 'report.md'), render(result));
  writeFileSync(process.env.RELEASE_CASE_REPORT, JSON.stringify(result) + '\n');
};
async function run(mutation = null) {
  const label = mutation?.id ?? 'admission',
    folder = join(output, label);
  mkdirSync(folder);
  const tested = { ...sources };
  if (mutation) {
    if (tested['src/crdt/' + mutation.file].split(mutation.from).length !== 2)
      throw Error('Mutation anchor is not unique: ' + label);
    tested['src/crdt/' + mutation.file] = tested['src/crdt/' + mutation.file].replace(
      mutation.from,
      mutation.to,
    );
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
        '@admission': join(folder, 'src/crdt/admission.ts'),
        '@custody': join(folder, 'src/crdt/custody.ts'),
        '@custody-record': join(folder, 'src/crdt/custodyRecord.ts'),
        '@custody-crypto': join(folder, 'src/crdt/custodyCrypto.ts'),
        '@write-session': join(folder, 'src/crdt/writeSession.ts'),
        '@content-record': join(folder, 'src/crdt/contentRecord.ts'),
        '@journal-codec': join(folder, 'src/crdt/journalCodec.ts'),
        '@store-name': join(folder, 'src/crdt/storeName.ts'),
      },
    },
    optimizeDeps: { noDiscovery: true },
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: true,
      hmr: false,
      fs: { allow: [root, output] },
    },
  });
  let origin, serverRecord;
  const report = {
    id: label,
    source: {
      files: Object.fromEntries(Object.entries(tested).map(([name, s]) => [name, hash(s)])),
    },
    mutation: mutation ? { file: mutation.file, from: mutation.from, to: mutation.to } : null,
    cases: [],
  };
  if (!mutation) result.candidates.push(report);
  try {
    origin = await listenEphemeralVite(server);
    serverRecord = { variant: label, origin, closed: false };
    result.servers.push(serverRecord);
    save();
    const inventory = mutation ? cases.filter((c) => c.id === mutation.case) : selected;
    for (const definition of inventory) {
      const row = await runCase(definition, {
        browser,
        origin,
        url: origin + '/test/admission/index.html',
      });
      report.cases.push(row);
      save();
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
    if (serverRecord) serverRecord.closed = true;
    save();
  }
}
try {
  browser = await chromium.connectOverCDP(process.env.RELEASE_BROWSER_ENDPOINT, { timeout: 15000 });
  result.browser = {
    version: browser.version(),
    ownership: 'stage-owned-cdp',
    platform: process.platform,
    arch: process.arch,
    playwright: JSON.parse(
      readFileSync(join(root, 'node_modules/@playwright/test/package.json'), 'utf8'),
    ).version,
  };
  await run();
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
