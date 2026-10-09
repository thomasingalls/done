import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { join, resolve } from 'node:path';
import { validationControlStages } from '../validation-controls/preflight.mjs';
import { LIMITS } from '../../test/account-residue/matcher.mjs';
const output = resolve(
  'test-results/account-residue',
  new Date().toISOString().replaceAll(':', '-'),
);
mkdirSync(output, { recursive: true });
const write = (name, value) =>
  writeFileSync(join(output, name + '.json'), JSON.stringify(value, null, 2) + '\n');
const hash = (b) => createHash('sha256').update(b).digest('hex');
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
const files = [
  ...new Set([
    ...['src', 'account-protocol', 'account-service', 'test', 'scripts'].flatMap(walk),
    ...walk('docs/account-crypto'),
    'docs/review/remediation/S0-2/authority-map.md',
    'package.json',
    'pnpm-lock.yaml',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'docs/PRD.md',
    'docs/TRD.md',
    'docs/account-residue-testing.md',
    'docs/account-residue-r1.md',
    'docs/account-residue-prep/surfaces.json',
  ]),
].sort();
const sources = files.map((path) => ({ path, sha256: hash(readFileSync(path)) }));
write('sources', sources);
write('scope', {
  claim:
    'R1 current private Local-to-Account logical carrier checkpoints; no physical residue or arbitrary key/opener/platform claim',
  limits: LIMITS,
  phases: ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'],
  requiredCollectors: [
    'indexedDB',
    'localStorage',
    'sessionStorage',
    'cacheStorage',
    'cookies',
    'opfs',
    'sql:core',
    'sql:authority',
    'diagnostics:page',
    'diagnostics:service',
  ],
  representation: [
    'utf8',
    'utf16le',
    'utf16be',
    'json strings/keys/byte-arrays',
    'hex',
    'base64/base64url padded/unpadded/prefixed',
    'typed-view/Blob/File bytes',
  ],
  knownCapabilities:
    'Only exact recovery preparation retryKey and finalization.retryKey fields are reported separately; other T matches fail',
  excluded: [
    'physical profile/SQL/WAL/deleted bytes',
    'HTTP disk cache',
    'packaged UI/SW/export and migration/clear flow qualification',
    'opaque CryptoKey contents',
    'arbitrary transformations/compression/record fragmentation',
    'other platforms',
    'personal installation',
  ],
  trialSeams: [
    'test-bundle switch holds automatic Local journal flush; explicit durability call releases it',
    'positive journal side-write copies actual update into localStorage in isolated leak bundle',
    'fixture authenticator signs actual service challenges; no real Account',
    'explicit receive retry after publication; polling cadence not measured',
  ],
  rawArtifacts:
    '*.raw.json retain synthetic acquired values and controller-held needles; separate disclosure domain, not automatic app/service output',
  baseline: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
});
const summary = {
  status: 'running',
  startedAt: new Date().toISOString(),
  stages: [],
  sourcePins: sources.length,
};
const save = () => write('summary', summary);
save();
console.log('Residue campaign: ' + output);
async function run(name, args, timeout = 60000) {
  const dir = join(output, name);
  mkdirSync(dir, { recursive: true });
  const log = createWriteStream(join(output, name + '.log'));
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ACCOUNT_REPORT_DIR: dir },
  });
  const started = Date.now();
  let timedOut = false,
    forced,
    error;
  const kill = (signal) => {
    try {
      process.kill(-child.pid, signal);
    } catch {
      /* process already exited */
    }
  };
  const timer = setTimeout(() => {
    timedOut = true;
    kill('SIGTERM');
    forced = setTimeout(() => kill('SIGKILL'), 5000);
  }, timeout);
  const heartbeat = setInterval(
    () =>
      console.log(
        name + ' running ' + Math.floor((Date.now() - started) / 1000) + 's; ' + name + '.log',
      ),
    15000,
  );
  console.log('Starting ' + name);
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (b) => {
      log.write(b);
      process.stdout.write(b);
    });
  const code = await new Promise((resolve) => {
    child.once('error', (e) => {
      error = e.message;
      resolve(1);
    });
    child.once('close', resolve);
  });
  clearTimeout(timer);
  clearTimeout(forced);
  clearInterval(heartbeat);
  await new Promise((r) => log.end(r));
  const text = readFileSync(join(output, name + '.log'), 'utf8');
  let tests;
  if (args.includes('--test') && code === 0 && !timedOut) {
    tests = Number(text.match(/(?:ℹ|#) tests (\d+)/)?.[1]);
    if (
      !tests ||
      !/(?:ℹ|#) fail 0(?:\r?\n|$)/.test(text) ||
      !/(?:ℹ|#) cancelled 0(?:\r?\n|$)/.test(text) ||
      !/(?:ℹ|#) skipped 0(?:\r?\n|$)/.test(text)
    )
      error = 'Missing or non-passing test census';
  }
  const stage = {
    name,
    args,
    code,
    ...(tests ? { tests } : {}),
    timedOut,
    elapsedMs: Date.now() - started,
    ...(error ? { error } : {}),
  };
  summary.stages.push(stage);
  save();
  if (code !== 0 || timedOut || error) throw Error('Stage failed: ' + name);
}
try {
  for (const [name, args, timeout] of validationControlStages(output))
    await run(name, args, timeout);
  await run('types', ['node_modules/typescript/bin/tsc', '-b', '--noEmit']);
  await run('instrument', ['--test', 'test/account-residue/matcher.test.mjs']);
  await run('calibration', ['--test', 'test/account-residue/calibration.test.mjs'], 150000);
  await run('lifecycle', ['--test', 'test/account-residue/lifecycle.test.mjs'], 240000);
  await run('generated', ['--test', 'test/account-residue/generated.test.mjs'], 330000);
  await run('lint', [
    'node_modules/oxlint/bin/oxlint',
    '--react-plugin',
    'test/account-residue',
    'scripts/account-residue',
  ]);
  await run('format', [
    'node_modules/oxfmt/bin/oxfmt',
    '--check',
    'test/account-residue',
    'scripts/account-residue',
    'package.json',
  ]);
  const expected = {
    calibration: ['calibration-matrix', 'collector-controls'],
    lifecycle: ['lifecycle', 'failure-branches'],
    generated: ['generated', 'generated-histories'],
  };
  for (const [dir, names] of Object.entries(expected))
    for (const name of names) JSON.parse(readFileSync(join(output, dir, name + '.json')));
  const matrix = JSON.parse(readFileSync(join(output, 'calibration', 'calibration-matrix.json'))),
    history = JSON.parse(readFileSync(join(output, 'generated', 'generated.json')));
  if (
    !matrix.cells.length ||
    matrix.cells.some((c) => c.clean !== 'absent' || c.plant !== 'detected') ||
    history.numRuns !== 24 ||
    history.failed ||
    history.interrupted
  )
    throw Error('Required calibration/history evidence missing');
  const requiredPoints = [
    'P0-empty',
    'P1-genesis',
    'P2-journal',
    'P3-flushed',
    'P3-locked',
    'P3-compacted',
    'P3-cold',
    'P4-generated',
    'P4-finalization-pending',
    'P4-confirmed',
    'P5-prepared',
    'P5-genesis',
    'P5-lost-reply',
    'P5-receipted',
    'P5-selected',
    'P5-openOwnedCapturedAccountWorkspace',
    'P5-openOwnedAccountSpoolWorkspace',
    'P5-openOwnedAccountDeliveryWorkspace',
    'P6-delivered',
    'P6-locked',
    'P6-cold',
    'P7-refused',
    'P7-journal-failure',
    'P7-cold',
    'write-control-baseline',
    'write-control-leak',
  ];
  for (const point of requiredPoints)
    for (const suffix of ['', '.raw', '.needles.raw']) {
      const r = JSON.parse(readFileSync(join(output, 'lifecycle', point + suffix + '.json')));
      if (!suffix && !r.verdict) throw Error('Checkpoint lacks verdict: ' + point);
    }
  const generated = JSON.parse(readFileSync(join(output, 'generated', 'generated-histories.json')));
  if (
    generated.length !== 24 ||
    generated.some(
      (h) =>
        h.status !== 'passed' ||
        h.points.length !== h.history.edits.length + 3 + (h.history.lostReply ? 1 : 0),
    )
  )
    throw Error('Generated point coverage incomplete');
  for (const h of generated)
    for (const point of h.points)
      for (const suffix of ['', '.raw', '.needles.raw'])
        JSON.parse(readFileSync(join(output, 'generated', h.id + '-' + point + suffix + '.json')));
  summary.directedCheckpoints = requiredPoints.length;
  for (const dir of ['lifecycle', 'generated']) {
    const reports = walk(join(output, dir)).filter((p) => !p.endsWith('.raw.json'));
    for (const p of reports) {
      const r = JSON.parse(readFileSync(p));
      if (
        r.verdict &&
        r.verdict !==
          (p.endsWith('write-control-leak.json')
            ? 'prohibited-match'
            : 'complete-no-prohibited-match')
      )
        throw Error('Unexpected checkpoint verdict ' + p);
    }
  }
  for (const s of sources)
    if (hash(readFileSync(s.path)) !== s.sha256)
      throw Error('Source changed during campaign: ' + s.path);
  summary.status = 'passed';
  summary.calibrationCells = matrix.cells.length;
  summary.generatedHistories = history.numRuns;
} catch (e) {
  summary.status = 'failed';
  summary.error = e.message;
  process.exitCode = 1;
} finally {
  summary.finishedAt = new Date().toISOString();
  save();
  console.log('Residue campaign ' + summary.status + ': ' + output);
}
