/** Aggregate execution evidence. Finding disposition remains a reviewed document, never a count. */
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { checkConstructionRegistry } from '../account-first-authority/registry.mjs';
import { sourcePaths, dependencyPins, digest } from '../release-validation/identity.mjs';

const output = resolve(
  'test-results/account-crypto-audit',
  new Date().toISOString().replaceAll(':', '-'),
);
mkdirSync(output, { recursive: true });
console.log('Aggregate Account contract evidence: ' + output);
const read = (path) => readFileSync(path, 'utf8');
const json = (path) => JSON.parse(read(path));
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const write = (name, value) =>
  writeFileSync(join(output, name + '.json'), JSON.stringify(value, null, 2) + '\n');
const registry = json('docs/account-crypto/constructions.json');
const checked = checkConstructionRegistry(process.cwd());
assert.deepEqual(checked.failures, []);
assert.equal(checked.open, 0, 'An open construction requires review before this closure campaign');
const corpora = [{ phase: 'A', vectorFile: registry.vectorFile }, ...registry.additionalCorpora];
const vectorIds = new Set();
const phases = corpora.map(({ phase, vectorFile }) => {
  const { vectors } = json(vectorFile);
  for (const v of vectors) {
    assert(!vectorIds.has(v.id), 'Duplicate vector id: ' + v.id);
    vectorIds.add(v.id);
  }
  return {
    phase,
    vectorFile,
    sha256: hash(vectorFile),
    constructions: registry.constructions.filter((c) => c.phase === phase).map((c) => c.id),
    vectors: vectors.map((v) => ({
      id: v.id,
      kind: v.kind,
      inputNegatives: v.negatives.length,
      encodedOmissions: v.encodedBindingControls?.length ?? 0,
    })),
  };
});
const registeredTests = [...new Set(registry.constructions.flatMap((c) => c.tests ?? []))].sort();
assert(registeredTests.every((p) => /^test\/[a-z0-9/-]+\.test\.mjs$/.test(p)));
const tests = [
  ...new Set([
    'test/account-first-authority/registry.test.mjs',
    'test/account-crypto-prep/contracts.test.mjs',
    ...registeredTests,
    ...['core', 'crypto', 'properties', 'restart', 'controls', 'native'].map(
      (n) => `test/account-recovery/${n}.test.mjs`,
    ),
    'test/account-genesis/crypto.test.mjs',
  ]),
];
const crosswalk = registry.constructions.map((c) => ({
  id: c.id,
  phase: c.phase,
  status: c.status,
  roles: c.roles,
  labels: c.labels,
  entryPoints: c.entryPoints,
  homePins: c.homePins,
  mapEntries: c.mapEntries,
  vectorCases: c.vectorCases ?? [],
  requirements: c.requirements ?? [],
  tests: (c.tests ?? []).map((path) => ({ path, sha256: hash(path) })),
  ...(c.status === 'inherited'
    ? { scope: c.scope, reason: c.reason, evidencePins: c.evidencePins }
    : {}),
}));
write('crosswalk', {
  counts: checked,
  phases,
  constructions: crosswalk,
  interpretation:
    'Vector membership and test references are registered obligations. The runner executes every named test file; a reviewed source/field assessment is still required. Counts do not prove protocol completeness.',
});
// Current complete repository inputs replace the inherited historical campaign list.
const paths = sourcePaths(process.cwd());
const installedDependencies = dependencyPins(process.cwd());
write('dependencies', installedDependencies);
const pins = paths.map((path) => ({ path, sha256: hash(path) }));
write('sources', pins);
const summary = {
  status: 'running',
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  startedAt: new Date().toISOString(),
  node: process.version,
  scope:
    'F-05/F-06 aggregate byte-contract execution, all registered helper/native files and recovery/HPKE bridges. No personal server/build, real Account or general release qualification.',
  registeredTestFiles: registeredTests,
  stages: [],
};
const save = () => write('summary', summary);
save();
async function run(name, args, timeout = 60000, testPath) {
  console.log('Starting ' + name);
  const log = createWriteStream(join(output, name + '.log'));
  const reportDir = join(output, name);
  mkdirSync(reportDir, { recursive: true });
  const env = { ...process.env, ACCOUNT_REPORT_DIR: reportDir };
  if (name === 'unit-bridges') delete env.ACCOUNT_REPORT_DIR;
  const started = Date.now();
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });
  let timedOut = false,
    forced,
    error;
  const kill = (signal) => {
    try {
      process.kill(-child.pid, signal);
    } catch {}
  };
  const timer = setTimeout(() => {
    timedOut = true;
    kill('SIGTERM');
    forced = setTimeout(() => kill('SIGKILL'), 5000);
  }, timeout);
  const heartbeat = setInterval(
    () =>
      console.log(
        `${name} still running (${Math.round((Date.now() - started) / 1000)}s); see ${name}.log`,
      ),
    15000,
  );
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (b) => {
      process.stdout.write(b);
      log.write(b);
    });
  const code = await new Promise((resolve) => {
    child.once('error', (e) => {
      error = String(e);
      resolve(1);
    });
    child.once('close', (code) => resolve(code ?? 1));
  });
  clearTimeout(timer);
  clearTimeout(forced);
  clearInterval(heartbeat);
  await new Promise((resolve) => log.end(resolve));
  let executedTests;
  if (testPath && code === 0) {
    const xml = read(join(output, name + '.xml'));
    executedTests = [...xml.matchAll(/<testcase\b/g)].length;
    if (!executedTests || /<(?:skipped|failure|error)\b/.test(xml))
      error = 'No executed tests or skipped/failed test present';
  }
  summary.stages.push({
    name,
    command: [process.execPath, ...args],
    code,
    timedOut,
    durationMs: Date.now() - started,
    ...(testPath ? { testPath, executedTests } : {}),
    ...(error ? { error } : {}),
  });
  save();
  if (code !== 0 || timedOut || error) throw Error('Failed stage: ' + name);
}
try {
  await run('inventory', ['scripts/account-crypto-prep/run.mjs']);
  await run('authority', ['scripts/check-authority-map.mjs']);
  for (const path of tests) {
    const name = path
      .replace(/^test\//, '')
      .replace(/\.test\.mjs$/, '')
      .replaceAll('/', '--');
    await run(
      name,
      [
        '--test',
        '--test-concurrency=1',
        '--test-reporter=spec',
        '--test-reporter-destination=stdout',
        '--test-reporter=junit',
        `--test-reporter-destination=${join(output, name + '.xml')}`,
        path,
      ],
      600000,
      path,
    );
  }
  await run('unit-bridges', [
    'node_modules/vitest/vitest.mjs',
    'run',
    'test/slotUnlock.test.ts',
    'test/accountTransportContract.test.ts',
    '--maxWorkers=2',
  ]);
  const pkg = json('package.json');
  const commands = pkg.scripts['vectors:check']
    .replace('pnpm vectors:coverage', pkg.scripts['vectors:coverage'])
    .split(' && ');
  for (const [i, command] of commands.entries()) {
    const [exe, ...args] = command.split(' ');
    assert.equal(exe, 'node', 'Review non-Node vector command before running');
    await run('vectors-' + String(i + 1).padStart(2, '0'), args);
  }
  await run('lint', [
    'node_modules/oxlint/bin/oxlint',
    'scripts/account-crypto-audit',
    'scripts/account-crypto-prep/run.mjs',
    'scripts/check-authority-map.mjs',
  ]);
  await run('format', [
    'node_modules/oxfmt/bin/oxfmt',
    '--check',
    'scripts/account-crypto-audit',
    'scripts/account-crypto-prep/run.mjs',
    'scripts/check-authority-map.mjs',
    'docs/account-crypto/constructions.json',
    'package.json',
  ]);
  const executed = new Set(
    summary.stages.filter((s) => s.code === 0 && s.executedTests > 0).map((s) => s.testPath),
  );
  for (const p of registeredTests) assert(executed.has(p), 'Unexecuted registered test file: ' + p);
  for (const p of pins)
    assert.equal(hash(p.path), p.sha256, 'Source changed during campaign: ' + p.path);
  assert.deepEqual(sourcePaths(process.cwd()), paths, 'Source input population changed');
  assert.equal(
    digest(dependencyPins(process.cwd())),
    digest(installedDependencies),
    'Installed dependencies changed',
  );
  summary.dependencyPinsVerified = installedDependencies.length;
  summary.sourcePinsVerified = pins.length;
  summary.registeredTestFilesExecuted = registeredTests.length;
  summary.nodeTestFilesExecuted = executed.size;
  summary.nodeTests = summary.stages.reduce((n, s) => n + (s.executedTests ?? 0), 0);
  summary.status = 'passed';
} catch (e) {
  summary.status = 'failed';
  summary.error = e.stack ?? String(e);
  process.exitCode = 1;
} finally {
  summary.completedAt = new Date().toISOString();
  save();
  console.log(summary.status + ': ' + output);
}
