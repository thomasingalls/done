/** Bounded Q-01/Q-04 campaign; not the full release aggregate. */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { join, resolve } from 'node:path';
import { validationControlStages } from './preflight.mjs';

if (process.argv.length !== 2) throw Error('Usage: node scripts/validation-controls/run.mjs');
const output = resolve(
  'test-results/validation-controls',
  new Date().toISOString().replaceAll(':', '-'),
);
mkdirSync(output, { recursive: true });
const write = (name, value) =>
  writeFileSync(join(output, name + '.json'), JSON.stringify(value, null, 2) + '\n');
const hash = (b) => createHash('sha256').update(b).digest('hex');
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
const sources = [
  ...new Set([
    ...[
      'src',
      'account-protocol',
      'account-service',
      'test',
      'scripts',
      'docs/account-crypto',
    ].flatMap(walk),
    ...execFileSync('git', ['ls-files', 'wasm'], { encoding: 'utf8' }).trim().split('\n'),
    'package.json',
    'pnpm-lock.yaml',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'vite.config.ts',
    'docs/review/remediation/S0-2/authority-map.md',
    'docs/review/implementation/validation-controls.md',
  ]),
]
  .sort()
  .map((path) => ({ path, sha256: hash(readFileSync(path)) }));
write('sources', sources);
writeFileSync(
  join(output, 'protocol.tested.md'),
  readFileSync('docs/review/implementation/validation-controls.md'),
);
write('scope', {
  parent: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  claim:
    'Live construction inventory and Q-04 omission controls, affected full suites and three phase-runner integrations. No complete contract audit, release aggregate, capacity or personal operation.',
});
const summary = {
  status: 'running',
  startedAt: new Date().toISOString(),
  sourcePins: sources.length,
  stages: [],
};
const save = () => write('summary', summary);
save();
console.log('Validation control campaign: ' + output);
async function run(name, args, timeout = 60000) {
  const dir = join(output, name);
  mkdirSync(dir, { recursive: true });
  const log = createWriteStream(join(output, name + '.log'));
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ACCOUNT_REPORT_DIR: dir },
  });
  const started = Date.now();
  let timedOut = false,
    forced,
    error;
  const kill = (signal) => {
    try {
      process.kill(-child.pid, signal);
    } catch {
      /* already drained */
    }
  };
  const timer = setTimeout(() => {
    timedOut = true;
    kill('SIGTERM');
    forced = setTimeout(() => kill('SIGKILL'), 5000);
  }, timeout);
  const heartbeat = setInterval(
    () =>
      console.log(
        name + ' running ' + Math.floor((Date.now() - started) / 1000) + 's; ' + name + '.log',
      ),
    15000,
  );
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (b) => log.write(b));
  const code = await new Promise((resolve) => {
    child.once('error', (e) => {
      error = e.message;
      resolve(1);
    });
    child.once('close', resolve);
  });
  clearTimeout(timer);
  clearTimeout(forced);
  clearInterval(heartbeat);
  await new Promise((r) => log.end(r));
  const text = readFileSync(join(output, name + '.log'), 'utf8');
  let tests;
  if (args.includes('--test') && code === 0 && !timedOut) {
    tests = Number(text.match(/(?:ℹ|#) tests (\d+)/)?.[1]);
    if (
      !tests ||
      !/(?:ℹ|#) fail 0(?:\r?\n|$)/.test(text) ||
      !/(?:ℹ|#) cancelled 0(?:\r?\n|$)/.test(text) ||
      !/(?:ℹ|#) skipped 0(?:\r?\n|$)/.test(text)
    )
      error = 'Missing or non-passing test census';
    if (name.endsWith('-control') && tests !== 1) error = 'Expected exactly one directed control';
  }
  const nested = text.match(
    /(?:Account native receive evidence|Account receive transport evidence|Sync-liveness campaign|Residue campaign|Private release failures): (.+)/,
  )?.[1];
  if (nested && code === 0) {
    const report = JSON.parse(readFileSync(join(nested, 'summary.json')));
    if (report.status !== 'passed' || !report.stages.length) error = 'Nested campaign did not pass';
  }
  const stage = {
    name,
    args,
    code,
    timedOut,
    elapsedMs: Date.now() - started,
    ...(tests ? { tests } : {}),
    ...(nested ? { report: nested } : {}),
    ...(error ? { error } : {}),
  };
  summary.stages.push(stage);
  save();
  console.log(name + ': ' + (code === 0 && !timedOut && !error ? 'passed' : 'FAILED'));
  if (code !== 0 || timedOut || error) throw Error('Stage failed: ' + name);
}
try {
  for (const [name, args, timeout] of validationControlStages(output))
    await run(name, args, timeout);
  await run('registry-origin', [
    '--test',
    '--test-concurrency=1',
    'test/account-crypto-prep/census.test.mjs',
    'test/account-first-authority/registry.test.mjs',
    'test/validation-controls/origin.test.mjs',
  ]);
  await run(
    'content-full',
    ['scripts/content/run.mjs', '--output', join(output, 'content-full-report')],
    120000,
  );
  await run('receive-full', ['scripts/account-receive/run.mjs'], 420000);
  await run('receive-transport-full', ['scripts/account-receive-transport/run.mjs'], 720000);
  await run('liveness-integration', ['scripts/account-liveness/run.mjs'], 1800000);
  await run('residue-integration', ['scripts/account-residue/run.mjs'], 1080000);
  await run(
    'private-failures-integration',
    ['scripts/private-release/run.mjs', 'failures'],
    900000,
  );
  const paths = [
    'scripts/validation-controls',
    'scripts/account-liveness/run.mjs',
    'scripts/account-residue/run.mjs',
    'scripts/private-release/run.mjs',
    'scripts/content',
    'scripts/check-origin-isolation.mjs',
    'test/validation-controls',
    'test/account-receive/fixtures.mjs',
    'test/account-receive/native.test.mjs',
    'test/account-receive-transport/controls.test.mjs',
  ];
  await run('lint', ['node_modules/oxlint/bin/oxlint', ...paths]);
  await run('format', [
    'node_modules/oxfmt/bin/oxfmt',
    '--check',
    ...paths,
    'docs/account-crypto/census.json',
    'docs/account-crypto/constructions.json',
    'docs/account-crypto/registry.json',
  ]);
  for (const s of sources)
    assert.equal(hash(readFileSync(s.path)), s.sha256, 'Tested source changed: ' + s.path);
  summary.status = 'passed';
} catch (e) {
  summary.status = 'failed';
  summary.error = String(e);
  process.exitCode = 1;
} finally {
  summary.completedAt = new Date().toISOString();
  save();
  console.log(summary.status + ': ' + output);
}
