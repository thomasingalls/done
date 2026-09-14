import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { playwrightDeclarations, playwrightCaseId } from './playwright-census.mjs';

// Explicit file admission; other browser files keep their own unresolved obligations.
export const browserGroups = {
  'browser-upgrade-fixtures': ['test/app-upgrades/upgrades.spec.ts'],
  'browser-storage-fixtures': [
    'test/local-app/packaged.spec.ts',
    'test/storage-compatibility/compatibility.spec.ts',
    'test/private-migration/rehearsal.spec.ts',
  ],
  'browser-local-fixtures': ['test/local-app/startup.spec.ts', 'test/local-app/editor.spec.ts'],
};
export const browserFiles = Object.values(browserGroups).flat();
export function browserPolicy(file) {
  assert(browserFiles.includes(file), 'Unreviewed browser fixture');
  if (file === 'test/app-upgrades/upgrades.spec.ts')
    return {
      config: 'playwright.app-upgrades.config.ts',
      projects: [''],
      mode: 'upgrades',
      deadlineMs: 240000,
    };
  if (file === 'test/local-app/packaged.spec.ts')
    return {
      config: 'playwright.local-startup.config.ts',
      projects: [''],
      mode: 'packaged',
      deadlineMs: 180000,
    };
  if (file === 'test/storage-compatibility/compatibility.spec.ts')
    return {
      config: 'playwright.storage-compatibility.config.ts',
      projects: [''],
      mode: 'development',
      deadlineMs: 270000,
    };
  if (file === 'test/private-migration/rehearsal.spec.ts')
    return {
      config: 'playwright.private-migration.config.ts',
      projects: [''],
      mode: 'migration',
      deadlineMs: 540000,
    };
  return {
    config: 'playwright.local-startup.config.ts',
    projects: [''],
    mode: 'development',
    deadlineMs: 300000,
  };
}
export const upgradePriorDisposition = {
  id: playwrightCaseId('test/app-upgrades/upgrades.spec.ts', '', [
    'the supplied predecessor upgrades into the new policy with its later writing intact',
  ]),
  outcome: 'not-applicable',
  reason: 'Supply APP_UPGRADE_PREDECESSOR_DIR to exercise the actual prior build.',
};
function disposition(id) {
  return id === upgradePriorDisposition.id
    ? { ...upgradePriorDisposition }
    : { id, outcome: 'pass' };
}
export function playwrightStage(root, file) {
  const p = browserPolicy(file);
  const cases = playwrightDeclarations(file, readFileSync(join(root, file), 'utf8'), {
    root,
    projects: p.projects,
  }).map((c) => disposition(c.id));
  if (p.mode === 'upgrades')
    assert(
      cases.some((c) => c.id === upgradePriorDisposition.id),
      'Missing named predecessor disposition',
    );
  return {
    id: 'test:' + file,
    argv: ['node', 'scripts/release-validation/playwright-driver.mjs', file],
    env: {},
    variant: 'playwright-owned-file-v1',
    fixture: { kind: 'chromium-cdp', startupMs: 15000 },
    expect: {
      kind: 'playwright',
      files: [file],
      projects: p.projects,
      cases,
    },
    deadlineMs: p.deadlineMs,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
  };
}
export function validatePlaywrightStage(stage) {
  const file = stage.expect.files?.[0];
  const p = browserPolicy(file);
  assert.deepEqual(stage.expect.files, [file]);
  assert.deepEqual(stage.argv, ['node', 'scripts/release-validation/playwright-driver.mjs', file]);
  assert.deepEqual(stage.env, {});
  assert.equal(stage.variant, 'playwright-owned-file-v1');
  assert.equal(stage.processPolicy, 'inherited-group-v1');
  assert.deepEqual(stage.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.deepEqual(stage.expect.projects, p.projects);
  assert.deepEqual(
    stage.expect.cases,
    stage.expect.cases.map((c) => disposition(c.id)),
    'Unreviewed browser disposition',
  );
}
export function reconcilePlaywright(expected, actual, nonce) {
  assert.equal(actual.schema, 1);
  assert.equal(actual.adapter, 'playwright-v1');
  assert.equal(actual.nonce, nonce, 'Stale Playwright report');
  assert.equal(actual.phase, 'complete', 'Missing terminal Playwright report');
  assert.equal(actual.status, 'passed', 'Non-passing Playwright run');
  assert.deepEqual(actual.errors, [], 'Playwright framework errors');
  assert.equal(actual.configuration.workers, 1);
  assert.equal(actual.configuration.fullyParallel, false);
  assert.deepEqual(
    actual.configuration.projects,
    expected.projects.map((name) => ({ name, retries: 0, repeatEach: 1 })),
  );
  assert.equal(actual.server?.closed, true, 'Browser fixture server did not close');
  const origin = new URL(actual.server.origin);
  assert(
    origin.protocol === 'http:' &&
      origin.hostname === '127.0.0.1' &&
      Number(origin.port) > 0 &&
      origin.pathname === '/' &&
      !origin.username &&
      !origin.password,
    'Unowned browser fixture origin',
  );
  const ids = expected.cases.map((c) => c.id).sort();
  assert.deepEqual([...actual.collected].sort(), ids, 'Collected Playwright census differs');
  assert.equal(
    new Set(actual.cases.map((c) => c.id)).size,
    actual.cases.length,
    'Repeated Playwright case',
  );
  assert.deepEqual(
    actual.cases
      .map((c) =>
        c.status === 'skipped' && disposition(c.id).outcome === 'not-applicable'
          ? disposition(c.id)
          : { id: c.id, outcome: c.status === 'passed' ? 'pass' : c.status },
      )
      .sort((a, b) => a.id.localeCompare(b.id)),
    [...expected.cases].sort((a, b) => a.id.localeCompare(b.id)),
    'Incomplete or non-passing Playwright census',
  );
  for (const c of actual.cases) {
    const declared = expected.cases.find((e) => e.id === c.id);
    const skipped = declared.outcome === 'not-applicable';
    assert.equal(
      c.expectedStatus,
      skipped ? 'skipped' : 'passed',
      'Inverted Playwright expectation',
    );
    assert.equal(c.status, skipped ? 'skipped' : 'passed', 'Unexpected browser disposition');
    assert.equal(c.retry, 0, 'Retried Playwright case');
    assert.equal(c.repeatEachIndex, 0, 'Repeated Playwright case');
    assert.deepEqual(c.errors, [], 'Playwright case errors');
    assert(Array.isArray(c.attachments), 'Missing Playwright attachment census');
    for (const item of c.attachments) {
      assert(
        typeof item.name === 'string' &&
          typeof item.contentType === 'string' &&
          typeof item.base64 === 'string',
        'Invalid Playwright attachment metadata',
      );
      const bytes = Buffer.from(item.base64, 'base64');
      assert.equal(bytes.toString('base64'), item.base64, 'Malformed attachment encoding');
      assert.equal(bytes.length, item.size, 'Attachment byte count changed');
      assert(bytes.length <= 262144, 'Playwright attachment byte bound exceeded');
      assert.equal(
        createHash('sha256').update(bytes).digest('hex'),
        item.sha256,
        'Attachment bytes changed',
      );
    }
    assert.deepEqual(
      c.annotations,
      skipped ? [{ type: 'skip', description: declared.reason }] : [],
      'Unreviewed Playwright annotation',
    );
    assert(Number.isFinite(c.durationMs) && c.durationMs >= 0, 'Missing Playwright duration');
  }
  return { ...actual, cases: actual.cases.map((c) => disposition(c.id)) };
}
