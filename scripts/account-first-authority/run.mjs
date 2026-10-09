import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { join, resolve } from 'node:path';
const output = resolve(
  'test-results/account-first-authority',
  new Date().toISOString().replaceAll(':', '-'),
);
mkdirSync(output, { recursive: true });
console.log(`First-authority evidence: ${output}`);
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
const files = [
  ...new Set([
    ...JSON.parse(readFileSync('docs/account-crypto/census.json')).sources.map((s) => s.path),
    ...[
      'docs/account-crypto',
      'scripts/account-first-authority',
      'test/account-first-authority',
      'scripts/account-crypto-prep',
      'test/account-crypto-prep',
      'test/account-admission',
      'scripts/lib',
      'test/vectors',
    ].flatMap(walk),
    ...readdirSync('scripts')
      .filter((p) => p.startsWith('generate-') && p.endsWith('.mjs'))
      .map((p) => 'scripts/' + p),
    'package.json',
    'pnpm-lock.yaml',
    'docs/TRD.md',
    'docs/account-first-authority.md',
    'docs/account-crypto-prep.md',
    'docs/account-admission-bounds.md',
    'docs/account-activation.md',
    'docs/account-handoff.md',
    'docs/review/remediation/S0-2/authority-map.md',
    'docs/selections/row-5-finalization.md',
    'docs/selections/row-7-checkpoint.md',
    'docs/selections/row-14-recovery-code.md',
    'scripts/check-authority-map.mjs',
    'scripts/check-aad-coverage.mjs',
    'scripts/account-admission-bounds/vectors.mjs',
    'test/slotUnlock.test.ts',
    'test/account-core/fixtures.mjs',
    'test/account-authority/fixtures.mjs',
    'test/account-genesis/oracle.mjs',
    ...['S0-1/A-policies.md', ...[2, 3, 4, 5, 6, 7].map((n) => `S0-${n}/A-schemas.md`)].map(
      (p) => 'docs/review/remediation/' + p,
    ),
  ]),
].sort();
writeFileSync(
  join(output, 'sources.json'),
  JSON.stringify(
    files.map((path) => ({
      path,
      sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
    })),
    null,
    2,
  ) + '\n',
);
const summary = {
  status: 'running',
  startedAt: new Date().toISOString(),
  node: process.version,
  scope:
    'Private first-authority byte contracts and map integration; fixed vectors, generated input ordering, field/registration omissions, actual verifier boundaries. No runtime format change or real Account.',
  stages: [],
};
const save = () =>
  writeFileSync(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
save();
async function run(name, args, timeout = 60000) {
  console.log('Starting ' + name);
  const log = createWriteStream(join(output, name + '.log'));
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ACCOUNT_REPORT_DIR: output },
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
    () => console.log(name + ' still running; see ' + name + '.log'),
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
  summary.stages.push({
    name,
    command: [process.execPath, ...args],
    code,
    timedOut,
    ...(error ? { error } : {}),
  });
  save();
  return code === 0 && !timedOut;
}
const testArgs = (name, paths) => [
  '--test',
  '--test-concurrency=1',
  '--test-reporter=spec',
  '--test-reporter-destination=stdout',
  '--test-reporter=junit',
  `--test-reporter-destination=${join(output, name + '.xml')}`,
  ...paths,
];
try {
  const pkg = JSON.parse(readFileSync('package.json'));
  // Execute the checked Node-only vector chain directly; do not depend on package-manager provisioning.
  const vectorCommands = pkg.scripts['vectors:check']
    .replace('pnpm vectors:coverage', pkg.scripts['vectors:coverage'])
    .split(' && ')
    .map((command) => {
      const [exe, ...args] = command.split(' ');
      if (exe !== 'node') throw Error('Review non-Node vector command before running: ' + command);
      return args;
    });
  const stages = [
    ['inventory', ['scripts/account-crypto-prep/run.mjs']],
    ['authority', ['scripts/check-authority-map.mjs']],
    [
      'formats',
      testArgs('formats', [
        'test/account-first-authority/formats.test.mjs',
        'test/account-first-authority/registry.test.mjs',
      ]),
    ],
    ['admission-core', testArgs('admission-core', ['test/account-admission/core.test.mjs'])],
    [
      'slot-verifier',
      ['node_modules/vitest/vitest.mjs', 'run', 'test/slotUnlock.test.ts', '--maxWorkers=2'],
    ],
    ...vectorCommands.map((args, i) => ['vectors-' + String(i + 1).padStart(2, '0'), args]),
    [
      'lint',
      [
        'node_modules/oxlint/bin/oxlint',
        'scripts/account-first-authority',
        'test/account-first-authority',
        'scripts/check-authority-map.mjs',
      ],
    ],
    [
      'format',
      [
        'node_modules/oxfmt/bin/oxfmt',
        '--check',
        'scripts/account-first-authority',
        'test/account-first-authority',
        'scripts/check-authority-map.mjs',
        'docs/account-crypto/constructions.json',
        'package.json',
      ],
    ],
  ];
  for (const [name, args] of stages) if (!(await run(name, args))) throw Error(name + ' failed');
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
