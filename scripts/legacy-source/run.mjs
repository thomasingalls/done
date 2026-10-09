/** Native read-only migration preparation. No destination import, selection or cleanup. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../..', import.meta.url));
const argv = process.argv.slice(2);
const options = {};
for (let i = 0; i < argv.length; i += 2) {
  const name = argv[i]?.slice(2);
  if (
    !['output', 'seed', 'runs', 'path', 'replay'].includes(name) ||
    !argv[i].startsWith('--') ||
    !argv[i + 1] ||
    argv[i + 1].startsWith('--') ||
    options[name]
  )
    throw Error(
      'Usage: [--output dir] [--seed integer] [--runs positive-integer] [--path fc-path] [--replay json]',
    );
  options[name] = argv[i + 1];
}
const seedValue = Number(options.seed ?? 8941),
  numRuns = Number(options.runs ?? 100);
if (
  !Number.isSafeInteger(seedValue) ||
  !Number.isSafeInteger(numRuns) ||
  numRuns < 1 ||
  (options.path && !options.seed) ||
  (options.replay && (options.path || options.seed))
)
  throw Error('Invalid replay/seed/runs');
const replay = options.replay
  ? JSON.parse(readFileSync(resolve(root, options.replay), 'utf8'))
  : null;
if (
  options.replay &&
  (!Array.isArray(replay) ||
    replay.length !== 2 ||
    !replay.every(
      (ids) =>
        Array.isArray(ids) &&
        ids.length <= 24 &&
        ids.every((id) => Number.isInteger(id) && id >= 0 && id <= 4),
    ))
)
  throw Error('Replay must contain [diskIds, walIds], each at most 24 update ids in 0..4');
const output = resolve(
  root,
  options.output ?? `test-results/legacy-source/${new Date().toISOString().replaceAll(':', '-')}`,
);
if (existsSync(output)) throw Error('Output exists');
mkdirSync(output, { recursive: true });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const walk = (dir) =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`],
  );
const paths = [
  ...walk('src'),
  ...walk('test/legacy-source'),
  ...walk('scripts/legacy-source'),
  'test/legacySource.test.ts',
  'test/storage-properties/oracle.ts',
  'wasm/journal-seal/seal.generated.ts',
  'pnpm-lock.yaml',
  'package.json',
  'docs/legacy-migration-prep.md',
  'docs/storage-contract.md',
];
const hashes = () => Object.fromEntries(paths.map((p) => [p, hash(readFileSync(join(root, p)))]));
const report = {
  schema: 1,
  scope: 'legacy-source-preparation',
  started: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  files: hashes(),
  browser: {},
  checks: [],
  properties: null,
  mutations: [],
  limits: [
    'Fixed legacy done database and its 1: journal, plus four known ancillary localStorage keys. Not an origin-wide inventory or authenticated authority.',
    'Native Chromium, disposable synthetic fixtures. One source-reader crash; no executed migration/selection/deletion kill matrix, no real-data cutover.',
    'The exclusive-lock counterexample uses the actual legacy provider. It demonstrates a missing fence; no production old-writer exclusion is implemented.',
    'The digest is an observation fingerprint, never permission to select a store or delete source carriers.',
  ],
};
const snapshot = join(output, 'snapshot');
mkdirSync(snapshot);
for (const p of paths) {
  const target = join(snapshot, p);
  mkdirSync(resolve(target, '..'), { recursive: true });
  cpSync(join(root, p), target);
}
const sourcePath = join(snapshot, 'src/crdt/legacySource.ts');
const original = readFileSync(sourcePath, 'utf8');
const mutants = [
  {
    id: 'omit-journal',
    from: '.filter((e) => e.key.startsWith(PREFIX))',
    to: '.filter(() => false)',
    case: 'journal',
  },
  {
    id: 'ignore-pending',
    from: "return hasPendingUpdates(doc) ? 'missing' : 'complete';",
    to: "return 'complete';",
    case: 'pending',
  },
  {
    id: 'ignore-custom',
    from: "if (custom.result !== 0) refuse('unsupported-legacy-custom-data');",
    to: 'void custom.result;',
    case: 'custom',
  },
  { id: 'writable-inspection', from: "'readonly',", to: "'readwrite',", case: 'journal' },
];
let browser, server;
const checks = (id, fn) => {
  try {
    fn();
    report.checks.push({ id, passed: true });
  } catch (error) {
    report.checks.push({ id, passed: false });
    throw error;
  }
};
const call = (page, method, ...args) =>
  page.evaluate(({ method, args }) => window.legacy[method](...args), { method, args });
const localKey = (i) => `done.pending-update.done.fixture.${i}`;
const run = async (mutant = null) => {
  if (mutant && original.split(mutant.from).length !== 2)
    throw Error('Mutation anchor is not unique: ' + mutant.id);
  writeFileSync(sourcePath, mutant ? original.replace(mutant.from, mutant.to) : original);
  cpSync(sourcePath, join(output, (mutant?.id ?? 'baseline') + '.ts'));
  server = await createServer({
    configFile: false,
    root: snapshot,
    logLevel: 'error',
    cacheDir: join(output, 'vite-' + (mutant?.id ?? 'baseline')),
    optimizeDeps: { noDiscovery: true },
    server: { host: '127.0.0.1', port: 5187, strictPort: true, fs: { allow: [root] } },
  });
  await server.listen();
  const url = 'http://127.0.0.1:5187/test/legacy-source/index.html';
  const context = await browser.newContext();
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === 'http://127.0.0.1:5187'
      ? route.continue()
      : route.abort(),
  );
  const page = async () => {
    const p = await context.newPage();
    p.setDefaultTimeout(15000);
    await p.goto(url);
    await p.waitForFunction(() => window.legacy);
    return p;
  };
  let p = await page();
  const test = async (id) => {
    if (id === 'journal') {
      await call(p, 'seed', [0, 1, 2, 3], [4]);
      const before = await call(p, 'inventory');
      const result = await call(p, 'inspect');
      assert.equal(result.status, 'observed', 'journal-observed');
      assert.deepEqual(
        result.value.journal.map((r) => r.bytes),
        [(await call(p, 'source'))[4]],
        'journal-only-update-retained',
      );
      assert.equal(result.value.dependencies, 'complete', 'complete-dependencies');
      assert.ok(
        result.modes.length > 0 && result.modes.every((m) => m === 'readonly'),
        'all-native-reads-readonly',
      );
      assert.deepEqual(await call(p, 'inventory'), before, 'source-byte-identical');
    } else if (id === 'pending') {
      for (const value of [3, 4]) {
        await call(p, 'seed', [], [value]);
        const result = await call(p, 'inspect');
        assert.equal(result.status, 'observed', 'pending-observed');
        assert.equal(result.value.dependencies, 'missing', 'pending-dependencies-retained');
        assert.equal(result.value.journal.length, 1, 'pending-journal-present');
      }
    } else if (id === 'custom') {
      await call(p, 'seed', [], []);
      await call(p, 'custom');
      const before = await call(p, 'inventory');
      assert.equal(
        (await call(p, 'inspect')).reason,
        'unsupported-legacy-custom-data',
        'custom-data-not-omitted',
      );
      assert.deepEqual(await call(p, 'inventory'), before, 'custom-data-retained');
    }
  };
  try {
    if (mutant) {
      try {
        await test(mutant.case);
        return { id: mutant.id, detected: false };
      } catch (error) {
        if (!(error instanceof assert.AssertionError)) throw error;
        return {
          id: mutant.id,
          detected: true,
          assertion: error.message,
          code: error.code,
          sourceHash: hash(readFileSync(sourcePath)),
          from: mutant.from,
          to: mutant.to,
        };
      }
    }
    for (const id of ['journal', 'pending', 'custom']) {
      await test(id);
      checks(id, () => {});
    }
    await call(p, 'reset');
    const absentBefore = await call(p, 'inventory');
    const absent = await call(p, 'inspect');
    checks('absence-is-not-origin-freshness', () => {
      assert.equal(absent.value.kind, 'legacy-source-observation');
      assert.equal(absent.value.databasePresent, false);
    });
    checks('absent-probe-creates-nothing', () => assert.deepEqual(absentBefore.names, []));
    assert.deepEqual(await call(p, 'inventory'), absentBefore);
    for (const fault of ['abort', 'journal-change']) {
      await call(p, 'seed', [0, 1, 2], [3, 4]);
      const before = await call(p, 'inventory');
      await call(p, 'fault', fault);
      const result = await call(p, 'inspect');
      checks('native-' + fault, () => {
        assert.equal(result.status, 'refused');
        if (fault === 'journal-change') assert.equal(result.reason, 'source-changed');
      });
      const after = await call(p, 'inventory');
      checks('failure-retains-database-' + fault, () => assert.deepEqual(after.rows, before.rows));
    }
    // Generated delivery partitions with duplicates/order. The expected ledger is
    // held in this process; production's digest or recovered document is not the oracle.
    const updates = await call(p, 'source');
    let comparisons = 0;
    const history = async (disk, wal) => {
      await call(p, 'seed', disk, wal);
      const before = await call(p, 'inventory');
      const result = await call(p, 'inspect');
      assert.equal(result.status, 'observed');
      assert.deepEqual(
        result.value.updates.map((r) => [r.key, r.bytes]),
        disk.map((id, i) => [1 + i * 2, updates[id]]),
      );
      assert.deepEqual(
        result.value.journal.map((r) => [r.key, r.bytes]),
        wal.map((id, i) => [localKey(i), updates[id]]).sort((a, b) => a[0].localeCompare(b[0])),
      );
      assert.deepEqual(await call(p, 'inventory'), before);
      assert.equal((await call(p, 'inspect')).value.digest, result.value.digest);
      comparisons += 4;
    };
    if (replay) {
      await history(...replay);
      report.properties = { replay, comparisons, failed: false };
    } else {
      const property = fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 4 }), { maxLength: 24 }),
        fc.array(fc.integer({ min: 0, max: 4 }), { maxLength: 24 }),
        history,
      );
      const detail = await fc.check(property, {
        seed: seedValue,
        numRuns,
        ...(options.path ? { path: options.path } : {}),
      });
      report.properties = {
        seed: detail.seed,
        numRuns: detail.numRuns,
        comparisons,
        failed: detail.failed,
        numShrinks: detail.numShrinks,
        counterexample: detail.counterexample,
        path: detail.counterexamplePath,
        error: detail.errorInstance?.message ?? null,
      };
      if (detail.failed) {
        writeFileSync(
          join(output, 'counterexample.json'),
          JSON.stringify(detail.counterexample) + '\n',
        );
        throw detail.errorInstance ?? Error('Native property failed');
      }
    }
    console.log(`legacy-source: ${replay ? 'replay' : numRuns + ' generated histories'} passed`);
    // Actual old provider: it neither asks for nor observes the new exclusive lock.
    await call(p, 'reset');
    const old = await page();
    await call(old, 'startOldWriter');
    const first = await call(p, 'inspect');
    await call(p, 'holdExclusive');
    await p.waitForFunction(() => window.legacy.gated());
    const held = await call(p, 'locks');
    const lateJournal = await call(old, 'oldWrite');
    checks('old-writer-bypasses-exclusive', () => {
      assert.ok(held.held.some((lock) => lock.mode === 'exclusive'));
      assert.equal(lateJournal, true);
    });
    await call(p, 'release');
    const second = await call(p, 'inspect');
    checks('observation-does-not-fence-late-commit', () => {
      assert.equal(second.status, 'observed');
      assert.notEqual(first.value.digest, second.value.digest);
    });
    await call(old, 'stopOldWriter');
    await old.close();
    // Crash only at this reader's digest boundary, not a migration kill matrix.
    await call(p, 'seed', [0, 1, 2], [3, 4]);
    const beforeCrash = await call(p, 'inventory');
    await call(p, 'fault', 'digest-gate');
    await call(p, 'startRead');
    await p.waitForFunction(() => window.legacy.gated());
    const cdp = await context.newCDPSession(p),
      died = p.waitForEvent('crash');
    void cdp.send('Page.crash').catch(() => {});
    await died;
    await p.close();
    p = await page();
    const afterCrash = await call(p, 'inventory'),
      reopened = await call(p, 'inspect');
    checks('reader-crash-preserves-source', () => {
      assert.deepEqual(afterCrash, beforeCrash);
      assert.equal(reopened.status, 'observed');
    });
    return null;
  } finally {
    await context.close();
    await server.close();
    server = null;
  }
};
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH ?? chromium.executablePath(),
  });
  report.browser = {
    version: browser.version(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  };
  await run();
  for (const mutant of mutants) {
    const result = await run(mutant);
    report.mutations.push(result);
    console.log(`${mutant.id}: ${result.detected ? 'detected' : 'survived'}`);
  }
  assert.ok(report.mutations.every((m) => m.detected));
  assert.deepEqual(hashes(), report.files, 'recorded-input-changed');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = { name: error.name, message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  await server?.close();
  await browser?.close();
  report.finished = new Date().toISOString();
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.status}: ${join(output, 'report.json')}`);
}
