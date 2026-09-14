import test from 'node:test';
import assert from 'node:assert/strict';
import {
  copyFileSync,
  existsSync,
  cpSync,
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import * as fc from 'fast-check';
import {
  createStageRunner,
  reconcileCases,
  validateStage,
} from '../../scripts/release-validation/stage.mjs';
import {
  historicalInput,
  validateHistoricalInputs,
} from '../../scripts/release-validation/historical-inputs.mjs';
import {
  nestedGroupOwner,
  spawnOwnedGroup,
} from '../../scripts/release-validation/nested-groups.mjs';
import { groupState } from '../../scripts/release-validation/process-group.mjs';
import { startOwnedChromium } from '../../scripts/release-validation/browser.mjs';
import { boundedStage } from '../../scripts/release-validation/manifest.mjs';
import { digest, filePins } from '../../scripts/release-validation/identity.mjs';
import { generatedNodeDeclarations } from '../../scripts/release-validation/census.mjs';

function fixture(t, script) {
  const base = mkdtempSync(join(tmpdir(), 'done-stage-')),
    root = join(base, 'checkout'),
    output = join(base, 'reports');
  mkdirSync(join(root, 'scripts/release-validation'), { recursive: true });
  for (const name of ['process-guard.mjs', 'node-reporter.mjs', 'nested-launcher.mjs'])
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
      filePins(root, [
        ...readdirSync(root)
          .filter((p) => p.endsWith('.mjs'))
          .sort(),
        'scripts/release-validation/node-reporter.mjs',
        'scripts/release-validation/process-guard.mjs',
        'scripts/release-validation/nested-launcher.mjs',
      ]),
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

function registrationFixture(t, during = false) {
  const cleanup = [],
    f = fixture({ after: (fn) => cleanup.push(fn) }, '');
  t.after(() => {
    try {
      if (process.env.REGISTRATION_CONTROL_OUTPUT) {
        mkdirSync(process.env.REGISTRATION_CONTROL_OUTPUT, { recursive: true });
        cpSync(f.output, join(process.env.REGISTRATION_CONTROL_OUTPUT, basename(f.base)), {
          recursive: true,
        });
      }
    } finally {
      for (const fn of cleanup.reverse()) fn();
    }
  });
  const path = 'test/account-delivery-oracle/helpers.mjs';
  const consumer = 'test/account-delivery-oracle/controls.test.mjs';
  const original = 'export const controls={one:["from","to"]};';
  const changed = original + '\n// helper changed without changing its case names';
  f.write(path, original);
  const text = `import test from 'node:test';import {writeFileSync} from 'node:fs';
    import {controls} from './helpers.mjs';for(const name of Object.keys(controls))test(name,()=>{
      ${during ? `writeFileSync('${path}',${JSON.stringify(changed)});` : ''}
    });`;
  f.write(consumer, text);
  const plan = () => ({
    ...f.stage,
    argv: [
      'node',
      '--test',
      '--test-concurrency=1',
      '--test-reporter=./scripts/release-validation/node-reporter.mjs',
      consumer,
    ],
    variant: 'node-account-fixture-file-v1',
    expect: { kind: 'cases', ...generatedNodeDeclarations(consumer, text, { root: f.root }) },
    deadlineMs: 5000,
  });
  return {
    ...f,
    path,
    plan,
    change: () => f.write(path, changed),
    reset: () => f.write(path, original),
  };
}

test('exported registration bytes refuse before launch and reuse, and changed same-name tables need a fresh receipt', async (t) => {
  const f = registrationFixture(t),
    stage = f.plan(),
    before = f.fingerprint();
  f.change();
  assert.deepEqual(
    f.fingerprint(),
    before,
    'This synthetic fingerprint intentionally omits the nested helper',
  );
  await assert.rejects(() => f.run(stage), /Registration data changed after planning/);
  assert.deepEqual(readdirSync(f.output), []);
  f.reset();
  const first = await f.run(stage);
  assert.equal(first.status, 'passed', first.result.reason);
  assert.equal((await f.run(stage)).reused, true);
  f.change();
  await assert.rejects(() => f.run(stage), /Registration data changed after planning/);
  const replanned = f.plan();
  assert.deepEqual(replanned.expect.cases, stage.expect.cases);
  const second = await f.run(replanned);
  assert.equal(second.status, 'passed', second.result.reason);
  assert.notEqual(second.key, first.key);
  assert.notEqual(second.reused, true);
  console.log('Registration input reuse control: ' + JSON.stringify({ first, second }));
});

test('a passing Node case still refuses and drains when its registration module changes during execution', async (t) => {
  const f = registrationFixture(t, true),
    before = f.fingerprint();
  const receipt = await f.run(f.plan());
  assert.equal(receipt.status, 'failed');
  assert.match(receipt.result.reason, /Registration data changed during execution/);
  assert.equal(receipt.result.groupDrained, true);
  assert.deepEqual(f.fingerprint(), before);
  const report = JSON.parse(readFileSync(join(f.output, receipt.key, 'cases.json')));
  assert.deepEqual(report.cases, f.plan().expect.cases);
  console.log('Registration input drift control: ' + JSON.stringify(receipt));
});

function historicalFixture(t, path = 'account-service/core.ts', during = false) {
  const cleanup = [];
  const f = fixture({ after: (fn) => cleanup.push(fn) }, '');
  t.after(() => {
    try {
      if (process.env.HISTORICAL_CONTROL_OUTPUT) {
        mkdirSync(process.env.HISTORICAL_CONTROL_OUTPUT, { recursive: true });
        cpSync(f.output, join(process.env.HISTORICAL_CONTROL_OUTPUT, basename(f.base)), {
          recursive: true,
        });
      }
    } finally {
      for (const fn of cleanup.reverse()) fn();
    }
  });
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: f.root,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '--quiet');
  f.write(path, 'export const fixture = 1;');
  git('add', path);
  const commit = () =>
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '--no-gpg-sign',
      '--quiet',
      '-m',
      'synthetic input',
    );
  commit();
  const reference = git('rev-parse', 'HEAD').slice(0, 12);
  const pin = historicalInput(f.root, reference, path);
  const oldBlob = git('rev-parse', reference + ':' + path);
  f.write(path, 'export const fixture = 2;');
  git('add', path);
  commit();
  const newBlob = git('rev-parse', 'HEAD:' + path);
  f.write(
    'subject.test.mjs',
    `import test from 'node:test';import assert from 'node:assert/strict';
    import {execFileSync} from 'node:child_process';
    test('historical input',()=>{
      const text=execFileSync('git',['show','${reference}:${path}'],{encoding:'utf8',timeout:3000});
      assert.match(text,/export const fixture = [12];/);
      ${during ? `execFileSync('git',['replace','${oldBlob}','${newBlob}'],{timeout:3000});` : ''}
    });`,
  );
  const stage = {
    ...f.stage,
    argv: [
      'node',
      '--test',
      '--test-concurrency=1',
      '--test-reporter=./scripts/release-validation/node-reporter.mjs',
      'subject.test.mjs',
    ],
    expect: {
      kind: 'cases',
      cases: [{ id: 'subject.test.mjs::historical input', outcome: 'pass' }],
      historyInputs: [pin],
    },
    deadlineMs: 5000,
  };
  return {
    ...f,
    git,
    stage,
    replace: () => git('replace', oldBlob, newBlob),
    reset: () => git('replace', '-d', oldBlob),
  };
}

