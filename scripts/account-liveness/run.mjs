import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { join, resolve } from 'node:path';
const output = resolve(
  'test-results/account-liveness',
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
    ...['src', 'account-protocol', 'account-service', 'test', 'scripts'].flatMap(walk),
    ...execFileSync('git', ['ls-files', 'wasm'], { encoding: 'utf8' }).trim().split('\n'),
    'package.json',
    'pnpm-lock.yaml',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'vite.config.ts',
    'docs/account-sync-liveness.md',
  ]),
]
  .sort()
  .map((path) => ({ path, sha256: hash(readFileSync(path)) }));
write('sources', sources);
write('scope', {
  baseline: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  claim:
    'Mechanism measurements and controlled reproductions in disposable v9 Account; no runtime repair or release-capacity claim',
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  jobs: 24,
  observations: [0, 8, 16, 24],
  statusRepeats: 3,
  generatedHistories: 40,
  seed: 120907,
  protocol: 'docs/account-sync-liveness.md',
  seams: [
    'source-level inclusive function probes',
    'client crypto timing wrappers',
    'IPC service metrics via Node module hook',
    'genuine read response barrier',
    'final receive commit clock offset only',
    'synthetic authenticator',
    'navigator online gate for isolated status samples',
  ],
  limits: [
    'one host/browser/history; descriptive timings only',
    'v9 creating-member stream; independent multi-publisher verifier fixture separately',
    'no real network outage or personal installation',
    'raw service/client durations are inclusive and overlap',
  ],
});
const summary = {
  status: 'running',
  startedAt: new Date().toISOString(),
  stages: [],
  sourcePins: sources.length,
};
const save = () => write('summary', summary);
save();
console.log('Sync-liveness campaign: ' + output);
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
      /* process already exited */
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
  console.log('Starting ' + name);
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (b) => {
      log.write(b);
      process.stdout.write(b);
    });
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
  }
  const stage = {
    name,
    args,
    code,
    ...(tests ? { tests } : {}),
    timedOut,
    elapsedMs: Date.now() - started,
    ...(error ? { error } : {}),
  };
  summary.stages.push(stage);
  save();
  if (code !== 0 || timedOut || error) throw Error('Stage failed: ' + name);
}
try {
  await run('types', ['node_modules/typescript/bin/tsc', '-b', '--noEmit']);
  await run('instrument', ['--test', 'test/account-liveness/instrument.test.mjs']);
  await run('coverage', [
    'node_modules/vitest/vitest.mjs',
    'run',
    'test/accountLiveness.test.ts',
    'test/verifiedRecords.test.ts',
    'test/verificationMemo.test.ts',
    'test/spoolRecord.test.ts',
  ]);
  await run('controlled', ['--test', 'test/account-liveness/controlled.test.mjs'], 200000);
  await run('view', ['--test', 'test/account-liveness/view.test.mjs'], 180000);
  await run('growth', ['--test', 'test/account-liveness/native.test.mjs'], 930000);
  await run('lint', [
    'node_modules/oxlint/bin/oxlint',
    '--react-plugin',
    'test/account-liveness',
    'test/accountLiveness.test.ts',
    'scripts/account-liveness',
  ]);
  await run('format', [
    'node_modules/oxfmt/bin/oxfmt',
    '--check',
    'test/account-liveness',
    'test/accountLiveness.test.ts',
    'scripts/account-liveness',
    'docs/account-sync-liveness.md',
    'package.json',
  ]);
  const read = (dir, name) => JSON.parse(readFileSync(join(output, dir, name + '.json')));
  const growth = read('growth', 'growth'),
    expiry = read('controlled', 'expiry'),
    held = read('controlled', 'held-fetch'),
    generated = read('coverage', 'coverage-histories');
  assert.equal(read('view', 'verified-view').status, 'passed');
  assert.equal(growth.status, 'passed');
  assert.equal(growth.history.length, 24);
  assert.equal(growth.controls.length, 6);
  assert(growth.coldReopen);
  assert.equal(growth.rows.length, 17); // 12 status sets, 3 closed-loop editing bursts, 2 idle polls.
  for (const sample of growth.rows.filter((s) => s.name.startsWith('idle-poll-')))
    assert.equal(sample.service.rows['service.census'].calls, 1);
  assert.equal(expiry.status, 'reproduced');
  assert(expiry.coldReopen);
  assert.equal(held.status, 'reproduced');
  assert.equal(held.settledWhileHeld, false);
  assert.equal(generated.result.numRuns, 40);
  assert.equal(generated.result.failed, false);
  assert.equal(generated.histories.length, 40);
  assert.equal(read('coverage', 'witness-control').missingContentRefused, true);
  for (const s of sources)
    assert.equal(hash(readFileSync(s.path)), s.sha256, 'Source changed: ' + s.path);
  summary.status = 'passed';
  summary.generatedHistories = 40;
  summary.nativeReproductions = 2;
} catch (e) {
  summary.status = 'failed';
  summary.error = e.stack;
  process.exitCode = 1;
} finally {
  summary.finishedAt = new Date().toISOString();
  save();
  console.log('Sync-liveness campaign ' + summary.status + ': ' + output);
}
