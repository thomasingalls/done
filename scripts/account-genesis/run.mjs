import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { resolve, join } from 'node:path';

const output = resolve(
  'test-results/account-genesis',
  new Date().toISOString().replaceAll(':', '-'),
);
mkdirSync(output, { recursive: true });
console.log(`Account genesis evidence: ${output}`);
const files = [
  'package.json',
  'pnpm-lock.yaml',
  'tsconfig.node.json',
  'tsconfig.app.json',
  ...readdirSync('src/crdt')
    .filter((f) => f.endsWith('.ts'))
    .map((f) => 'src/crdt/' + f),
  ...readdirSync('src/lib')
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => 'src/lib/' + f),
  'src/account/recovery.ts',
  'src/account/generationWrap.ts',
  'test/vectors/package.json',
  'test/account-promotion/fixtures.mjs',
  'test/account-promotion/browser.ts',
  'src/account/recoveryOwner.ts',
  'test/account-authority/browser.ts',
  'test/account-core/fixtures.mjs',
  'test/account-core/worker.mjs',
  'test/account-recovery/fixtures.mjs',
  'wasm/journal-seal/seal.generated.ts',
  'docs/account-promotion.md',
  'scripts/account-genesis/run.mjs',
  ...['account-service', 'account-protocol', 'test/account-genesis'].flatMap((dir) =>
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
    ...['crypto', 'native'].map((name) => `test/account-genesis/${name}.test.mjs`),
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
}, 180000);
const heartbeat = setInterval(
  () => console.log('Account genesis campaign is still running; results stream to run.log.'),
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
        'Private journal-inclusive genesis candidate and exact wraps; independent OpenSSL oracle, generated delivery/interruption histories, semantic bad-acceptance controls and native renderer/IDB boundaries. No admission or personal operations.',
    },
    null,
    2,
  ) + '\n',
);
console.log(`Account genesis campaign ${code === 0 && !timedOut ? 'passed' : 'failed'}: ${output}`);
process.exitCode = timedOut ? 1 : code;