test('historical Git bytes are checked before launch and reuse and enter the receipt contract', async (t) => {
  for (const path of [
    'account-service/core.ts',
    'src/crdt/spoolRecord.ts',
    'src/crdt/promotionAdmission.ts',
    'src/crdt/accountEnvelopePreparation.ts',
    'src/crdt/accountDelivery.ts',
    'account-protocol/admission.ts',
    'test/accountDelivery.test.ts',
    'src/crdt/promotionRecord.ts',
    'src/crdt/startupClassification.ts',
    'account-protocol/genesis.ts',
  ]) {
    const f = historicalFixture(t, path),
      before = f.fingerprint();
    f.replace();
    assert.deepEqual(f.fingerprint(), before, 'Checkout identity alone misses historical drift');
    await assert.rejects(() => f.run(f.stage), /Historical source changed/);
    assert.deepEqual(readdirSync(f.output), [], 'Refusal precedes launch');
    f.reset();
    const first = await f.run(f.stage);
    assert.equal(first.status, 'passed', first.result.reason);
    assert.equal((await f.run(f.stage)).reused, true);
    f.replace();
    await assert.rejects(() => f.run(f.stage), /Historical source changed/);
    const i = f.stage.expect.historyInputs[0];
    const replanned = structuredClone(f.stage);
    replanned.expect.historyInputs = [historicalInput(f.root, i.reference, i.path)];
    const second = await f.run(replanned);
    assert.equal(second.status, 'passed', second.result.reason);
    assert.notEqual(second.key, first.key);
    assert.notEqual(second.reused, true);
    console.log('Historical input reuse control: ' + JSON.stringify({ first, second }));
  }
});

