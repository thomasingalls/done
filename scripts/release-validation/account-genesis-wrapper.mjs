import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatedNodeDeclarations } from './census.mjs';
import { historicalInput, validateHistoricalInputs } from './historical-inputs.mjs';

export const genesisCampaign = 'scripts/account-genesis/run.mjs';
export const genesisFiles = ['crypto', 'native'].map(
  (name) => `test/account-genesis/${name}.test.mjs`,
);
export const genesisReports = [
  'sources.json',
  'summary.json',
  'results.xml',
  'run.log',
  'control-snapshot.json',
  'control-wrap.json',
  'generated.json',
];
export const genesisFilePolicy = {
  kind: 'account-reports-v1',
  required: genesisReports,
  maxEntries: 32,
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 1,
};

export function genesisCampaignStage(root) {
  const cases = genesisFiles.flatMap((file) => {
    const declarations = generatedNodeDeclarations(file, readFileSync(join(root, file), 'utf8'), {
      root,
    });
    assert.deepEqual(declarations.dataInputs, [], 'Review new genesis registration inputs');
    return declarations.cases;
  });
  return {
    id: 'campaign:' + genesisCampaign,
    argv: ['node', genesisCampaign],
    env: {},
    variant: 'account-genesis-campaign-v1',
    expect: {
      kind: 'account-genesis',
      cases,
      historyInputs: [historicalInput(root, 'a4e1c15', 'src/crdt/promotionRecord.ts')],
    },
    // Preserve the wrapper's 180-second campaign bound; the owner also drains descendants.
    deadlineMs: 180000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
    fixture: { kind: 'chromium-cdp', startupMs: 15000 },
    fileOutputs: structuredClone(genesisFilePolicy),
  };
}

export function validateGenesisCampaign(stage) {
  assert.equal(
    stage.expect.kind,
    'account-genesis',
    'Genesis wrapper requires report postconditions',
  );
  assert.equal(stage.variant, 'account-genesis-campaign-v1');
  assert.deepEqual(stage.argv, ['node', genesisCampaign]);
  assert.deepEqual(stage.env, {});
  assert.deepEqual(stage.fileOutputs, genesisFilePolicy);
  assert.deepEqual(stage.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(stage.deadlineMs, 180000);
  assert.equal(stage.graceMs, 5000);
  assert.equal(stage.processPolicy, 'inherited-group-v1');
  assert.equal(stage.expect.dataInputs, undefined);
  validateHistoricalInputs(stage.expect.historyInputs);
  assert.deepEqual(
    stage.expect.historyInputs.map(({ reference, path }) => [reference, path]),
    [['a4e1c15', 'src/crdt/promotionRecord.ts']],
  );
}

/** Called only after bounded inventory validation and producer drain. Node's owned
 * terminal census is the case authority; JUnit and run.log remain auxiliary evidence. */
export function reconcileGenesisReports(directory, sources) {
  const json = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const summary = json('summary.json');
  assert.equal(summary.status, 'passed', 'Genesis campaign summary failed');
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
        'src/account/generationWrap.ts',
        'test/vectors/package.json',
        'test/account-promotion/fixtures.mjs',
        'test/account-promotion/browser.ts',
        'src/account/recoveryOwner.ts',
        'test/account-authority/browser.ts',
        'test/account-core/fixtures.mjs',
        'test/account-core/worker.mjs',
        'test/account-recovery/fixtures.mjs',
        'wasm/journal-seal/seal.generated.ts',
        genesisCampaign,
        'docs/account-promotion.md',
      ].includes(path) ||
      /^src\/crdt\/[^/]+\.ts$/.test(path) ||
      /^src\/lib\/[^/]+\.tsx?$/.test(path) ||
      /^(?:account-service|account-protocol|test\/account-genesis)\/[^/]+\.(?:ts|mjs)$/.test(path),
  );
  const sort = (rows) => [...rows].sort((a, b) => a.path.localeCompare(b.path));
  assert.deepEqual(
    sort(json('sources.json')),
    sort(selected.map(({ path, sha256 }) => ({ path, sha256 }))),
    'Genesis report source pins disagree with owned inputs',
  );
  reconcileGenesisControls(json('control-snapshot.json'), json('control-wrap.json'));
  reconcileGenesisHistories(json('generated.json'));
  // Presence/bytes are already bound by fileOutputs. Do not credit JUnit as an
  // independent oracle or discard counterexample/ledger diagnostics on failures.
  for (const file of ['run.log', 'results.xml'])
    assert(
      readFileSync(join(directory, file)).length > 0,
      'Empty genesis auxiliary report: ' + file,
    );
}

