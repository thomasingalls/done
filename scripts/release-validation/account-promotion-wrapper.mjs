import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatedNodeDeclarations } from './census.mjs';

export const promotionCampaign = 'scripts/account-promotion/run.mjs';
export const promotionFiles = ['core', 'native'].map(
  (name) => `test/account-promotion/${name}.test.mjs`,
);
export const promotionReports = [
  'sources.json',
  'summary.json',
  'results.xml',
  'run.log',
  'control-current-state.json',
  'control-mac.json',
];
export const promotionFilePolicy = {
  kind: 'account-reports-v1',
  required: promotionReports,
  maxEntries: 32,
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 1,
};

export function promotionCampaignStage(root) {
  const cases = promotionFiles.flatMap((file) => {
    const declarations = generatedNodeDeclarations(file, readFileSync(join(root, file), 'utf8'), {
      root,
    });
    assert.deepEqual(declarations.dataInputs, [], 'Review new promotion registration inputs');
    return declarations.cases;
  });
  return {
    id: 'campaign:' + promotionCampaign,
    argv: ['node', promotionCampaign],
    env: {},
    variant: 'account-promotion-campaign-v1',
    expect: { kind: 'account-promotion', cases },
    // Preserve the wrapper's 120-second campaign bound; the owner also drains descendants.
    deadlineMs: 120000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
    fixture: { kind: 'chromium-cdp', startupMs: 15000 },
    fileOutputs: structuredClone(promotionFilePolicy),
  };
}

export function validatePromotionCampaign(stage) {
  assert.equal(
    stage.expect.kind,
    'account-promotion',
    'Promotion wrapper requires report postconditions',
  );
  assert.equal(stage.variant, 'account-promotion-campaign-v1');
  assert.deepEqual(stage.argv, ['node', promotionCampaign]);
  assert.deepEqual(stage.env, {});
  assert.deepEqual(stage.fileOutputs, promotionFilePolicy);
  assert.deepEqual(stage.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(stage.deadlineMs, 120000);
  assert.equal(stage.graceMs, 5000);
  assert.equal(stage.processPolicy, 'inherited-group-v1');
}

/** Called only after bounded inventory validation and producer drain. Node's owned
 * terminal census is the case authority; JUnit and run.log remain auxiliary evidence. */
export function reconcilePromotionReports(directory, sources) {
  const json = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const summary = json('summary.json');
  assert.equal(summary.status, 'passed', 'Promotion campaign summary failed');
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
        'tsconfig.app.json',
        'src/account/recovery.ts',
        'src/account/recoveryOwner.ts',
        'test/account-authority/browser.ts',
        'test/account-core/fixtures.mjs',
        'test/account-core/worker.mjs',
        'test/account-recovery/fixtures.mjs',
        'wasm/journal-seal/seal.generated.ts',
        promotionCampaign,
        'docs/account-promotion.md',
      ].includes(path) ||
      /^src\/crdt\/[^/]+\.ts$/.test(path) ||
      /^(?:account-service|account-protocol|test\/account-promotion)\/[^/]+\.(?:ts|mjs)$/.test(
        path,
      ),
  );
  const sort = (rows) => [...rows].sort((a, b) => a.path.localeCompare(b.path));
  assert.deepEqual(
    sort(json('sources.json')),
    sort(selected.map(({ path, sha256 }) => ({ path, sha256 }))),
    'Promotion report source pins disagree with owned inputs',
  );
  reconcilePromotionControls(json('control-current-state.json'), json('control-mac.json'));
  // Presence/bytes are already bound by fileOutputs. Do not credit JUnit as an
  // independent oracle or discard counterexample/ledger diagnostics on failures.
  for (const file of ['run.log', 'results.xml'])
    assert(
      readFileSync(join(directory, file)).length > 0,
      'Empty promotion auxiliary report: ' + file,
    );
}

export function reconcilePromotionControls(current, mac) {
  assert.equal(current.baseline, 'refused', 'Promotion live-state baseline did not refuse');
  assert.equal(current.mutant, 'accepted-abandoned-account');
  assert.equal(current.baselineOk, false);
  assert.equal(current.mutantOk, true);
  assert.equal(current.acceptedStatus, 'eligible', 'Promotion mutant did not accept eligibility');
  assert.equal(mac.baseline, 'refused', 'Promotion MAC baseline did not refuse');
  assert.equal(mac.mutant, 'accepted-substituted-intent');
  for (const key of ['originalId', 'substitutedId', 'acceptedId'])
    assert(
      typeof mac[key] === 'string' && /^[a-f0-9]{32}$/.test(mac[key]),
      'Malformed promotion intent ID',
    );
  assert.notEqual(
    mac.originalId,
    mac.substitutedId,
    'Promotion control did not substitute the intent',
  );
  assert.equal(
    mac.acceptedId,
    mac.substitutedId,
    'Promotion mutant did not accept the substituted intent',
  );
}
