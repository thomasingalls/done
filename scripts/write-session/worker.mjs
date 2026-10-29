/** Owned Write-session worker. Public entrypoint: scripts/write-session/run.mjs. */
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
import { encodeCatalogueEvidence } from '../release-validation/assertion-evidence.mjs';
import { listenEphemeralVite } from '../release-validation/server.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
if (
  !process.env.RELEASE_BROWSER_ENDPOINT ||
  !process.env.RELEASE_CASE_REPORT ||
  !process.env.RELEASE_RUN_NONCE ||
  !process.env.RELEASE_WRITE_SESSION_OUTPUT
)
  throw Error('Write-session worker requires a release stage owner');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
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
const output = resolve(root, process.env.RELEASE_WRITE_SESSION_OUTPUT);
if (existsSync(output)) throw Error('Refusing to overwrite existing output: ' + output);
mkdirSync(output, { recursive: true });
const sourcePath = 'src/crdt/writeSession.ts';
const walk = (dir) =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(dir + '/' + e.name) : [dir + '/' + e.name],
  );
const sourcePaths = [
  ...walk('src'),
  ...walk('account-protocol'),
  'wasm/journal-seal/seal.generated.ts',
];
const sources = Object.fromEntries(
  sourcePaths.map((path) => [path, readFileSync(join(root, path), 'utf8')]),
);
const source = sources[sourcePath];
const files = (paths) =>
  Object.fromEntries(paths.map((path) => [path, hash(readFileSync(join(root, path)))]));
const recordedFiles = [
  ...sourcePaths,
  ...['src/crdt', 'account-protocol'].flatMap((dir) =>
    readdirSync(join(root, dir))
      .filter((n) => n.endsWith('.ts'))
      .map((n) => dir + '/' + n),
  ),
  'scripts/storage-conformance/report.mjs',
  'scripts/storage-conformance/observe.mjs',
  'docs/storage-contract.md',
  'pnpm-lock.yaml',
  ...['scripts/write-session', 'test/write-session'].flatMap((dir) =>
    readdirSync(join(root, dir)).map((name) => `${dir}/${name}`),
  ),
];
const result = {
  schema: 1,
  releaseNonce: process.env.RELEASE_RUN_NONCE,
  servers: [],
  scope: 'C04-component-browser',
  started: new Date().toISOString(),
  requestedCandidates: ['write-session'],
  requestedCases: selected.map((c) => c.id),
  harness: {
    commit: git('rev-parse', 'HEAD'),
    dirty: Boolean(git('status', '--porcelain')),
    files: files(recordedFiles),
    node: process.version,
    vite: JSON.parse(readFileSync(join(root, 'node_modules/vite/package.json'), 'utf8')).version,
  },
  browser: {},
  candidates: [],
  mutations: [],
  limits: [
    'Production lifecycle component with synthetic cache/write probes; not wired into the encrypted store or editor.',
    'No factor custody, opener census, generation activation, clear authorization, or supported-version cutover is certified.',
    'Chromium on this host only. Freeze, renderer death, worker termination and navigation are real browser operations.',
    'A new document on back navigation is not evidence of a BFCache restoration.',
    'All side effects must use the capability API; it does not sandbox hostile same-origin code or escaped raw keys.',
  ],
};
let browser;
const save = () => {
  const encoded = encodeCatalogueEvidence(result);
  writeFileSync(join(output, 'report.json'), JSON.stringify(encoded, null, 2) + '\n');
  writeFileSync(join(output, 'report.md'), render(result));
  writeFileSync(process.env.RELEASE_CASE_REPORT, JSON.stringify(encoded) + '\n');
};
async function run(mutation = null) {
  const label = mutation?.id ?? 'write-session';
  const folder = join(output, label);
  mkdirSync(folder);
  const tested = { ...sources };
  if (mutation) {
    if (source.split(mutation.from).length !== 2)
      throw Error('Mutation source anchor is not unique: ' + label);
    tested[sourcePath] = source.replace(mutation.from, mutation.to);
  }
  for (const [name, text] of Object.entries(tested)) {
    mkdirSync(dirname(join(folder, name)), { recursive: true });
    writeFileSync(join(folder, name), text);
  }
  const target = join(folder, sourcePath);
  const server = await createServer({
    configFile: false,
    root,
    logLevel: 'error',
    cacheDir: join(folder, 'vite-cache'),
    resolve: {
      alias: {
        '@write-session': target,
        './promotionRecord': join(folder, 'src/crdt/promotionRecord.ts'),
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
      path: sourcePath,
      sha256: hash(tested[sourcePath]),
      original: hash(source),
      files: Object.fromEntries(Object.entries(tested).map(([p, s]) => [p, hash(s)])),
    },
    mutation: mutation ? { file: sourcePath, from: mutation.from, to: mutation.to } : null,
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
        url: origin + '/test/write-session/index.html',
      });
      const pageErrors =
        row.artifacts.find((a) => a.point === 'unexpected-page-errors')?.errors ?? [];
      if (pageErrors.length) {
        row.status = 'error';
        row.error = { message: 'Unexpected browser errors: ' + pageErrors.join('; ') };
      }
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
    for (const [name, text] of Object.entries(tested))
      if (hash(readFileSync(join(folder, name))) !== hash(text))
        throw Error('Tested source changed during execution');
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
    executablePath: process.env.RELEASE_BROWSER_EXECUTABLE,
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
      const runResult = await run(spec);
      const baseline = result.candidates[0].cases.find((c) => c.id === spec.case);
      result.mutations.push({
        id: spec.id,
        assertion: spec.assertion,
        status: mutationStatus(baseline, runResult.cases[0], spec.assertion),
        result: runResult,
      });
      save();
    }
  if (JSON.stringify(files(recordedFiles)) !== JSON.stringify(result.harness.files))
    throw Error('Source/harness inputs changed during execution');
  result.exitCode = exitCode(result.candidates, result.mutations);
  result.finished = new Date().toISOString();
  save();
  console.log(
    `Report: ${join(output, 'report.md')}\nExit ${result.exitCode} (bounded C04 component scope)`,
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
