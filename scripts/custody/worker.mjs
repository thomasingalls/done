/** Owned Custody worker. Public entrypoint: scripts/custody/run.mjs. */
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
import { ownedProfiles } from './profiles.mjs';
import { encodeCatalogueEvidence } from '../release-validation/assertion-evidence.mjs';
import { listenEphemeralVite } from '../release-validation/server.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
if (
  !process.env.RELEASE_BROWSER_ENDPOINT ||
  !process.env.RELEASE_CASE_REPORT ||
  !process.env.RELEASE_RUN_NONCE ||
  !process.env.RELEASE_CUSTODY_OUTPUT
)
  throw Error('Custody worker requires a release stage owner');
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
const output = resolve(root, process.env.RELEASE_CUSTODY_OUTPUT);
if (existsSync(output)) throw Error('Refusing existing output: ' + output);
mkdirSync(output, { recursive: true });
const tree = (dir) =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tree(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
  );
const sourcePaths = [...tree('src'), ...tree('account-protocol')];
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
  releaseNonce: process.env.RELEASE_RUN_NONCE,
  servers: [],
  profiles: [],
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
let browser;
const save = () => {
  const encoded = encodeCatalogueEvidence(result);
  writeFileSync(join(output, 'report.json'), JSON.stringify(encoded, null, 2) + '\n');
  writeFileSync(join(output, 'report.md'), render(result));
  writeFileSync(process.env.RELEASE_CASE_REPORT, JSON.stringify(encoded) + '\n');
};
async function run(mutation = null) {
  const label = mutation?.id ?? 'custody',
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
  let origin, serverRecord, profiles;
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
    profiles = ownedProfiles({
      directory: join(folder, 'profiles'),
      origin,
      records: result.profiles,
      save,
    });
    save();
    const inventory = mutation ? cases.filter((c) => c.id === mutation.case) : selected;
    for (const definition of inventory) {
      const row = await runCase(definition, {
        browser,
        origin,
        url: origin + '/test/custody/index.html',
        profile: profiles.profile,
        copyProfile: profiles.copyProfile,
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
    try {
      await profiles?.close();
    } finally {
      await server.close();
    }
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
