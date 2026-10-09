import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { resolve, join } from 'node:path';

import assert from 'node:assert/strict';

const owned = Boolean(process.env.RELEASE_PROCESS_GUARD);
if (owned) {
  assert(process.env.ACCOUNT_REPORT_DIR, 'Owned authority campaign requires retained output');
  assert(
    process.env.RELEASE_CASE_REPORT && process.env.RELEASE_RUN_NONCE,
    'Owned authority campaign requires its reporter',
  );
  assert(process.env.RELEASE_BROWSER_ENDPOINT, 'Owned authority campaign requires its browser');
}
const output = owned
  ? resolve(process.env.ACCOUNT_REPORT_DIR)
  : resolve('test-results/account-authority', new Date().toISOString().replaceAll(':', '-'));
mkdirSync(output, { recursive: true });
console.log(`Account authority evidence: ${output}`);
const files = [
  'package.json',
  'pnpm-lock.yaml',
  'tsconfig.node.json',
  'tsconfig.app.json',
  ...readdirSync('src/crdt')
    .filter((f) => f.endsWith('.ts'))
    .map((f) => 'src/crdt/' + f),
  'src/account/recovery.ts',
  'wasm/journal-seal/seal.generated.ts',
  'docs/account-authority.md',
  'scripts/account-authority/run.mjs',
  ...['account-service', 'account-protocol', 'test/account-authority'].flatMap((dir) =>
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
    ...['core', 'properties', 'restart', 'controls', 'native'].map(
      (name) => `test/account-authority/${name}.test.mjs`,
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
  () => console.log('Account authority campaign is still running; results stream to run.log.'),
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
        'Private encrypted service root and read-only Local promotion preflight; independent proofs, generated root/browser histories, controls and process deaths. No personal operations or activation.',
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Account authority campaign ${code === 0 && !timedOut ? 'passed' : 'failed'}: ${output}`,
);
process.exitCode = timedOut ? 1 : code;
