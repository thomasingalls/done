import test from 'node:test';
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { playwrightDeclarations } from '../../scripts/release-validation/playwright-census.mjs';
import {
  browserFiles,
  playwrightStage,
  reconcilePlaywright,
  namedBrowserDispositions,
} from '../../scripts/release-validation/playwright-adapter.mjs';
import {
  measurementContract,
  measurementArtifact,
  reconcileMeasurements,
} from '../../scripts/release-validation/playwright-measurements.mjs';
import { validateStage } from '../../scripts/release-validation/stage.mjs';

const file = 'test/local-app/startup.spec.ts';
const population = (names) =>
  playwrightDeclarations(
    file,
    `import {test} from '@playwright/test';for(const name of ${JSON.stringify(names)})test(name,()=>{});`,
  );
const report = (cases) => ({
  schema: 1,
  adapter: 'playwright-v1',
  nonce: 'fresh',
  phase: 'complete',
  status: 'passed',
  configuration: {
    workers: 1,
    fullyParallel: false,
    projects: [{ name: '', retries: 0, repeatEach: 1 }],
  },
  collected: cases.map((c) => c.id),
  cases: cases.map((c) => ({
    id: c.id,
    status: 'passed',
    expectedStatus: 'passed',
    retry: 0,
    repeatEachIndex: 0,
    durationMs: 1,
    errors: [],
    annotations: [],
    attachments: [],
  })),
  errors: [],
  server: { origin: 'http://127.0.0.1:19001', closed: true },
});
const expected = (cases) => ({ kind: 'playwright', files: [file], projects: [''], cases });

test('Playwright static census keeps suite, table and project identities without executing bodies or confusing RegExp.test', () => {
  const text = `import {test,expect} from '@playwright/test';throw Error('must not execute');test.describe('suite',()=>{test.beforeEach(()=>{});for(const name of ['one','two'])test(name,()=>{expect(/x/.test('x')).toBe(true);});});`;
  const rows = playwrightDeclarations(file, text, { projects: ['desktop', 'android'] });
  assert.deepEqual(
    rows.map((c) => JSON.parse(c.id.slice(file.length + 2))),
    [
      ['desktop', 'suite', 'one'],
      ['desktop', 'suite', 'two'],
      ['android', 'suite', 'one'],
      ['android', 'suite', 'two'],
    ],
  );
});

test('Playwright census refuses hidden, aliased, modified, skipped registrations and duplicate names', () => {
  for (const body of [
    "if(flag)test('one',()=>{});",
    "const run=test;run('one',()=>{});",
    "test.only('one',()=>{});",
    "test.skip('one',()=>{});",
    "test('one',()=>test('nested',()=>{}));",
    "test.beforeEach(()=>test('nested',()=>{}));",
    "test('one',()=>{});test('one',()=>{});",
    "test.describe.serial('s',()=>test('one',()=>{}));",
  ])
    assert.throws(() =>
      playwrightDeclarations(file, `import {test} from '@playwright/test';${body}`),
    );
});

test('reviewed browser files preserve Local and storage cases and cannot bypass owned browser, driver or result contracts', () => {
  assert.equal(browserFiles.length, 15);
  assert.deepEqual(
    browserFiles.map((f) => playwrightStage(process.cwd(), f).expect.cases.length),
    [4, 8, 2, 12, 22, 6, 6, 26, 12, 8, 3, 6, 5, 4, 4],
  );
  for (const f of browserFiles) {
    const stage = playwrightStage(process.cwd(), f);
    validateStage(stage);
    assert.equal(
      stage.deadlineMs,
      {
        'test/app-upgrades/upgrades.spec.ts': 240000,
        'test/latency/journal.spec.ts': 720000,
        'test/geometry/reorder.spec.ts': 180000,
        'test/geometry/sync.spec.ts': 180000,
        'test/geometry/wheel.spec.ts': 180000,
        'test/geometry/workflow.spec.ts': 360000,

        'test/geometry/breadcrumbs.spec.ts': 240000,
        'test/geometry/cards.spec.ts': 240000,
        'test/geometry/layout.spec.ts': 360000,
        'test/geometry/lineHeight.spec.ts': 240000,

        'test/local-app/packaged.spec.ts': 180000,
        'test/storage-compatibility/compatibility.spec.ts': 270000,
        'test/private-migration/rehearsal.spec.ts': 540000,
      }[f] ?? 300000,
    );
    assert(readFileSync(f, 'utf8').includes("from '../release-validation/browser-fixture'"));
    for (const change of [
      { env: { CI: '0' } },
      { variant: 'current' },
      { fixture: undefined },
      { expect: { ...stage.expect, kind: 'cases' } },
      { argv: [...stage.argv, '--grep=one'] },
      { expect: { ...stage.expect, projects: ['android'] } },
    ])
      assert.throws(() => validateStage({ ...stage, ...change }));
  }
  assert.throws(() => playwrightStage(process.cwd(), 'test/latency/latency.spec.ts'), /Unreviewed/);
});

