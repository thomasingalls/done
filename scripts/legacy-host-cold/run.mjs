import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assets, sha, walk, predecessor } from '../legacy-host/assets.mjs';
import { atomicJSON, within } from '../legacy-cleanup/diagnostics.mjs';

const args = process.argv.slice(2),
  options = {};
for (let i = 0; i < args.length; i += 2) {
  assert.ok(
    ['--lima-home', '--machine', '--output'].includes(args[i]) &&
      args[i + 1] &&
      !Object.hasOwn(options, args[i]),
    'explicit-runtime-arguments',
  );
  options[args[i]] = args[i + 1];
}
const limaHome = resolve(options['--lima-home'] ?? '/invalid'),
  machine = options['--machine'];
assert.ok(
  limaHome.startsWith('/private/tmp/') && /^[a-z0-9-]+$/u.test(machine ?? ''),
  'explicit-disposable-lima-runtime-required',
);
const config = readFileSync(join(limaHome, machine, 'lima.yaml'), 'utf8');
assert.match(config, /^plain: true$/mu);
assert.match(config, /^mounts: \[\]$/mu);
const root = process.cwd(),
  id = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const output = resolve(options['--output'] ?? join(root, 'test-results/legacy-host-cold', id));
assert.equal(existsSync(output), false, 'new-output-required');
mkdirSync(output, { recursive: true });
const guest = `/home/probe/cold/${id}`,
  results = `/home/probe/cold-output/${id}`;
const limits = { phaseMs: 630000, runMs: 1800000, teardownMs: 10000 };
const env = { ...process.env, LIMA_HOME: limaHome };
const report = {
  id,
  started: new Date().toISOString(),
  predecessor,
  limits,
  phases: [],
  diagnosticsPassed: false,
  hostSupported: false,
  verdict: 'in-flight',
  runtime: { limaHome, machine, configHash: sha(config) },
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
};
const event = (kind, data = {}) => {
  const row = { time: new Date().toISOString(), kind, ...data };
  appendFileSync(join(output, 'events.jsonl'), JSON.stringify(row) + '\n');
  console.log(JSON.stringify(row));
  atomicJSON(join(output, 'report.json'), report);
};
let active;
const command = (program, argv, timeoutMs = limits.phaseMs) =>
  new Promise((resolveCommand, reject) => {
    const child = spawn(program, argv, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    active = child;
    const log = (chunk) => {
      appendFileSync(join(output, 'native.log'), chunk);
      process.stdout.write(chunk);
    };
    child.stdout.on('data', log);
    child.stderr.on('data', log);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      active = null;
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      active = null;
      resolveCommand({ code, signal, timedOut });
    });
  });
