import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  rmSync,
  symlinkSync,
  linkSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import fc from 'fast-check';
import {
  inspectFileOutputs,
  validateFileOutputs,
} from '../../scripts/release-validation/file-outputs.mjs';
import { createStageRunner, validateStage } from '../../scripts/release-validation/stage.mjs';
import { boundedStage } from '../../scripts/release-validation/manifest.mjs';
import { filePins, digest } from '../../scripts/release-validation/identity.mjs';

const policy = (extra = {}) => ({
  kind: 'account-reports-v1',
  maxEntries: 32,
  maxBytes: 4096,
  maxDepth: 4,
  required: ['report.json'],
  ...extra,
});
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const directory = (t) => {
  const path = mkdtempSync(join(tmpdir(), 'done-report-files-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
};
const program = (
  extra = '',
) => `import {writeFileSync,mkdirSync} from 'node:fs';import {join} from 'node:path';
  const dir=process.env.ACCOUNT_REPORT_DIR;writeFileSync(join(dir,'report.json'),'partial report');${extra}`;
function fixture(t, source) {
  const base = directory(t),
    root = join(base, 'checkout'),
    output = join(base, 'receipts');
  mkdirSync(join(root, 'scripts/release-validation'), { recursive: true });
  const paths = ['subject.mjs'];
  for (const name of ['process-guard.mjs', 'nested-launcher.mjs']) {
    const path = 'scripts/release-validation/' + name;
    copyFileSync(path, join(root, path));
    paths.push(path);
  }
  writeFileSync(join(root, 'subject.mjs'), source);
  const run = createStageRunner({
    root,
    output,
    fingerprint: () => ({
      revision: 'report-control',
      sourceDigest: digest(filePins(root, paths)),
      dependencyDigest: 'fixed',
      runtime: { node: process.version },
    }),
  });
  const stage = boundedStage(
    'report',
    ['node', 'subject.mjs'],
    { kind: 'exit', exitCodes: [0] },
    { deadlineMs: 5000, graceMs: 500, fileOutputs: policy() },
  );
  return {
    root,
    output,
    stage,
    run: async (s = stage, options) => {
      const receipt = await run(s, options);
      if (process.env.ACCOUNT_REPORT_DIR) {
        const dest = join(process.env.ACCOUNT_REPORT_DIR, basename(base), receipt.key);
        mkdirSync(dest, { recursive: true });
        for (const path of ['receipt.json', ...receipt.artifacts.map((a) => a.path)]) {
          mkdirSync(dirname(join(dest, path)), { recursive: true });
          copyFileSync(join(output, receipt.key, path), join(dest, path));
        }
      }
      return receipt;
    },
  };
}

test('report policy refuses unsafe paths, unbounded trees and unmanaged environment overrides', () => {
  validateFileOutputs(policy());
  for (const extra of [
    { maxBytes: 0 },
    { maxBytes: 4194305 },
    { maxEntries: 257 },
    { maxDepth: 9 },
    { required: ['../outside'] },
    { required: ['/absolute'] },
    { required: ['a/a/a/a/a'] },
    { required: ['same', 'same'] },
    { kind: 'unknown' },
    { unexpected: true },
  ])
    assert.throws(() => validateFileOutputs(policy(extra)));
  const stage = boundedStage('x', ['node', 'x.mjs'], { kind: 'exit', exitCodes: [0] });
  assert.throws(
    () => validateStage({ ...stage, env: { ACCOUNT_REPORT_DIR: '/unowned' } }),
    /Owned environment override/,
  );
});

test('80 generated report trees retain exact binary bytes and reject missing or changed evidence', (t) => {
  const base = directory(t);
  let iteration = 0;
  fc.assert(
    fc.property(
      fc.array(fc.uint8Array({ maxLength: 80 }), { minLength: 1, maxLength: 8 }),
      (values) => {
        const dir = join(base, String(iteration++));
        mkdirSync(join(dir, 'nested'), { recursive: true });
        const expected = [{ path: 'nested', type: 'directory' }];
        values.forEach((value, i) => {
          const path = 'nested/' + i + '.bin';
          writeFileSync(join(dir, path), value);
          expected.push({ path, type: 'file', bytes: value.length, sha256: sha(value) });
        });
        const rules = policy({ required: ['nested/0.bin'] });
        const observed = inspectFileOutputs(dir, rules);
        assert.equal(observed.complete, true, observed.error);
        assert.deepEqual(observed.entries, expected);
        assert.equal(
          observed.bytes,
          values.reduce((n, value) => n + value.length, 0),
        );
        writeFileSync(join(dir, 'nested/0.bin'), Buffer.concat([values[0], Buffer.from([255])]));
        assert.notDeepEqual(inspectFileOutputs(dir, rules), observed);
        rmSync(join(dir, 'nested/0.bin'));
        assert.match(inspectFileOutputs(dir, rules).error, /Missing required report/);
        rmSync(dir, { recursive: true });
      },
    ),
    { seed: 150932, numRuns: 80 },
  );
});

test('report traversal refuses symlinks, hard links, excessive depth, entries and cumulative bytes', (t) => {
  const base = directory(t),
    outside = join(base, 'outside');
  writeFileSync(outside, 'external sentinel');
  for (const kind of ['symlink', 'hardlink', 'root-link', 'depth', 'entries', 'bytes']) {
    const dir = join(base, kind);
    mkdirSync(dir);
    let rules = policy({ required: [] });
    if (kind === 'symlink') symlinkSync(outside, join(dir, 'link'));
    if (kind === 'hardlink') linkSync(outside, join(dir, 'link'));
    if (kind === 'root-link') {
      rmSync(dir, { recursive: true });
      symlinkSync(base, dir);
    }
    if (kind === 'depth') mkdirSync(join(dir, 'a/b/c/d/e'), { recursive: true });
    if (kind === 'entries') {
      for (let i = 0; i < 3; i++) mkdirSync(join(dir, String(i)));
      rules = policy({ required: [], maxEntries: 2 });
    }
    if (kind === 'bytes') {
      writeFileSync(join(dir, 'a'), '123');
      writeFileSync(join(dir, 'b'), '456');
      rules = policy({ required: [], maxBytes: 5 });
    }
    const observed = inspectFileOutputs(dir, rules);
    assert.equal(observed.complete, false, kind);
    assert(observed.error, kind);
    assert(!observed.entries.some((entry) => entry.sha256 === sha('external sentinel')), kind);
    assert.equal(readFileSync(outside, 'utf8'), 'external sentinel');
  }
});

test('owned reports survive checkout removal and exact receipt reuse checks bytes and tree membership', async (t) => {
  const f = fixture(
    t,
    program(
      "mkdirSync(join(dir,'nested'));writeFileSync(join(dir,'nested/bytes.bin'),Buffer.from([0,255,1]));",
    ),
  );
  const receipt = await f.run();
  assert.equal(receipt.status, 'passed', receipt.result.reason);
  assert.equal(receipt.result.fileOutputs.complete, true);
  assert.equal(receipt.result.groupDrained, true);
  assert.equal((await f.run({ ...f.stage, id: 'second' })).reused, true);
  const changedBound = await f.run({ ...f.stage, fileOutputs: policy({ maxBytes: 4097 }) });
  assert.equal(changedBound.status, 'passed', changedBound.result.reason);
  assert.notEqual(changedBound.key, receipt.key, 'Report bounds participate in reuse identity');
  const files = join(f.output, receipt.key, 'files');
  writeFileSync(join(files, 'extra'), 'new');
  await assert.rejects(() => f.run(), /Changed reusable report tree/);
  await assert.rejects(
    () =>
      f.run({ ...f.stage, id: 'dependent', dependsOn: ['report'] }, { dependencies: [receipt] }),
    /Changed prerequisite report tree/,
  );
  rmSync(join(files, 'extra'));
  writeFileSync(join(files, 'report.json'), 'changed');
  await assert.rejects(() => f.run(), /Changed reusable report tree/);
  rmSync(f.root, { recursive: true });
  assert.deepEqual(readFileSync(join(files, 'nested/bytes.bin')), Buffer.from([0, 255, 1]));
});

test('zero exit without required reports refuses while failed exit retains partial files', async (t) => {
  const missing = fixture(t, '');
  const refusal = await missing.run();
  assert.equal(refusal.status, 'failed');
  assert.match(refusal.result.reason, /Missing required report/);
  const f = fixture(t, program('process.exitCode=1;'));
  const failed = await f.run();
  assert.equal(failed.status, 'failed');
  assert.match(failed.result.reason, /Nonzero/);
  assert.equal(failed.result.groupDrained, true);
  assert.equal(
    readFileSync(join(f.output, failed.key, 'files/report.json'), 'utf8'),
    'partial report',
  );
  assert.equal(
    failed.result.fileOutputs.complete,
    true,
    'Complete file inventory does not mean a passing stage or valid JSON',
  );
});

test('cancellation and timeout preserve partial reports after producer drain', async (t) => {
  for (const cancel of [false, true]) {
    const f = fixture(t, program('setInterval(()=>{},1000);'));
    const controller = new AbortController();
    // Signal only after the known synthetic report exists; avoid a startup-speed assumption.
    const running = f.run(
      { ...f.stage, deadlineMs: cancel ? 5000 : 1500 },
      { signal: controller.signal },
    );
    let timer;
    if (cancel)
      timer = setInterval(() => {
        // The runner owns one stage directory; observing its report does not author its result.
        for (const path of readdirSync(f.output))
          if (existsSync(join(f.output, path, 'files/report.json'))) controller.abort();
      }, 10);
    let receipt;
    try {
      receipt = await running;
    } finally {
      clearInterval(timer);
    }
    assert.equal(receipt.status, 'failed');
    assert.equal(receipt.result.reason, cancel ? 'cancelled' : 'timeout');
    assert.equal(receipt.result.groupDrained, true);
    assert.equal(
      readFileSync(join(f.output, receipt.key, 'files/report.json'), 'utf8'),
      'partial report',
    );
  }
});

test('oversized reports trigger bounded failure and never become reusable receipts', async (t) => {
  const f = fixture(
    t,
    program("writeFileSync(join(dir,'large.bin'),Buffer.alloc(8192));setInterval(()=>{},1000);"),
  );
  const receipt = await f.run();
  assert.equal(receipt.status, 'failed');
  assert.match(receipt.result.reason, /Report byte limit/);
  assert.equal(receipt.result.groupDrained, true);
  assert.equal(receipt.result.fileOutputs.complete, false);
  assert(
    !receipt.artifacts.some((a) => a.path.endsWith('large.bin')),
    'Do not read oversized files into a passing artifact manifest',
  );
  assert.equal(readFileSync(join(f.output, receipt.key, 'files/large.bin')).length, 8192);
  await assert.rejects(() => f.run(), /stale or partially written/);
});
