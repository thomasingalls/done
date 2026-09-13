import test from 'node:test';
import assert from 'node:assert/strict';
import {
  copyFileSync,
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as fc from 'fast-check';
import {
  createStageRunner,
  reconcileCases,
  validateStage,
} from '../../scripts/release-validation/stage.mjs';
import { startOwnedChromium } from '../../scripts/release-validation/browser.mjs';
import { boundedStage } from '../../scripts/release-validation/manifest.mjs';
import { digest, filePins } from '../../scripts/release-validation/identity.mjs';

function fixture(t, script) {
  const base = mkdtempSync(join(tmpdir(), 'done-stage-')),
    root = join(base, 'checkout'),
    output = join(base, 'reports');
  mkdirSync(join(root, 'scripts/release-validation'), { recursive: true });
  for (const name of ['process-guard.mjs', 'node-reporter.mjs'])
    copyFileSync(
      'scripts/release-validation/' + name,
      join(root, 'scripts/release-validation', name),
    );
  const write = (name, text) => {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), text);
  };
  write('subject.mjs', script);
  write('helper.mjs', 'export const version = 1;');
  const fingerprint = () => ({
    revision: 'fixture',
    sourceDigest: digest(
      filePins(
        root,
        readdirSync(root)
          .filter((p) => p.endsWith('.mjs'))
          .sort(),
      ),
    ),
    dependencyDigest: 'fixture-dependency-v1',
    runtime: { node: process.version },
  });
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const run = createStageRunner({ root, output, fingerprint });
  const stage = boundedStage(
    'subject',
    ['node', 'subject.mjs'],
    { kind: 'exit', exitCodes: [0] },
    { deadlineMs: 1500, graceMs: 300, maxLogBytes: 4096 },
  );
  return { base, root, output, write, run, stage, fingerprint };
}
const reportScript = (cases, extra = '') => `import {writeFileSync} from 'node:fs'; ${extra}
writeFileSync(process.env.RELEASE_CASE_REPORT, JSON.stringify({schema:1, nonce: process.env.RELEASE_RUN_NONCE, cases:${JSON.stringify(cases)}, errors:[]}));`;

test('real passing stage reuses only complete identical results and preserves dependency ordering', async (t) => {
  const f = fixture(t, "console.log('one execution');");
  const first = await f.run(f.stage);
  assert.equal(first.status, 'passed');
  const reuse = await f.run({ ...f.stage, id: 'second-consumer' });
  assert.equal(reuse.reused, true);
  assert.equal(reuse.key, first.key);
  const dependent = { ...f.stage, id: 'dependent', dependsOn: ['second-consumer'] };
  assert.equal((await f.run(dependent, { dependencies: [reuse] })).status, 'passed');
  await assert.rejects(() => f.run(dependent), /Missing or reordered/);
  await assert.rejects(() => f.run(dependent, { dependencies: [{ ...reuse }] }), /Unverified/);
});

test('changed argv, environment, variants, case expectations, bounds and source bytes prevent reuse', async (t) => {
  const f = fixture(t, "console.log(process.env.MODE ?? 'current');");
  const first = await f.run(f.stage),
    keys = new Set([first.key]);
  for (const patch of [
    { argv: ['node', 'subject.mjs', 'before'] },
    { env: { MODE: 'before' } },
    { variant: '063cd72' },
    { deadlineMs: 1600 },
    { graceMs: 400 },
  ]) {
    const result = await f.run({ ...f.stage, ...patch });
    assert.equal(result.status, 'passed');
    assert(!keys.has(result.key));
    keys.add(result.key);
  }
  f.write('helper.mjs', 'export const version = 2;');
  const changed = await f.run(f.stage);
  assert.notEqual(changed.key, first.key);
  await assert.rejects(
    () => f.run({ ...f.stage, id: 'consumer', dependsOn: ['subject'] }, { dependencies: [first] }),
    /Stale prerequisite/,
  );
  writeFileSync(join(f.output, changed.key, 'output.log'), 'tampered');
  await assert.rejects(() => f.run(f.stage), /Changed reusable/);
});

test('zero, missing, duplicate, skipped and survived mutation results cannot become success', async (t) => {
  const expected = [
    { id: 'a', outcome: 'pass' },
    { id: 'b', outcome: 'pass' },
  ];
  for (const cases of [
    [],
    expected.slice(0, 1),
    [expected[0], expected[0]],
    [{ id: 'a', outcome: 'skipped' }, expected[1]],
  ]) {
    const f = fixture(t, reportScript(cases));
    const result = await f.run({ ...f.stage, expect: { kind: 'cases', cases: expected } });
    assert.equal(result.status, 'failed');
  }
  const f = fixture(t, reportScript([{ id: 'omit', outcome: 'pass' }]));
  const mutation = [{ id: 'omit', outcome: 'detected', assertion: 'coverage-refuses' }];
  assert.equal(
    (await f.run({ ...f.stage, expect: { kind: 'cases', cases: mutation } })).status,
    'failed',
  );
  f.write('subject.mjs', reportScript(mutation));
  assert.equal(
    (await f.run({ ...f.stage, expect: { kind: 'cases', cases: mutation } })).status,
    'passed',
  );
});

