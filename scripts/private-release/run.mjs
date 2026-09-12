import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { join, resolve } from 'node:path';
const phase = process.argv[2] ?? 'privacy';
if (!['privacy', 'failures', 'recovery'].includes(phase)) throw Error('Unknown release phase');
const output = resolve(
  'test-results/private-release-' + phase,
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
    'docs/account-privacy-recovery-capacity.md',
  ]),
]
  .sort()
  .map((path) => ({ path, sha256: hash(readFileSync(path)) }));
write('sources', sources);
write('scope', {
  baseline: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  phase,
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  protocol: 'docs/account-privacy-recovery-capacity.md',
  claim:
    phase === 'privacy'
      ? 'Bounded private Chromium privacy extension; legacy physical residue is separately reported, not a forensic-erasure promise'
      : phase === 'recovery'
        ? 'Authenticated read-only partial Local recovery; originals retained, no completeness claim'
        : 'Private bounded diagnostics and refusal recovery; unsigned hints never authorize a decision',
});

const summary = {
  status: 'running',
  startedAt: new Date().toISOString(),
  stages: [],
  sourcePins: sources.length,
};
const save = () => write('summary', summary);
save();
console.log('Private release ' + phase + ': ' + output);
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
  if (phase === 'privacy') {
    await run('types', ['node_modules/typescript/bin/tsc', '-b', '--noEmit']);
    await run('neutral', [
      '--test',
      'test/account-residue/matcher.test.mjs',
      'test/account-residue/extended.test.mjs',
    ]);
    await run(
      'packaged',
      ['--test', '--test-concurrency=1', 'test/account-residue/packaged.test.mjs'],
      240000,
    );
    await run('service-files', ['--test', 'test/account-residue/service-files.test.mjs'], 240000);
    await run('r1-calibration', ['--test', 'test/account-residue/calibration.test.mjs'], 180000);
    await run('r1-lifecycle', ['--test', 'test/account-residue/lifecycle.test.mjs'], 300000);
    await run('r1-generated', ['--test', 'test/account-residue/generated.test.mjs'], 360000);
    await run('lint', [
      'node_modules/oxlint/bin/oxlint',
      '--react-plugin',
      'test/account-residue',
      'scripts/private-release',
    ]);
    await run('format', [
      'node_modules/oxfmt/bin/oxfmt',
      '--check',
      'test/account-residue',
      'scripts/private-release',
    ]);
    const read = (stage, name) => JSON.parse(readFileSync(join(output, stage, name + '.json')));
    assert.equal(read('packaged', 'fresh-outcome').logical, 'passed');
    assert.equal(read('packaged', 'fresh-worker-control').detected, true);
    assert.equal(read('packaged', 'migration-outcome').logical, 'passed');
    assert.equal(read('service-files', 'service-files').verdict, 'complete-no-prohibited-match');
  } else if (phase === 'recovery') {
    await run('types', ['node_modules/typescript/bin/tsc', '-b', '--noEmit']);
    await run('unit', ['node_modules/vitest/vitest.mjs', 'run'], 120000);
    await run('native', ['--test', 'test/local-recovery/native.test.mjs'], 120000);
    await run('custody', ['scripts/custody/run.mjs'], 180000);
    await run('trim', ['scripts/content-trim/run.mjs'], 180000);
    await run(
      'packaged',
      ['--test', '--test-concurrency=1', 'test/account-residue/packaged.test.mjs'],
      240000,
    );
    const paths = [
      'src/crdt/localRecovery.ts',
      'src/crdt/custody.ts',
      'src/ui/LocalRecovery.tsx',
      'src/ui/LocalApp.tsx',
      'test/localRecovery.test.ts',
      'test/local-recovery',
      'scripts/private-release',
    ];
    await run('lint', ['node_modules/oxlint/bin/oxlint', '--react-plugin', ...paths]);
    await run('format', ['node_modules/oxfmt/bin/oxfmt', '--check', ...paths]);
  } else {
    await run('types', ['node_modules/typescript/bin/tsc', '-b', '--noEmit']);
    await run('unit', ['node_modules/vitest/vitest.mjs', 'run'], 120000);
    await run(
      'native',
      [
        '--test',
        '--test-concurrency=1',
        'test/account-failures/native.test.mjs',
        'test/account-failures/service.test.mjs',
        'test/account-failures/http.test.mjs',
      ],
      120000,
    );
    await run(
      'activation',
      [
        '--test',
        '--test-concurrency=1',
        'test/account-activation/core.test.mjs',
        'test/account-activation/native.test.mjs',
      ],
      180000,
    );
    await run(
      'service-delivery',
      [
        '--test',
        '--test-concurrency=1',
        'test/account-service-delivery/core.test.mjs',
        'test/account-service-delivery/generated.test.mjs',
      ],
      180000,
    );
    await run(
      'service-inbound',
      [
        '--test',
        '--test-concurrency=1',
        'test/account-service-inbound/core.test.mjs',
        'test/account-service-inbound/generated.test.mjs',
      ],
      180000,
    );
    await run(
      'transport',
      [
        '--test',
        '--test-concurrency=1',
        'test/account-receive-transport/native.test.mjs',
        'test/account-sync/native.test.mjs',
      ],
      240000,
    );
    await run('privacy', ['--test', 'test/account-residue/lifecycle.test.mjs'], 180000);
    const paths = [
      'account-protocol/diagnostics.ts',
      'account-service/core.ts',
      'account-service/delivery.ts',
      'account-service/private-server.ts',
      'src/account/privateDeliveryHttp.ts',
      'src/crdt/promotionAdmission.ts',
      'test/diagnostics.test.ts',
      'test/privateDeliveryHttp.test.ts',
      'test/account-failures',
      'scripts/private-release',
    ];
    await run('lint', ['node_modules/oxlint/bin/oxlint', '--react-plugin', ...paths]);
    await run('format', ['node_modules/oxfmt/bin/oxfmt', '--check', ...paths]);
  }
  for (const s of sources)
    assert.equal(hash(readFileSync(s.path)), s.sha256, 'Source changed: ' + s.path);
  summary.status = 'passed';
} catch (e) {
  summary.status = 'failed';
  summary.error = e.stack;
  process.exitCode = 1;
} finally {
  summary.finishedAt = new Date().toISOString();
  save();
  console.log('Private release ' + phase + ' ' + summary.status + ': ' + output);
}
