import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatedNodeDeclarations } from './census.mjs';

export const coreCampaign = 'scripts/account-core/run.mjs';
export const coreFiles = ['core', 'properties', 'restart', 'controls', 'native'].map(
  (name) => `test/account-core/${name}.test.mjs`,
);
export const coreReports = [
  'sources.json',
  'summary.json',
  'results.xml',
  'run.log',
  ...['replay', 'purpose', 'key'].flatMap((name) =>
    ['baseline', 'mutant'].map((variant) => `control-${name}-${variant}.json`),
  ),
];
export const coreFilePolicy = {
  kind: 'account-reports-v1',
  required: coreReports,
  maxEntries: 32,
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 1,
};

export function coreCampaignStage(root) {
  const cases = coreFiles.flatMap((file) => {
    const declarations = generatedNodeDeclarations(file, readFileSync(join(root, file), 'utf8'), {
      root,
    });
    assert.deepEqual(declarations.dataInputs, [], 'Review new core registration inputs');
    return declarations.cases;
  });
  return {
    id: 'campaign:' + coreCampaign,
    argv: ['node', coreCampaign],
    env: {},
    variant: 'account-core-campaign-v1',
    expect: { kind: 'account-core', cases },
    // Preserve the wrapper's 120-second campaign bound; the owner also drains descendants.
    deadlineMs: 120000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
    fixture: { kind: 'chromium-cdp', startupMs: 15000 },
    fileOutputs: structuredClone(coreFilePolicy),
  };
}

export function validateCoreCampaign(stage) {
  assert.equal(stage.expect.kind, 'account-core', 'Core wrapper requires report postconditions');
  assert.equal(stage.variant, 'account-core-campaign-v1');
  assert.deepEqual(stage.argv, ['node', coreCampaign]);
  assert.deepEqual(stage.env, {});
  assert.deepEqual(stage.fileOutputs, coreFilePolicy);
  assert.deepEqual(stage.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(stage.deadlineMs, 120000);
  assert.equal(stage.graceMs, 5000);
  assert.equal(stage.processPolicy, 'inherited-group-v1');
}

/** Called only after bounded inventory validation and producer drain. Node's owned
 * terminal census is the case authority; JUnit and run.log remain auxiliary evidence. */
export function reconcileCoreReports(directory, sources) {
  const json = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const summary = json('summary.json');
  assert.equal(summary.status, 'passed', 'Core campaign summary failed');
  assert.equal(summary.code, 0);
  assert.equal(summary.timedOut, false);
  assert.equal(summary.launchError, undefined);
  for (const key of ['startedAt', 'completedAt'])
    assert(
      typeof summary[key] === 'string' && new Date(summary[key]).toISOString() === summary[key],
      'Invalid campaign time',
    );
  assert(Date.parse(summary.completedAt) >= Date.parse(summary.startedAt));
  const selected = sources.filter(
    ({ path }) =>
      [
        'package.json',
        'pnpm-lock.yaml',
        'tsconfig.node.json',
        coreCampaign,
        'docs/account-core.md',
      ].includes(path) ||
      /^(?:account-service|account-protocol|test\/account-core)\/[^/]+\.(?:ts|mjs)$/.test(path),
  );
  const sort = (rows) => [...rows].sort((a, b) => a.path.localeCompare(b.path));
  assert.deepEqual(
    sort(json('sources.json')),
    sort(selected.map(({ path, sha256 }) => ({ path, sha256 }))),
    'Core report source pins disagree with owned inputs',
  );
  const baseline = json('control-replay-baseline.json'),
    mutant = json('control-replay-mutant.json');
  for (const row of [baseline, mutant]) {
    assert.equal(row.first.stage, 'account-proof');
    assert.equal(row.second.stage, 'account-proof');
    assert(typeof row.first.receiptId === 'string' && row.first.receiptId.length > 0);
    assert(typeof row.second.receiptId === 'string' && row.second.receiptId.length > 0);
  }
  assert.equal(
    baseline.first.receiptId,
    baseline.second.receiptId,
    'Baseline replay changed result',
  );
  assert.notEqual(
    mutant.first.receiptId,
    mutant.second.receiptId,
    'Replay control did not discriminate',
  );
  for (const name of ['purpose', 'key']) {
    assert.equal(
      json(`control-${name}-baseline.json`).result.refusal,
      'invalid-proof',
      `${name} baseline did not refuse`,
    );
    assert.equal(
      json(`control-${name}-mutant.json`).result.stage,
      'account-proof',
      `${name} control did not discriminate`,
    );
  }
  // Presence/bytes are already bound by fileOutputs. Do not credit JUnit as an
  // independent oracle or discard counterexample/ledger diagnostics on failures.
  for (const file of ['run.log', 'results.xml'])
    assert(readFileSync(join(directory, file)).length > 0, 'Empty core auxiliary report: ' + file);
}
