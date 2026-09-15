import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compileManifest, selectStages } from '../../scripts/release-validation/manifest.mjs';
import { validateStage, reconcileCases } from '../../scripts/release-validation/stage.mjs';
import { reconcileCampaignTrace } from '../../scripts/release-validation/campaign-reporting.mjs';
import {
  serviceDeliveryCampaign,
  serviceDeliveryCampaignStage,
  serviceDeliverySteps,
  serviceDeliveryReports,
  reconcileServiceDeliveryReports,
  reconcileServiceDeliveryEvidence,
} from '../../scripts/release-validation/account-service-delivery-wrapper.mjs';
function evidence() {
  const subject = (position, digest) => ({
    workspace: 'a',
    credential: 'b',
    position,
    digest,
    epoch: 1,
  });
  const a = subject(1, 'aa'.repeat(32)),
    b = subject(1, 'bb'.repeat(32)),
    c = subject(2, 'cc'.repeat(32));
  const response = (kind, s) => ({
    kind: 'decision',
    bytes: Buffer.from(
      JSON.stringify(
        kind === 'accepted'
          ? [
              'done/position-response/v1',
              1,
              kind,
              s.workspace,
              s.credential,
              s.position,
              '00'.repeat(32),
              1,
              false,
              1,
              s.digest,
              'ff'.repeat(64),
            ]
          : [
              'done/position-response/v1',
              1,
              kind,
              s.workspace,
              s.credential,
              s.position,
              s.digest,
              1,
              'wrong-generation',
              '00'.repeat(32),
              'ff'.repeat(64),
            ],
      ),
    ).toString('hex'),
  });
  const ra = response('refused', a),
    rb = response('accepted', b),
    rc = response('accepted', c);
  const rows = [
    { ordinal: 1, kind: 'refused', position: 1, digest: a.digest },
    { ordinal: 2, kind: 'accepted', position: 1, digest: b.digest },
    { ordinal: 3, kind: 'accepted', position: 2, digest: c.digest },
  ];
  const decision = (s, result, kind, firstRows, afterRows, first = result) => ({
    kind: 'decision',
    subject: s,
    requestHash: 'dd'.repeat(32),
    first,
    firstRows,
    result,
    proofKind: kind,
    rows: afterRows,
  });
  const observation = (kind, rows, other = {}) => ({
    kind,
    before: 'ee'.repeat(32),
    after: 'ee'.repeat(32),
    rows,
    ...other,
  });
  const history = {
    commands: ['refuse', 'before', 'retry', 'after', 'gap', 'future', 'restart'],
    observations: [
      decision(a, ra, 'refused', rows.slice(0, 1), rows.slice(0, 1)),
      decision(b, rb, 'accepted', rows.slice(0, 1), rows.slice(0, 2), { kind: 'unknown' }),
      observation('retry', rows.slice(0, 2), { index: 0, result: ra }),
      decision(c, rc, 'accepted', rows, rows, { kind: 'unknown' }),
      observation('unknown', rows, { result: { kind: 'unknown' } }),
      observation('unknown', rows, { result: { kind: 'unknown' } }),
      observation('restart', rows),
    ],
    recovered: [ra, rb, rc],
    finalRows: rows,
  };
  return {
    'control-commit.json': {
      baseline: { outcome: 'accepted', persisted: 1, account: 'active' },
      outcome: 'accepted',
      persisted: 0,
      account: 'active',
    },
    'control-generation.json': {
      baseline: { outcome: 'refused', persisted: 1, account: 'active' },
      outcome: 'accepted',
      persisted: 1,
      account: 'active',
    },
    'control-current.json': {
      baseline: { outcome: 'unknown', persisted: 0, account: 'pending' },
      outcome: 'accepted',
      persisted: 1,
      account: 'pending',
    },
    'control-witness.json': {
      baseline: { outcome: 'unknown', persisted: 0, account: 'active' },
      outcome: 'accepted',
      persisted: 1,
      account: 'active',
    },
    'generated.json': {
      seed: 9822026,
      status: 'passed',
      histories: Array.from({ length: 80 }, () => structuredClone(history)),
    },
  };
}
test('service-delivery wrapper resolves the exact supported command and excludes its retired browser child', () => {
  const graph = JSON.parse(readFileSync('docs/release-validation-graph.json')),
    m = compileManifest(process.cwd(), graph);
  const [stage, ...rest] = selectStages(m, 'wrapper-account-service-delivery');
  assert.deepEqual(rest, []);
  validateStage(stage);
  assert.equal(stage.expect.cases.length, 32);
  assert.equal(stage.expect.steps.length, 1);
  assert.equal(stage.expect.historyInputs[0].reference, '2cb42a2');
  assert.equal(stage.fixture, undefined);
  assert.equal(stage.deadlineMs, 95000);
  assert.equal(stage.expect.steps[0].deadlineMs, 90000);
  assert.deepEqual(stage.fileOutputs.required, serviceDeliveryReports);
  assert(m.rows.some((r) => r.kind === 'command' && r.requires?.includes(stage.id)));
  assert(m.exclusions.some((r) => r.id === 'test:test/account-service-delivery/native.test.mjs'));
  assert(
    !readFileSync(serviceDeliveryCampaign, 'utf8').includes(
      'test/account-service-delivery/native.test.mjs',
    ),
  );
  for (const changes of [
    { argv: [...stage.argv, '--case', 'native'] },
    { env: { MODE: 'other' } },
    { variant: 'current' },
    { deadlineMs: 95001 },
    { fixture: { kind: 'chromium-cdp', startupMs: 15000 } },
    { fileOutputs: undefined },
    { expect: { kind: 'exit', exitCodes: [0] } },
    { expect: { ...stage.expect, historyInputs: [] } },
    { expect: { ...stage.expect, cases: stage.expect.cases.slice(1) } },
  ])
    assert.throws(() => validateStage({ ...stage, ...changes }));
  graph.extraRoots.push({
    id: 'service-delivery-filter',
    argv: ['node', serviceDeliveryCampaign, '--case', 'native'],
  });
  assert(
    compileManifest(process.cwd(), graph).rows.find(
      (r) => r.id === 'command:service-delivery-filter:0',
    ).blocked,
  );
});
test('service-delivery child trace requires the exact four-file case domain, nonce and completion', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'done-service-delivery-trace-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'case-reports'));
  const s = serviceDeliveryCampaignStage(process.cwd()),
    trace = {
      schema: 1,
      adapter: 'campaign-v1',
      nonce: 'fresh',
      phase: 'complete',
      steps: s.expect.steps.map(({ expect: _e, ...step }) => ({
        ...step,
        phase: 'complete',
        code: 0,
        timedOut: false,
      })),
    };
  const report = {
    schema: 1,
    nonce: 'fresh:service',
    phase: 'complete',
    cases: s.expect.cases,
    errors: [],
    summary: {
      success: true,
      counts: { tests: s.expect.cases.length, failed: 0, cancelled: 0, skipped: 0, todo: 0 },
    },
  };
  const run = (trace, report) => {
    writeFileSync(join(dir, 'case-reports/service.json'), JSON.stringify(report));
    return reconcileCampaignTrace(s.expect.steps, trace, 'fresh', dir, reconcileCases);
  };
  assert.deepEqual(run(trace, report).cases, s.expect.cases);
  for (const alter of [
    (v) => v.report.cases.pop(),
    (v) => (v.report.nonce = 'stale'),
    (v) => (v.trace.steps[0].timedOut = true),
    (v) => v.trace.steps[0].argv.pop(),
    (v) => (v.report.summary.success = false),
  ]) {
    const v = structuredClone({ trace, report });
    alter(v);
    assert.throws(() => run(v.trace, v.report));
  }
});
test('service-delivery requires successful summary, exact source inventory and all retained observations', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'done-service-delivery-reports-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const sources = [{ path: serviceDeliveryCampaign, sha256: 'a'.repeat(64) }],
    reports = {
      ...evidence(),
      'sources.json': sources,
      'summary.json': {
        status: 'passed',
        startedAt: '2026-09-15T00:00:00.000Z',
        completedAt: '2026-09-15T00:00:01.000Z',
        stages: serviceDeliverySteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
      },
    };
  const save = (r) => {
    for (const [file, value] of Object.entries(r))
      writeFileSync(join(dir, file), JSON.stringify(value));
    for (const file of ['results.xml', 'service.log']) writeFileSync(join(dir, file), 'observed');
  };
  save(reports);
  reconcileServiceDeliveryReports(dir, sources);
  for (const alter of [
    (r) => (r['summary.json'].status = 'failed'),
    (r) => r['summary.json'].stages.pop(),
    (r) => (r['sources.json'][0].sha256 = 'b'.repeat(64)),
  ]) {
    const bad = structuredClone(reports);
    alter(bad);
    save(bad);
    assert.throws(() => reconcileServiceDeliveryReports(dir, sources));
  }
  for (const file of [...Object.keys(reports), 'results.xml', 'service.log']) {
    save(reports);
    rmSync(join(dir, file));
    assert.throws(() => reconcileServiceDeliveryReports(dir, sources));
  }
});
test('160 generated service control corruptions reject ineffective normal or mutated evidence', () => {
  const reports = evidence();
  reconcileServiceDeliveryEvidence(reports);
  fc.assert(
    fc.property(fc.constantFrom('commit', 'generation', 'current', 'witness'), (name) => {
      for (const alter of [
        (c) => (c.baseline.persisted ^= 1),
        (c) => (c.baseline.outcome = 'unrelated'),
        (c) => (c.outcome = 'unknown'),
        (c) => (c.persisted ^= 1),
        (c) => (c.account = 'unrelated'),
      ]) {
        const bad = structuredClone(reports);
        alter(bad['control-' + name + '.json']);
        assert.throws(() => reconcileServiceDeliveryEvidence(bad));
      }
    }),
    { seed: 150957, numRuns: 160 },
  );
});
test('160 generated service history corruptions reject lost observations, changed retries, commit cuts and ledger rows', () => {
  const reports = evidence();
  reconcileServiceDeliveryEvidence(reports);
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 79 }), (index) => {
      for (const alter of [
        (r) => r.histories[index].observations.pop(),
        (r) => r.histories[index].observations[1].firstRows.pop(),
        (r) => r.histories[index].observations[3].firstRows.pop(),
        (r) => (r.histories[index].observations[2].result = { kind: 'unknown' }),
        (r) => (r.histories[index].observations[4].after = 'ab'.repeat(32)),
        (r) => (r.histories[index].observations[0].proofKind = 'accepted'),
        (r) => (r.histories[index].observations[0].subject.digest = 'ab'.repeat(32)),
        (r) => r.histories[index].observations[1].rows[1].position++,
        (r) => r.histories[index].recovered.pop(),
        (r) => r.histories[index].finalRows.pop(),
        (r) => r.histories.pop(),
        (r) => (r.status = 'running'),
      ]) {
        const bad = structuredClone(reports);
        alter(bad['generated.json']);
        assert.throws(() => reconcileServiceDeliveryEvidence(bad));
      }
    }),
    { seed: 150958, numRuns: 160 },
  );
});
