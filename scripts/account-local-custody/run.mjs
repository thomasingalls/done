import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { join, resolve } from 'node:path';
const output = resolve(
  'test-results/account-local-custody',
  new Date().toISOString().replaceAll(':', '-'),
);
mkdirSync(output, { recursive: true });
console.log(`Factor/custody byte bridge evidence: ${output}`);
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
    'docs/account-promotion.md',
    'docs/account-source-capture.md',
    'docs/account-spool.md',
    'docs/content-store.md',
    'docs/custody.md',
    'docs/selections/row-13-device-lock.md',
    'docs/journal-store.md',
    'docs/selections/row-2-journal-aead.md',
    'docs/selections/row-3-record-format.md',
    'wasm/journal-seal/seal.generated.ts',
    'wasm/journal-seal/src/lib.rs',
    'wasm/journal-seal/Cargo.toml',
    'wasm/journal-seal/Cargo.lock',
    'docs/account-delivery.md',
    'docs/account-receive.md',
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
    'D6 factor/envelope and v2 credential/metadata bytes, native custody and guarded failure paths. Includes strict state-parser repair. No real provisioning, personal build, PRF, rotation, power-loss or whole-profile security qualification',
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
  const stageStarted = performance.now();
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
  if (name === 'unit')
    writeFileSync(
      join(output, 'unit-timing.json'),
      JSON.stringify(
        { elapsedMs: performance.now() - stageStarted, deadlineMs: timeout, code, timedOut },
        null,
        2,
      ) + '\n',
    );
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
    ['registry', testArgs('registry', ['test/account-first-authority/registry.test.mjs'])],
    [
      'first-authority',
      testArgs('first-authority', ['test/account-first-authority/formats.test.mjs']),
    ],
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
      'transport-contract',
      testArgs(
        'transport-contract',
        ['formats', 'controls'].map((n) => 'test/account-transport-contract/' + n + '.test.mjs'),
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
      'promotion-contract',
      testArgs('promotion-contract', ['test/account-promotion-contract/formats.test.mjs']),
    ],
    [
      'ledger-contract',
      testArgs(
        'ledger-contract',
        ['formats', 'controls'].map((n) => 'test/account-ledger-contract/' + n + '.test.mjs'),
      ),
    ],
    [
      'local-custody-contract',
      testArgs('local-custody-contract', ['test/account-local-custody/formats.test.mjs']),
    ],
    [
      'local-custody-native',
      testArgs('local-custody-native', ['test/account-local-custody/native.test.mjs']),
    ],
    [
      'counter-contract',
      testArgs('counter-contract', ['test/account-counter-contract/formats.test.mjs']),
    ],
    [
      'store-contract',
      testArgs('store-contract', ['test/account-store-contract/formats.test.mjs']),
    ],
    [
      'custody-native',
      ['scripts/custody/run.mjs', '--output', join(output, 'custody-native', 'native')],
    ],
    ['typecheck', ['node_modules/typescript/bin/tsc', '-b', '--noEmit']],
    ['unit', ['node_modules/vitest/vitest.mjs', 'run', '--maxWorkers=2']],
    ...vectorCommands.map((args, i) => ['vectors-' + String(i + 1).padStart(2, '0'), args]),
    [
      'lint',
      [
        'node_modules/oxlint/bin/oxlint',
        'scripts/account-local-custody',
        'test/account-local-custody',
        'src/crdt/custodyRecord.ts',
        'scripts/account-first-authority/registry.mjs',
        'test/account-first-authority/registry.test.mjs',
        'scripts/check-authority-map.mjs',
      ],
    ],
    [
      'format',
      [
        'node_modules/oxfmt/bin/oxfmt',
        '--check',
        'scripts/account-local-custody',
        'test/account-local-custody',
        'src/crdt/custodyRecord.ts',
        'scripts/account-first-authority/registry.mjs',
        'test/account-first-authority/registry.test.mjs',
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
        name.endsWith('-regressions') || name.endsWith('-native')
          ? 300000
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
