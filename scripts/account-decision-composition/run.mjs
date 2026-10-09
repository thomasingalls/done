import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { join, resolve } from 'node:path';
const output = resolve(
  'test-results/account-decision-composition',
  new Date().toISOString().replaceAll(':', '-'),
);
mkdirSync(output, { recursive: true });
console.log(`Account decision composition evidence: ${output}`);
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
    'docs/account-reservation-durability.md',
    'docs/account-isolation.md',
    'docs/account-decision-composition.md',
    'docs/account-outbound-composition.md',
    'docs/content-store.md',
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
    'F-21.7 actual service-issued refusal/conflict through native delivery/sender/sync owners; exact proof/source retention, generated arrival/retry histories, service and renderer death. Test/conformance only; no real Account or personal app changes.',
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
  if ((args.includes('--test') || name === 'unit') && code === 0) {
    const xml = readFileSync(join(output, name + '.xml'), 'utf8');
    const count = [...xml.matchAll(/<testcase\b/g)].length;
    summary.stages.at(-1).executedTests = count;
    if (!count || /<(?:skipped|failure|error)\b/.test(xml)) {
      summary.stages.at(-1).error = 'Missing executed tests or skipped/failed test';
      error = 'Test execution incomplete';
    }
  }
  save();
  return code === 0 && !timedOut && !error;
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
  const suite = (dir, names) => names.map((n) => 'test/' + dir + '/' + n + '.test.mjs');
  const suites = [
    [
      'registry',
      [
        'test/account-first-authority/registry.test.mjs',
        'test/account-crypto-prep/contracts.test.mjs',
      ],
    ],
    ...['native', 'restart', 'controls', 'generated', 'order'].map((name) => [
      'composition-' + name,
      suite('account-decision-composition', [name]),
    ]),
    [
      'service-delivery',
      suite('account-service-delivery', ['core', 'generated', 'controls', 'restart', 'native']),
    ],
    ['decisions', suite('account-decisions', ['native'])],
    ['delivery', suite('account-delivery', ['native'])],
    ['driver', suite('account-driver', ['native'])],
    ['sync', suite('account-sync', ['native'])],
  ];
  const changed = ['test/account-decision-composition', 'scripts/account-decision-composition'];
  const stages = [
    ['inventory', ['scripts/account-crypto-prep/run.mjs']],
    ['authority', ['scripts/check-authority-map.mjs']],
    ...suites.map(([name, paths]) => [name, testArgs(name, paths)]),
    ['typecheck', ['node_modules/typescript/bin/tsc', '-b', '--noEmit']],
    [
      'unit',
      [
        'node_modules/vitest/vitest.mjs',
        'run',
        'test/positionDecision.test.ts',
        'test/accountDelivery.test.ts',
        'test/accountDriver.test.ts',
        'test/accountSyncDriver.test.ts',
        'test/accountReceiveDriver.test.ts',
        '--maxWorkers=2',
        '--reporter=verbose',
        '--reporter=junit',
        `--outputFile.junit=${join(output, 'unit.xml')}`,
      ],
    ],
    ...vectorCommands.map((args, i) => ['vectors-' + String(i + 1).padStart(2, '0'), args]),
    ['lint', ['node_modules/oxlint/bin/oxlint', ...changed]],
    [
      'format',
      [
        'node_modules/oxfmt/bin/oxfmt',
        '--check',
        ...changed,
        'docs/account-crypto/constructions.json',
        'package.json',
      ],
    ],
  ];
  for (const [name, args] of stages)
    if (!(await run(name, args, name === 'delivery' ? 480000 : 300000)))
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
