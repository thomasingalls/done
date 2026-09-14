import test from 'node:test';
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { playwrightDeclarations } from '../../scripts/release-validation/playwright-census.mjs';
import {
  browserFiles,
  playwrightStage,
  reconcilePlaywright,
} from '../../scripts/release-validation/playwright-adapter.mjs';
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
  assert.equal(browserFiles.length, 5);
  assert.deepEqual(
    browserFiles.map((f) => playwrightStage(process.cwd(), f).expect.cases.length),
    [3, 6, 5, 4, 4],
  );
  for (const f of browserFiles) {
    const stage = playwrightStage(process.cwd(), f);
    validateStage(stage);
    assert.equal(
      stage.deadlineMs,
      {
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
  assert.throws(() => playwrightStage(process.cwd(), 'test/geometry/layout.spec.ts'), /Unreviewed/);
});

test('Playwright reports refuse terminal, collected, retry, annotation, framework, server and outcome corruption', () => {
  const cases = population(['one', 'two']);
  assert.equal(reconcilePlaywright(expected(cases), report(cases), 'fresh').cases.length, 2);
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
