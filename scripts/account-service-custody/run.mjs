import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { join, resolve } from 'node:path';
const output = resolve(
  'test-results/account-service-custody',
  new Date().toISOString().replaceAll(':', '-'),
);
mkdirSync(output, { recursive: true });
console.log(`Service-custody evidence: ${output}`);
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
const files = [
  ...new Set([
    ...[
      'src',
      'account-protocol',
      'account-service',
      'test',
      'scripts',
      'docs/account-crypto',
    ].flatMap(walk),
    'package.json',
    'pnpm-lock.yaml',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'vite.config.ts',
    'docs/TRD.md',
    'docs/account-first-authority.md',
    'docs/account-authority.md',
    'docs/account-recovery.md',
    'docs/account-crypto-prep.md',
    'docs/account-outbound.md',
    'docs/account-decisions.md',
    'docs/account-transport.md',
    'docs/account-service-delivery.md',
    'docs/account-receive-transport.md',
    'docs/review/remediation/S0-2/authority-map.md',
    'docs/selections/row-5-finalization.md',
    'docs/selections/row-7-checkpoint.md',
    'docs/selections/row-14-recovery-code.md',
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
    'D1 service root and acceptance custody byte contracts, provider-format and creation cleanup repairs. Independent fixed vectors, authentic wrong-seed payloads, production guard controls, generated cold-open histories and native authority/transport regressions. No real Account or personal artifacts.',
  stages: [],
};
const save = () =>
  writeFileSync(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
save();
async function run(name, args, timeout = 60000) {
  console.log('Starting ' + name);
  const log = createWriteStream(join(output, name + '.log'));
  const evidenceDir = join(output, name);
  mkdirSync(evidenceDir, { recursive: true });
  const env = { ...process.env };
  if (name === 'unit') delete env.ACCOUNT_REPORT_DIR;
  else env.ACCOUNT_REPORT_DIR = evidenceDir;
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
      'first-authority',
      testArgs('first-authority', ['test/account-first-authority/formats.test.mjs']),
    ],
    ['registry', testArgs('registry', ['test/account-first-authority/registry.test.mjs'])],
    ['prep-probes', testArgs('prep-probes', ['test/account-crypto-prep/contracts.test.mjs'])],
    [
      'recovery-contract',
      testArgs(
        'recovery-contract',
        ['formats', 'exports', 'controls'].map(
          (n) => 'test/account-recovery-contract/' + n + '.test.mjs',
        ),
      ),
    ],
    [
      'formats',
      testArgs('formats', [
        'test/account-transport-contract/formats.test.mjs',
        'test/account-transport-contract/controls.test.mjs',
      ]),
    ],
    [
      'service-delivery',
      testArgs(
        'service-delivery',
        ['core', 'generated', 'restart', 'controls', 'native'].map(
          (n) => 'test/account-service-delivery/' + n + '.test.mjs',
        ),
      ),
    ],
    [
      'transport',
      testArgs(
        'transport',
        ['service', 'generated', 'controls', 'native', 'native-controls'].map(
          (n) => 'test/account-transport/' + n + '.test.mjs',
        ),
      ),
    ],
    [
      'service-inbound',
      testArgs(
        'service-inbound',
        ['core', 'generated', 'restart', 'controls', 'native'].map(
          (n) => 'test/account-service-inbound/' + n + '.test.mjs',
        ),
      ),
    ],
    [
      'custody-contract',
      testArgs(
        'custody-contract',
        ['formats', 'exports', 'controls'].map(
          (n) => 'test/account-service-custody/' + n + '.test.mjs',
        ),
      ),
    ],
    [
      'authority-regressions',
      testArgs(
        'authority-regressions',
        ['core', 'controls', 'properties', 'restart', 'native'].map(
          (n) => 'test/account-authority/' + n + '.test.mjs',
        ),
      ),
    ],
    ['typecheck', ['node_modules/typescript/bin/tsc', '-b', '--noEmit']],
    ['unit', ['node_modules/vitest/vitest.mjs', 'run', '--maxWorkers=2']],
    ...vectorCommands.map((args, i) => ['vectors-' + String(i + 1).padStart(2, '0'), args]),
    [
      'lint',
      [
        'node_modules/oxlint/bin/oxlint',
        'scripts/account-first-authority',
        'scripts/account-transport-contract',
        'scripts/account-service-custody',
        'test/account-service-custody',
        'account-service/authority.ts',
        'account-service/acceptance.ts',
        'account-service/keyEncoding.ts',
        'test/account-transport-contract',
        'test/account-first-authority',
        'test/accountTransportContract.test.ts',
        'test/account-service-inbound/controls.test.mjs',
        'scripts/check-authority-map.mjs',
      ],
    ],
    [
      'format',
      [
        'node_modules/oxfmt/bin/oxfmt',
        '--check',
        'scripts/account-first-authority',
        'scripts/account-transport-contract',
        'scripts/account-service-custody',
        'test/account-service-custody',
        'account-service/authority.ts',
        'account-service/acceptance.ts',
        'account-service/keyEncoding.ts',
        'test/account-transport-contract',
        'test/account-first-authority',
        'test/accountTransportContract.test.ts',
        'test/account-service-inbound/controls.test.mjs',
        'scripts/check-authority-map.mjs',
        'docs/account-crypto/constructions.json',
        'package.json',
      ],
    ],
  ];
  for (const [name, args] of stages)
    if (
      !(await run(
        name,
        args,
        ['service-delivery', 'transport', 'service-inbound', 'authority-regressions'].includes(name)
          ? 180000
          : name === 'unit'
            ? 120000
            : 60000,
      ))
    )
      throw Error(name + ' failed');
  const saved = JSON.parse(readFileSync(join(output, 'sources.json')));
  for (const entry of saved)
    if (createHash('sha256').update(readFileSync(entry.path)).digest('hex') !== entry.sha256)
      throw Error('Source changed during campaign: ' + entry.path);
  summary.sourcePinsVerified = saved.length;
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