test('stale report nonce, exit-zero without a report and input changes during execution refuse', async (t) => {
  const expected = [{ id: 'a', outcome: 'pass' }];
  const f = fixture(t, reportScript(expected, "process.env.RELEASE_RUN_NONCE = 'yesterday';"));
  assert.match(
    (await f.run({ ...f.stage, expect: { kind: 'cases', cases: expected } })).result.reason,
    /Stale case report/,
  );
  f.write('subject.mjs', '');
  assert.equal(
    (await f.run({ ...f.stage, expect: { kind: 'cases', cases: expected } })).status,
    'failed',
  );
  f.write(
    'subject.mjs',
    "import {writeFileSync} from 'node:fs'; writeFileSync('new-helper.mjs', 'changed');",
  );
  assert.match((await f.run(f.stage)).result.reason, /Inputs changed/);
});

test('deadline and cancellation kill a TERM-resistant leader and its inherited child within the drain bound', async (t) => {
  for (const cancel of [false, true]) {
    const f = fixture(
      t,
      "import {spawn} from 'node:child_process'; import {writeFileSync} from 'node:fs'; process.on('SIGTERM', () => {}); const child = spawn(process.execPath, ['-e', `process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)`], {stdio:'ignore'}); writeFileSync(process.env.TMPDIR + '/child-pid', String(child.pid)); setInterval(() => {}, 1000);",
    );
    const controller = new AbortController();
    const timer = cancel ? setTimeout(() => controller.abort(), 150) : null;
    const start = Date.now();
    const receipt = await f.run({ ...f.stage, deadlineMs: 350 }, { signal: controller.signal });
    clearTimeout(timer);
    assert.equal(receipt.status, 'failed');
    assert.equal(receipt.result.reason, cancel ? 'cancelled' : 'timeout');
    assert.equal(receipt.result.groupDrained, true);
    assert(Date.now() - start < 2000);
    const pid = Number(readFileSync(join(f.output, receipt.key, 'tmp/child-pid'), 'utf8'));
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  }
});

test('a leader that exits zero leaving a child is drained and refused without waiting forever for pipe close', async (t) => {
  const f = fixture(
    t,
    "import {spawn} from 'node:child_process'; const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio: 'ignore'}); child.unref();",
  );
  const result = await f.run(f.stage);
  assert.equal(result.status, 'failed');
  assert.equal(result.result.reason, 'orphaned-child');
  assert.equal(result.result.groupDrained, true);
});

test('detached child attempts remain failures even when a test catches the ownership error', async (t) => {
  const f = fixture(
    t,
    "import {spawn} from 'node:child_process'; try { spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {detached:true, stdio:'ignore'}); } catch {};",
  );
  const result = await f.run(f.stage);
  assert.equal(result.status, 'failed');
  assert.match(result.result.reason, /ownership violation/);
});

test('output floods are bounded, and cancellation before launch never runs the command', async (t) => {
  const f = fixture(t, "setInterval(() => console.log('x'.repeat(10000)), 1);");
  const result = await f.run(f.stage);
  assert.equal(result.result.reason, 'log-limit');
  assert(readFileSync(join(f.output, result.key, 'output.log')).length <= 4096);
  const controller = new AbortController();
  controller.abort();
  const cancelled = await f.run(
    { ...f.stage, variant: 'cancelled' },
    { signal: controller.signal },
  );
  assert.equal(cancelled.result.code, null);
  assert.equal(cancelled.result.reason, 'cancelled');
});

test('owned Node reporter rejects a real skipped case instead of crediting exit zero', async (t) => {
  const f = fixture(t, '');
  f.write(
    'subject.test.mjs',
    "import test from 'node:test'; test('a', () => {}); test.skip('b', () => {});",
  );
  const stage = {
    ...f.stage,
    argv: [
      'node',
      '--test',
      '--test-reporter=./scripts/release-validation/node-reporter.mjs',
      'subject.test.mjs',
    ],
    expect: {
      kind: 'cases',
      cases: [
        { id: 'subject.test.mjs::a', outcome: 'pass' },
        { id: 'subject.test.mjs::b', outcome: 'pass' },
      ],
    },
  };
  assert.equal((await f.run(stage)).status, 'failed');
  f.write('subject.test.mjs', "import test from 'node:test'; test('a', () => {});");
  assert.equal((await f.run(stage)).status, 'failed');
  f.write(
    'subject.test.mjs',
    "import test from 'node:test'; test('a', () => {}); test('b', () => {});",
  );
  const passed = await f.run(stage);
  assert.equal(passed.status, 'passed', passed.result.reason);
});

