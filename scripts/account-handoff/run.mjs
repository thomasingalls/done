import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { resolve, join } from 'node:path';

const output = resolve(
  'test-results/account-handoff',
  new Date().toISOString().replaceAll(':', '-'),
);
mkdirSync(output, { recursive: true });
console.log(`Account handoff evidence: ${output}`);
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
  'src/account/slotUnlock.ts',
  'src/account/es256Signature.ts',
  'test/slotUnlock.test.ts',
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
  'docs/account-handoff.md',
  'docs/account-admission.md',
  ...readdirSync('test/account-admission')
    .filter((f) => /\.(ts|mjs)$/.test(f))
    .map((f) => 'test/account-admission/' + f),
  'test/account-authority/fixtures.mjs',
  ...readdirSync('test/account-genesis')
    .filter((f) => /\.(ts|mjs)$/.test(f))
    .map((f) => 'test/account-genesis/' + f),
  'scripts/account-handoff/run.mjs',
  ...['account-service', 'account-protocol', 'test/account-handoff'].flatMap((dir) =>
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
    ...['core', 'es256', 'native'].map((name) => `test/account-handoff/${name}.test.mjs`),
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
  () => console.log('Account handoff campaign is still running; results stream to run.log.'),
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
        'Private Account index handoff and offline startup classification; real ES256 browser assertion, generated DER/service/native histories, independent source inventories, actual acceptance controls and renderer/IDB interruption. No Account editor, relay or personal operations.',
    },
    null,
    2,
  ) + '\n',
);
console.log(`Account handoff campaign ${code === 0 && !timedOut ? 'passed' : 'failed'}: ${output}`);
process.exitCode = timedOut ? 1 : code;
