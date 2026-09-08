/** Generate, shrink and replay serializable histories on frozen production code in native Chromium. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import * as fc from 'fast-check';
import { historyArbitrary, incompleteMergeArbitrary, defaultSeeds } from './arbitrary.mjs';
import { mutants } from './mutants.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const argv = process.argv.slice(2);
const option = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
for (let i = 0; i < argv.length; i++) {
  if (['--seed', '--runs', '--path', '--output', '--replay', '--mutant'].includes(argv[i])) {
    if (!argv[++i] || argv[i].startsWith('--')) throw Error('Missing option value');
  } else if (!['--no-mutants', '--no-shrink'].includes(argv[i]))
    throw Error('Unknown option: ' + argv[i]);
}
const seeds = option('--seed') ? [Number(option('--seed'))] : defaultSeeds;
const runs = Number(option('--runs') ?? 40);
if (seeds.some((n) => !Number.isSafeInteger(n)) || !Number.isSafeInteger(runs) || runs < 1)
  throw Error('Invalid seed/runs');
if (option('--path') && !option('--seed')) throw Error('--path requires --seed');
if (option('--mutant') && !mutants.some((m) => m.id === option('--mutant')))
  throw Error('Unknown mutant');
const output = resolve(
  root,
  option('--output') ??
    `test-results/storage-properties/${new Date().toISOString().replaceAll(':', '-')}`,
);
if (existsSync(output)) throw Error('Refusing existing output: ' + output);
mkdirSync(output, { recursive: true });
const hash = (value) => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const sourceNames = [
  'custody.ts',
  'localClearState.ts',
  'startupStorage.ts',
  'startupState.ts',
  'custodyCrypto.ts',
  'custodyRecord.ts',
  'writeSession.ts',
  'contentRecord.ts',
  'contentDatabase.ts',
  'contentStore.ts',
  'contentCompaction.ts',
  'yjs.ts',
  'storeName.ts',
  'journalCodec.ts',
  'journalStore.ts',
];
const sources = Object.fromEntries(
  sourceNames.map((n) => [n, readFileSync(join(root, 'src/crdt', n), 'utf8')]),
);
sources['seal.generated.ts'] = readFileSync(
  join(root, 'wasm/journal-seal/seal.generated.ts'),
  'utf8',
);
const tree = (dir) =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tree(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
  );
const recorded = [
  ...sourceNames.map((n) => 'src/crdt/' + n),
  'wasm/journal-seal/seal.generated.ts',
  'package.json',
  'pnpm-lock.yaml',
  'docs/storage-properties.md',
  'docs/storage-contract.md',
  'scripts/content-trim/catalog.mjs',
  'test/storageProperties.test.ts',
  ...tree('scripts/storage-properties'),
  ...tree('test/storage-properties'),
];
const files = () => Object.fromEntries(recorded.map((p) => [p, hash(readFileSync(join(root, p)))]));
const report = {
  schema: 1,
  scope: 'encrypted-storage-properties',
  started: new Date().toISOString(),
  harness: {
    commit: git('rev-parse', 'HEAD'),
    dirty: Boolean(git('status', '--porcelain')),
    files: files(),
    node: process.version,
    fastCheck: fc.__version,
    vite: JSON.parse(readFileSync(join(root, 'node_modules/vite/package.json'))).version,
  },
  seeds,
  runsPerSeed: runs,
  baseline: null,
  mutations: [],
  limits: [
    'Two native shared journal sessions in one renderer, three source text lanes with generated authors and cross-client dependencies; generated overlaps at named boundaries, not an exhaustive browser scheduler.',
    'Actual generation-one factor custody, IndexedDB/Web Locks/WebCrypto/WASM; synthetic identity/creation authority. No default application, ordered editor admission, genesis/clear, migration or generation rotation.',
    'Operation ledger and string edits are independent of persistence; both wire replay sides use pinned Yjs. This tests carrier preservation, not independent CRDT correctness.',
    'Controlled quota/removal/transaction faults and renderer death on one Chromium/macOS host; no power-loss, real quota exhaustion or supported-platform claim.',
  ],
};
const save = () =>
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let browser;

async function historyRun(origin, history) {
  const context = await browser.newContext();
  let page;
  const load = async () => {
    page = await context.newPage();
    await page.goto(origin + '/test/storage-properties/index.html');
    await page.waitForFunction(() => Boolean(window.properties), { timeout: 15000 });
  };
  const call = (method, value) =>
    Promise.race([
      page.evaluate(({ method, value }) => window.properties[method](value), { method, value }),
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(Error(`Harness timeout: ${method}`)), 20000);
        timer.unref();
      }),
    ]);
  let index = -1;
  try {
    await load();
    await call('start', history);
    for (const [i, command] of history.steps.entries()) {
      index = i;
      const result = await call('step', command);
      if (result.error) return { ...result, index };
      if (result.crash) {
        const cdp = await context.newCDPSession(page);
        const crashed = page.waitForEvent('crash', { timeout: 10000 });
        void cdp.send('Page.crash').catch(() => {});
        await crashed;
        await page.close();
        await load();
        const resumed = await call('resume', result.model);
        if (resumed.error) return { ...resumed, index };
      }
    }
    return { ...(await call('finish')), index };
  } catch (error) {
    return { error: { type: 'harness', message: error.message, stack: error.stack }, index };
  } finally {
    await context.close();
  }
}

async function campaign(origin, label, seed) {
  const attempts = [];
  const focused = label === 'merge-incomplete-content';
  const details = await fc.check(
    fc.asyncProperty(focused ? incompleteMergeArbitrary : historyArbitrary, async (history) => {
      const outcome = await historyRun(origin, history);
      attempts.push({ history, outcome });
      if (outcome.error && !attempts.slice(0, -1).some((a) => a.outcome.error)) {
        writeFileSync(
          join(output, `${label}-${seed}-first-failure.json`),
          JSON.stringify({ history, outcome }, null, 2) + '\n',
        );
        console.log(`${label} seed=${seed} first failure: ${outcome.error.message}`);
      }
      if (attempts.length % 10 === 0)
        console.log(
          `${label} seed=${seed} attempt=${attempts.length}: ${outcome.error ? outcome.error.message : 'pass'}`,
        );
      if (outcome.error) {
        const error = new Error(outcome.error.message);
        error.outcome = outcome;
        throw error;
      }
    }),
    {
      seed,
      numRuns: runs,
      verbose: 1,
      endOnFailure: argv.includes('--no-shrink'),
      ...(option('--path') ? { path: option('--path') } : {}),
    },
  );
  const row = {
    generator: focused ? 'four-edit-incomplete-merge' : 'full-history',
    seed: details.seed,
    runs: details.numRuns,
    shrinks: details.numShrinks,
    failed: details.failed,
    path: details.counterexamplePath,
    attempts: attempts.length,
    counts: {},
    comparisons: 0,
  };
  for (const { outcome } of attempts)
    if (!outcome.error) {
      row.comparisons += outcome.comparisons;
      for (const [key, value] of Object.entries(outcome.counts))
        row.counts[key] = (row.counts[key] ?? 0) + value;
    }
  writeFileSync(
    join(output, `${label}-${seed}-histories.json`),
    JSON.stringify(attempts, null, 2) + '\n',
  );
  if (details.failed) {
    row.error = details.errorInstance?.outcome?.error ?? {
      type: 'harness',
      message: String(details.errorInstance),
    };
    row.history = details.counterexample?.[0];
    row.replay = row.history ? await historyRun(origin, row.history) : null;
    // The shrink tree can retain an irrelevant trailing suffix. Remove it and recheck separately.
    if (
      row.replay?.error?.type === 'property' &&
      row.replay.index >= 0 &&
      row.replay.index + 1 < row.history.steps.length
    ) {
      const prefix = { ...row.history, steps: row.history.steps.slice(0, row.replay.index + 1) };
      const replay = await historyRun(origin, prefix);
      if (replay.error?.invariant === row.error.invariant) {
        row.prunedTrailingSteps = row.history.steps.length - prefix.steps.length;
        row.history = prefix;
        row.replay = replay;
      }
    }
    writeFileSync(
      join(output, `${label}-${seed}-counterexample.json`),
      JSON.stringify(
        {
          schema: 1,
          seed: row.seed,
          path: row.path,
          shrinks: row.shrinks,
          prunedTrailingSteps: row.prunedTrailingSteps ?? 0,
          history: row.history,
          error: row.error,
        },
        null,
        2,
      ) + '\n',
    );
  }
  console.log(
    `${label} seed=${seed}: ${row.failed ? `FAIL ${row.error.type}/${row.error.invariant ?? row.error.message}, ${row.shrinks} shrinks` : `PASS ${row.runs} histories, ${row.comparisons} recovery comparisons`}`,
  );
  return row;
}

async function withServer(mutation, action) {
  const label = mutation?.id ?? 'baseline',
    folder = join(output, label);
  mkdirSync(folder, { recursive: true });
  const tested = { ...sources };
  if (mutation) {
    if (tested[mutation.file].split(mutation.from).length !== 2)
      throw Error('Nonunique mutant anchor: ' + label);
    tested[mutation.file] = tested[mutation.file].replace(mutation.from, mutation.to);
  }
  for (const [n, s] of Object.entries(tested)) writeFileSync(join(folder, n), s);
  const server = await createServer({
    configFile: false,
    root,
    logLevel: 'error',
    cacheDir: join(folder, 'vite-cache'),
    resolve: {
      alias: {
        '../../wasm/journal-seal/seal.generated': join(folder, 'seal.generated.ts'),
        '@custody': join(folder, 'custody.ts'),
        '@store-name': join(folder, 'storeName.ts'),
      },
    },
    optimizeDeps: { noDiscovery: true },
    server: { host: '127.0.0.1', port: 5186, strictPort: true, fs: { allow: [root] } },
  });
  await server.listen();
  try {
    const result = await action(
      'http://127.0.0.1:5186',
      Object.fromEntries(Object.entries(tested).map(([n, s]) => [n, hash(s)])),
    );
    for (const [n, s] of Object.entries(tested))
      if (hash(readFileSync(join(folder, n))) !== hash(s)) throw Error('Frozen source changed');
    return result;
  } finally {
    await server.close();
  }
}

try {
  const executablePath = process.env.CHROMIUM_PATH ?? chromium.executablePath();
  browser = await chromium.launch({ headless: true, executablePath });
  report.browser = {
    version: browser.version(),
    executablePath,
    platform: process.platform,
    arch: process.arch,
    playwright: JSON.parse(readFileSync(join(root, 'node_modules/@playwright/test/package.json')))
      .version,
  };
  const corpus = option('--replay')
    ? [resolve(root, option('--replay'))]
    : tree('test/storage-properties/corpus')
        .filter((p) => p.endsWith('.json'))
        .map((p) => join(root, p));
  report.baseline = await withServer(null, async (origin, sourceHashes) => {
    const result = { sourceHashes, corpus: [], campaigns: [] };
    for (const path of corpus) {
      const value = JSON.parse(readFileSync(path, 'utf8'));
      const outcome = await historyRun(origin, value.history ?? value);
      result.corpus.push({ path, hash: hash(readFileSync(path)), outcome });
      console.log(
        `baseline replay ${path}: ${outcome.error ? 'FAIL ' + outcome.error.message : 'PASS'}`,
      );
    }
    if (!option('--replay'))
      for (const seed of seeds) {
        result.campaigns.push(await campaign(origin, 'baseline', seed));
        if (result.campaigns.at(-1).failed) break;
      }
    return result;
  });
  report.baseline.coverage = {};
  for (const row of report.baseline.campaigns)
    for (const [key, value] of Object.entries(row.counts))
      report.baseline.coverage[key] = (report.baseline.coverage[key] ?? 0) + value;
  report.baseline.requiredCoverage =
    !option('--seed') && !option('--runs') && !option('--path') && !option('--replay')
      ? [
          'disk',
          'journal',
          'flush',
          'compact',
          'quota',
          'remove-failure',
          'late-reservation',
          'renderer-crash',
          'fault:seal',
          'fault:published',
          'fault:deleted',
          'fault:abort-reserve',
          'fault:abort-record',
          'fault:abort-publish',
          'fault:abort-delete',
          'overlap:disk:seal:close',
          'overlap:compact:published:release',
        ]
      : [];
  report.baseline.missingCoverage = report.baseline.requiredCoverage.filter(
    (key) => !report.baseline.coverage[key],
  );
  save();
  const baselineFailed =
    report.baseline.corpus.some((r) => r.outcome.error) ||
    report.baseline.campaigns.some((r) => r.failed) ||
    report.baseline.missingCoverage.length > 0;
  if (!baselineFailed && !argv.includes('--no-mutants') && !option('--replay')) {
    for (const mutation of mutants.filter(
      (m) => !option('--mutant') || m.id === option('--mutant'),
    )) {
      const result = await withServer(mutation, async (origin, sourceHashes) => {
        const campaigns = [];
        for (const seed of seeds) {
          campaigns.push(await campaign(origin, mutation.id, seed));
          if (campaigns.at(-1).failed) break;
        }
        return { id: mutation.id, sourceHashes, mutation, campaigns };
      });
      const failure = result.campaigns.find((r) => r.failed);
      if (failure?.history)
        result.baselineReplay = await withServer(null, (origin) =>
          historyRun(origin, failure.history),
        );
      result.status =
        failure?.error.type === 'property' &&
        failure.replay?.error?.invariant === failure.error.invariant &&
        !result.baselineReplay?.error
          ? 'detected'
          : failure
            ? 'error'
            : 'survived';
      report.mutations.push(result);
      save();
    }
  }
  if (JSON.stringify(files()) !== JSON.stringify(report.harness.files))
    throw Error('Source/harness inputs changed during run');
  const harnessFailed =
    report.baseline.corpus.some((r) => r.outcome.error?.type === 'harness') ||
    report.baseline.campaigns.some((r) => r.error?.type === 'harness') ||
    report.mutations.some((m) => m.status === 'error');
  report.exitCode = harnessFailed
    ? 2
    : baselineFailed || report.mutations.some((m) => m.status !== 'detected')
      ? 1
      : 0;
  report.finished = new Date().toISOString();
  save();
  console.log(`Report: ${join(output, 'report.json')}\nExit ${report.exitCode}`);
  process.exitCode = report.exitCode;
} catch (error) {
  report.fatal = { message: error.message, stack: error.stack };
  report.exitCode = 2;
  save();
  console.error(error);
  process.exitCode = 2;
} finally {
  await browser?.close();
}