test('160 generated actual-case omissions and mutations fail the exact independent census', () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 0, max: 30 }), { minLength: 2, maxLength: 15 }),
      (ids) => {
        const cases = ids.map((id) => ({ id: String(id), outcome: 'pass' }));
        const report = { schema: 1, nonce: 'fresh', cases, errors: [] };
        reconcileCases(cases, report, 'fresh');
        assert.throws(
          () => reconcileCases(cases, { ...report, cases: cases.slice(1) }, 'fresh'),
          /Incomplete/,
        );
        assert.throws(
          () =>
            reconcileCases(
              cases,
              { ...report, cases: [{ ...cases[0], outcome: 'skipped' }, ...cases.slice(1)] },
              'fresh',
            ),
          /Incomplete/,
        );
        assert.throws(() => reconcileCases(cases, report, 'new-run'), /Stale/);
      },
    ),
    { seed: 130903, numRuns: 160 },
  );
});

test('stage contracts refuse unbounded execution, filtered tests and generic nonzero mutation credit', () => {
  const stage = boundedStage('a', ['node', 'subject.mjs'], { kind: 'exit', exitCodes: [0] });
  for (const patch of [
    { deadlineMs: 0 },
    { graceMs: Infinity },
    { processPolicy: 'unknown' },
    { env: { NODE_OPTIONS: '--inspect' } },
    { expect: { kind: 'exit', exitCodes: [1] } },
    { expect: { kind: 'cases', cases: [] } },
  ])
    assert.throws(() => validateStage({ ...stage, ...patch }));
});

test('uncertain group probes may recover within grace but persistent uncertainty never proves drain', async (t) => {
  const original = process.kill;
  for (const persistent of [false, true]) {
    const f = fixture(t, '');
    let probes = 0;
    process.kill = function (pid, signal) {
      if (pid < 0 && signal === 0 && (persistent || probes < 2)) {
        probes++;
        throw Object.assign(Error('Injected uncertain probe'), { code: 'EPERM' });
      }
      return original.call(process, pid, signal);
    };
    try {
      const start = Date.now();
      const receipt = await f.run({ ...f.stage, graceMs: 100 });
      assert.equal(receipt.status, persistent ? 'failed' : 'passed');
      assert.equal(receipt.result.groupDrained, !persistent);
      assert(receipt.result.uncertainProbes >= 2);
      assert(Date.now() - start < 1500);
    } finally {
      process.kill = original;
    }
  }
});

test('a malformed case report still produces a complete failed receipt and drained group', async (t) => {
  const f = fixture(
    t,
    "import {writeFileSync} from 'node:fs'; writeFileSync(process.env.RELEASE_CASE_REPORT, JSON.stringify({schema:1,nonce:process.env.RELEASE_RUN_NONCE,errors:[]}));",
  );
  const receipt = await f.run({
    ...f.stage,
    expect: { kind: 'cases', cases: [{ id: 'required', outcome: 'pass' }] },
  });
  assert.equal(receipt.status, 'failed');
  assert.match(receipt.result.reason, /Missing actual case census/);
  assert.equal(receipt.result.groupDrained, true);
  assert.equal(Object.hasOwn(receipt.result, 'cases'), false);
  assert.equal(
    JSON.parse(readFileSync(join(f.output, receipt.key, 'receipt.json'))).status,
    'failed',
  );
});

function portFileBrowser(t, completes) {
  const dir = mkdtempSync(join(tmpdir(), 'done-port-file-control-'));
  const executable = join(dir, 'browser');
  writeFileSync(
    executable,
    `#!${process.execPath}
import {writeFileSync} from 'node:fs';
const profile=process.argv.find(x=>x.startsWith('--user-data-dir=')).slice('--user-data-dir='.length);
const file=profile+'/DevToolsActivePort';
writeFileSync(file,'');
setTimeout(()=>writeFileSync(file,'12345'),80);
setTimeout(()=>writeFileSync(file,'12345\\n/devtools/browser/a'),160);
${completes ? "setTimeout(()=>writeFileSync(file,'12345\\n/devtools/browser/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),240);" : ''}
setInterval(()=>{},100);
`,
  );
  chmodSync(executable, 0o755);
  const owner = startOwnedChromium({
    runtime: { executable, snapshot: { fixture: 'fragmented-port-file' } },
    directory: dir,
    env: {},
    startupMs: completes ? 1500 : 500,
    graceMs: 300,
    maxLogBytes: 4096,
  });
  t.after(async () => {
    assert.equal((await owner.close()).groupDrained, true);
    rmSync(dir, { recursive: true, force: true });
  });
  return owner;
}

test('browser startup waits through empty and partial endpoint publication for a complete owned endpoint', async (t) => {
  const owner = portFileBrowser(t, true);
  assert.equal(
    await owner.ready(),
    'ws://127.0.0.1:12345/devtools/browser/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  );
  assert(owner.result.portFileRetries > 0);
});

test('an endpoint file that remains incomplete never becomes ready and still drains at the startup deadline', async (t) => {
  const owner = portFileBrowser(t, false);
  await assert.rejects(owner.ready(), /Browser startup deadline exceeded/);
  assert.equal(owner.result.endpoint, undefined);
  assert.equal((await owner.close()).groupDrained, true);
});