test('Playwright reports refuse terminal, collected, retry, annotation, framework, server and outcome corruption', () => {
  const cases = population(['one', 'two']);
  assert.equal(reconcilePlaywright(expected(cases), report(cases), 'fresh').cases.length, 2);
  assert.equal(namedBrowserDispositions.length, 11);
  for (const inactiveCase of namedBrowserDispositions) {
    const named = [inactiveCase],
      inactive = report(named);
    inactive.cases[0].status = 'skipped';
    inactive.cases[0].expectedStatus = 'skipped';
    inactive.cases[0].annotations = [{ type: 'skip', description: inactiveCase.reason }];
    assert.deepEqual(reconcilePlaywright(expected(named), inactive, 'fresh').cases, named);
    for (const mutate of [
      (r) => (r.cases[0].annotations[0].description = 'different reason'),
      (r) => (r.cases[0].status = 'passed'),
      (r) => (r.cases[0].annotations = []),
      (r) => (r.cases[0].status = 'failed'),
    ]) {
      const changed = structuredClone(inactive);
      mutate(changed);
      assert.throws(() => reconcilePlaywright(expected(named), changed, 'fresh'));
    }
  }
  for (const change of [
    (r) => (r.phase = 'running'),
    (r) => (r.status = 'failed'),
    (r) => (r.nonce = 'stale'),
    (r) => r.errors.push('hook failed'),
    (r) => r.collected.pop(),
    (r) => r.cases.pop(),
    (r) => r.cases.push(r.cases[0]),
    (r) => (r.cases[0].status = 'skipped'),
    (r) => (r.cases[0].expectedStatus = 'failed'),
    (r) => (r.cases[0].retry = 1),
    (r) => (r.cases[0].repeatEachIndex = 1),
    (r) => r.cases[0].annotations.push({ type: 'skip', description: 'unknown' }),
    (r) => r.cases[0].errors.push('assertion failed'),
    (r) => (r.configuration.workers = 2),
    (r) => (r.configuration.projects[0].retries = 1),
    (r) => (r.server.closed = false),
    (r) => (r.server.origin = 'http://example.com'),
    (r) => (r.cases[0].durationMs = null),
    (r) => (r.cases[0].attachments = undefined),
    (r) =>
      r.cases[0].attachments.push({
        name: 'inputs',
        contentType: 'application/json',
        size: 1,
        base64: 'eA==',
        sha256: 'wrong',
      }),
  ]) {
    const actual = report(cases);
    change(actual);
    assert.throws(() => reconcilePlaywright(expected(cases), actual, 'fresh'));
  }
});

test('160 generated browser populations need every independent project and case exactly once', () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.stringMatching(/^[a-z]{1,8}$/), { minLength: 1, maxLength: 12 }),
      fc.nat(),
      (names, pick) => {
        const cases = population(names),
          actual = report(cases);
        assert.equal(
          reconcilePlaywright(expected(cases), actual, 'fresh').cases.length,
          names.length,
        );
        actual.cases.splice(pick % actual.cases.length, 1);
        assert.throws(() => reconcilePlaywright(expected(cases), actual, 'fresh'));
      },
    ),
    { seed: 140921, numRuns: 160 },
  );
});

test('browser measurements require fresh bounded exact project/metric populations and retained bytes', () => {
  const contract = measurementContract('test/latency/journal.spec.ts');
  assert.equal(contract.metrics.length, 22);
  const rows = contract.projects.flatMap((project) =>
    contract.metrics.map((metric) => ({
      project,
      metric,
      value: 0.1,
      samples: 10,
      note: 'controlled',
    })),
  );
  const artifact = (r) =>
    measurementArtifact(Buffer.from(r.map((v) => JSON.stringify(v)).join('\n') + '\n'));
  reconcileMeasurements(contract, artifact(rows));
  for (const change of [
    (r) => r.pop(),
    (r) => r.push(r[0]),
    (r) => (r[0].project = 'unknown'),
    (r) => (r[0].metric = 'unknown'),
    (r) => (r[0].value = null),
    (r) => (r[0].samples = 0),
    (r) => delete r[0].note,
    (r) => (r[0].value = -1),
  ]) {
    const changed = structuredClone(rows);
    change(changed);
    assert.throws(() => reconcileMeasurements(contract, artifact(changed)));
  }
  const changed = artifact(rows);
  changed.sha256 = '0'.repeat(64);
  assert.throws(() => reconcileMeasurements(contract, changed));
  assert.throws(() => reconcileMeasurements(contract, undefined));
  assert.throws(() => reconcileMeasurements(undefined, artifact(rows)));
  assert.throws(() => measurementArtifact(Buffer.alloc(65537)));
  assert.throws(() =>
    reconcileMeasurements(contract, measurementArtifact(Buffer.from('truncated'))),
  );
});
