import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { resolve, join } from 'node:path';

import assert from 'node:assert/strict';

const owned = Boolean(process.env.RELEASE_PROCESS_GUARD);
if (owned) {
  assert(process.env.ACCOUNT_REPORT_DIR, 'Owned recovery campaign requires retained output');
  assert(
    process.env.RELEASE_CASE_REPORT && process.env.RELEASE_RUN_NONCE,
    'Owned recovery campaign requires its reporter',
  );
  assert(
    process.env.RELEASE_BROWSER_EXECUTABLE && process.env.RELEASE_CUSTODY_OUTPUT,
    'Owned recovery campaign requires persistent browser ownership',
  );
}
const output = owned
  ? resolve(process.env.ACCOUNT_REPORT_DIR)
  : resolve('test-results/account-recovery', new Date().toISOString().replaceAll(':', '-'));
mkdirSync(output, { recursive: true });
console.log(`Account recovery evidence: ${output}`);
const files = [
  'package.json',
  'pnpm-lock.yaml',
  'tsconfig.node.json',
  'tsconfig.app.json',
  'src/account/recovery.ts',
  'src/account/recoveryOwner.ts',
  'test/account-core/fixtures.mjs',
  'test/account-core/worker.mjs',
  'scripts/account-recovery/run.mjs',
  'docs/account-recovery.md',
  ...['account-service', 'account-protocol', 'test/account-recovery'].flatMap((dir) =>
    readdirSync(dir)
      .filter((file) => /\.(ts|mjs)$/.test(file))
      .map((file) => `${dir}/${file}`),
  ),
];
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
const summaryPath = join(output, 'summary.json');
const startedAt = new Date().toISOString();
writeFileSync(summaryPath, JSON.stringify({ status: 'running', startedAt }, null, 2) + '\n');
const child = spawn(
  process.execPath,
  [
    '--test',
    '--test-reporter=spec',
    '--test-reporter-destination=stdout',
    '--test-reporter=junit',
    `--test-reporter-destination=${join(output, 'results.xml')}`,
    ...(owned
      ? [
          '--test-reporter=./scripts/release-validation/node-reporter.mjs',
          '--test-reporter-destination=stdout',
        ]
      : []),
    ...['core', 'crypto', 'properties', 'restart', 'controls', 'native'].map(
      (name) => `test/account-recovery/${name}.test.mjs`,
    ),
  ],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ACCOUNT_REPORT_DIR: output },
  },
);
const log = createWriteStream(join(output, 'run.log'));
child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  log.write(chunk);
});
child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
  log.write(chunk);
});
let timedOut = false,
  forced;
const deadline = setTimeout(() => {
  timedOut = true;
  child.kill('SIGTERM');
  forced = setTimeout(() => child.kill('SIGKILL'), 5000);
}, 120000);
const heartbeat = setInterval(
  () => console.log('Account recovery campaign is still running; results stream to run.log.'),
  15000,
);
let launchError;
const code = await new Promise((resolve) => {
  child.once('error', (error) => {
    launchError = String(error);
    resolve(1);
  });
  child.once('close', (value) => resolve(value ?? 1));
});
clearTimeout(deadline);
clearTimeout(forced);
clearInterval(heartbeat);
await new Promise((resolve) => log.end(resolve));
writeFileSync(
  summaryPath,
  JSON.stringify(
    {
      status: code === 0 && !timedOut ? 'passed' : 'failed',
      startedAt,
      completedAt: new Date().toISOString(),
      code,
      timedOut,
      ...(launchError ? { launchError } : {}),
      scope:
        'Private recovery preparation; independent crypto, generated ledgers, deliberate controls, SIGKILL service restarts, IndexedDB aborts, renderer death and disposable Chromium WebAuthn. Accounts stay pending; no personal operations.',
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Account recovery campaign ${code === 0 && !timedOut ? 'passed' : 'failed'}: ${output}`,
);
process.exitCode = timedOut ? 1 : code;
