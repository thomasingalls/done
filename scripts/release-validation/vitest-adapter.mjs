import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vitestDeclarations } from './vitest-census.mjs';
import { vitestDisposition } from './vitest-dispositions.mjs';

// These five synthetic suites use the normal config/setup, in-memory IndexedDB and
// inherited Vitest forks. Native wrappers and whole `pnpm test` remain separate obligations.
export const propertyFiles = [
  'test/spoolBatch.test.ts',
  'test/accountInboundPrep.test.ts',
  'test/legacyImport.test.ts',
  'test/legacySelection.test.ts',
  'test/legacyCleanup.test.ts',
];
export const vitestFilePattern =
  /^(?:test|vite)\/(?:[A-Za-z0-9-]+\/)*[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.test\.tsx?$/;
export const vitestArgv = (file) => {
  assert(vitestFilePattern.test(file), 'Unsupported Vitest path');
  return [
    'node',
    'node_modules/vitest/vitest.mjs',
    'run',
    '--config=vite.config.ts',
    '--pool=forks',
    '--maxWorkers=1',
    '--no-file-parallelism',
    '--retry=0',
    '--bail=0',
    '--reporter=./scripts/release-validation/vitest-reporter.mjs',
    file,
  ];
};
export function vitestStage(root, file) {
  const declarations = vitestDeclarations(file, readFileSync(join(root, file), 'utf8'), { root });
  return {
    id: 'test:' + file,
    argv: vitestArgv(file),
    env: {},
    variant: 'vitest-single-file-v1',
    expect: {
      kind: 'vitest',
      files: [file],
      cases: declarations.cases,
      ...(declarations.dataInputs.length ? { dataInputs: declarations.dataInputs } : {}),
    },
    deadlineMs: 180000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
  };
}
export function reconcileVitest(expected, actual, nonce) {
  assert.deepEqual(
    expected.cases,
    expected.cases.map((c) => vitestDisposition(c.id)),
    'Unreviewed Vitest disposition',
  );
  assert.equal(actual.schema, 1);
  assert.equal(actual.adapter, 'vitest-v1');
  assert.equal(actual.nonce, nonce, 'Stale Vitest report');
  assert.equal(actual.reason, 'passed', 'Missing or failed terminal Vitest run');
  assert.deepEqual(actual.errors, [], 'Vitest reported errors');
  assert.deepEqual(
    actual.modules
      .map((m) => ({ file: m.file, state: m.state }))
      .sort((a, b) => a.file.localeCompare(b.file)),
    expected.files
      .map((file) => ({ file, state: 'passed' }))
      .sort((a, b) => a.file.localeCompare(b.file)),
    'Vitest module census differs',
  );
  assert(Array.isArray(actual.cases) && actual.cases.length, 'Empty Vitest report');
  assert.equal(
    new Set(actual.cases.map((c) => c.id)).size,
    actual.cases.length,
    'Duplicate Vitest case',
  );
  const sort = (cases) => [...cases].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(
    sort(
      actual.cases.map(({ id, outcome }) => ({
        ...vitestDisposition(id),
        outcome: outcome === 'skipped' ? 'not-applicable' : outcome,
      })),
    ),
    sort(expected.cases),
    'Incomplete or non-passing Vitest census',
  );
  for (const c of actual.cases) {
    if (vitestDisposition(c.id).outcome === 'not-applicable') {
      assert.equal(c.outcome, 'skipped', 'Named Vitest disposition must actually skip');
      assert.equal(c.mode, 'skip');
      assert.equal(c.retryCount ?? 0, 0);
      assert.equal(c.repeatCount ?? 0, 0);
      assert.equal(c.expectedFailure, false);
      assert(c.durationMs === null || (Number.isFinite(c.durationMs) && c.durationMs >= 0));
      assert.deepEqual(c.errors, []);
      continue;
    }
    assert.equal(c.retryCount, 0, 'Retried Vitest case');
    assert.equal(c.repeatCount, 0, 'Repeated Vitest case');
    assert.equal(c.expectedFailure, false, 'Inverted Vitest outcome');
    assert.equal(c.mode, 'run', 'Filtered Vitest case');
    assert(Number.isFinite(c.durationMs) && c.durationMs >= 0, 'Missing Vitest case duration');
    assert.deepEqual(c.errors, [], 'Vitest case errors');
  }
  return actual;
}