test('a passing historical fixture still fails and drains when Git bytes change during execution', async (t) => {
  for (const path of [
    'account-service/core.ts',
    'src/crdt/spoolRecord.ts',
    'src/crdt/promotionAdmission.ts',
    'src/crdt/accountEnvelopePreparation.ts',
    'src/crdt/accountDelivery.ts',
    'account-protocol/admission.ts',
    'test/accountDelivery.test.ts',
    'src/crdt/promotionRecord.ts',
    'src/crdt/startupClassification.ts',
    'account-protocol/genesis.ts',
  ]) {
    const f = historicalFixture(t, path, true),
      before = f.fingerprint();
    const receipt = await f.run(f.stage);
    assert.equal(receipt.status, 'failed');
    assert.match(receipt.result.reason, /Historical source changed/);
    assert.equal(receipt.result.groupDrained, true);
    assert.deepEqual(f.fingerprint(), before);
    const report = JSON.parse(readFileSync(join(f.output, receipt.key, 'cases.json')));
    assert.deepEqual(report.cases, f.stage.expect.cases);
    console.log('Historical input drift control: ' + JSON.stringify(receipt));
  }
});

test('historical metadata rejects malformed pins, unsupported adapters and 160 generated locator corruptions', () => {
  const pin = {
    reference: 'a'.repeat(7),
    revision: 'a'.repeat(40),
    path: 'account-service/core.ts',
    sha256: 'b'.repeat(64),
  };
  validateHistoricalInputs([pin]);
  validateHistoricalInputs([{ ...pin, path: 'src/crdt/spoolRecord.ts' }]);
  validateHistoricalInputs([{ ...pin, path: 'src/crdt/promotionAdmission.ts' }]);
  validateHistoricalInputs([
    pin,
    ...[
      'account-protocol/admission.ts',
      'src/crdt/accountEnvelopePreparation.ts',
      'src/crdt/accountDelivery.ts',
      'test/accountDelivery.test.ts',
      'src/crdt/promotionRecord.ts',
      'src/crdt/startupClassification.ts',
      'account-protocol/genesis.ts',
    ].map((path) => ({ ...pin, path })),
  ]);
  for (const path of [
    'test/other.test.ts',
    'test/../accountDelivery.test.ts',
    'account-protocol/other.ts',
    'account-protocol/../admission.ts',
    'src/crdt/other.ts',
    'src/crdt/../spoolRecord.ts',
    'src/crdt/../promotionAdmission.ts',
    'src/other/spoolRecord.ts',
    '/src/crdt/spoolRecord.ts',
  ])
    assert.throws(
      () => validateHistoricalInputs([{ ...pin, path }]),
      /Invalid historical source locator/,
    );
  for (const bad of [
    null,
    [],
    Array(9).fill(pin),
    [pin, pin],
    [null],
    [{ ...pin, revision: 'c'.repeat(40) }],
    [{ ...pin, sha256: 'b'.repeat(63) }],
    [{ ...pin, extra: true }],
  ])
    assert.throws(() => validateHistoricalInputs(bad));
  const stage = boundedStage('a', ['node', 'subject.mjs'], {
    kind: 'exit',
    exitCodes: [0],
    historyInputs: [pin],
  });
  assert.throws(() => validateStage(stage), /requires Node cases/);
  stage.expect = { kind: 'cases', cases: [{ id: 'a', outcome: 'pass' }], historyInputs: [pin] };
  assert.throws(() => validateStage(stage), /requires the Node reporter/);
  fc.assert(
    fc.property(fc.string({ maxLength: 100 }), (text) => {
      assert.throws(() => validateHistoricalInputs([{ ...pin, reference: '-' + text }]));
      assert.throws(() =>
        validateHistoricalInputs([{ ...pin, path: 'account-service/../' + text + '.ts' }]),
      );
    }),
    { seed: 130924, numRuns: 160 },
  );
});

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
    "import test from 'node:test'; for (const flag of [false,true]) test(flag ? 'b' : 'a', () => {});",
  );
  const passed = await f.run(stage);
  assert.equal(passed.status, 'passed', passed.result.reason);
});

