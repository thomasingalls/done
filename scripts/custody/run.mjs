/** Immutable-source real-browser custody component schedules, not whole-store certification. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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
  option('--output') ?? `test-results/custody/${new Date().toISOString().replaceAll(':', '-')}`,
);
if (existsSync(output)) throw Error('Refusing existing output: ' + output);
mkdirSync(output, { recursive: true });
const sourcePaths = [
  'custody.ts',
  'custodyCrypto.ts',
  'custodyRecord.ts',
  'writeSession.ts',
  'contentRecord.ts',
  'contentDatabase.ts',
  'contentStore.ts',
];
const sources = Object.fromEntries(
  sourcePaths.map((name) => [name, readFileSync(join(root, 'src/crdt', name), 'utf8')]),
);
const recordedFiles = [
  ...sourcePaths.map((name) => 'src/crdt/' + name),
  'docs/storage-contract.md',
  'pnpm-lock.yaml',
  'package.json',
  'test/custodyCrypto.test.ts',
  'test/custodyRecord.test.ts',
  'scripts/storage-conformance/report.mjs',
  ...['scripts/custody', 'test/custody'].flatMap((dir) =>
    readdirSync(join(root, dir)).map((name) => `${dir}/${name}`),
  ),
];
const files = () =>
  Object.fromEntries(recordedFiles.map((path) => [path, hash(readFileSync(join(root, path)))]));
const result = {
  schema: 1,
  scope: 'custody-component-browser',
  started: new Date().toISOString(),
  requestedCandidates: ['custody'],
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
    'Component scope: genesis custody, generated code unlock and lifecycle. App startup/admission, legacy migration, PRF ceremonies and full storage composition remain separate.',
    'Identity and other-carrier validation are required caller boundaries, supplied by synthetic fixture checks in this run. The Account service verifier is not exercised.',
    'Chromium on this macOS host only. Entire closed profiles are copied; test-only content and future ECDH probes are not production content writes or a reader-wrap verifier.',
    'Profile attacker attempts persisted 32-byte values and CryptoKey handles as root openers for known content and future-receiver probes; this is not an exhaustive attack proof.',
    'Source and copies use --use-mock-keychain and --password-store=basic. Results do not certify native keychain or other supported-platform behavior.',
    'Copies only read/decrypt; raw profile cloning is not a supported writable store history. No release debt is paid.',
  ],
};
const executablePath = process.env.CHROMIUM_PATH ?? chromium.executablePath();
let browser;
const save = () => {
  writeFileSync(join(output, 'report.json'), JSON.stringify(result, null, 2) + '\n');
  writeFileSync(join(output, 'report.md'), render(result));
};
async function run(mutation = null) {
  const label = mutation?.id ?? 'custody',
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
        '@custody': join(folder, 'custody.ts'),
        '@custody-record': join(folder, 'custodyRecord.ts'),
        '@custody-crypto': join(folder, 'custodyCrypto.ts'),
        '@write-session': join(folder, 'writeSession.ts'),
      },
    },
    optimizeDeps: { noDiscovery: true },
    server: { host: '127.0.0.1', port: 5176, strictPort: true, fs: { allow: [root] } },
  });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const profile = async (name) => {
    const context = await chromium.launchPersistentContext(join(folder, 'profiles', name), {
      headless: true,
      executablePath,
      args: ['--use-mock-keychain', '--password-store=basic'],
    });
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin
        ? route.continue()
        : route.abort('blockedbyclient'),
    );
    return context;
  };
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
        url: origin + '/test/custody/index.html',
        profile,
        copyProfile: async (source, destination) => {
          cpSync(join(folder, 'profiles', source), join(folder, 'profiles', destination), {
            recursive: true,
          });
          return profile(destination);
        },
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
    `Report: ${join(output, 'report.md')}\nExit ${result.exitCode} (bounded custody component)`,
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
