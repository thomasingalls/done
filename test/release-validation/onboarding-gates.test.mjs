import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vitestDeclarations } from '../../scripts/release-validation/vitest-census.mjs';
import { vitestStage, reconcileVitest } from '../../scripts/release-validation/vitest-adapter.mjs';
import { namedVitestDispositions } from '../../scripts/release-validation/vitest-dispositions.mjs';
import { validateStage } from '../../scripts/release-validation/stage.mjs';
import { checkConstructionRegistry } from '../../scripts/account-first-authority/registry.mjs';
import { reconcileCampaignTrace } from '../../scripts/release-validation/campaign-reporting.mjs';

const file = 'test/workspaceAdmission.test.ts';
const source = () => readFileSync(file, 'utf8');
const cases = () => vitestDeclarations(file, source(), { root: process.cwd() }).cases;
const report = (rows) => ({
  schema: 1,
  adapter: 'vitest-v1',
  nonce: 'fresh',
  reason: 'passed',
  modules: [{ file, state: 'passed' }],
  errors: [],
  cases: rows.map((c) => ({
    id: c.id,
    outcome: c.outcome === 'not-applicable' ? 'skipped' : 'pass',
    mode: c.outcome === 'not-applicable' ? 'skip' : 'run',
    retryCount: 0,
    repeatCount: 0,
    expectedFailure: false,
    durationMs: 1,
    errors: [],
  })),
});

test('the existing mode-specific skip stays in the independently collected denominator', () => {
  const rows = cases(),
    skipped = rows.filter((c) => c.outcome === 'not-applicable');
  assert.deepEqual(skipped, namedVitestDispositions);
  assert.equal(
    rows.filter((c) => c.id.includes('private prepared histories remain unpublished')).length,
    5,
  );
  const stage = vitestStage(process.cwd(), file);
  validateStage(stage);
  reconcileVitest(stage.expect, report(rows), 'fresh');
});

test('conditional skips outside the exact existing path, condition and case refuse', () => {
  for (const [path, text] of [
    ['test/another.test.ts', source()],
    [file, source().replace("preparation === 'account-text'", "preparation === 'reference'")],
    [
      file,
      source().replace(
        'private prepared histories remain unpublished under pressure',
        'changed case under pressure',
      ),
    ],
    [file, source().replace('it.skipIf(', 'it.onlyIf(')],
  ])
    assert.throws(() => vitestDeclarations(path, text, { root: process.cwd() }));
});

test('missing, extra, unexpectedly passing or failed skipped cases cannot earn execution credit', () => {
  const rows = cases(),
    expected = { files: [file], cases: rows };
  for (const mutate of [
    (r) => {
      r.cases = r.cases.filter((c) => c.outcome !== 'skipped');
    },
    (r) => {
      r.cases[0].outcome = 'skipped';
      r.cases[0].mode = 'skip';
    },
    (r) => {
      r.cases.find((c) => c.outcome === 'skipped').outcome = 'pass';
    },
    (r) => {
      r.cases.find((c) => c.outcome === 'skipped').errors = ['failure'];
    },
    (r) => {
      r.cases.find((c) => c.outcome === 'skipped').retryCount = 1;
    },
  ]) {
    const actual = report(rows);
    mutate(actual);
    assert.throws(() => reconcileVitest(expected, actual, 'fresh'));
  }
  const changed = structuredClone(expected);
  changed.cases[0].outcome = 'not-applicable';
  assert.throws(() => reconcileVitest(changed, report(rows), 'fresh'), /Unreviewed/);
});

test('newly inventoried cryptographic domains remain open qualification obligations', () => {
  const result = checkConstructionRegistry(process.cwd());
  assert.deepEqual(result.failures, []);
  assert.equal(result.specified, 78);
  assert.equal(result.open, 16);
  const preparation = JSON.parse(
    readFileSync('docs/account-crypto/constructions.json', 'utf8'),
  ).constructions.find((c) => c.id === 'account-local-preparation');
  assert.equal(preparation.status, 'open');
  // This is the same prerequisite enforced before the aggregate closure campaign.
  assert.throws(() => assert.equal(result.open, 0), /16 !== 0/);
});

test('campaign aggregation retains the named non-applicable case only after child verification', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'done-named-skip-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'case-reports'));
  const rows = cases(),
    expected = { files: [file], cases: rows },
    step = { name: 'properties', kind: 'vitest', argv: ['node', 'vitest'], deadlineMs: 1000 },
    trace = {
      schema: 1,
      adapter: 'campaign-v1',
      nonce: 'fresh',
      phase: 'complete',
      steps: [{ ...step, phase: 'complete', code: 0, timedOut: false }],
    },
    actual = { ...report(rows), nonce: 'fresh:properties' };
  const run = () => {
    writeFileSync(join(directory, 'case-reports/properties.json'), JSON.stringify(actual));
    return reconcileCampaignTrace(
      [{ ...step, expect: expected }],
      trace,
      'fresh',
      directory,
      () => {
        throw Error('No Node child in this fixture');
      },
    );
  };
  assert.deepEqual(run().cases, rows);
  actual.cases[0].outcome = 'skipped';
  actual.cases[0].mode = 'skip';
  assert.throws(run);
});