test('Binary IPC crash workers drain on success and a passing case cannot hide a leaked fork', async (t) => {
  const f = fixture(t, '');
  f.write(
    'worker.mjs',
    `process.on('SIGTERM',()=>{}); process.on('message',m=>m==='crash'?process.kill(process.pid,'SIGKILL'):process.send(m));process.send('ready');setInterval(()=>{},1000);`,
  );
  const text = `import test from 'node:test';import assert from 'node:assert/strict';import {fork} from 'node:child_process';import {once} from 'node:events';
    test('crash worker',async()=>{
      const child=fork('./worker.mjs',[],{stdio:['ignore','ignore','ignore','ipc'],serialization:'advanced'});
      await once(child,'message');
      const echo=once(child,'message');child.send(new Uint8Array([0,128,255]));
      const [bytes]=await echo;assert(bytes instanceof Uint8Array);assert.deepEqual([...bytes],[0,128,255]);
      if(process.env.LEAK==='yes'){child.disconnect();child.unref();return;}
      const death=once(child,'exit');child.send('crash');
      assert.deepEqual(await death,[null,'SIGKILL']);
    });`;
  f.write('subject.test.mjs', text);
  const stage = {
    ...f.stage,
    argv: [
      'node',
      '--test',
      '--test-concurrency=1',
      '--test-reporter=./scripts/release-validation/node-reporter.mjs',
      'subject.test.mjs',
    ],
    expect: { kind: 'cases', cases: [{ id: 'subject.test.mjs::crash worker', outcome: 'pass' }] },
    deadlineMs: 5000,
  };
  const clean = await f.run(stage);
  assert.equal(clean.status, 'passed', clean.result.reason);
  assert.equal(clean.result.groupDrained, true);
  const leaked = await f.run({ ...stage, env: { LEAK: 'yes' } });
  assert.equal(leaked.status, 'failed');
  assert.equal(leaked.result.reason, 'orphaned-child');
  assert.equal(leaked.result.groupDrained, true);
  const report = JSON.parse(readFileSync(join(f.output, leaked.key, 'cases.json')));
  assert.deepEqual(report.cases, stage.expect.cases);
  console.log('IPC ownership control: ' + JSON.stringify({ clean, leaked }));
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

test('Node property failure retains its counterexample and seed that the old reporter lost', async (t) => {
  const f = fixture(t, '');
  f.write(
    'actual.test.mjs',
    `import test from 'node:test';import fc from ${JSON.stringify(import.meta.resolve('fast-check'))};
    test('property',()=>fc.assert(fc.property(fc.nat(10),n=>n<0),{seed:130919,numRuns:120}));`,
  );
  const stage = {
    ...f.stage,
    argv: [
      'node',
      '--test',
      '--test-concurrency=1',
      '--test-reporter=./scripts/release-validation/node-reporter.mjs',
      'actual.test.mjs',
    ],
    expect: { kind: 'cases', cases: [{ id: 'actual.test.mjs::property', outcome: 'pass' }] },
    deadlineMs: 5000,
    maxLogBytes: 1024 * 1024,
  };
  f.write(
    'scripts/release-validation/node-reporter.mjs',
    execFileSync('git', ['show', '8acdee4:scripts/release-validation/node-reporter.mjs'], {
      encoding: 'utf8',
    }),
  );
  const before = await f.run(stage);
  assert.equal(before.status, 'failed');
  assert.doesNotMatch(
    readFileSync(join(f.output, before.key, 'output.log'), 'utf8'),
    /Counterexample|seed: 130919/,
  );
  f.write(
    'scripts/release-validation/node-reporter.mjs',
    readFileSync('scripts/release-validation/node-reporter.mjs', 'utf8'),
  );
  const after = await f.run(stage);
  assert.equal(after.status, 'failed');
  assert(after.result.groupDrained);
  for (const file of ['output.log', 'cases.json']) {
    const text = readFileSync(join(f.output, after.key, file), 'utf8');
    assert.match(text, /Counterexample/);
    assert.match(text, /seed: 130919/);
  }
  if (process.env.NODE_CONTROL_OUTPUT) {
    mkdirSync(process.env.NODE_CONTROL_OUTPUT, { recursive: true });
    for (const [name, r] of [
      ['before', before],
      ['after', after],
    ])
      for (const file of ['receipt.json', 'output.log', 'cases.json'])
        copyFileSync(
          join(f.output, r.key, file),
          join(process.env.NODE_CONTROL_OUTPUT, name + '-' + file),
        );
  }
});

test('a stuck Node test cannot pass and leaves completed-case progress after owned deadline drain', async (t) => {
  const f = fixture(t, '');
  f.write(
    'actual.test.mjs',
    `import test from 'node:test';test('completed',()=>{});test('stuck',async()=>{setInterval(()=>{},1000);await new Promise(()=>{});});`,
  );
  const r = await f.run({
    ...f.stage,
    argv: [
      'node',
      '--test',
      '--test-concurrency=1',
      '--test-reporter=./scripts/release-validation/node-reporter.mjs',
      'actual.test.mjs',
    ],
    expect: {
      kind: 'cases',
      cases: ['completed', 'stuck'].map((name) => ({
        id: 'actual.test.mjs::' + name,
        outcome: 'pass',
      })),
    },
    deadlineMs: 1200,
  });
  assert.equal(r.status, 'failed');
  assert.equal(r.result.reason, 'timeout');
  assert(r.result.groupDrained);
  const partial = JSON.parse(readFileSync(join(f.output, r.key, 'cases.json')));
  assert.equal(partial.phase, 'running');
  assert.deepEqual(partial.cases, [{ id: 'actual.test.mjs::completed', outcome: 'pass' }]);
  if (process.env.NODE_CONTROL_OUTPUT)
    for (const file of ['receipt.json', 'output.log', 'cases.json'])
      copyFileSync(
        join(f.output, r.key, file),
        join(process.env.NODE_CONTROL_OUTPUT, 'timeout-' + file),
      );
});

function portFileBrowser(t, completes, expectedDrain = true) {
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
    assert.equal((await owner.close()).groupDrained, expectedDrain);
    rmSync(dir, { recursive: true, force: true });
  });
  return owner;
}

