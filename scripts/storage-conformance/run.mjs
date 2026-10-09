/** Run pinned production adapters. Exit 0 = selected scope conforms, 1 = failures/debt, 2 = harness errors. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  lstatSync,
  readlinkSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { candidates, cases, pending, mutants } from './catalog.mjs';
import { runCase } from './scenarios.mjs';
import { validateReport, mutationStatus, exitCode, render } from './report.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
function tree(path) {
  const entries = [];
  function visit(dir) {
    for (const name of readdirSync(dir).sort()) {
      const file = join(dir, name),
        stat = lstatSync(file),
        key = relative(path, file);
      if (stat.isSymbolicLink()) entries.push([key, 'symlink:' + readlinkSync(file)]);
      else if (stat.isDirectory()) visit(file);
      else entries.push([key, hash(readFileSync(file))]);
    }
  }
  visit(path);
  return { files: entries.length, sha256: hash(JSON.stringify(entries)) };
}
const argv = process.argv.slice(2);
function option(name) {
  const i = argv.indexOf(name);
  return i < 0 ? null : argv[i + 1];
}
for (let i = 0; i < argv.length; i++) {
  if (['--candidate', '--case', '--output'].includes(argv[i])) {
    if (!argv[++i] || argv[i].startsWith('--')) throw Error('Option needs a value');
  } else if (!['--no-mutants', '--keep-profiles'].includes(argv[i]))
    throw Error(`Unknown option: ${argv[i]}`);
}
const chosen = option('--candidate')?.split(',') ?? candidates.map((c) => c.id);
if (chosen.some((id) => !candidates.some((c) => c.id === id))) throw Error('Unknown candidate');
const selectedCases = option('--case')
  ? cases.filter((c) => option('--case').split(',').includes(c.id))
  : cases;
if (
  !selectedCases.length ||
  (option('--case') && selectedCases.length !== new Set(option('--case').split(',')).size)
)
  throw Error('Unknown or empty case selection');
const output = resolve(
  root,
  option('--output') ??
    `test-results/storage-conformance/${new Date().toISOString().replaceAll(':', '-')}`,
);
if (lstatExists(output)) throw Error(`Output already exists; refusing to overwrite ${output}`);
mkdirSync(output, { recursive: true });
function lstatExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}
const started = new Date().toISOString();
const result = {
  schema: 1,
  started,
  scope: option('--case') ? 'selected-subcases' : 'catalog',
  requestedCandidates: chosen,
  requestedCases: selectedCases.map((c) => c.id),
  harness: {
    commit: git('rev-parse', 'HEAD'),
    dirty: Boolean(git('status', '--porcelain')),
    scripts: tree(join(root, 'scripts/storage-conformance')),
    browserAdapter: tree(join(root, 'test/storage-conformance')),
    contract: hash(readFileSync(join(root, 'docs/storage-contract.md'))),
    matrix: hash(readFileSync(join(root, 'docs/storage-conformance.md'))),
    lockfile: hash(readFileSync(join(root, 'pnpm-lock.yaml'))),
    dependencies: Object.fromEntries(
      [
        'vite',
        '@playwright/test',
        'yjs',
        '@codemirror/state',
        '@codemirror/view',
        'y-codemirror.next',
      ].map((name) => [
        name,
        JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')).version,
      ]),
    ),
    node: process.version,
  },
  browser: {},
  candidates: [],
  mutations: [],
  limits: [
    'Chromium on this host only; no hardware latency or supported-platform assurance.',
    'Receive injection uses the production provider-document seam; encrypted wire admission is not implemented.',
    'No factor/authenticator implementation or positive factor control exists at these candidate revisions.',
    'CryptoKey inventory records metadata, never exports keys. Full-profile copy uses Chromium test launch settings on the same host.',
    'Page.crash is a renderer crash, not an OS/power-loss test.',
    'Missing integrated APIs remain explicit not-implemented obligations.',
  ],
};
const launchOptions = {
  headless: true,
  // Pin the launched executable too: otherwise Playwright may choose its
  // separate headless-shell binary while executablePath() names full Chromium.
  executablePath: process.env.CHROMIUM_PATH ?? chromium.executablePath(),
};
let browser;
function save() {
  writeFileSync(join(output, 'report.json'), JSON.stringify(result, null, 2) + '\n');
  writeFileSync(join(output, 'report.md'), render(result));
}
async function runCandidate(candidate, mutation = null) {
  const label = mutation ? `${candidate.id}--${mutation.id}` : candidate.id;
  const folder = join(output, label),
    snapshot = join(folder, 'source');
  mkdirSync(snapshot, { recursive: true });
  if (git('rev-parse', `${candidate.revision}^{commit}`) !== candidate.revision)
    throw Error('Candidate pin did not resolve exactly');
  const archive = execFileSync('git', ['-C', root, 'archive', candidate.revision], {
    maxBuffer: 64 * 1024 * 1024,
  });
  execFileSync('tar', ['-x', '-C', snapshot], { input: archive });
  const originalTree = tree(snapshot);
  let mutationEvidence = null;
  if (mutation) {
    const file = join(snapshot, mutation.path),
      source = readFileSync(file, 'utf8');
    if (source.split(mutation.from).length !== 2)
      throw Error(`Mutation anchor is not unique: ${mutation.id}`);
    const changed = source.replace(mutation.from, mutation.to);
    writeFileSync(file, changed);
    mutationEvidence = {
      path: mutation.path,
      original: hash(source),
      mutated: hash(changed),
      from: mutation.from,
      to: mutation.to,
    };
  }
  const sourceTree = tree(snapshot);
  const server = await createServer({
    configFile: false,
    root,
    logLevel: 'error',
    cacheDir: join(folder, 'vite-cache'),
    resolve: {
      alias: {
        '@candidate': join(snapshot, 'src'),
        '@adapter': join(root, `test/storage-conformance/adapters/${candidate.id}.mjs`),
      },
      dedupe: [
        'yjs',
        'react',
        'react-dom',
        '@codemirror/state',
        '@codemirror/view',
        '@codemirror/language',
      ],
    },
    optimizeDeps: {
      noDiscovery: true,
      include: [
        'react',
        'react-dom',
        'yjs',
        'y-protocols/awareness',
        'y-codemirror.next',
        '@codemirror/state',
        '@codemirror/view',
        '@codemirror/language',
        '@codemirror/commands',
        '@codemirror/lang-markdown',
        '@lezer/highlight',
      ],
    },
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: true,
      fs: { allow: [root, realpathSync(join(root, 'node_modules/yjs'))] },
    },
  });
  await server.listen();
  const address = server.httpServer.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const restrictNetwork = async (context) =>
    context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      return url.origin === origin || url.protocol === 'data:'
        ? route.continue()
        : route.abort('blockedbyclient');
    });
  const report = {
    ...candidate,
    originalTree,
    lockfile: hash(readFileSync(join(snapshot, 'pnpm-lock.yaml'))),
    sourceTree,
    mutation: mutationEvidence,
    evidenceClass: 'browser-adapter-subcases',
    cases: [],
  };
  try {
    for (const definition of mutation
      ? cases.filter((c) => c.id === mutation.case)
      : selectedCases) {
      const artifacts = join(folder, definition.id);
      mkdirSync(artifacts);
      const checkpoints = [];
      const entry = await runCase(definition, {
        browser,
        artifacts,
        checkpoints,
        name: `fixture-${definition.id}`,
        url: `${origin}/test/storage-conformance/index.html`,
        restrictNetwork,
        persistent: async (path) => {
          const ctx = await chromium.launchPersistentContext(path, launchOptions);
          await restrictNetwork(ctx);
          return ctx;
        },
        verifyCopy: (from, to) => {
          const source = tree(from),
            copy = tree(to);
          if (source.sha256 !== copy.sha256)
            throw Error('Closed profile copy differs before reopening');
          return {
            source,
            copy,
            launch: 'Playwright Chromium defaults, including mock keychain, same host',
          };
        },
      });
      writeFileSync(
        join(artifacts, 'checkpoints.json'),
        JSON.stringify(checkpoints, null, 2) + '\n',
      );
      report.cases.push({ ...definition, ...entry, artifacts: relative(output, artifacts) });
      if (!argv.includes('--keep-profiles')) {
        for (const name of ['profile-original', 'profile-copy'])
          rmSync(join(artifacts, name), { recursive: true, force: true });
      }
      console.log(
        `${label} ${definition.id}: ${entry.status}${entry.error ? ' — ' + entry.error.message.split('\n')[0] : ''}`,
      );
    }
    if (!mutation && !option('--case'))
      report.cases.push(...pending.map((c) => ({ ...c, status: 'not-implemented' })));
    const expectedIds = mutation
      ? [mutation.case]
      : [...selectedCases.map((c) => c.id), ...(!option('--case') ? pending.map((c) => c.id) : [])];
    validateReport(report, expectedIds);
    if (tree(snapshot).sha256 !== sourceTree.sha256)
      throw Error(`Production source changed during execution: ${label}`);
    return report;
  } finally {
    await server.close();
  }
}
try {
  browser = await chromium.launch(launchOptions);
  result.browser = {
    engine: 'chromium',
    version: await browser.version(),
    platform: process.platform,
    arch: process.arch,
    executable: launchOptions.executablePath,
  };
  for (const candidate of candidates.filter((c) => chosen.includes(c.id))) {
    result.candidates.push(await runCandidate(candidate));
    save();
  }
  if (!argv.includes('--no-mutants')) {
    for (const mutant of mutants.filter(
      (m) => chosen.includes(m.candidate) && selectedCases.some((c) => c.id === m.case),
    )) {
      const run = await runCandidate(
        candidates.find((c) => c.id === mutant.candidate),
        mutant,
      );
      const baseline = result.candidates
        .find((c) => c.id === mutant.candidate)
        ?.cases.find((c) => c.id === mutant.case);
      const status = mutationStatus(baseline, run.cases[0], mutant.assertion);
      result.mutations.push({ id: mutant.id, assertion: mutant.assertion, status, result: run });
      save();
    }
  }
  result.finished = new Date().toISOString();
  result.exitCode = exitCode(result.candidates, result.mutations);
  save();
  console.log(
    `Report: ${join(output, 'report.md')}\nExit ${result.exitCode}: ${result.exitCode === 0 ? 'selected assertions pass' : 'unmet conformance or harness errors; read individual results'}`,
  );
  process.exitCode = result.exitCode;
} catch (error) {
  result.fatal = { name: error.name, message: error.message, stack: error.stack };
  result.exitCode = 2;
  save();
  console.error(error);
  process.exitCode = 2;
} finally {
  await browser?.close();
}
