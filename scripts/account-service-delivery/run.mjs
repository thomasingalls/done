import { createCampaignReporting } from '../release-validation/campaign-reporting.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { join, resolve } from 'node:path';

const owned = Boolean(process.env.RELEASE_PROCESS_GUARD);
if (owned)
  assert(process.env.ACCOUNT_REPORT_DIR, 'Owned service-delivery campaign requires reports');
const output = owned
  ? resolve(process.env.ACCOUNT_REPORT_DIR)
  : resolve('test-results/account-service-delivery', new Date().toISOString().replaceAll(':', '-'));
mkdirSync(output, { recursive: true });
const reporting = createCampaignReporting(output);
console.log(`Account service delivery evidence: ${output}`);
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
    'docs/account-service-delivery.md',
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
    'scripts/account-service-delivery/run.mjs',
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
    'Private schema-4 durable service acceptance/refusal, certified membership, fixed-purpose acceptance custody, atomic signed ledger witness, process death/competition, independent generated histories and required service fixtures. The retired v8 HTTP browser bridge is excluded; v9 interoperability remains a separate required campaign. No shipped relay transport, client successor minting, general lineage advancement or personal operations.',
};
const save = () =>
  writeFileSync(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
save();
async function run(name, args, timeoutMs) {
  console.log(`Starting ${name}`);
  const log = createWriteStream(join(output, name + '.log'));
  const step = reporting?.begin(name, args, timeoutMs);
  const child = spawn(process.execPath, step?.args ?? args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ACCOUNT_REPORT_DIR: output, ...step?.env },
  });
  let timedOut = false,
    forced,
    launchError;
  const deadline = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
    forced = setTimeout(() => child.kill('SIGKILL'), 5000);
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
  reporting?.end(result);
  summary.stages.push(result);
  save();
  return code === 0 && !timedOut;
}
try {
  const stages = [
    [
      'service',
      [
        '--test',
        '--test-reporter=spec',
        '--test-reporter-destination=stdout',
        '--test-reporter=junit',
        `--test-reporter-destination=${join(output, 'results.xml')}`,
        ...['core', 'generated', 'restart', 'controls'].map(
          (name) => `test/account-service-delivery/${name}.test.mjs`,
        ),
      ],
      90000,
    ],
  ];
  for (const [name, args, timeout] of stages)
    if (!(await run(name, args, timeout))) throw Error(`${name} failed`);
  summary.status = 'passed';
} catch (e) {
  summary.status = 'failed';
  summary.error = String(e);
  process.exitCode = 1;
} finally {
  reporting?.finish();
  summary.completedAt = new Date().toISOString();
  save();
  console.log(`${summary.status}: ${output}`);
}
