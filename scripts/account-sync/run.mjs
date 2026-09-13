import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { join, resolve } from 'node:path';

const output = resolve('test-results/account-sync', new Date().toISOString().replaceAll(':', '-'));
mkdirSync(output, { recursive: true });
console.log(`Account composition evidence: ${output}`);
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
const files = [
  ...new Set([
    'package.json',
    'pnpm-lock.yaml',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'vite.config.ts',
    'docs/account-source-capture.md',
    'docs/account-outbound-composition.md',
    'docs/account-inbound.md',
    'docs/account-inbound-verification.md',
    'docs/account-delivery.md',
    'docs/account-admission.md',
    'docs/account-decisions.md',
    'docs/account-spool.md',
    'docs/selections/row-5-finalization.md',
    'docs/selections/row-6-antireplay-retention.md',
    'docs/account-outbound.md',
    'docs/TRD.md',
    'docs/review/remediation/S0-4/A-schemas.md',
    'docs/review/remediation/S0-2/authority-map.md',
    'docs/selections/row-4-envelope-format.md',
    'scripts/account-sync/run.mjs',
    'scripts/generate-private-envelope-vectors.mjs',
    'scripts/generate-envelope-vectors.mjs',
    'scripts/lib/aad-coverage.mjs',
    ...['src', 'account-protocol', 'account-service', 'test', 'vite', 'wasm/journal-seal']
      .flatMap(walk)
      .filter((f) => /\.(ts|tsx|mjs|json|wasm)$/.test(f)),
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
  stages: [],
  scope:
    'Private v9 single-owner outbound/receive composition: original source grants, exact retry, full union census, self-stream byte binding, fair two-lane scheduling, native faults, generated histories and effective controls. No new enrollment, default app activation or personal Account deployment.',
};
const save = () =>
  writeFileSync(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
save();
async function run(name, args, timeoutMs) {
  console.log(`Starting ${name}`);
  const log = createWriteStream(join(output, name + '.log'));
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ACCOUNT_REPORT_DIR: output },
  });
  let timedOut = false,
    forced,
    launchError;
  const kill = (signal) => {
    try {
      process.kill(-child.pid, signal);
    } catch {}
  };
  const deadline = setTimeout(() => {
    timedOut = true;
    kill('SIGTERM');
    forced = setTimeout(() => kill('SIGKILL'), 5000);
  }, timeoutMs);
  const heartbeat = setInterval(() => console.log(`${name} still running; see ${name}.log`), 15000);
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (b) => {
      process.stdout.write(b);
      log.write(b);
    });
  const code = await new Promise((resolve) => {
    child.once('error', (e) => {
      launchError = String(e);
      resolve(1);
    });
    child.once('close', (code) => resolve(code ?? 1));
  });
  clearTimeout(deadline);
  clearTimeout(forced);
  clearInterval(heartbeat);
  await new Promise((resolve) => log.end(resolve));
  const result = { name, code, timedOut, ...(launchError ? { launchError } : {}) };
  summary.stages.push(result);
  save();
  return code === 0 && !timedOut;
}
try {
  const stages = [
    ['types', ['node_modules/typescript/bin/tsc', '-b'], 60000],
    [
      'units',
      [
        'node_modules/vitest/vitest.mjs',
        'run',
        'test/accountSyncDriver.test.ts',
        'test/accountReceiveDriver.test.ts',
        'test/ownedReceiveQueue.test.ts',
        '--maxWorkers=2',
        '--reporter=verbose',
      ],
      60000,
    ],
    ...[
      // R-01 adds real historical 600 KiB spool/restart cases; retain a finite measured stage budget.
      ['native', 600000],
      ['controls', 90000],
      ['native-controls', 150000],
      ['generated', 450000],
    ].map(([name, deadline]) => [
      name,
      [
        '--test',
        '--test-concurrency=1',
        '--test-reporter=spec',
        '--test-reporter-destination=stdout',
        '--test-reporter=junit',
        `--test-reporter-destination=${join(output, name + '.xml')}`,
        `test/account-sync/${name}.test.mjs`,
      ],
      deadline,
    ]),
  ];
  for (const [name, args, timeout] of stages)
    if (!(await run(name, args, timeout))) throw Error(`${name} failed`);
  summary.status = 'passed';
} catch (e) {
  summary.status = 'failed';
  summary.error = String(e);
  process.exitCode = 1;
} finally {
  summary.completedAt = new Date().toISOString();
  save();
  console.log(`${summary.status}: ${output}`);
}
