/** Real-browser C04 component evidence; never a whole-store conformance result. */
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
const output = resolve(
  root,
  option('--output') ??
    `test-results/write-session/${new Date().toISOString().replaceAll(':', '-')}`,
);
if (existsSync(output)) throw Error('Refusing to overwrite existing output: ' + output);
mkdirSync(output, { recursive: true });
const sourcePath = 'src/crdt/writeSession.ts';
const source = readFileSync(join(root, sourcePath), 'utf8');
const files = (paths) =>
  Object.fromEntries(paths.map((path) => [path, hash(readFileSync(join(root, path)))]));
const recordedFiles = [
  sourcePath,
  'src/crdt/storageCompatibility.ts',
  'scripts/storage-conformance/report.mjs',
  'docs/storage-contract.md',
  'pnpm-lock.yaml',
  ...['scripts/write-session', 'test/write-session'].flatMap((dir) =>
    readdirSync(join(root, dir)).map((name) => `${dir}/${name}`),
  ),
];
const result = {
  schema: 1,
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
const executablePath = process.env.CHROMIUM_PATH ?? chromium.executablePath();
let browser;
const save = () => {
  writeFileSync(join(output, 'report.json'), JSON.stringify(result, null, 2) + '\n');
  writeFileSync(join(output, 'report.md'), render(result));
};
async function run(mutation = null) {
  const label = mutation?.id ?? 'write-session';
  const folder = join(output, label);
  mkdirSync(folder);
  let tested = source;
  if (mutation) {
    if (source.split(mutation.from).length !== 2)
      throw Error('Mutation source anchor is not unique: ' + label);
    tested = source.replace(mutation.from, mutation.to);
  }
  const target = join(folder, 'writeSession.ts');
  writeFileSync(target, tested);
  writeFileSync(
    join(folder, 'storageCompatibility.ts'),
    readFileSync(join(root, 'src/crdt/storageCompatibility.ts')),
  );
  const server = await createServer({
    configFile: false,
    root,
    logLevel: 'error',
    cacheDir: join(folder, 'vite-cache'),
    resolve: { alias: { '@write-session': target } },
    optimizeDeps: { noDiscovery: true },
    server: { host: '127.0.0.1', port: 5175, strictPort: true, fs: { allow: [root] } },
  });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const report = {
    id: label,
    source: { path: sourcePath, sha256: hash(tested), original: hash(source) },
    mutation: mutation ? { from: mutation.from, to: mutation.to } : null,
    cases: [],
  };
  try {
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
      console.log(
        `${label} ${row.id}: ${row.status}${row.error ? ' — ' + row.error.message.split('\n')[0] : ''}`,
      );
    }
    validateReport(
      report,
      inventory.map((c) => c.id),
    );
    if (hash(readFileSync(target)) !== hash(tested))
      throw Error('Tested source changed during execution');
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