const lima = (argv, ms) => command('limactl', argv, ms);
const total = setTimeout(() => {
  event('run-timeout');
  active?.kill('SIGKILL');
  process.exit(124);
}, limits.runMs);
try {
  event('build-start');
  const built = await assets(root, join(output, 'assets'));
  await built.close();
  report.assets = built.files;
  report.inputs = Object.fromEntries(
    [
      ...walk(join(root, 'scripts/legacy-host-cold')),
      join(root, 'scripts/legacy-host/assets.mjs'),
      join(root, 'scripts/legacy-host/cdp.mjs'),
      join(root, 'scripts/legacy-cleanup/diagnostics.mjs'),
      join(root, 'test/legacy-import/error.mjs'),
      join(root, 'scripts/legacy-export/oracle.mjs'),
      join(root, 'test/legacy-host/seed.mjs'),
      join(root, 'test/legacy-export/source.ts'),
      join(root, 'pnpm-lock.yaml'),
    ].map((p) => [p.slice(root.length + 1), sha(readFileSync(p))]),
  );
  execFileSync(
    join(root, 'node_modules/.bin/rolldown'),
    [
      'scripts/legacy-host-cold/guest.mjs',
      '--platform',
      'node',
      '--format',
      'esm',
      '--file',
      join(output, 'guest.mjs'),
    ],
    { stdio: 'inherit' },
  );
  execFileSync(
    join(root, 'node_modules/.bin/rolldown'),
    [
      'scripts/legacy-host-cold/native-policy.mjs',
      '--platform',
      'node',
      '--format',
      'esm',
      '--file',
      join(output, 'native-policy.mjs'),
    ],
    { stdio: 'inherit' },
  );
  writeFileSync(
    join(output, 'enter.sh'),
    readFileSync(join(root, 'scripts/legacy-host-cold/enter.sh')),
  );
  writeFileSync(join(output, 'runtime-config.yaml'), config);
  const archive = join(output, 'fixtures.tgz');
  execFileSync(
    'tar',
    [
      '--no-xattrs',
      '-czf',
      archive,
      '-C',
      output,
      'assets/old-dist',
      'assets/fixture-dist',
      'guest.mjs',
      'native-policy.mjs',
      'enter.sh',
    ],
    { env: { ...process.env, COPYFILE_DISABLE: '1' } },
  );
  report.bundleHash = sha(readFileSync(join(output, 'guest.mjs')));
  report.transferHash = sha(readFileSync(archive));
  for (const argv of [
    ['shell', machine, 'mkdir', '-p', guest],
    ['copy', archive, `${machine}:${guest}/fixtures.tgz`],
    ['shell', machine, 'tar', '-xzf', `${guest}/fixtures.tgz`, '-C', guest],
  ])
    assert.equal((await lima(argv)).code, 0, 'runtime-transfer');
  const phase = async (mode, policy) => {
    event('phase-start', { mode, policy });
    // The independent root timeout bounds the namespace even if a guest promise never settles.
    const exit = await lima([
      'shell',
      machine,
      'sudo',
      'timeout',
      '--kill-after=10s',
      '600s',
      'unshare',
      '--mount',
      '--net',
      '--pid',
      '--fork',
      '--mount-proc',
      'sh',
      `${guest}/enter.sh`,
      policy,
      `${guest}/guest.mjs`,
      mode,
      results,
      `${guest}/assets`,
      policy,
    ]);
    const item = { mode, policy, ...exit };
    report.phases.push(item);
    event('phase-end', item);
    return exit.code === 0;
  };
  let okay = true;
  for (const policy of ['missing', 'malformed', 'ignored', 'exception', 'recommended']) {
    if (!okay) break;
    event('policy-control-start', { policy });
    const exit = await lima(
      [
        'shell',
        machine,
        'sudo',
        'timeout',
        '--kill-after=10s',
        '60s',
        'unshare',
        '--mount',
        '--net',
        '--pid',
        '--fork',
        '--mount-proc',
        'sh',
        `${guest}/enter.sh`,
        policy,
        `${guest}/native-policy.mjs`,
        results,
        `${guest}/assets`,
        policy,
      ],
      75000,
    );
    report.phases.push({ mode: 'policy-control', policy, ...exit });
    okay = exit.code === 0;
  }
  if (okay) okay = await phase('seed', 'allow');
  if (okay) okay = await phase('directed', 'allow');
  if (okay) okay = await phase('directed', 'origin');
  if (okay) okay = await phase('directed', 'deny');
  if (okay) okay = await phase('generated', 'deny');
  report.diagnosticsPassed = okay;
  report.verdict = okay ? 'bounded-diagnostics-passed-host-unsupported' : 'diagnostic-failed';
  if (!okay) process.exitCode = 1;
} catch (error) {
  report.error = error.stack;
  report.verdict = 'harness-failed';
  process.exitCode = 1;
} finally {
  clearTimeout(total);
  // Preserve small synthetic reports/ledgers only. Profiles remain closed inside the disposable VM.
  try {
    const collection = await within('evidence collection', 31000, () =>
      lima(
        [
          'shell',
          machine,
          'sh',
          '-c',
          `cd '${results}' && tar -czf '${guest}/evidence.tgz' --exclude=profiles .`,
        ],
        30000,
      ),
    );
    if (collection.code === 0) {
      assert.equal(
        (await lima(['copy', `${machine}:${guest}/evidence.tgz`, join(output, 'evidence.tgz')]))
          .code,
        0,
      );
      mkdirSync(join(output, 'native'));
      execFileSync('tar', ['-xzf', join(output, 'evidence.tgz'), '-C', join(output, 'native')]);
      report.evidence = Object.fromEntries(
        walk(join(output, 'native')).map((p) => [p.slice(output.length + 1), sha(readFileSync(p))]),
      );
    } else report.collectionError = collection;
  } catch (error) {
    report.collectionError = error.stack;
    process.exitCode = 1;
  }
  report.ended = new Date().toISOString();
  event('complete', {
    verdict: report.verdict,
    output,
    diagnosticsPassed: report.diagnosticsPassed,
    hostSupported: false,
  });
}