const hexDigest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function reconcileGenesisControls(snapshot, wrap) {
  for (const [kind, report] of [
    ['snapshot', snapshot],
    ['wrap', wrap],
  ]) {
    assert.equal(report.control, kind, 'Genesis control kind changed');
    assert.equal(report.baseline, 'refused', 'Genesis control baseline did not refuse');
    assert.equal(report.observed, 'forged artifact accepted with semantic refusal disabled');
    for (const candidate of [report.original, report.candidate]) {
      assert.equal(candidate.v, 1);
      assert.equal(candidate.kind, 'promotion-genesis-candidate');
      assert.equal(candidate.generation, 1);
      assert.equal(candidate.proposedEpoch, 1);
      assert(Array.isArray(candidate.wraps) && candidate.wraps.length === 2);
      assert.equal(candidate.wraps[0].recipient, 'device');
      assert.equal(candidate.wraps[1].recipient, 'recovery');
      assert(candidate.checkpoint && typeof candidate.checkpoint === 'object');
      assert(
        typeof candidate.signature === 'string' && /^[a-f0-9]{128}$/.test(candidate.signature),
      );
    }
    const original = structuredClone(report.original),
      accepted = structuredClone(report.candidate);
    assert.notEqual(original.signature, accepted.signature, 'Genesis control did not re-sign');
    delete original.signature;
    delete accepted.signature;
    if (kind === 'snapshot') {
      assert.notDeepEqual(
        original.checkpoint,
        accepted.checkpoint,
        'Genesis snapshot control did not change checkpoint',
      );
      delete original.checkpoint;
      delete accepted.checkpoint;
      assert(hexDigest(report.semantic.expectedSha256) && hexDigest(report.semantic.actualSha256));
      assert.notEqual(
        report.semantic.expectedSha256,
        report.semantic.actualSha256,
        'Genesis snapshot control did not lose source state',
      );
    } else {
      for (const c of [original, accepted]) {
        assert(typeof c.wraps[1].enc === 'string' && /^[a-f0-9]{64}$/.test(c.wraps[1].enc));
        assert(typeof c.wraps[1].ct === 'string' && /^[a-f0-9]{96}$/.test(c.wraps[1].ct));
      }
      assert.notEqual(
        original.wraps[1].ct,
        accepted.wraps[1].ct,
        'Genesis wrap control did not change sealed generation',
      );
      for (const c of [original, accepted]) {
        delete c.wraps[1].enc;
        delete c.wraps[1].ct;
      }
      assert.equal(
        report.semantic.oracle,
        'refused',
        'Genesis wrong-generation oracle did not refuse',
      );
    }
    assert.deepEqual(accepted, original, 'Genesis control changed unrelated candidate fields');
  }
}

export function reconcileGenesisHistories(report) {
  assert.equal(report.seed, 9222026, 'Genesis history seed changed');
  assert.equal(report.numRuns, 40);
  assert(
    Array.isArray(report.histories) && report.histories.length === 40,
    'Incomplete genesis histories',
  );
  for (const history of report.histories) {
    assert.deepEqual(Object.keys(history).sort(), [
      'abort',
      'forgery',
      'ops',
      'restart',
      'reverse',
      'status',
    ]);
    assert.equal(history.status, 'passed');
    for (const key of ['abort', 'restart', 'reverse']) assert.equal(typeof history[key], 'boolean');
    assert(['snapshot', 'wrap', 'coverage', 'recipient', 'actor'].includes(history.forgery));
    assert(Array.isArray(history.ops) && history.ops.length >= 1 && history.ops.length <= 12);
    for (const op of history.ops) {
      assert.deepEqual(Object.keys(op).sort(), ['at', 'disk', 'insert', 'remove']);
      assert(Number.isInteger(op.at) && op.at >= 0 && op.at <= 100);
      assert(Number.isInteger(op.remove) && op.remove >= 0 && op.remove <= 6);
      assert(typeof op.insert === 'string' && op.insert.length >= 1 && op.insert.length <= 16);
      assert.equal(typeof op.disk, 'boolean');
    }
  }
}