test('browser startup waits through empty and partial endpoint publication for a complete owned endpoint', async (t) => {
  const owner = portFileBrowser(t, true);
  assert(owner.result.argv.includes('--disable-extensions'));
  assert(owner.result.argv.includes('--disable-component-extensions-with-background-pages'));
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

test('browser signal denial retries within grace but persistent denial cannot prove drain', async (t) => {
  for (const persistent of [false, true]) {
    const owner = portFileBrowser(t, true, !persistent);
    await owner.ready();
    const original = process.kill;
    let denials = 0;
    process.kill = function (pid, signal) {
      if (pid === -owner.result.pid && (persistent || (signal !== 0 && denials < 2))) {
        denials++;
        throw Object.assign(Error('Injected browser signal denial'), { code: 'EPERM' });
      }
      return original.call(process, pid, signal);
    };
    const cleanup = async () => {
      // End only this synthetic process after restoring real signals. The failed
      // receipt remains failed; later cleanup must not turn uncertainty into credit.
      try {
        original.call(process, -owner.result.pid, 'SIGKILL');
      } catch (e) {
        if (e.code !== 'ESRCH') throw e;
      }
      const until = Date.now() + 2000;
      let gone = false;
      while (!gone && Date.now() < until) {
        try {
          original.call(process, -owner.result.pid, 0);
        } catch (e) {
          if (e.code === 'ESRCH') gone = true;
          else if (e.code !== 'EPERM') throw e;
        }
        if (!gone) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert(gone, 'Synthetic browser was not cleaned up after the refusal control');
    };
    try {
      const start = Date.now();
      const result = await owner.close();
      assert.equal(result.groupDrained, !persistent);
      assert(denials >= 2);
      assert(Date.now() - start < 1500, 'Browser signal retry exceeded its grace bounds');
      if (persistent) assert.match(result.cleanupError, /EPERM|signal denial/);
    } finally {
      process.kill = original;
      await cleanup();
    }
  }
});

const registeredStage = (f) => ({
  ...f.stage,
  variant: 'node-registered-groups-v1',
  processPolicy: 'registered-groups-v1',
  deadlineMs: 2000,
  graceMs: 300,
});
const registeredSpawn = `import {spawn} from 'node:child_process'; import {writeFileSync,existsSync} from 'node:fs';
const launch=(script)=>spawn(process.execPath,['-e',script],{detached:true,stdio:'ignore',[Symbol.for('done.release.registered-group')]:true});`;

test('registered group payloads preserve clean exit and their exact leader drain', async (t) => {
  const f = fixture(
    t,
    registeredSpawn +
      `const child=launch('process.exit(0)');await new Promise((r,j)=>{child.on('error',j);child.on('close',c=>c===0?r():j(Error(String(c))));});`,
  );
  const r = await f.run(registeredStage(f));
  assert.equal(r.status, 'passed', JSON.stringify(r.result));
  assert.equal(r.result.nestedGroups.groups.length, process.env.RELEASE_NESTED_ROOT ? 2 : 1);
  assert(
    r.result.nestedGroups.groups.every((g) => g.state === 'gone' && groupState(g.pid) === 'gone'),
  );
});

test('registered descendants are drained after parent exception and abrupt death', async (t) => {
  for (const ending of ['throw Error("parent failure")', 'process.kill(process.pid,"SIGKILL")']) {
    const f = fixture(
      t,
      registeredSpawn +
        `const child=launch('require("node:fs").writeFileSync("alive",String(process.pid));setInterval(()=>{},1000)');while(!existsSync('alive'))await new Promise(r=>setTimeout(r,5));${ending};`,
    );
    const r = await f.run(registeredStage(f));
    assert.equal(r.status, 'failed');
    assert(r.result.groupDrained, JSON.stringify(r.result));
    assert.equal(r.result.nestedGroups.orphaned.length, 1);
    assert(r.result.nestedGroups.groups.every((g) => groupState(g.pid) === 'gone'));
    const payload = Number(readFileSync(join(f.root, 'alive'), 'utf8'));
    assert.throws(() => process.kill(payload, 0), { code: 'ESRCH' });
  }
});

test('timeout drains nested groups that ignore graceful termination at two levels', async (t) => {
  const grandchild = `process.on('SIGTERM',()=>{});require('node:fs').writeFileSync('grandchild',String(process.pid));setInterval(()=>{},1000)`;
  const nested = `const{spawn}=require('node:child_process');spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{detached:true,stdio:'ignore',[Symbol.for('done.release.registered-group')]:true});process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`;
  const f = fixture(
    t,
    registeredSpawn + `launch(${JSON.stringify(nested)});await new Promise(()=>{});`,
  );
  const r = await f.run(registeredStage(f));
  assert.equal(r.result.reason, 'timeout');
  assert(r.result.groupDrained, JSON.stringify(r.result));
  assert.equal(r.result.nestedGroups.groups.length, process.env.RELEASE_NESTED_ROOT ? 3 : 2);
  assert(r.result.nestedGroups.groups.every((g) => groupState(g.pid) === 'gone'));
  assert.throws(() => process.kill(Number(readFileSync(join(f.root, 'grandchild'), 'utf8')), 0), {
    code: 'ESRCH',
  });
});

test('registered stages still refuse unregistered detached launches and environment escape', async (t) => {
  const f = fixture(
    t,
    `import {spawn} from 'node:child_process';try{spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,env:{}})}catch{}`,
  );
  const r = await f.run(registeredStage(f));
  assert.equal(r.status, 'failed');
  assert.match(r.result.reason, /ownership violation/);
  assert(r.result.groupDrained);
  assert.equal(r.result.nestedGroups.groups.length, process.env.RELEASE_NESTED_ROOT ? 1 : 0);
});

test('closed nested owner prevents a late leader from executing its payload', async (t) => {
  const f = fixture(t, ''),
    owner = nestedGroupOwner(f.output, f.root),
    root = owner.environment.RELEASE_NESTED_ROOT;
  const id = '11111111-2222-3333-4444-555555555555';
  writeFileSync(join(root, id + '.intent.json'), JSON.stringify({ id, parent: process.pid }));
  const child = spawnOwnedGroup(
    process.execPath,
    [
      join(f.root, 'scripts/release-validation/nested-launcher.mjs'),
      root,
      id,
      JSON.stringify({
        file: process.execPath,
        args: ['-e', 'require("node:fs").writeFileSync("forbidden","ran")'],
      }),
    ],
    { cwd: f.root, env: { ...process.env, ...owner.environment }, detached: true, stdio: 'ignore' },
  );
  const ended = new Promise((r, j) => {
    child.once('error', j);
    child.once('close', r);
  });
  const until = Date.now() + 2000;
  while (!existsSync(join(root, id + '.started.json')) && Date.now() < until)
    await new Promise((r) => setTimeout(r, 5));
  assert(existsSync(join(root, id + '.started.json')));
  owner.cancel();
  await ended;
  const result = await owner.close(100);
  assert(result.groupDrained, JSON.stringify(result));
  assert.equal(existsSync(join(f.root, 'forbidden')), false);
});

test('unpublished nested intent cannot be credited as proven process drain', async (t) => {
  const f = fixture(t, ''),
    owner = nestedGroupOwner(f.output, f.root),
    root = owner.environment.RELEASE_NESTED_ROOT;
  const id = '11111111-2222-3333-4444-555555555555';
  writeFileSync(join(root, id + '.intent.json'), JSON.stringify({ id, parent: process.pid }));
  t.after(() => rmSync(join(root, id + '.intent.json'), { force: true }));
  const result = await owner.close(30);
  assert.equal(result.groupDrained, false);
  assert.deepEqual(result.pending, [id]);
});

test('nested closure-marker failure still kills registered payloads and refuses cleanup credit', async (t) => {
  const f = fixture(
    t,
    registeredSpawn +
      `launch('require("node:fs").writeFileSync("alive",String(process.pid));setInterval(()=>{},1000)');while(!existsSync('alive'))await new Promise(r=>setTimeout(r,5));const {mkdirSync}=await import('node:fs');mkdirSync(process.env.RELEASE_NESTED_ROOT+'/closed');`,
  );
  const r = await f.run(registeredStage(f));
  assert.equal(r.status, 'failed');
  assert.equal(r.result.groupDrained, false);
  assert.deepEqual(r.result.nestedGroups.closureErrors, ['EISDIR']);
  assert(r.result.nestedGroups.groups.every((g) => groupState(g.pid) === 'gone'));
  assert.throws(() => process.kill(Number(readFileSync(join(f.root, 'alive'), 'utf8')), 0), {
    code: 'ESRCH',
  });
});
