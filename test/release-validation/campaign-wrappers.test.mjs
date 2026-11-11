import {
  encodeInboundBatch,
  encodeInboundBatchPages,
} from '../../account-protocol/inboundBatch.ts';
import {
  boundsCampaign,
  boundsCampaignStage,
  boundsSteps,
  boundsReports,
  boundsReference,
  boundsHistoricalFiles,
  reconcileBoundsReports,
  reconcileBoundsCodecs,
  reconcileBoundsUpper,
  reconcileBoundsControls,
  reconcileBoundsVersions,
  reconcileBoundsReplay,
  reconcileBoundsNativeControls,
} from '../../scripts/release-validation/account-admission-bounds-wrapper.mjs';
import {
  activationCampaign,
  activationCampaignStage,
  activationSteps,
  activationReports,
  reconcileActivationReports,
  reconcileActivationEvidence,
} from '../../scripts/release-validation/account-activation-wrapper.mjs';
import {
  activationReference,
  activationHistoricalFiles,
} from '../../scripts/account-activation/historical-inputs.mjs';
import { validateHistoricalInputs } from '../../scripts/release-validation/historical-inputs.mjs';
import {
  serviceInboundCampaign,
  serviceInboundCampaignStage,
  serviceInboundSteps,
  serviceInboundReports,
  reconcileServiceInboundReports,
  reconcileServiceInboundEvidence,
} from '../../scripts/release-validation/account-service-inbound-wrapper.mjs';
import {
  syncCampaign,
  syncCampaignStage,
  syncSteps,
  syncReports,
  reconcileSyncReports,
  reconcileSyncEvidence,
} from '../../scripts/release-validation/account-sync-wrapper.mjs';
import {
  receiveDriverCampaign,
  receiveDriverCampaignStage,
  receiveDriverSteps,
  receiveDriverReports,
  reconcileReceiveDriverReports,
  reconcileReceiveDriverEvidence,
} from '../../scripts/release-validation/account-receive-driver-wrapper.mjs';
import {
  receiveTransportCampaign,
  receiveTransportCampaignStage,
  receiveTransportSteps,
  receiveTransportReports,
  reconcileReceiveTransportReports,
  reconcileReceiveTransportEvidence,
} from '../../scripts/release-validation/account-receive-transport-wrapper.mjs';
import {
  receiveEditorCampaign,
  receiveEditorCampaignStage,
  receiveEditorSteps,
  receiveEditorReports,
  reconcileReceiveEditorReports,
  reconcileReceiveEditorEvidence,
} from '../../scripts/release-validation/account-receive-editor-wrapper.mjs';
import { manifestSnapshot } from '../../scripts/release-validation/manifest-snapshot.mjs';
import {
  receiveCampaign,
  receiveCampaignStage,
  receiveSteps,
  receiveReports,
  reconcileReceiveReports,
  reconcileReceiveEvidence,
} from '../../scripts/release-validation/account-receive-wrapper.mjs';
import {
  inboundCodecsCampaign,
  inboundCodecsCampaignStage,
  inboundCodecsSteps,
  inboundCodecsReports,
  inboundCodecsMutations,
  reconcileInboundCodecsReports,
  reconcileInboundCodecsEvidence,
} from '../../scripts/release-validation/account-inbound-codecs-wrapper.mjs';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import * as Y from 'yjs';
import {
  inboundPrepCampaign,
  inboundPrepCampaignStage,
  inboundPrepSteps,
  inboundPrepReports,
  reconcileInboundPrepReports,
  reconcileInboundPrepEvidence,
} from '../../scripts/release-validation/account-inbound-prep-wrapper.mjs';
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
      baseline: { outcome: 'unknown', persisted: 1, account: 'active' },
      redundant: Array(2).fill({ kind: 'unknown', reason: 'ledger-integrity' }),
      outcome: 'accepted',
      persisted: 2,
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

// Deliberately synthetic report oracle control. No model, receiver or crypto encoder
// is imported; these tiny plaintext updates only exercise report reconciliation.
function inboundEvidence() {
  const docs = [new Y.Doc({ gc: false }), new Y.Doc({ gc: false }), new Y.Doc({ gc: false })];
  docs.forEach((d, i) => (d.clientID = 700 + i));
  const [base, a, b] = docs,
    hex = (bytes) => Buffer.from(bytes).toString('hex');
  const update = (doc, f) => {
    const sv = Y.encodeStateVector(doc);
    f();
    return hex(Y.encodeStateAsUpdate(doc, sv));
  };
  try {
    base.getText('master').insert(0, 'base');
    const baseline = hex(Y.encodeStateAsUpdate(base));
    Y.applyUpdate(a, Buffer.from(baseline, 'hex'));
    Y.applyUpdate(b, Buffer.from(baseline, 'hex'));
    const a1 = update(a, () => a.getText('master').insert(4, 'X'));
    Y.applyUpdate(b, Buffer.from(a1, 'hex'));
    const b1 = update(b, () => b.getText('master').insert(5, 'Y')),
      b2 = update(b, () => b.getText('master').delete(4, 1)),
      a2 = update(a, () => a.getText('master').insert(5, 'Z'));
    const entries = [a1, a2, b1, b2].map((u, i) => ({
      publisher: (i < 2 ? '11' : '22').repeat(16),
      position: (i % 2) + 1,
      envelope: 'aa' + i + '0',
      proof: 'bb' + i + '0',
      request: 'cc',
      page: 'dd',
      previous: '00'.repeat(32),
      link: 'ee'.repeat(32),
      updates: [u],
    }));
    const observe = (indices) => {
      const doc = new Y.Doc({ gc: false }),
        cursor = {};
      try {
        Y.applyUpdate(doc, Buffer.from(baseline, 'hex'));
        for (const i of indices) {
          const e = entries[i];
          cursor[e.publisher] = e.position;
          Y.applyUpdate(doc, Buffer.from(e.updates[0], 'hex'));
        }
        return {
          cursor,
          text: doc.getText('master').toString(),
          pending: doc.store.pendingStructs !== null || doc.store.pendingDs !== null,
          captures: 0,
          ledgerHash: createHash('sha256')
            .update(
              JSON.stringify(
                indices.map((i) => [
                  'received',
                  entries[i].publisher,
                  entries[i].position,
                  entries[i].envelope,
                  entries[i].proof,
                ]),
              ),
            )
            .digest('hex'),
        };
      } finally {
        doc.destroy();
      }
    };
    // Gap, pre-commit cut, pending dependency, duplicate, close, accepted cut-after,
    // second publisher continuation and final dependency drain are all represented.
    const actions = [
        [1, 'none', false],
        [0, 'before', false],
        [2, 'none', false],
        [2, 'none', false],
        [0, 'none', true],
        [3, 'after', false],
        [0, 'none', false],
      ],
      accepted = [[], [], [2], [2], [2], [2, 3], [2, 3, 0]],
      final = observe([2, 3, 0, 1]);
    const h = {
      history: actions.map(([index, cut, close]) => ({ index, cut, close, compact: true })),
      observations: accepted.map(observe),
      final,
    };
    return {
      'fixtures.json': {
        baseline,
        baselineId: '00'.repeat(32),
        authority: { reader: '33'.repeat(16) },
        expected: final.text,
        entries,
      },
      'generated.json': {
        status: 'passed',
        seed: 9142026,
        runs: 300,
        histories: Array.from({ length: 300 }, () => structuredClone(h)),
      },
      'control-deletion-coverage.json': {
        sameStateVector: true,
        sameSnapshot: false,
        complete: 'ase',
        omittedDeletion: 'base',
      },
      'control-baseline.json': {
        signatureWithAttackerBaseline: 'accepted',
        heldBaseline: 'unknown',
        missingGenesis: { pending: true, text: '', expected: final.text },
      },
      'control-split.json': {
        received: 1,
        contentRecords: 0,
        error: 'Error: Content does not cover',
      },
      'control-pending.json': { expected: final.text, afterDroppingPendingDeletion: 'baseX' },
      'control-early-promotion.json': {
        beforeKill: 'baseXlocal',
        coldWithoutRemoteCommit: 'base',
        pending: true,
      },
      'control-global-cursor.json': { expected: final.text, actual: 'baseXZ', cursor: 2 },
      'control-relabel.json': {
        originalPublisher: '11'.repeat(16),
        newCapsulePublisher: '33'.repeat(16),
        sameUpdate: true,
        correctReceiverCapsules: 0,
      },
    };
  } finally {
    docs.forEach((d) => d.destroy());
  }
}
test('inbound preparation wrapper binds two exact invocations, 73 cases and both vector inputs', () => {
  const graph = JSON.parse(readFileSync('docs/release-validation-graph.json')),
    m = compileManifest(process.cwd(), graph),
    [s, ...rest] = selectStages(m, 'wrapper-account-inbound-prep');
  assert.deepEqual(rest, []);
  validateStage(s);
  assert.equal(s.expect.cases.length, 73);
  assert.equal(s.deadlineMs, 120000);
  assert.equal(s.fixture, undefined);
  assert.deepEqual(s.fileOutputs.required, inboundPrepReports);
  assert(m.rows.some((r) => r.kind === 'command' && r.requires?.includes(s.id)));
  for (const change of [
    { env: { MODE: 'other' } },
    { argv: [...s.argv, '--case', 'one'] },
    { fixture: { kind: 'chromium-cdp', startupMs: 15000 } },
    { deadlineMs: 120001 },
    { fileOutputs: undefined },
    { expect: { kind: 'exit', exitCodes: [0] } },
    { expect: { ...s.expect, cases: s.expect.cases.slice(1) } },
    { expect: { ...s.expect, dataInputs: s.expect.dataInputs.slice(1) } },
  ])
    assert.throws(() => validateStage({ ...s, ...change }));
  graph.extraRoots.push({
    id: 'inbound-prep-filter',
    argv: ['node', inboundPrepCampaign, '--case', 'one'],
  });
  assert(
    compileManifest(process.cwd(), graph).rows.find((r) => r.id === 'command:inbound-prep-filter:0')
      .blocked,
  );
  for (const retired of ['transport', 'driver'])
    assert(m.exclusions.some((r) => r.argv?.[1] === 'scripts/account-' + retired + '/run.mjs'));
});
test('inbound preparation accepts module scheduling order but rejects missing, duplicate, retried or stale child reports', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'done-inbound-prep-trace-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'case-reports'));
  const s = inboundPrepCampaignStage(process.cwd()),
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
  const reports = s.expect.steps.map((step) => ({
    schema: 1,
    adapter: 'vitest-v1',
    nonce: 'fresh:' + step.name,
    reason: 'passed',
    modules: [...step.expect.files].reverse().map((file) => ({ file, state: 'passed' })),
    errors: [],
    cases: step.expect.cases.map((c) => ({
      ...c,
      durationMs: 0,
      retryCount: 0,
      repeatCount: 0,
      expectedFailure: false,
      mode: 'run',
      errors: [],
    })),
  }));
  const run = (v) => {
    v.reports.forEach((report, i) =>
      writeFileSync(
        join(dir, 'case-reports/' + s.expect.steps[i].name + '.json'),
        JSON.stringify(report),
      ),
    );
    return reconcileCampaignTrace(s.expect.steps, v.trace, 'fresh', dir, reconcileCases);
  };
  assert.deepEqual(run({ trace, reports }).cases, s.expect.cases);
  for (const alter of [
    (v) => v.reports[1].modules.pop(),
    (v) => v.reports[1].modules.push(v.reports[1].modules[0]),
    (v) => v.reports[1].cases.pop(),
    (v) => v.reports[1].cases[0].retryCount++,
    (v) => (v.reports[0].nonce = 'stale'),
    (v) => v.trace.steps[1].argv.pop(),
    (v) => (v.trace.steps[0].timedOut = true),
  ]) {
    const bad = structuredClone({ trace, reports });
    alter(bad);
    assert.throws(() => run(bad));
  }
});
test('inbound preparation requires every report, terminal summary and exact source inventory', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'done-inbound-prep-reports-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const sources = [{ path: inboundPrepCampaign, sha256: 'a'.repeat(64) }],
    r = {
      ...inboundEvidence(),
      'sources.json': sources,
      'summary.json': {
        status: 'passed',
        startedAt: '2026-09-15T00:00:00.000Z',
        completedAt: '2026-09-15T00:00:01.000Z',
        stages: inboundPrepSteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
      },
    };
  const save = (reports) => {
    for (const [file, value] of Object.entries(reports))
      writeFileSync(join(dir, file), JSON.stringify(value));
    for (const file of ['results.xml', 'preparation.log', 'primitives.log'])
      writeFileSync(join(dir, file), 'observed');
  };
  save(r);
  reconcileInboundPrepReports(dir, sources);
  for (const alter of [
    (r) => (r['summary.json'].status = 'failed'),
    (r) => r['summary.json'].stages.pop(),
    (r) => (r['sources.json'][0].sha256 = 'b'.repeat(64)),
  ]) {
    const bad = structuredClone(r);
    alter(bad);
    save(bad);
    assert.throws(() => reconcileInboundPrepReports(dir, sources));
  }
  for (const file of [...Object.keys(r), 'results.xml', 'preparation.log', 'primitives.log']) {
    save(r);
    rmSync(join(dir, file));
    assert.throws(() => reconcileInboundPrepReports(dir, sources));
  }
});
test('160 generated inbound history corruptions reject cursor, pending, text, ledger, capture and final-drain changes', () => {
  const r = inboundEvidence();
  reconcileInboundPrepEvidence(r);
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 299 }), (index) => {
      for (const alter of [
        (h) => h.observations.pop(),
        (h) => (h.observations[0].cursor['11'.repeat(16)] = 1),
        (h) => (h.observations[2].pending = false),
        (h) => (h.observations[2].text += 'lost'),
        (h) => (h.observations[4].ledgerHash = '00'.repeat(32)),
        (h) => h.observations[5].captures++,
        (h) => (h.final.pending = true),
        (h) => (h.final.cursor['11'.repeat(16)] = 1),
        (h) => (h.history[2].close = true),
      ]) {
        const bad = structuredClone(r);
        alter(bad['generated.json'].histories[index]);
        assert.throws(() => reconcileInboundPrepEvidence(bad));
      }
    }),
    { seed: 150959, numRuns: 160 },
  );
});
test('160 generated inbound control corruptions reject counterexamples that no longer demonstrate their failure', () => {
  const r = inboundEvidence();
  reconcileInboundPrepEvidence(r);
  const alterations = [
    ['deletion-coverage', (c) => (c.sameSnapshot = true)],
    ['baseline', (c) => (c.heldBaseline = 'accepted')],
    ['baseline', (c) => (c.missingGenesis.pending = false)],
    ['split', (c) => (c.contentRecords = 1)],
    ['pending', (c) => (c.afterDroppingPendingDeletion = c.expected)],
    ['early-promotion', (c) => (c.pending = false)],
    ['global-cursor', (c) => (c.actual = c.expected)],
    ['relabel', (c) => (c.sameUpdate = false)],
  ];
  fc.assert(
    fc.property(fc.integer({ min: 0, max: alterations.length - 1 }), (index) => {
      const bad = structuredClone(r),
        [name, alter] = alterations[index];
      alter(bad['control-' + name + '.json']);
      assert.throws(() => reconcileInboundPrepEvidence(bad));
    }),
    { seed: 150960, numRuns: 160 },
  );
});

function codecsEvidence(source) {
  const hash = (v) => createHash('sha256').update(v).digest('hex'),
    hex = (v) => Buffer.from(JSON.stringify(v)).toString('hex');
  const request = hex([
      'done/private-read/v2',
      2,
      'service',
      'origin',
      'workspace',
      'reader',
      'publisher',
      'lineage',
      'head',
      1,
      0,
      1,
      'nonce',
      30000,
      'signature',
    ]),
    page = hex([
      'done/private-read-page/v2',
      2,
      hash(Buffer.from(request, 'hex')),
      1,
      1,
      [['aa', 'bb']],
      'signature',
    ]),
    record = hex([
      'done/account-inbound/v1',
      1,
      'baseline',
      'lineage',
      'head',
      'reader',
      'publisher',
      'received',
      1,
      'previous',
      'link',
      request,
      page,
    ]);
  const doc = new Y.Doc();
  doc.clientID = 999;
  doc.getText('master').insert(0, 'test');
  const update = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('hex');
  doc.destroy();
  const r = {
    'independent-bytes.json': {
      request,
      page,
      record,
      updates: [update],
      observedRecord: record,
      observedUpdates: [update],
    },
    'generated.json': {
      seed: 9152026,
      status: 'passed',
      runs: 400,
      histories: Array.from({ length: 400 }, () => ({
        text: 'test',
        nonce: 1,
        update,
        expectedRecord: 'aa'.repeat(32),
        observedRecord: 'aa'.repeat(32),
        coldRecord: 'aa'.repeat(32),
        observedUpdates: [update],
        coldUpdates: [update],
        actorRefusal: 'Error: actor',
      })),
    },
    'wire-corruptions.json': {
      seed: 9162026,
      status: 'passed',
      page: hash(Buffer.from(page, 'hex')),
      mutations: Array.from({ length: 500 }, () => ({
        index: 0,
        mask: 1,
        original: 91,
        changed: 90,
        reason: 'Error: invalid frame',
      })),
    },
  };
  for (const [mode, changes] of Object.entries(inboundCodecsMutations)) {
    let after = source;
    for (const [from, to] of changes) after = after.replace(from, to);
    if (mode === 'prefix-proof')
      after =
        "import { decodePositionResponse } from '../../account-protocol/positionDecision';\n" +
        after;
    const observation =
      mode === 'buffer-copy'
        ? {
            normalRequest: request,
            normalRetained: request,
            mutantRequest: request,
            mutantRetained: request + '00',
            coldError: 'Error: request',
          }
        : mode === 'record-binding'
          ? {
              normalError: 'Error: record',
              mutantKind: 'received',
              storedBaseline: 'ab',
              heldBaseline: 'cd',
            }
          : mode === 'late-close'
            ? { normalError: 'Error: closed', mutantKind: 'received', closed: true }
            : {
                normalError: 'Error: unverified',
                mutantKind: 'received',
                actor: { id: (mode === 'actor' ? '22' : '11').repeat(16), kind: 'human' },
                updates: mode === 'batch-count' ? 256 : 1,
                prefix: { position: mode === 'prefix-proof' ? 1 : 0 },
                record: 'aa'.repeat(32),
              };
    r['control-' + mode + '.json'] = {
      mode,
      changes,
      mutation: {
        before: hash(source),
        after: hash(after),
        hits: changes.length,
        bundle: 'bb'.repeat(32),
      },
      observation,
      request,
      page,
      outcome: 'synthetic report control',
    };
  }
  return r;
}
test('inbound codecs wrapper retains three exact commands, 118 cases and isolated preparation reports', () => {
  const graph = JSON.parse(readFileSync('docs/release-validation-graph.json')),
    m = compileManifest(process.cwd(), graph),
    [s, ...rest] = selectStages(m, 'wrapper-account-inbound-codecs');
  assert.deepEqual(rest, []);
  validateStage(s);
  assert.equal(s.expect.cases.length, 118);
  assert.equal(s.expect.steps.length, 3);
  assert.equal(s.expect.steps[2].kind, 'exit');
  assert.equal(s.deadlineMs, 135000);
  assert.equal(s.fixture, undefined);
  assert.deepEqual(s.fileOutputs.required, inboundCodecsReports);
  assert.equal(inboundCodecsReports.length, 28);
  assert(m.rows.some((r) => r.kind === 'command' && r.requires?.includes(s.id)));
  for (const change of [
    { argv: [...s.argv, '--case', 'one'] },
    { env: { MODE: 'other' } },
    { fileOutputs: undefined },
    { deadlineMs: 135001 },
    { fixture: { kind: 'chromium-cdp', startupMs: 15000 } },
    { expect: { kind: 'exit', exitCodes: [0] } },
    { expect: { ...s.expect, cases: s.expect.cases.slice(1) } },
    { expect: { ...s.expect, dataInputs: s.expect.dataInputs.slice(1) } },
  ])
    assert.throws(() => validateStage({ ...s, ...change }));
  const altered = structuredClone(s);
  altered.expect.steps[2].argv.pop();
  assert.throws(() => validateStage(altered));
  graph.extraRoots.push({
    id: 'inbound-codecs-filter',
    argv: ['node', inboundCodecsCampaign, '--case', 'one'],
  });
  assert(
    compileManifest(process.cwd(), graph).rows.find(
      (r) => r.id === 'command:inbound-codecs-filter:0',
    ).blocked,
  );
});
test('inbound codecs trace requires both exact Vitest domains and the terminal Node import', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'done-inbound-codecs-trace-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'case-reports'));
  const s = inboundCodecsCampaignStage(process.cwd()),
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
  const reports = s.expect.steps
    .filter((s) => s.kind === 'vitest')
    .map((step) => ({
      schema: 1,
      adapter: 'vitest-v1',
      nonce: 'fresh:' + step.name,
      reason: 'passed',
      modules: step.expect.files.map((file) => ({ file, state: 'passed' })),
      errors: [],
      cases: step.expect.cases.map((c) => ({
        ...c,
        durationMs: 0,
        retryCount: 0,
        repeatCount: 0,
        expectedFailure: false,
        mode: 'run',
        errors: [],
      })),
    }));
  const run = (v) => {
    v.reports.forEach((report, i) =>
      writeFileSync(
        join(dir, 'case-reports/' + s.expect.steps[i].name + '.json'),
        JSON.stringify(report),
      ),
    );
    return reconcileCampaignTrace(s.expect.steps, v.trace, 'fresh', dir, reconcileCases);
  };
  assert.deepEqual(run({ trace, reports }).cases, s.expect.cases);
  for (const alter of [
    (v) => v.trace.steps.pop(),
    (v) => (v.trace.steps[2].code = 1),
    (v) => (v.trace.steps[1].timedOut = true),
    (v) => v.reports[0].cases.pop(),
    (v) => (v.reports[0].nonce = 'stale'),
    (v) => v.reports[1].cases[0].retryCount++,
  ]) {
    const bad = structuredClone({ trace, reports });
    alter(bad);
    assert.throws(() => run(bad));
  }
});
test('inbound codecs requires observed reports, pinned mutation source and nested preparation evidence', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'done-inbound-codecs-reports-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'regression-artifacts'));
  const source = readFileSync('src/crdt/accountInbound.ts', 'utf8'),
    sources = [
      { path: inboundCodecsCampaign, sha256: 'a'.repeat(64) },
      {
        path: 'src/crdt/accountInbound.ts',
        sha256: createHash('sha256').update(source).digest('hex'),
      },
    ],
    reports = {
      ...codecsEvidence(source),
      ...Object.fromEntries(
        Object.entries(inboundEvidence()).map(([f, v]) => ['regression-artifacts/' + f, v]),
      ),
      'sources.json': sources,
      'summary.json': {
        status: 'passed',
        startedAt: '2026-09-15T00:00:00.000Z',
        completedAt: '2026-09-15T00:00:01.000Z',
        stages: inboundCodecsSteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
      },
    };
  const aux = ['results.xml', ...inboundCodecsSteps.map((s) => s.name + '.log')],
    save = (r) => {
      for (const [file, value] of Object.entries(r))
        writeFileSync(join(dir, file), JSON.stringify(value));
      for (const file of aux) writeFileSync(join(dir, file), 'observed');
    };
  save(reports);
  reconcileInboundCodecsReports(dir, sources, process.cwd());
  for (const alter of [
    (r) => (r['summary.json'].status = 'failed'),
    (r) => (r['sources.json'][0].sha256 = 'b'.repeat(64)),
    (r) => (r['regression-artifacts/generated.json'].histories[0].final.pending = true),
  ]) {
    const bad = structuredClone(reports);
    alter(bad);
    save(bad);
    assert.throws(() => reconcileInboundCodecsReports(dir, sources, process.cwd()));
  }
  for (const file of [...Object.keys(reports), ...aux]) {
    save(reports);
    rmSync(join(dir, file));
    assert.throws(() => reconcileInboundCodecsReports(dir, sources, process.cwd()));
  }
});
test('160 generated codec report corruptions reject lost cold records, wrong plaintext and ineffective wire changes', () => {
  const source = readFileSync('src/crdt/accountInbound.ts', 'utf8'),
    r = codecsEvidence(source);
  reconcileInboundCodecsEvidence(r, source);
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 399 }), (index) => {
      for (const alter of [
        (r) => (r['generated.json'].histories[index].coldRecord = '00'.repeat(32)),
        (r) => (r['generated.json'].histories[index].observedUpdates = []),
        (r) => (r['generated.json'].histories[index].text = 'different'),
        (r) => (r['generated.json'].histories[index].actorRefusal = 'not refused'),
        (r) => (r['wire-corruptions.json'].mutations[index].changed ^= 1),
        (r) => (r['wire-corruptions.json'].mutations[index].reason = ''),
        (r) => (r['independent-bytes.json'].observedRecord += '00'),
      ]) {
        const bad = structuredClone(r);
        alter(bad);
        assert.throws(() => reconcileInboundCodecsEvidence(bad, source));
      }
    }),
    { seed: 150961, numRuns: 160 },
  );
});
test('160 generated codec control corruptions reject wrong mutation source and non-discriminating outcomes', () => {
  const source = readFileSync('src/crdt/accountInbound.ts', 'utf8'),
    r = codecsEvidence(source),
    modes = Object.keys(inboundCodecsMutations);
  reconcileInboundCodecsEvidence(r, source);
  fc.assert(
    fc.property(fc.integer({ min: 0, max: modes.length - 1 }), (index) => {
      const mode = modes[index];
      for (const alter of [
        (c) => (c.mutation.before = '00'.repeat(32)),
        (c) => (c.mutation.after = '00'.repeat(32)),
        (c) => c.mutation.hits++,
        (c) => {
          if (mode === 'buffer-copy') c.observation.mutantRetained = c.observation.mutantRequest;
          else c.observation.mutantKind = 'unknown';
        },
      ]) {
        const bad = structuredClone(r);
        alter(bad['control-' + mode + '.json']);
        assert.throws(() => reconcileInboundCodecsEvidence(bad, source));
      }
    }),
    { seed: 150962, numRuns: 160 },
  );
});

function receiveEvidence() {
  const hash = (v) => createHash('sha256').update(v).digest('hex'),
    hex = (b) => Buffer.from(b).toString('hex'),
    frame = (v) => hex(Buffer.from(JSON.stringify(v))),
    doc = new Y.Doc({ gc: false }),
    ledger = new Y.Doc({ gc: false });
  doc.clientID = 1919;
  ledger.clientID = 880;
  try {
    ledger.getText('master').insert(0, 'test');
    const insert = Y.encodeStateAsUpdate(ledger),
      sv = Y.encodeStateVector(ledger);
    ledger.getText('master').delete(0, 1);
    const deletion = Y.encodeStateAsUpdate(ledger, sv),
      unit = {
        text: 'test',
        n: 1,
        insert: hex(insert),
        deletion: hex(deletion),
        merged: hex(Y.mergeUpdates([insert, deletion])),
        missing: 'Error: coverage',
        withoutDeletion: 'Error: coverage',
      };
    const actions = ['before', 'after', 'none'].map((cut) => ({ cut, compact: true, cold: true })),
      frames = [],
      wires = [],
      observations = [],
      events = [];
    let previous = '00'.repeat(32);
    for (let i = 0; i < 3; i++) {
      const sv = Y.encodeStateVector(doc);
      doc.getText('remote-fixture').insert(i, String(i));
      frames.push(hex(Y.encodeStateAsUpdate(doc, sv)));
      wires.push('aa' + i + '0');
      const link = (i + 1).toString(16).padStart(64, '0'),
        request = frame([
          'done/private-read/v2',
          2,
          'service',
          'origin',
          'workspace',
          'reader',
          'publisher',
          'lineage',
          'head',
          1,
          i,
          1,
          'nonce',
          30000,
          'sig',
        ]),
        page = frame([
          'done/private-read-page/v2',
          2,
          hash(Buffer.from(request, 'hex')),
          3,
          i + 1,
          [[wires[i], 'aa']],
          'sig',
        ]),
        status = { state: 'ready', receivedThrough: i + 1, link, observedThrough: 3 };
      observations.push({
        cutCursor: i === 0 ? 0 : i === 1 ? 2 : null,
        request,
        page,
        link,
        result: { kind: i === 1 ? 'duplicate' : 'received', recorded: i !== 1, status },
        status,
      });
      events.push({
        seq: i * 2 + 3,
        bytes: frame([
          'done/account-inbound/v1',
          1,
          'baseline',
          'lineage',
          'head',
          'reader',
          'publisher',
          'received',
          i + 1,
          previous,
          link,
          request,
          page,
        ]),
      });
      previous = link;
    }
    const h = {
      actions,
      frames,
      wires,
      observations,
      events,
      content: [{ seq: 9, kind: 'state', bytes: hex(Y.encodeStateAsUpdate(doc)) }],
      value: '012',
      pending: false,
    };
    return {
      'control-coverage.json': {
        normalError: 'Error: coverage',
        omitted: ['startup fallback', 'owner reuse'],
        single: ['reuse', 'fallback'].map((branch) => ({ branch, error: 'Error: coverage' })),
        joint: { receivedThrough: 1 },
      },
      'control-witness.json': {
        normalError: 'Error: incomplete witness',
        changed: { receivedThrough: 0 },
      },
      'control-split.json': { readbackError: 'Error: coverage', coldError: 'Error: coverage' },
      'control-stored-page.json': {
        normalError: 'Error: unverified',
        changed: { receivedThrough: 1 },
      },
      'unit-ledger-histories.json': {
        status: 'passed',
        seed: 9172026,
        histories: Array.from({ length: 200 }, () => structuredClone(unit)),
      },
      'generated-native.json': {
        status: 'passed',
        seed: 9182026,
        runs: 12,
        histories: Array.from({ length: 12 }, () => structuredClone(h)),
      },
    };
  } finally {
    doc.destroy();
    ledger.destroy();
  }
}
test('receive wrapper binds the unchanged property/native commands, 68 cases, browser and old marker reader', () => {
  const graph = JSON.parse(readFileSync('docs/release-validation-graph.json')),
    m = compileManifest(process.cwd(), graph),
    [s, ...rest] = selectStages(m, 'wrapper-account-receive');
  assert.deepEqual(rest, []);
  validateStage(s);
  assert.equal(s.expect.cases.length, 68);
  assert.equal(s.deadlineMs, 360000);
  assert.equal(s.expect.steps[1].deadlineMs, 300000);
  assert.equal(s.expect.historyInputs[0].reference, '8378596');
  assert.equal(s.fixture.kind, 'chromium-cdp');
  assert.deepEqual(s.fileOutputs.required, receiveReports);
  assert.equal(receiveReports.length, 24);
  const recorded = manifestSnapshot(m);
  assert.deepEqual(JSON.parse(recorded), m);
  assert(Buffer.byteLength(recorded) <= 4 * 1024 * 1024);
  assert.throws(
    () => manifestSnapshot({ ...m, unreviewedPadding: 'x'.repeat(4 * 1024 * 1024) }),
    /Manifest size budget/,
  );
  assert(m.rows.some((r) => r.kind === 'command' && r.requires?.includes(s.id)));
  for (const change of [
    { env: { MODE: 'other' } },
    { argv: [...s.argv, '--case', 'one'] },
    { fixture: undefined },
    { deadlineMs: 360001 },
    { fileOutputs: undefined },
    { expect: { kind: 'exit', exitCodes: [0] } },
    { expect: { ...s.expect, cases: s.expect.cases.slice(1) } },
    { expect: { ...s.expect, historyInputs: [] } },
  ])
    assert.throws(() => validateStage({ ...s, ...change }));
  graph.extraRoots.push({ id: 'receive-filter', argv: ['node', receiveCampaign, '--case', 'one'] });
  assert(
    compileManifest(process.cwd(), graph).rows.find((r) => r.id === 'command:receive-filter:0')
      .blocked,
  );
});
test('receive trace requires both exact Vitest and native censuses with distinct nonces', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'done-receive-trace-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'case-reports'));
  const s = receiveCampaignStage(process.cwd()),
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
    },
    v = s.expect.steps[0].expect,
    n = s.expect.steps[1].expect;
  const reports = [
    {
      schema: 1,
      adapter: 'vitest-v1',
      nonce: 'fresh:properties',
      reason: 'passed',
      modules: v.files.map((file) => ({ file, state: 'passed' })),
      errors: [],
      cases: v.cases.map((c) => ({
        ...c,
        durationMs: 0,
        retryCount: 0,
        repeatCount: 0,
        expectedFailure: false,
        mode: 'run',
        errors: [],
      })),
    },
    {
      schema: 1,
      nonce: 'fresh:native',
      phase: 'complete',
      cases: n.cases,
      errors: [],
      summary: {
        success: true,
        counts: { tests: n.cases.length, failed: 0, cancelled: 0, skipped: 0, todo: 0 },
      },
    },
  ];
  const run = (v) => {
    v.reports.forEach((report, i) =>
      writeFileSync(
        join(dir, 'case-reports/' + s.expect.steps[i].name + '.json'),
        JSON.stringify(report),
      ),
    );
    return reconcileCampaignTrace(s.expect.steps, v.trace, 'fresh', dir, reconcileCases);
  };
  assert.deepEqual(run({ trace, reports }).cases, s.expect.cases);
  for (const alter of [
    (v) => v.reports[0].cases.pop(),
    (v) => v.reports[1].cases.pop(),
    (v) => (v.reports[0].nonce = 'fresh:native'),
    (v) => (v.reports[1].phase = 'running'),
    (v) => v.trace.steps[1].argv.pop(),
    (v) => (v.trace.steps[1].timedOut = true),
  ]) {
    const bad = structuredClone({ trace, reports });
    alter(bad);
    assert.throws(() => run(bad));
  }
});
test('receive reports require native histories and controls alongside preserved codec evidence', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'done-receive-reports-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = readFileSync('src/crdt/accountInbound.ts', 'utf8'),
    sources = [
      { path: receiveCampaign, sha256: 'a'.repeat(64) },
      {
        path: 'src/crdt/accountInbound.ts',
        sha256: createHash('sha256').update(source).digest('hex'),
      },
    ],
    r = {
      ...codecsEvidence(source),
      ...receiveEvidence(),
      'sources.json': sources,
      'summary.json': {
        status: 'passed',
        startedAt: '2026-09-15T00:00:00.000Z',
        completedAt: '2026-09-15T00:00:01.000Z',
        stages: receiveSteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
      },
    };
  const aux = ['results.xml', 'properties.log', 'native.log'],
    save = (r) => {
      for (const [file, value] of Object.entries(r))
        writeFileSync(join(dir, file), JSON.stringify(value));
      for (const file of aux) writeFileSync(join(dir, file), 'observed');
    };
  save(r);
  reconcileReceiveReports(dir, sources, process.cwd());
  for (const alter of [
    (r) => (r['summary.json'].status = 'failed'),
    (r) => (r['sources.json'][0].sha256 = 'b'.repeat(64)),
    (r) => r['generated-native.json'].histories[0].observations.pop(),
  ]) {
    const bad = structuredClone(r);
    alter(bad);
    save(bad);
    assert.throws(() => reconcileReceiveReports(dir, sources, process.cwd()));
  }
  for (const file of [...Object.keys(r), ...aux]) {
    save(r);
    rmSync(join(dir, file));
    assert.throws(() => reconcileReceiveReports(dir, sources, process.cwd()));
  }
});
test('160 generated receive report corruptions reject lost commit cuts, changed stored bytes and missing original coverage', () => {
  const r = receiveEvidence();
  reconcileReceiveEvidence(r);
  // A suffix with an absent dependency can leave snapshots unchanged; pending state must fail too.
  const pendingDoc = new Y.Doc({ gc: false });
  pendingDoc.clientID = 8888;
  pendingDoc.getText('remote-fixture').insert(0, 'dependency');
  const sv = Y.encodeStateVector(pendingDoc);
  pendingDoc.getText('remote-fixture').insert(10, 'suffix');
  const pending = Buffer.from(Y.encodeStateAsUpdate(pendingDoc, sv)).toString('hex');
  pendingDoc.destroy();
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 11 }), (index) => {
      for (const alter of [
        (h) => h.observations[0].cutCursor++,
        (h) => (h.observations[1].result.recorded = true),
        (h) => (h.observations[2].status.receivedThrough = 0),
        (h) => h.events.pop(),
        (h) => (h.observations[0].page = h.observations[1].page),
        (h) => (h.content[0].bytes = '0000'),
        (h) => (h.frames[0] = pending),
        (h) => (h.value = 'missing'),
      ]) {
        const bad = structuredClone(r);
        alter(bad['generated-native.json'].histories[index]);
        assert.throws(() => reconcileReceiveEvidence(bad));
      }
    }),
    { seed: 150963, numRuns: 160 },
  );
});
test('160 generated receive control and unit-ledger corruptions reject ineffective guards or deletion loss', () => {
  const r = receiveEvidence();
  reconcileReceiveEvidence(r);
  const changes = [
    (r) => r['control-coverage.json'].single.pop(),
    (r) => (r['control-coverage.json'].joint.receivedThrough = 0),
    (r) => (r['control-witness.json'].changed.receivedThrough = 1),
    (r) => (r['control-split.json'].coldError = ''),
    (r) => (r['control-stored-page.json'].normalError = ''),
    (r) =>
      (r['unit-ledger-histories.json'].histories[0].merged =
        r['unit-ledger-histories.json'].histories[0].insert),
    (r) => (r['unit-ledger-histories.json'].status = 'running'),
  ];
  fc.assert(
    fc.property(fc.integer({ min: 0, max: changes.length - 1 }), (index) => {
      const bad = structuredClone(r);
      changes[index](bad);
      assert.throws(() => reconcileReceiveEvidence(bad));
    }),
    { seed: 150964, numRuns: 160 },
  );
});

// Synthetic observations test the independent report checker, not product execution.
function receiveEditorEvidence() {
  const capsule = (id, bytes = [0, 0]) => ({
    id,
    sources: [{ actor: '11'.repeat(16), kind: 'human', bytes }],
  });
  const before = [
      capsule('startup'),
      { id: 'system-initial', sources: [{ actor: 'system', kind: 'system', bytes: [0, 1] }] },
    ],
    original = [1, 2, 3],
    extra = capsule('local', original);
  const status = (n) => ({
    state: 'ready',
    receivedThrough: n,
    observedThrough: n,
    link: (n ? 'ab' : '00').repeat(32),
  });
  const observe = (visible, n, captures) => ({
    visible,
    status: status(n),
    captures: structuredClone(captures),
  });
  const r = {};
  for (const side of ['before', 'after'])
    r['baseline-' + side + '.json'] = {
      side,
      initial: 'base',
      before,
      held: { visible: 'base', queuedVisible: 'base', resultPending: true },
      recovered: observe(
        side === 'after' ? 'REMOTE base' : 'base',
        side === 'after' ? 1 : 0,
        before,
      ),
      result: {
        kind: side === 'before' ? 'received' : 'duplicate',
        recorded: side === 'before',
        status: status(1),
      },
      final: observe('REMOTE base', 1, before),
    };
  r['control-early.json'] = {
    initial: 'base',
    before,
    held: { visible: 'REMOTE base', resultPending: true },
    recovered: observe('base', 0, before),
  };
  r['control-relabel.json'] = {
    initial: 'base',
    original,
    before,
    after: [...before, extra],
    observed: observe('REMOTE base', 1, [...before, extra]),
  };
  const actions = ['receive', 'local', 'duplicate', 'invalid', 'compact', 'restart'];
  const observations = actions.map((action, i) => ({
    action,
    ...observe(i ? 'R0 baseL' : 'R0 base', 1, i ? [...before, extra] : before),
    outcome:
      i === 0
        ? { kind: 'received', recorded: true, status: status(1) }
        : i === 2
          ? { kind: 'duplicate', recorded: false, status: status(1) }
          : i === 3
            ? 'receive-refused'
            : null,
  }));
  r['generated-editor.json'] = {
    status: 'passed',
    seed: 9202026,
    runs: 10,
    histories: Array.from({ length: 10 }, () =>
      structuredClone({
        initial: 'base',
        before,
        actions,
        observations,
        final: observe('R0 baseL', 1, [...before, extra]),
      }),
    ),
  };
  return r;
}
test('receive-editor wrapper preserves three original commands, 324 cases and disposable browser without unused history', () => {
  const graph = JSON.parse(readFileSync('docs/release-validation-graph.json')),
    m = compileManifest(process.cwd(), graph),
    [s, ...rest] = selectStages(m, 'wrapper-account-receive-editor');
  assert.deepEqual(rest, []);
  validateStage(s);
  assert.equal(s.expect.cases.length, 324);
  assert.deepEqual(
    s.expect.steps.map((s) => s.deadlineMs),
    [30000, 60000, 480000],
  );
  assert.equal(s.deadlineMs, 570000);
  assert.equal(s.expect.historyInputs, undefined);
  assert.equal(s.expect.dataInputs, undefined);
  assert.equal(s.expect.steps[0].expect.kind, 'exit');
  assert.equal(s.fixture.kind, 'chromium-cdp');
  assert.deepEqual(s.fileOutputs.required, receiveEditorReports);
  assert.equal(receiveEditorReports.length, 13);
  assert(m.rows.some((r) => r.kind === 'command' && r.requires?.includes(s.id)));
  for (const change of [
    { env: { MODE: 'other' } },
    { argv: [...s.argv, '--case', 'one'] },
    { fixture: undefined },
    { deadlineMs: 570001 },
    { fileOutputs: undefined },
    { expect: { kind: 'exit', exitCodes: [0] } },
    { expect: { ...s.expect, cases: s.expect.cases.slice(1) } },
    { expect: { ...s.expect, historyInputs: [] } },
  ])
    assert.throws(() => validateStage({ ...s, ...change }));
  graph.extraRoots.push({
    id: 'receive-editor-filter',
    argv: ['node', receiveEditorCampaign, '--case', 'one'],
  });
  assert(
    compileManifest(process.cwd(), graph).rows.find(
      (r) => r.id === 'command:receive-editor-filter:0',
    ).blocked,
  );
});
test('receive-editor trace requires typecheck exit and distinct exact property/native censuses', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'done-receive-editor-trace-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'case-reports'));
  const s = receiveEditorCampaignStage(process.cwd()),
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
    },
    v = s.expect.steps[1].expect,
    n = s.expect.steps[2].expect;
  const reports = [
    {
      schema: 1,
      adapter: 'vitest-v1',
      nonce: 'fresh:properties',
      reason: 'passed',
      modules: v.files.map((file) => ({ file, state: 'passed' })),
      errors: [],
      cases: v.cases.map((c) => ({
        ...c,
        outcome: c.outcome === 'not-applicable' ? 'skipped' : c.outcome,
        durationMs: 0,
        retryCount: 0,
        repeatCount: 0,
        expectedFailure: false,
        mode: c.outcome === 'not-applicable' ? 'skip' : 'run',
        errors: [],
      })),
    },
    {
      schema: 1,
      nonce: 'fresh:native',
      phase: 'complete',
      cases: n.cases,
      errors: [],
      summary: {
        success: true,
        counts: { tests: n.cases.length, failed: 0, cancelled: 0, skipped: 0, todo: 0 },
      },
    },
  ];
  const run = (v) => {
    v.reports.forEach((report, i) =>
      writeFileSync(
        join(dir, 'case-reports/' + s.expect.steps[i + 1].name + '.json'),
        JSON.stringify(report),
      ),
    );
    return reconcileCampaignTrace(s.expect.steps, v.trace, 'fresh', dir, reconcileCases);
  };
  assert.deepEqual(run({ trace, reports }).cases, s.expect.cases);
  for (const alter of [
    (v) => v.reports[0].cases.pop(),
    (v) => v.reports[1].cases.pop(),
    (v) => (v.reports[0].nonce = 'fresh:native'),
    (v) => (v.reports[1].phase = 'running'),
    (v) => v.trace.steps[0].argv.pop(),
    (v) => (v.trace.steps[0].code = 1),
    (v) => v.trace.steps[2].argv.pop(),
    (v) => (v.trace.steps[1].timedOut = true),
  ]) {
    const bad = structuredClone({ trace, reports });
    alter(bad);
    assert.throws(() => run(bad));
  }
});

test('receive-editor reports require complete observations and permit an empty successful typecheck log', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'done-receive-editor-reports-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const sources = [{ path: receiveEditorCampaign, sha256: 'a'.repeat(64) }],
    r = {
      ...receiveEditorEvidence(),
      'sources.json': sources,
      'summary.json': {
        status: 'passed',
        startedAt: '2026-09-15T00:00:00.000Z',
        completedAt: '2026-09-15T00:00:01.000Z',
        stages: receiveEditorSteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
      },
    };
  const aux = ['results.xml', 'types.log', 'properties.log', 'native.log'];
  const save = (r) => {
    for (const [file, v] of Object.entries(r)) writeFileSync(join(dir, file), JSON.stringify(v));
    for (const file of aux) writeFileSync(join(dir, file), file === 'types.log' ? '' : 'observed');
  };
  save(r);
  reconcileReceiveEditorReports(dir, sources);
  for (const alter of [
    (r) => (r['summary.json'].status = 'failed'),
    (r) => (r['sources.json'][0].sha256 = 'b'.repeat(64)),
    (r) => r['generated-editor.json'].histories[0].observations.pop(),
  ]) {
    const bad = structuredClone(r);
    alter(bad);
    save(bad);
    assert.throws(() => reconcileReceiveEditorReports(dir, sources));
  }
  for (const file of [...Object.keys(r), ...aux]) {
    save(r);
    rmSync(join(dir, file));
    assert.throws(() => reconcileReceiveEditorReports(dir, sources));
  }
});
test('160 generated receive-editor corruptions reject lost text, false receipt progress and changing source identities/bytes', () => {
  const r = receiveEditorEvidence();
  reconcileReceiveEditorEvidence(r);
  const alters = [
    (h) => h.observations.pop(),
    (h) => (h.observations[0].visible += 'L'),
    (h) => (h.observations[1].status.receivedThrough = 0),
    (h) => (h.observations[3].outcome = 'accepted'),
    (h) => (h.observations[2].outcome.kind = 'received'),
    (h) => (h.observations[4].captures[0].sources[0].bytes = [99]),
    (h) =>
      h.observations[5].captures.push({
        id: 'remote',
        sources: [{ actor: '11', kind: 'human', bytes: [0, 0] }],
      }),
    (h) => h.final.captures.pop(),
    (h) => (h.final.visible += 'L'),
    (h) => (h.observations[3].status.link = 'cc'.repeat(32)),
    (h) => {
      for (const rows of [...h.observations.map((o) => o.captures), h.final.captures]) {
        const source = rows.find((c) => c.id === 'local')?.sources[0];
        if (source) {
          source.kind = 'system';
          source.actor = 'system';
        }
      }
    },
    (h) => {
      for (const rows of [h.before, ...h.observations.map((o) => o.captures), h.final.captures])
        rows.find((c) => c.id === 'system-initial').sources[0].actor = 'other-actor';
    },
    (h) =>
      h.observations[0].captures.find((c) => c.id === 'system-initial').sources[0].bytes.push(99),
    (h) => h.final.captures.find((c) => c.id === 'system-initial').sources[0].bytes.push(99),
  ];
  for (const alter of alters) {
    const bad = structuredClone(r);
    alter(bad['generated-editor.json'].histories[0]);
    assert.throws(() => reconcileReceiveEditorEvidence(bad));
  }
  fc.assert(
    fc.property(fc.nat(9), fc.nat(alters.length - 1), (i, k) => {
      const bad = structuredClone(r);
      alters[k](bad['generated-editor.json'].histories[i]);
      assert.throws(() => reconcileReceiveEditorEvidence(bad));
    }),
    { seed: 150965, numRuns: 160 },
  );
});
test('160 generated receive-editor control corruptions reject ineffective early-publication and relabel discriminators', () => {
  const r = receiveEditorEvidence();
  reconcileReceiveEditorEvidence(r);
  const alters = [
    (r) => (r['baseline-before.json'].held.visible = 'REMOTE base'),
    (r) => (r['baseline-after.json'].recovered.visible = 'base'),
    (r) => (r['baseline-after.json'].result.recorded = true),
    (r) => (r['control-early.json'].held.resultPending = false),
    (r) => (r['control-early.json'].held.visible = 'base'),
    (r) => (r['control-early.json'].recovered.visible = 'REMOTE base'),
    (r) => r['control-relabel.json'].after.pop(),
    (r) => (r['control-relabel.json'].original = [99]),
    (r) => (r['generated-editor.json'].status = 'running'),
  ];
  fc.assert(
    fc.property(fc.nat(alters.length - 1), (k) => {
      const bad = structuredClone(r);
      alters[k](bad);
      assert.throws(() => reconcileReceiveEditorEvidence(bad));
    }),
    { seed: 150966, numRuns: 160 },
  );
});

function receiveTransportEvidence() {
  const capsule = (id) => ({
      id,
      sources: [{ actor: '11'.repeat(16), kind: 'human', bytes: [0, 0] }],
    }),
    before = [
      capsule('startup'),
      { id: 'system-initial', sources: [{ actor: 'system', kind: 'system', bytes: [0, 1] }] },
    ],
    local = capsule('local');
  const actions = [
    'lost',
    'local',
    'receive',
    'corrupt',
    'compact',
    'restart',
    'receive',
    'receive',
    'restart',
  ];
  const h = {
    actions,
    completed: true,
    initial: 'base',
    before,
    wires: ['aa', 'bb', 'cc'],
    observations: [],
    requests: [],
  };
  let through = 0,
    text = 'base',
    link = '00'.repeat(32),
    current = structuredClone(before);
  const status = () => ({
    state: 'ready',
    receivedThrough: through,
    observedThrough: through ? 3 : 0,
    link,
  });
  for (const action of actions) {
    let outcome = null;
    if (['lost', 'corrupt', 'receive'].includes(action)) {
      const width = through === 0 || through === 3 ? 1 : Math.min(2, 3 - through),
        batch = width > 1,
        pages = Array.from({ length: width }, (_, index) => {
          const at = through + index,
            present = at < 3,
            q = ['done/private-read/v2', 2, ...Array(13).fill('fixture')];
          q[10] = at;
          q[11] = 1;
          const request = Buffer.from(JSON.stringify(q)).toString('hex'),
            nextLink = present ? ['aa', 'bb', 'cc'][at].repeat(32) : link,
            page = [
              'done/private-read-page/v2',
              2,
              createHash('sha256').update(Buffer.from(request, 'hex')).digest('hex'),
              3,
              at + (present ? 1 : 0),
              present ? [[h.wires[at], 'proof']] : [],
              'signature',
            ];
          return {
            request,
            candidatePage: Buffer.from(JSON.stringify(page)).toString('hex'),
            link: nextLink,
          };
        }),
        request = batch
          ? Buffer.from(
              encodeInboundBatch(pages.map((p) => new Uint8Array(Buffer.from(p.request, 'hex')))),
            ).toString('hex')
          : pages[0].request,
        response = batch
          ? Buffer.from(
              encodeInboundBatchPages(
                pages.map((p) => new Uint8Array(Buffer.from(p.candidatePage, 'hex'))),
              ),
            ).toString('hex')
          : pages[0].candidatePage;
      h.requests.push({
        mode: action,
        batch,
        request,
        pages,
        responseBody:
          action === 'lost'
            ? null
            : action === 'corrupt'
              ? Buffer.from('bad page').toString('hex')
              : response,
      });
      if (action === 'receive') {
        const progress = Math.min(width, 3 - through);
        for (let n = 0; n < progress; n++) text = `R${through++} ` + text;
        link = pages.at(-1).link;
        outcome = {
          kind: progress ? 'received' : 'empty',
          recorded: progress > 0,
          status: status(),
          ...(batch ? { kinds: pages.map(() => 'received') } : {}),
        };
      } else if (action === 'lost') outcome = { kind: 'unknown', recorded: false };
      else
        outcome = {
          error: batch ? 'Error: Invalid inbound batch' : 'AdmissionError: invalid page',
        };
    } else if (action === 'local') {
      text += 'L';
      current.push(local);
    }
    h.observations.push({
      action,
      outcome,
      visible: text,
      status: status(),
      captures: structuredClone(current),
    });
  }
  h.final = { visible: text, status: status(), captures: structuredClone(current) };
  const coverage = {};
  for (const a of actions) coverage[a] = (coverage[a] ?? 0) + 16;
  const r = {
    'generated.json': {
      status: 'passed',
      model: 'grouped-http-v2',
      seed: 9112042,
      runs: 16,
      histories: Array.from({ length: 16 }, () => structuredClone(h)),
      coverage,
      transports: { single: 48, batch: 32 },
    },
  };
  for (const mode of ['queue', 'flight', 'bound', 'drain'])
    r['control-' + mode + '.json'] = {
      effective: true,
      observations: [false, true].map((changed) => ({
        changed,
        ...(mode === 'queue'
          ? {
              initial: 'base',
              text: (changed ? '' : 'REMOTE ') + 'base',
              through: 1,
              result: { kind: 'received', status: { receivedThrough: 1 } },
            }
          : mode === 'flight'
            ? { calls: changed ? 2 : 1, result: { kind: changed ? 'unknown' : 'busy' } }
            : mode === 'bound'
              ? { length: changed ? 17 : null }
              : {
                  cancelled: true,
                  settledBeforeCancellationCompleted: changed,
                  settledAfterCancellationCompleted: true,
                  result: null,
                }),
      })),
    };
  return r;
}
test('receive-transport wrapper binds all five commands, 30 cases and inherited browser process ownership', () => {
  const graph = JSON.parse(readFileSync('docs/release-validation-graph.json')),
    m = compileManifest(process.cwd(), graph),
    [s, ...rest] = selectStages(m, 'wrapper-account-receive-transport');
  assert.deepEqual(rest, []);
  validateStage(s);
  assert.equal(s.expect.cases.length, 30);
  assert.deepEqual(
    s.expect.steps.map((s) => s.deadlineMs),
    [60000, 60000, 120000, 90000, 330000],
  );
  assert.equal(s.deadlineMs, 660000);
  assert.equal(s.expect.historyInputs, undefined);
  assert.equal(s.expect.dataInputs, undefined);
  assert.equal(s.fixture.kind, 'chromium-cdp');
  assert.equal(s.processPolicy, 'inherited-group-v1');
  assert.deepEqual(s.fileOutputs.required, receiveTransportReports);
  assert.equal(receiveTransportReports.length, 19);
  assert(m.rows.some((r) => r.kind === 'command' && r.requires?.includes(s.id)));
  for (const change of [
    { env: { MODE: 'other' } },
    { argv: [...s.argv, '--case', 'one'] },
    { fixture: undefined },
    { deadlineMs: 660001 },
    { fileOutputs: undefined },
    { expect: { kind: 'exit', exitCodes: [0] } },
    { expect: { ...s.expect, cases: s.expect.cases.slice(1) } },
    { expect: { ...s.expect, historyInputs: [] } },
  ])
    assert.throws(() => validateStage({ ...s, ...change }));
  graph.extraRoots.push({
    id: 'receive-transport-filter',
    argv: ['node', receiveTransportCampaign, '--case', 'one'],
  });
  assert(
    compileManifest(process.cwd(), graph).rows.find(
      (r) => r.id === 'command:receive-transport-filter:0',
    ).blocked,
  );
});
test('receive-transport trace rejects missing cases from any child or a lost typecheck exit', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'done-receive-transport-trace-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'case-reports'));
  const s = receiveTransportCampaignStage(process.cwd()),
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
  const reports = s.expect.steps
    .filter((s) => s.kind !== 'exit')
    .map((step) =>
      step.kind === 'vitest'
        ? {
            schema: 1,
            adapter: 'vitest-v1',
            nonce: 'fresh:' + step.name,
            reason: 'passed',
            modules: step.expect.files.map((file) => ({ file, state: 'passed' })),
            errors: [],
            cases: step.expect.cases.map((c) => ({
              ...c,
              durationMs: 0,
              retryCount: 0,
              repeatCount: 0,
              expectedFailure: false,
              mode: 'run',
              errors: [],
            })),
          }
        : {
            schema: 1,
            nonce: 'fresh:' + step.name,
            phase: 'complete',
            cases: step.expect.cases,
            errors: [],
            summary: {
              success: true,
              counts: {
                tests: step.expect.cases.length,
                failed: 0,
                cancelled: 0,
                skipped: 0,
                todo: 0,
              },
            },
          },
    );
  const run = (v) => {
    v.reports.forEach((report, i) =>
      writeFileSync(
        join(dir, 'case-reports/' + s.expect.steps[i + 1].name + '.json'),
        JSON.stringify(report),
      ),
    );
    return reconcileCampaignTrace(s.expect.steps, v.trace, 'fresh', dir, reconcileCases);
  };
  assert.deepEqual(run({ trace, reports }).cases, s.expect.cases);
  for (const alter of [
    ...reports.map((_, i) => (v) => v.reports[i].cases.pop()),
    (v) => (v.trace.steps[0].code = 1),
    (v) => v.trace.steps[2].argv.pop(),
    (v) => (v.reports[1].nonce = 'fresh:controls'),
    (v) => (v.trace.steps[4].phase = 'running'),
  ]) {
    const bad = structuredClone({ trace, reports });
    alter(bad);
    assert.throws(() => run(bad));
  }
});
test('receive-transport reports require complete HTTP histories and effective control observations', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'done-receive-transport-reports-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const sources = [{ path: receiveTransportCampaign, sha256: 'a'.repeat(64) }],
    r = {
      ...receiveTransportEvidence(),
      'sources.json': sources,
      'summary.json': {
        status: 'passed',
        startedAt: '2026-09-15T00:00:00.000Z',
        completedAt: '2026-09-15T00:00:01.000Z',
        stages: receiveTransportSteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
      },
    };
  const aux = [
    ...['native', 'controls', 'generated'].map((n) => n + '.xml'),
    ...receiveTransportSteps.map((s) => s.name + '.log'),
  ];
  const save = (r) => {
    for (const [file, v] of Object.entries(r)) writeFileSync(join(dir, file), JSON.stringify(v));
    for (const file of aux) writeFileSync(join(dir, file), file === 'types.log' ? '' : 'observed');
  };
  save(r);
  reconcileReceiveTransportReports(dir, sources);
  for (const alter of [
    (r) => (r['summary.json'].status = 'failed'),
    (r) => (r['sources.json'][0].sha256 = 'b'.repeat(64)),
    (r) => r['generated.json'].histories[0].observations.pop(),
  ]) {
    const bad = structuredClone(r);
    alter(bad);
    save(bad);
    assert.throws(() => reconcileReceiveTransportReports(dir, sources));
  }
  for (const file of [...Object.keys(r), ...aux]) {
    save(r);
    rmSync(join(dir, file));
    assert.throws(() => reconcileReceiveTransportReports(dir, sources));
  }
});
test('160 generated receive-transport corruptions reject false progress, source loss and mismatched request/page bytes', () => {
  const r = receiveTransportEvidence();
  reconcileReceiveTransportEvidence(r);
  const alters = [
    (h) => h.observations.pop(),
    (h) => h.requests.pop(),
    (h) => (h.observations[0].outcome.kind = 'received'),
    (h) => (h.observations[2].status.receivedThrough = 0),
    (h) => (h.observations[3].outcome.error = 'accepted'),
    (h) => (h.observations[4].captures[0].sources[0].bytes = [99]),
    (h) => h.final.captures.pop(),
    (h) => (h.final.visible += 'L'),
    (h) => (h.requests[0].request += '00'),
    (h) => (h.requests[2].responseBody = h.requests[2].pages[0].candidatePage),
    (h) => (h.wires[0] = 'bb'),
    (h) => h.requests.find((r) => r.batch && r.mode === 'receive').pages.reverse(),
    (h) => {
      const r = h.requests.find((r) => r.batch && r.mode === 'receive');
      r.responseBody = r.responseBody.slice(0, -2);
    },
    (h) => {
      const r = h.requests.find((r) => r.batch && r.mode === 'receive');
      r.request = r.pages[0].request;
    },
    (h) => h.observations[6].outcome.kinds.pop(),
    (h) => (h.observations[7].outcome.recorded = true),
    (h) => {
      for (const rows of [...h.observations.map((o) => o.captures), h.final.captures]) {
        const source = rows.find((c) => c.id === 'local')?.sources[0];
        if (source) {
          source.kind = 'system';
          source.actor = 'system';
        }
      }
    },
    (h) => {
      for (const rows of [h.before, ...h.observations.map((o) => o.captures), h.final.captures])
        rows.find((c) => c.id === 'system-initial').sources[0].actor = 'other-actor';
    },
    (h) =>
      h.observations[0].captures.find((c) => c.id === 'system-initial').sources[0].bytes.push(99),
    (h) => h.final.captures.find((c) => c.id === 'system-initial').sources[0].bytes.push(99),
  ];
  for (const alter of alters) {
    const bad = structuredClone(r);
    alter(bad['generated.json'].histories[0]);
    assert.throws(() => reconcileReceiveTransportEvidence(bad));
  }
  fc.assert(
    fc.property(fc.nat(15), fc.nat(alters.length - 1), (i, k) => {
      const bad = structuredClone(r);
      alters[k](bad['generated.json'].histories[i]);
      assert.throws(() => reconcileReceiveTransportEvidence(bad));
    }),
    { seed: 150967, numRuns: 160 },
  );
});
test('160 generated receive-transport control corruptions reject queue, flight, bound and cancellation omissions', () => {
  const r = receiveTransportEvidence();
  reconcileReceiveTransportEvidence(r);
  const alters = [
    (r) => (r['control-queue.json'].observations[1].text = 'REMOTE base'),
    (r) => (r['control-flight.json'].observations[0].calls = 2),
    (r) => (r['control-bound.json'].observations[0].length = 17),
    (r) => (r['control-drain.json'].observations[0].settledBeforeCancellationCompleted = true),
    (r) => (r['control-drain.json'].observations[1].settledAfterCancellationCompleted = false),
    (r) => (r['generated.json'].status = 'running'),
    (r) => r['generated.json'].coverage.lost--,
    (r) => (r['generated.json'].histories[0].completed = false),
  ];
  fc.assert(
    fc.property(fc.nat(alters.length - 1), (k) => {
      const bad = structuredClone(r);
      alters[k](bad);
      assert.throws(() => reconcileReceiveTransportEvidence(bad));
    }),
    { seed: 150968, numRuns: 160 },
  );
});

function receiveDriverEvidence() {
  const capsule = (id) => ({
      id,
      sources: [{ actor: '11'.repeat(16), kind: 'human', bytes: [0, 0] }],
    }),
    before = [
      capsule('startup'),
      { id: 'system-initial', sources: [{ actor: 'system', kind: 'system', bytes: [0, 1] }] },
    ],
    local = capsule('local');
  const actions = ['lost', 'offline', 'halt', 'local', 'publish', 'publish', 'restart'];
  const h = {
    actions,
    completed: true,
    initial: 'base',
    before,
    wires: ['aa', 'bb'],
    observations: [],
    requests: [],
  };
  let available = 0,
    through = 0,
    link = '00'.repeat(32),
    locals = 0,
    current = structuredClone(before);
  const status = (phase = 'idle', failures = 0, reason = null) => ({
    phase,
    receivedThrough: through,
    failures,
    reason,
    nextAttemptAt: phase === 'idle' ? 5000 : phase === 'retrying' ? 1000 : null,
  });
  const request = (mode) => {
    const q = ['done/private-read/v2', 2, ...Array(13).fill('fixture')];
    q[10] = through;
    q[11] = 1;
    const request = Buffer.from(JSON.stringify(q)).toString('hex'),
      advance = through < available,
      nextLink = advance ? (through ? 'bb' : 'aa').repeat(32) : link,
      page = [
        'done/private-read-page/v2',
        2,
        createHash('sha256').update(Buffer.from(request, 'hex')).digest('hex'),
        available,
        through + (advance ? 1 : 0),
        advance ? [[h.wires[through], 'proof']] : [],
        'signature',
      ],
      candidatePage = Buffer.from(JSON.stringify(page)).toString('hex');
    h.requests.push({
      mode,
      available,
      request,
      candidatePage,
      responseBody:
        mode === 'lost'
          ? null
          : mode === 'halt'
            ? Buffer.from('corrupt page').toString('hex')
            : candidatePage,
      link: nextLink,
    });
    if (mode === 'good' && advance) {
      through++;
      link = nextLink;
    }
  };
  request('good');
  h.startupRequests = 1;
  for (const action of actions) {
    const requestStart = h.requests.length;
    let transition = null;
    if (action === 'publish') {
      available++;
      request('good');
      request('good');
    } else if (action === 'local') {
      locals++;
      current.push(local);
    } else if (action === 'restart') request('good');
    else if (action === 'offline') {
      transition = status('offline');
      request('good');
    } else {
      request(action);
      transition =
        action === 'lost' ? status('retrying', 1) : status('blocked', 0, 'operation-failed');
      request('good');
    }
    const visible =
      Array.from({ length: available }, (_, i) => `REMOTE${available - 1 - i} `).join('') +
      'base' +
      'L'.repeat(locals);
    h.observations.push({
      action,
      requestStart,
      requestEnd: h.requests.length,
      transition,
      visible,
      status: status(),
      captures: structuredClone(current),
    });
  }
  h.final = {
    visible: h.observations.at(-1).visible,
    status: status(),
    captures: structuredClone(current),
  };
  const coverage = {};
  for (const a of actions) coverage[a] = (coverage[a] ?? 0) + 10;
  const r = {
    'generated-native.json': {
      status: 'passed',
      seed: 9112052,
      runs: 10,
      histories: Array.from({ length: 10 }, () => structuredClone(h)),
      coverage,
    },
  };
  for (const [mode, pair] of Object.entries({
    overlap: [1, 2],
    poll: [2, 1],
    halt: [1, 2],
    observer: [0, 1],
    resume: [1, 0],
  }))
    r['control-' + mode + '.json'] = {
      mode,
      effective: true,
      observations: [false, true].map((changed, i) => ({
        changed,
        calls: pair[i],
        timers: 0,
        status: { ...status('working'), receivedThrough: 0 },
        disposed: {
          calls: pair[i],
          timers: 0,
          status: { ...status('closed'), receivedThrough: 0 },
        },
      })),
    };
  for (const gate of ['offline', 'pressure'])
    r['control-dispatch-' + gate + '.json'] = {
      effective: true,
      observations: ['baseline', 'dispatch'].map((mode) => ({
        mode,
        calls: mode === 'dispatch' ? 1 : 0,
        held: {
          ...status(
            gate === 'offline' ? 'offline' : 'blocked',
            0,
            gate === 'offline' ? null : 'local-storage',
          ),
          receivedThrough: 0,
        },
        closed: { ...status('closed'), receivedThrough: 0 },
      })),
    };
  return r;
}
test('receive-driver wrapper binds all six commands, 37 cases and inherited browser process ownership', () => {
  const graph = JSON.parse(readFileSync('docs/release-validation-graph.json')),
    m = compileManifest(process.cwd(), graph),
    [s, ...rest] = selectStages(m, 'wrapper-account-receive-driver');
  assert.deepEqual(rest, []);
  validateStage(s);
  assert.equal(s.expect.cases.length, 37);
  assert.deepEqual(
    s.expect.steps.map((s) => s.deadlineMs),
    [60000, 60000, 180000, 90000, 90000, 270000],
  );
  assert.equal(s.deadlineMs, 750000);
  assert.equal(s.expect.historyInputs, undefined);
  assert.equal(s.expect.dataInputs, undefined);
  assert.equal(s.fixture.kind, 'chromium-cdp');
  assert.equal(s.processPolicy, 'inherited-group-v1');
  assert.deepEqual(s.fileOutputs.required, receiveDriverReports);
  assert.equal(receiveDriverReports.length, 25);
  assert(m.rows.some((r) => r.kind === 'command' && r.requires?.includes(s.id)));
  for (const change of [
    { env: { MODE: 'other' } },
    { argv: [...s.argv, '--case', 'one'] },
    { fixture: undefined },
    { deadlineMs: 750001 },
    { fileOutputs: undefined },
    { expect: { kind: 'exit', exitCodes: [0] } },
    { expect: { ...s.expect, cases: s.expect.cases.slice(1) } },
    { expect: { ...s.expect, historyInputs: [] } },
  ])
    assert.throws(() => validateStage({ ...s, ...change }));
  graph.extraRoots.push({
    id: 'receive-driver-filter',
    argv: ['node', receiveDriverCampaign, '--case', 'one'],
  });
  assert(
    compileManifest(process.cwd(), graph).rows.find(
      (r) => r.id === 'command:receive-driver-filter:0',
    ).blocked,
  );
});
test('receive-driver trace rejects missing cases from any child or a lost typecheck exit', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'done-receive-driver-trace-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'case-reports'));
  const s = receiveDriverCampaignStage(process.cwd()),
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
  const reports = s.expect.steps
    .filter((s) => s.kind !== 'exit')
    .map((step) =>
      step.kind === 'vitest'
        ? {
            schema: 1,
            adapter: 'vitest-v1',
            nonce: 'fresh:' + step.name,
            reason: 'passed',
            modules: step.expect.files.map((file) => ({ file, state: 'passed' })),
            errors: [],
            cases: step.expect.cases.map((c) => ({
              ...c,
              durationMs: 0,
              retryCount: 0,
              repeatCount: 0,
              expectedFailure: false,
              mode: 'run',
              errors: [],
            })),
          }
        : {
            schema: 1,
            nonce: 'fresh:' + step.name,
            phase: 'complete',
            cases: step.expect.cases,
            errors: [],
            summary: {
              success: true,
              counts: {
                tests: step.expect.cases.length,
                failed: 0,
                cancelled: 0,
                skipped: 0,
                todo: 0,
              },
            },
          },
    );
  const run = (v) => {
    v.reports.forEach((report, i) =>
      writeFileSync(
        join(dir, 'case-reports/' + s.expect.steps[i + 1].name + '.json'),
        JSON.stringify(report),
      ),
    );
    return reconcileCampaignTrace(s.expect.steps, v.trace, 'fresh', dir, reconcileCases);
  };
  assert.deepEqual(run({ trace, reports }).cases, s.expect.cases);
  for (const alter of [
    ...reports.map((_, i) => (v) => v.reports[i].cases.pop()),
    (v) => (v.trace.steps[0].code = 1),
    (v) => v.trace.steps[2].argv.pop(),
    (v) => (v.reports[1].nonce = 'fresh:controls'),
    (v) => (v.trace.steps[4].phase = 'running'),
  ]) {
    const bad = structuredClone({ trace, reports });
    alter(bad);
    assert.throws(() => run(bad));
  }
});
test('receive-driver reports require complete HTTP histories and effective control observations', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'done-receive-driver-reports-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const sources = [{ path: receiveDriverCampaign, sha256: 'a'.repeat(64) }],
    r = {
      ...receiveDriverEvidence(),
      'sources.json': sources,
      'summary.json': {
        status: 'passed',
        startedAt: '2026-09-15T00:00:00.000Z',
        completedAt: '2026-09-15T00:00:01.000Z',
        stages: receiveDriverSteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
      },
    };
  const aux = [
    ...['native', 'controls', 'native-controls', 'generated'].map((n) => n + '.xml'),
    ...receiveDriverSteps.map((s) => s.name + '.log'),
  ];
  const save = (r) => {
    for (const [file, v] of Object.entries(r)) writeFileSync(join(dir, file), JSON.stringify(v));
    for (const file of aux) writeFileSync(join(dir, file), file === 'types.log' ? '' : 'observed');
  };
  save(r);
  reconcileReceiveDriverReports(dir, sources);
  for (const alter of [
    (r) => (r['summary.json'].status = 'failed'),
    (r) => (r['sources.json'][0].sha256 = 'b'.repeat(64)),
    (r) => r['generated-native.json'].histories[0].observations.pop(),
  ]) {
    const bad = structuredClone(r);
    alter(bad);
    save(bad);
    assert.throws(() => reconcileReceiveDriverReports(dir, sources));
  }
  for (const file of [...Object.keys(r), ...aux]) {
    save(r);
    rmSync(join(dir, file));
    assert.throws(() => reconcileReceiveDriverReports(dir, sources));
  }
});

test('160 generated receive-driver corruptions reject skipped durable queries, false restart progress and changed sources', () => {
  const r = receiveDriverEvidence();
  reconcileReceiveDriverEvidence(r);
  const alters = [
    (h) => h.observations.pop(),
    (h) => h.requests.pop(),
    (h) => (h.observations[0].transition.receivedThrough = 1),
    (h) => (h.observations[4].status.receivedThrough = 0),
    (h) => (h.observations[6].requestStart = 0),
    (h) => (h.observations[4].captures[0].sources[0].bytes = [99]),
    (h) => h.final.captures.pop(),
    (h) => (h.final.visible += 'L'),
    (h) => (h.requests[0].request += '00'),
    (h) => (h.requests[4].responseBody = h.requests[4].candidatePage),
    (h) => (h.wires[0] = 'bb'),
    (h) => {
      for (const rows of [...h.observations.map((o) => o.captures), h.final.captures]) {
        const source = rows.find((c) => c.id === 'local')?.sources[0];
        if (source) {
          source.kind = 'system';
          source.actor = 'system';
        }
      }
    },
    (h) => {
      for (const rows of [h.before, ...h.observations.map((o) => o.captures), h.final.captures])
        rows.find((c) => c.id === 'system-initial').sources[0].actor = 'other-actor';
    },
    (h) =>
      h.observations[0].captures.find((c) => c.id === 'system-initial').sources[0].bytes.push(99),
    (h) => h.final.captures.find((c) => c.id === 'system-initial').sources[0].bytes.push(99),
  ];
  for (const alter of alters) {
    const bad = structuredClone(r);
    alter(bad['generated-native.json'].histories[0]);
    assert.throws(() => reconcileReceiveDriverEvidence(bad));
  }
  fc.assert(
    fc.property(fc.nat(9), fc.nat(alters.length - 1), (i, k) => {
      const bad = structuredClone(r);
      alters[k](bad['generated-native.json'].histories[i]);
      assert.throws(() => reconcileReceiveDriverEvidence(bad));
    }),
    { seed: 150969, numRuns: 160 },
  );
});
test('160 generated receive-driver control corruptions reject ineffective scheduler/dispatch omissions and incomplete disposal', () => {
  const r = receiveDriverEvidence();
  reconcileReceiveDriverEvidence(r);
  const alters = [
    (r) => (r['control-overlap.json'].observations[1].calls = 1),
    (r) => (r['control-poll.json'].observations[0].calls = 1),
    (r) => (r['control-halt.json'].observations[0].calls = 2),
    (r) => (r['control-observer.json'].observations[0].calls = 1),
    (r) => (r['control-resume.json'].observations[1].calls = 1),
    (r) => (r['control-dispatch-offline.json'].observations[0].calls = 1),
    (r) => (r['control-dispatch-pressure.json'].observations[1].closed.phase = 'blocked'),
    (r) => (r['control-overlap.json'].observations[1].disposed.timers = 1),
    (r) => (r['generated-native.json'].status = 'running'),
    (r) => r['generated-native.json'].coverage.lost--,
  ];
  fc.assert(
    fc.property(fc.nat(alters.length - 1), (k) => {
      const bad = structuredClone(r);
      alters[k](bad);
      assert.throws(() => reconcileReceiveDriverEvidence(bad));
    }),
    { seed: 150970, numRuns: 160 },
  );
});

function syncEvidence() {
  const capsule = (id) => ({
      id,
      sources: [{ actor: '11'.repeat(16), kind: 'human', bytes: [0, 0] }],
    }),
    before = [capsule('startup')];
  const lane = (phase = 'idle', n = 0, failures = 0) => ({
    phase,
    failures,
    reason: null,
    nextAttemptAt: phase === 'idle' ? 5000 : null,
    acceptedThrough: n,
    receivedThrough: n,
  });
  const status = (phase = 'idle', n = 0, failures = 0) => ({
    send: lane(phase, n, failures),
    receive: lane(phase, n, failures),
  });
  const u32 = (n) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n);
    return b;
  };
  const lp = (...ss) =>
    Buffer.concat(
      ss.flatMap((s) => {
        const b = Buffer.from(s),
          n = Buffer.alloc(2);
        n.writeUInt16BE(b.length);
        return [n, b];
      }),
    );
  const wire = (n) => {
    const ct = Buffer.alloc(16, n),
      e = Buffer.concat([
        lp('done/envelope-wire/v2', '2', 'workspace', 'credential', '1', '1', String(n)),
        Buffer.alloc(12, n),
        createHash('sha256').update(ct).digest(),
        u32(ct.length),
        ct,
        Buffer.alloc(64),
      ]);
    return Buffer.concat([
      lp('done/envelope-submission-wire/v1', '1', '11'.repeat(32)),
      u32(e.length),
      e,
      u32(0),
      Buffer.alloc(64),
    ]).toString('hex');
  };
  const actions = [
      'offline-edit',
      'lost-send',
      'lost-read',
      'compact',
      'restart',
      'edit',
      'restart',
    ],
    h = {
      actions,
      completed: true,
      initial: 'base',
      before,
      submissions: [],
      reads: [],
      observations: [],
    };
  let current = structuredClone(before),
    expected = 'base',
    edits = 0;
  const send = (reply) => {
    const position = current.length;
    h.submissions.push({
      position,
      wire: wire(position),
      sealCount: position,
      responseStatus: 200,
      responseBody: 'aa',
      reply,
    });
  };
  const read = (reply) => {
    const q = ['done/private-read/v2', 2, ...Array(13).fill('fixture')];
    q[10] = current.length;
    q[11] = 1;
    h.reads.push({
      request: Buffer.from(JSON.stringify(q)).toString('hex'),
      sentPositions: current.length,
      reply,
    });
  };
  const state = () => ({
    visible: expected,
    captures: structuredClone(current),
    status: status('idle', current.length),
    spool: {
      attempts: current.length,
      positions: current.map((c, i) => ({
        position: i + 1,
        source: { id: c.id, index: 0, hash: 'aa'.repeat(32) },
        attempts: [i + 1],
        persisted: true,
      })),
    },
    nonces: current.map((_, i) => Array(12).fill(i + 1)),
    wires: current.map((_, i) => ({ position: i + 1, wire: wire(i + 1) })),
  });
  send('delivered');
  read('continued');
  for (const action of actions) {
    const sendStart = h.submissions.length,
      readStart = h.reads.length;
    let transition = null;
    if (!['compact', 'restart'].includes(action)) {
      expected += ' [' + edits + ']';
      current.push(capsule('local' + edits++));
      send(action === 'lost-send' ? 'lost' : 'delivered');
    }
    read(action === 'lost-read' ? 'lost' : 'continued');
    if (action === 'offline-edit') transition = status('offline', current.length - 1);
    if (action.startsWith('lost')) {
      transition = status('retrying', current.length - 1, 1);
      if (action === 'lost-send') send('delivered');
      else read('continued');
    }
    h.observations.push({
      action,
      sendStart,
      readStart,
      sendEnd: h.submissions.length,
      readEnd: h.reads.length,
      transition,
      ...state(),
    });
  }
  h.final = state();
  h.positions = current.length;
  const coverage = {};
  for (const a of actions) coverage[a] = (coverage[a] ?? 0) + 8;
  const r = {
    'generated-native.json': {
      status: 'passed',
      seed: 9112062,
      runs: 8,
      histories: Array.from({ length: 8 }, () => structuredClone(h)),
      coverage,
    },
  };
  for (const [mode, pair] of Object.entries({
    fairness: ['receive', 'send'],
    overlap: [1, 2],
    halt: ['receive', 'send'],
    resume: ['send', 'receive'],
    wake: [3, 2],
  }))
    r['control-' + mode + '.json'] = {
      effective: true,
      observations: [false, true].map((mutant, i) => {
        const calls = typeof pair[i] === 'number' ? Array(pair[i]).fill('send') : [pair[i]];
        return {
          mutant,
          observed: pair[i],
          held: { calls, timers: 0, status: status('working') },
          disposed: { calls, timers: 0, status: status('closed') },
        };
      }),
    };
  for (const gate of ['offline', 'pressure'])
    r['control-dispatch-' + gate + '.json'] = {
      effective: true,
      observations: [false, true].map((mutant) => ({
        mutant,
        calls: mutant ? 1 : 0,
        held: status(gate === 'offline' ? 'offline' : 'blocked'),
        closed: status('closed'),
      })),
    };
  r['control-witness.json'] = {
    effective: true,
    observations: [
      { mutant: false, opened: false, error: 'witness refusal' },
      { mutant: true, opened: true, master: 'base', status: status('offline') },
    ],
  };
  const records = [{ kind: 'update', gen: 1, seq: 1, bytes: [1, 2] }];
  const record = (tag, index, tail = []) => ({
    kind: 'heads',
    gen: 1,
    seq: index,
    bytes: [...Buffer.from(JSON.stringify([tag, ...tail]))],
  });
  const baselineStatus = status('retrying');
  baselineStatus.send.reason = 'network-unavailable';
  baselineStatus.receive = { ...baselineStatus.receive, phase: 'blocked', reason: 'integrity' };
  const baseline = {
    mode: 'baseline',
    advanced: false,
    editorState: 'active',
    status: baselineStatus,
    reads: 1,
    initial: 'base',
    visible: 'base',
    storage: { before: records, after: records, newDeliveryDecisions: 0 },
  };
  for (const mode of ['self', 'classification']) {
    const s = status(mode === 'self' ? 'blocked' : 'closed');
    for (const lane of ['send', 'receive'])
      s[lane].reason = mode === 'self' ? 'conflict' : 'closed';
    r['control-' + mode + '.json'] = {
      effective: true,
      observations: [
        baseline,
        {
          mode,
          advanced: false,
          editorState: mode === 'self' ? 'active' : 'closed',
          status: s,
          reads: 1,
          initial: 'base',
          visible: mode === 'self' ? 'base' : null,
          storage: {
            before: records,
            after:
              mode === 'self'
                ? [
                    ...records,
                    record('done/account-delivery/v1', 2, [...Array(8).fill(null), 'response']),
                  ]
                : records,
            newDeliveryDecisions: mode === 'self' ? 1 : 0,
          },
        },
      ],
    };
  }
  const nativeRows = [{ store: 'content', keys: [1], values: [{ ct: [4, 5] }] }];
  r['control-worker-self.json'] = {
    effective: true,
    observations: [false, true].map((mutant) => {
      const asset = '/assets/accountOwner.worker-' + (mutant ? 'mutant' : 'baseline') + '.js';
      const received = {
        state: 'ready',
        receivedThrough: 1,
        observedThrough: 1,
        link: 'ab'.repeat(32),
      };
      return {
        mutant,
        initial: 'base',
        result: mutant ? { kind: 'received', recorded: true, status: received } : null,
        status: mutant ? received : null,
        error: mutant ? null : 'WorkerChannelError: Worker operation could not finish.',
        errorCode: mutant ? null : 'closed',
        mirrorState: mutant ? 'active' : 'closing',
        closedState: 'closed',
        visible: mutant ? 'REMOTE base' : null,
        workerUrl: 'http://localhost:1234' + asset,
        before: records,
        after: mutant ? [...records, record('done/account-inbound/v1', 2)] : records,
        nativeBefore: nativeRows,
        nativeAfter: mutant
          ? [...nativeRows, { store: 'heads', keys: [2], values: [{ ct: [9] }] }]
          : nativeRows,
        bundle: {
          guardCount: 1,
          omissionCount: mutant ? 1 : 0,
          entry: '/done.js',
          assets: ['/done.js', asset].map((path) => ({
            path,
            bytes: 100,
            sha256: 'ab'.repeat(32),
          })),
        },
      };
    }),
  };
  return JSON.parse(JSON.stringify(r));
}
test('sync wrapper binds all six commands, 85 cases and inherited browser process ownership', () => {
  const graph = JSON.parse(readFileSync('docs/release-validation-graph.json')),
    m = compileManifest(process.cwd(), graph),
    [s, ...rest] = selectStages(m, 'wrapper-account-sync');
  assert.deepEqual(rest, []);
  validateStage(s);
  assert.equal(s.expect.cases.length, 85);
  assert.deepEqual(
    s.expect.steps.map((s) => s.deadlineMs),
    [60000, 60000, 600000, 90000, 150000, 450000],
  );
  assert.equal(s.deadlineMs, 1410000);
  assert.deepEqual(
    s.expect.historyInputs.map((p) => [p.reference, p.path]),
    ['src/crdt/accountEnvelopePreparation.ts', 'src/crdt/accountDelivery.ts'].map((p) => [
      '4bb09042f37f68ec31f0d82587af608f599eb096',
      p,
    ]),
  );
  assert.equal(s.expect.dataInputs, undefined);
  assert.equal(s.fixture.kind, 'chromium-cdp');
  assert.equal(s.processPolicy, 'inherited-group-v1');
  assert.deepEqual(s.fileOutputs.required, syncReports);
  assert.equal(syncReports.length, 29);
  assert(m.rows.some((r) => r.kind === 'command' && r.requires?.includes(s.id)));
  for (const change of [
    { env: { MODE: 'other' } },
    { argv: [...s.argv, '--case', 'one'] },
    { fixture: undefined },
    { deadlineMs: 1410001 },
    { fileOutputs: undefined },
    { expect: { kind: 'exit', exitCodes: [0] } },
    { expect: { ...s.expect, cases: s.expect.cases.slice(1) } },
    { expect: { ...s.expect, historyInputs: [] } },
  ])
    assert.throws(() => validateStage({ ...s, ...change }));
  graph.extraRoots.push({
    id: 'sync-filter',
    argv: ['node', syncCampaign, '--case', 'one'],
  });
  assert(
    compileManifest(process.cwd(), graph).rows.find((r) => r.id === 'command:sync-filter:0')
      .blocked,
  );
});
test('sync trace rejects missing cases from any child or a lost typecheck exit', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'done-sync-trace-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'case-reports'));
  const s = syncCampaignStage(process.cwd()),
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
  const reports = s.expect.steps
    .filter((s) => s.kind !== 'exit')
    .map((step) =>
      step.kind === 'vitest'
        ? {
            schema: 1,
            adapter: 'vitest-v1',
            nonce: 'fresh:' + step.name,
            reason: 'passed',
            modules: step.expect.files.map((file) => ({ file, state: 'passed' })),
            errors: [],
            cases: step.expect.cases.map((c) => ({
              ...c,
              durationMs: 0,
              retryCount: 0,
              repeatCount: 0,
              expectedFailure: false,
              mode: 'run',
              errors: [],
            })),
          }
        : {
            schema: 1,
            nonce: 'fresh:' + step.name,
            phase: 'complete',
            cases: step.expect.cases,
            errors: [],
            summary: {
              success: true,
              counts: {
                tests: step.expect.cases.length,
                failed: 0,
                cancelled: 0,
                skipped: 0,
                todo: 0,
              },
            },
          },
    );
  const run = (v) => {
    v.reports.forEach((report, i) =>
      writeFileSync(
        join(dir, 'case-reports/' + s.expect.steps[i + 1].name + '.json'),
        JSON.stringify(report),
      ),
    );
    return reconcileCampaignTrace(s.expect.steps, v.trace, 'fresh', dir, reconcileCases);
  };
  assert.deepEqual(run({ trace, reports }).cases, s.expect.cases);
  for (const alter of [
    ...reports.map((_, i) => (v) => v.reports[i].cases.pop()),
    (v) => (v.trace.steps[0].code = 1),
    (v) => v.trace.steps[2].argv.pop(),
    (v) => (v.reports[1].nonce = 'fresh:controls'),
    (v) => (v.trace.steps[4].phase = 'running'),
  ]) {
    const bad = structuredClone({ trace, reports });
    alter(bad);
    assert.throws(() => run(bad));
  }
});
test('sync reports require complete HTTP histories and effective control observations', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'done-sync-reports-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const sources = [{ path: syncCampaign, sha256: 'a'.repeat(64) }],
    r = {
      ...syncEvidence(),
      'sources.json': sources,
      'summary.json': {
        status: 'passed',
        startedAt: '2026-09-15T00:00:00.000Z',
        completedAt: '2026-09-15T00:00:01.000Z',
        stages: syncSteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
      },
    };
  const aux = [
    ...['native', 'controls', 'native-controls', 'generated'].map((n) => n + '.xml'),
    ...syncSteps.map((s) => s.name + '.log'),
  ];
  const save = (r) => {
    for (const [file, v] of Object.entries(r)) writeFileSync(join(dir, file), JSON.stringify(v));
    for (const file of aux) writeFileSync(join(dir, file), file === 'types.log' ? '' : 'observed');
  };
  save(r);
  reconcileSyncReports(dir, sources);
  for (const alter of [
    (r) => (r['summary.json'].status = 'failed'),
    (r) => (r['sources.json'][0].sha256 = 'b'.repeat(64)),
    (r) => r['generated-native.json'].histories[0].observations.pop(),
  ]) {
    const bad = structuredClone(r);
    alter(bad);
    save(bad);
    assert.throws(() => reconcileSyncReports(dir, sources));
  }
  for (const file of [...Object.keys(r), ...aux]) {
    save(r);
    rmSync(join(dir, file));
    assert.throws(() => reconcileSyncReports(dir, sources));
  }
});

test('160 generated sync corruptions reject rewritten retries, reused nonces, lost text and source/cursor disagreement', () => {
  const r = syncEvidence();
  reconcileSyncEvidence(r);
  const alters = [
    (h) => h.observations.pop(),
    (h) => (h.submissions[0].wire += '00'),
    (h) => (h.submissions[3].wire = h.submissions[0].wire),
    (h) => (h.observations[1].nonces[1] = h.observations[1].nonces[0]),
    (h) => (h.observations[2].spool.positions[0].source.hash = 'bb'.repeat(32)),
    (h) => (h.observations[3].captures[0].sources[0].bytes = [99]),
    (h) => h.final.captures.pop(),
    (h) => (h.final.visible += 'L'),
    (h) => (h.reads[0].request += '00'),
    (h) => (h.observations[1].transition.send.failures = 0),
    (h) => (h.final.status.receive.receivedThrough = 0),
    (h) => (h.submissions[2].reply = 'delivered'),
  ];
  fc.assert(
    fc.property(fc.nat(7), fc.nat(alters.length - 1), (i, k) => {
      const bad = structuredClone(r);
      alters[k](bad['generated-native.json'].histories[i]);
      assert.throws(() => reconcileSyncEvidence(bad));
    }),
    { seed: 150971, numRuns: 160 },
  );
});
function syncInitialSystemEvidence() {
  const r = syncEvidence();
  for (const h of r['generated-native.json'].histories) {
    const id = h.before[0].id;
    for (const rows of [h.before, ...h.observations.map((o) => o.captures), h.final.captures]) {
      const source = rows.find((c) => c.id === id).sources[0];
      source.kind = 'system';
      source.actor = 'system';
    }
  }
  return r;
}
test('sync report accepts only unchanged initial system captures with the system actor', () => {
  const r = syncInitialSystemEvidence();
  reconcileSyncEvidence(r);
  for (const change of [
    (h) => {
      h.before[0].sources[0].actor = 'other';
    },
    (h) => {
      const added = h.observations[0].captures.find((c) => !h.before.some((b) => b.id === c.id));
      added.sources[0].kind = 'system';
      added.sources[0].actor = 'system';
    },
    (h) => {
      h.observations[0].captures[0].sources[0].bytes[0] = 99;
    },
    (h) => {
      h.final.captures[0].sources[0].bytes[0] = 99;
    },
  ]) {
    const v = JSON.parse(JSON.stringify(r));
    change(v['generated-native.json'].histories[0]);
    assert.throws(() => reconcileSyncEvidence(v));
  }
});
test('sync report accepts the network reason only on the observed lost reply retry lane', () => {
  const r = syncEvidence();
  for (const h of r['generated-native.json'].histories) {
    for (const o of h.observations)
      if (o.action.startsWith('lost-')) {
        const lane = o.action === 'lost-send' ? 'send' : 'receive';
        o.transition[lane].reason = 'network-unavailable';
      }
  }
  reconcileSyncEvidence(r);
  const firstLost = (v) =>
    v['generated-native.json'].histories[0].observations.find((o) => o.action.startsWith('lost-'));
  for (const change of [
    (o, lane) => {
      o.transition[lane].phase = 'idle';
    },
    (o, lane) => {
      o.transition[lane].failures = 0;
    },
    (o, lane) => {
      o.transition[lane === 'send' ? 'receive' : 'send'].reason = 'network-unavailable';
    },
  ]) {
    const v = JSON.parse(JSON.stringify(r));
    const o = firstLost(v),
      lane = o.action === 'lost-send' ? 'send' : 'receive';
    change(o, lane);
    assert.throws(() => reconcileSyncEvidence(v));
  }
});
test('sync layered and Worker controls require their distinct refusals, storage and original advance', () => {
  const r = syncEvidence();
  reconcileSyncEvidence(r);
  const changes = [
    (v) => (v['control-self.json'].observations[1].status.send.reason = 'integrity'),
    (v) =>
      v['control-self.json'].observations[1].storage.after.push({
        kind: 'update',
        gen: 1,
        seq: 3,
        bytes: [42],
      }),
    (v) => (v['control-worker-self.json'].observations[1].visible = 'base'),
    (v) => (v['control-worker-self.json'].observations[1].status.receivedThrough = 0),
    (v) => (v['control-worker-self.json'].observations[0].nativeAfter[0].values[0].ct[0] = 99),
  ];
  for (const change of changes) {
    // Report serialization must break fixture aliases, just like separate on-disk observations.
    const v = JSON.parse(JSON.stringify(r));
    change(v);
    assert.throws(() => reconcileSyncEvidence(v));
  }
});
test('160 generated sync control corruptions reject ineffective scheduler, dispatch, witness and self-stream controls', () => {
  const r = syncEvidence();
  reconcileSyncEvidence(r);
  const alters = [
    (r) => (r['control-overlap.json'].observations[1].observed = 1),
    (r) => (r['control-fairness.json'].observations[0].observed = 'send'),
    (r) => (r['control-halt.json'].observations[0].observed = 'send'),
    (r) => (r['control-wake.json'].observations[0].observed = 2),
    (r) => (r['control-resume.json'].observations[1].observed = 'send'),
    (r) => (r['control-dispatch-offline.json'].observations[0].calls = 1),
    (r) => (r['control-dispatch-pressure.json'].observations[1].closed.send.phase = 'blocked'),
    (r) => (r['control-overlap.json'].observations[1].disposed.timers = 1),
    (r) => (r['control-witness.json'].observations[0].opened = true),
    (r) => (r['control-self.json'].observations[1].advanced = true),
    (r) => (r['control-classification.json'].observations[1].editorState = 'active'),
    (r) => (r['control-self.json'].observations[1].status.receive.reason = 'integrity'),
    (r) => (r['control-self.json'].observations[1].visible += 'REMOTE'),
    (r) => (r['control-self.json'].observations[1].storage.after[0].bytes = [99]),
    (r) => (r['control-self.json'].observations[1].storage.newDeliveryDecisions = 0),
    (r) => (r['control-worker-self.json'].observations[1].result.status.receivedThrough = 0),
    (r) => (r['control-worker-self.json'].observations[1].result.recorded = false),
    (r) => (r['control-worker-self.json'].observations[0].nativeAfter = []),
    (r) => (r['control-worker-self.json'].observations[1].bundle.omissionCount = 0),
    (r) => r['control-worker-self.json'].observations[1].after.pop(),
    (r) => r['generated-native.json'].coverage['lost-send']--,
  ];
  fc.assert(
    fc.property(fc.nat(alters.length - 1), (k) => {
      const bad = structuredClone(r);
      alters[k](bad);
      assert.throws(() => reconcileSyncEvidence(bad));
    }),
    { seed: 150972, numRuns: 160 },
  );
});

function serviceInboundEvidence() {
  const key = generateKeyPairSync('ed25519'),
    publicKey = key.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
  const hex = (v) => Buffer.from(JSON.stringify(v)).toString('hex'),
    digest = (v) => createHash('sha256').update(Buffer.from(v, 'hex')).digest('hex');
  const request = (after = 0, limit = 1, role) => {
    const q = ['done/private-read/v2', 2, ...Array(13).fill('fixture')];
    q[10] = after;
    q[11] = limit;
    if (role) q[role === 'reader' ? 5 : 6] = 'ac'.repeat(16);
    return hex(q);
  };
  const one = {
      envelope: 'aa',
      result: {
        kind: 'decision',
        bytes: hex(['done/position-response/v1', 1, 'accepted', 'workspace', 'credential', 1]),
      },
    },
    two = {
      envelope: 'bb',
      result: {
        kind: 'decision',
        bytes: hex(['done/position-response/v1', 1, 'accepted', 'workspace', 'credential', 2]),
      },
    };
  const page = (q, originals) => {
    const after = JSON.parse(Buffer.from(q, 'hex'))[10],
      entries = originals.slice(after, after + 1).map((o) => [o.envelope, o.result.bytes]);
    const p = [
      'done/private-read-page/v2',
      2,
      digest(q),
      originals.length,
      after + entries.length,
      entries,
    ];
    return {
      request: q,
      result: {
        kind: 'decision',
        bytes: hex([
          ...p,
          sign(null, Buffer.from(JSON.stringify(p)), key.privateKey).toString('hex'),
        ]),
      },
    };
  };
  const refused = (q) => ({ request: q, result: { kind: 'unknown', reason: 'fixture' } });
  const commands = ['append', 'read', 'replay', 'reader', 'publisher', 'ledger', 'restart'].map(
      (op) => ({ op, limit: 1, cursor: 0 }),
    ),
    h = { commands, observations: [], completed: true, publicKey };
  const before = '00'.repeat(32),
    after = '11'.repeat(32),
    q = request();
  h.observations.push({ op: 'append', before, after, position: 1, ...one });
  for (const op of commands.slice(1).map((c) => c.op)) {
    const o = { op, before: after, after };
    if (op === 'read' || op === 'replay') Object.assign(o, page(q, [one]));
    else if (['reader', 'publisher', 'ledger'].includes(op)) {
      Object.assign(o, refused(request(0, 1, op === 'ledger' ? undefined : op)));
      if (op === 'ledger') {
        o.faulted = '22'.repeat(32);
        o.result = { kind: 'unknown', reason: 'ledger-integrity' };
      }
    }
    h.observations.push(o);
  }
  h.final = [{ before: after, after, ...page(q, [one]) }];
  const coverage = Object.fromEntries(commands.map((c) => [c.op, 60]));
  const r = {
    'generated.json': {
      status: 'passed',
      seed: 9112031,
      coverage,
      histories: Array.from({ length: 60 }, () => structuredClone(h)),
      details: {
        failed: false,
        numRuns: 60,
        numShrinks: 0,
        counterexample: null,
        counterexamplePath: null,
        error: null,
      },
    },
  };
  for (const control of [
    'reader',
    'publisher',
    'signature',
    'current',
    'registration',
    'witness',
    'expiry',
    'custody',
  ])
    r['control-' + control + '.json'] = {
      control,
      publicKey,
      originals: [one],
      ordinary: [page(q, [one]), page(q, [one])],
      baseline: refused(q),
      mutant: page(q, control === 'publisher' ? [] : [one]),
      ...(control === 'publisher'
        ? {
            publisherPolicyOmissions: 2,
            publisherLookup: { request: q, result: { kind: 'unknown', reason: 'unavailable' } },
          }
        : {}),
      ...(control === 'witness'
        ? { redundantWitness: Array(2).fill({ kind: 'unknown', reason: 'ledger-integrity' }) }
        : {}),
      activation: control === 'registration' ? [refused(q), refused(q)] : [],
    };
  for (const cut of ['verified', 'signed'])
    r['restart-' + cut + '.json'] = {
      cut,
      code: null,
      signal: 'SIGKILL',
      replies: 0,
      before,
      after: before,
      publicKey,
      originals: [one],
      ...page(q, [one]),
    };
  const response = (p) => ({
    status: 200,
    cache: 'no-store',
    type: 'application/octet-stream',
    bytes: p.result.bytes,
  });
  const pages = [0, 1].map((i) => {
      const p = page(request(i), [one, two]),
        res = response(p);
      return {
        position: i + 1,
        request: p.request,
        response: res,
        retry: structuredClone(res),
        outcome: { kind: 'received', status: { receivedThrough: i + 1 } },
      };
    }),
    end = page(request(2), [one, two]);
  r['native-http.json'] = {
    refused: [
      ['v1', 409],
      ['Origin', 403],
      ['Content-Type', 403],
      ['Authorization', 403],
      ['size', 413],
      ['signature', 409],
    ].map(([tag, status]) => ({ tag, status })),
    originals: ['aa', 'bb'],
    pages,
    duplicate: { kind: 'duplicate' },
    beforeCold: { receivedThrough: 2 },
    afterCold: { receivedThrough: 2 },
    end: { request: end.request, response: response(end), outcome: { kind: 'empty' } },
  };
  return r;
}
test('service-inbound wrapper binds all three commands, 33 cases and inherited browser process ownership', () => {
  const graph = JSON.parse(readFileSync('docs/release-validation-graph.json')),
    m = compileManifest(process.cwd(), graph),
    [s, ...rest] = selectStages(m, 'wrapper-account-service-inbound');
  assert.deepEqual(rest, []);
  validateStage(s);
  assert.equal(s.expect.cases.length, 33);
  assert.deepEqual(
    s.expect.steps.map((s) => s.deadlineMs),
    [60000, 120000, 90000],
  );
  assert.equal(s.deadlineMs, 270000);
  assert.deepEqual(
    s.expect.historyInputs.map((p) => [p.reference, p.path]),
    ['account-service/delivery.ts'].map((p) => ['4bb09042f37f68ec31f0d82587af608f599eb096', p]),
  );
  assert.equal(s.expect.dataInputs, undefined);
  assert.equal(s.fixture.kind, 'chromium-cdp');
  assert.equal(s.processPolicy, 'inherited-group-v1');
  assert.deepEqual(s.fileOutputs.required, serviceInboundReports);
  assert.equal(serviceInboundReports.length, 20);
  assert(m.rows.some((r) => r.kind === 'command' && r.requires?.includes(s.id)));
  for (const change of [
    { env: { MODE: 'other' } },
    { argv: [...s.argv, '--case', 'one'] },
    { fixture: undefined },
    { deadlineMs: 270001 },
    { fileOutputs: undefined },
    { expect: { kind: 'exit', exitCodes: [0] } },
    { expect: { ...s.expect, cases: s.expect.cases.slice(1) } },
    { expect: { ...s.expect, historyInputs: [] } },
  ])
    assert.throws(() => validateStage({ ...s, ...change }));
  graph.extraRoots.push({
    id: 'serviceInbound-filter',
    argv: ['node', serviceInboundCampaign, '--case', 'one'],
  });
  assert(
    compileManifest(process.cwd(), graph).rows.find(
      (r) => r.id === 'command:serviceInbound-filter:0',
    ).blocked,
  );
});
test('service-inbound trace rejects missing cases from any child or a lost typecheck exit', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'done-serviceInbound-trace-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'case-reports'));
  const s = serviceInboundCampaignStage(process.cwd()),
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
  const reports = s.expect.steps
    .filter((s) => s.kind !== 'exit')
    .map((step) =>
      step.kind === 'vitest'
        ? {
            schema: 1,
            adapter: 'vitest-v1',
            nonce: 'fresh:' + step.name,
            reason: 'passed',
            modules: step.expect.files.map((file) => ({ file, state: 'passed' })),
            errors: [],
            cases: step.expect.cases.map((c) => ({
              ...c,
              durationMs: 0,
              retryCount: 0,
              repeatCount: 0,
              expectedFailure: false,
              mode: 'run',
              errors: [],
            })),
          }
        : {
            schema: 1,
            nonce: 'fresh:' + step.name,
            phase: 'complete',
            cases: step.expect.cases,
            errors: [],
            summary: {
              success: true,
              counts: {
                tests: step.expect.cases.length,
                failed: 0,
                cancelled: 0,
                skipped: 0,
                todo: 0,
              },
            },
          },
    );
  const run = (v) => {
    v.reports.forEach((report, i) =>
      writeFileSync(
        join(dir, 'case-reports/' + s.expect.steps[i + 1].name + '.json'),
        JSON.stringify(report),
      ),
    );
    return reconcileCampaignTrace(s.expect.steps, v.trace, 'fresh', dir, reconcileCases);
  };
  assert.deepEqual(run({ trace, reports }).cases, s.expect.cases);
  for (const alter of [
    ...reports.map((_, i) => (v) => v.reports[i].cases.pop()),
    (v) => (v.trace.steps[0].code = 1),
    (v) => v.trace.steps[2].argv.pop(),
    (v) => (v.reports[1].nonce = 'fresh:controls'),
    (v) => (v.trace.steps[2].phase = 'running'),
  ]) {
    const bad = structuredClone({ trace, reports });
    alter(bad);
    assert.throws(() => run(bad));
  }
});
test('service-inbound reports require complete HTTP histories and effective control observations', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'done-serviceInbound-reports-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const sources = [{ path: serviceInboundCampaign, sha256: 'a'.repeat(64) }],
    r = {
      ...serviceInboundEvidence(),
      'sources.json': sources,
      'summary.json': {
        status: 'passed',
        startedAt: '2026-09-15T00:00:00.000Z',
        completedAt: '2026-09-15T00:00:01.000Z',
        stages: serviceInboundSteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
      },
    };
  const aux = ['results.xml', ...serviceInboundSteps.map((s) => s.name + '.log')];
  const save = (r) => {
    for (const [file, v] of Object.entries(r)) writeFileSync(join(dir, file), JSON.stringify(v));
    for (const file of aux) writeFileSync(join(dir, file), file === 'types.log' ? '' : 'observed');
  };
  save(r);
  reconcileServiceInboundReports(dir, sources);
  for (const alter of [
    (r) => (r['summary.json'].status = 'failed'),
    (r) => (r['sources.json'][0].sha256 = 'b'.repeat(64)),
    (r) => r['generated.json'].histories[0].observations.pop(),
  ]) {
    const bad = structuredClone(r);
    alter(bad);
    save(bad);
    assert.throws(() => reconcileServiceInboundReports(dir, sources));
  }
  for (const file of [...Object.keys(r), ...aux]) {
    save(r);
    rmSync(join(dir, file));
    assert.throws(() => reconcileServiceInboundReports(dir, sources));
  }
});

test('160 generated service-inbound report corruptions reject changed originals, replay, read-only inventory and page signatures', () => {
  const r = serviceInboundEvidence();
  reconcileServiceInboundEvidence(r);
  const restored = r['generated.json'].histories[0];
  restored.commands.splice(
    6,
    0,
    { op: 'append', limit: 1, cursor: 0 },
    { op: 'read', limit: 1, cursor: 0 },
  );
  const inventory = restored.observations[5].after,
    refusal = { kind: 'unknown', reason: 'ledger-integrity' };
  restored.observations.splice(
    6,
    0,
    {
      op: 'append',
      before: inventory,
      after: inventory,
      position: 2,
      envelope: 'bb',
      result: refusal,
    },
    {
      op: 'read',
      before: inventory,
      after: inventory,
      request: restored.observations[1].request,
      result: refusal,
    },
  );
  r['generated.json'].coverage.append++;
  r['generated.json'].coverage.read++;
  reconcileServiceInboundEvidence(r);
  for (const index of [6, 7]) {
    const bad = structuredClone(r);
    bad['generated.json'].histories[0].observations[index].result = {
      kind: 'decision',
      bytes: 'aa',
    };
    assert.throws(() => reconcileServiceInboundEvidence(bad), 'same-owner quarantine must refuse');
  }
  const cold = r['generated.json'].histories[1];
  cold.commands.pop();
  cold.observations.pop();
  r['generated.json'].coverage.restart--;
  cold.recovery = {
    before: inventory,
    after: inventory,
    read: { request: cold.observations[1].request, result: refusal },
    append: { position: 2, envelope: 'bb', result: refusal },
    restart: { before: inventory, after: inventory },
  };
  reconcileServiceInboundEvidence(r);
  for (const alter of [
    (h) => delete h.recovery,
    (h) => delete h.recovery.restart,
    (h) => (h.recovery.append.result.reason = 'unavailable'),
    (h) => (h.recovery.read.result.kind = 'decision'),
    (h) => (h.recovery.restart.after = 'ff'.repeat(32)),
  ]) {
    const bad = structuredClone(r);
    alter(bad['generated.json'].histories[1]);
    assert.throws(
      () => reconcileServiceInboundEvidence(bad),
      'cold recovery must retain explicit quarantine proof',
    );
  }
  const alters = [
    (h) => h.observations.pop(),
    (h) => (h.observations[0].envelope = 'bb'),
    (h) => (h.observations[1].after = '22'.repeat(32)),
    (h) => (h.observations[2].request += '00'),
    (h) => (h.observations[3].result.kind = 'decision'),
    (h) => (h.observations[5].faulted = h.observations[5].before),
    (h) => h.final.pop(),
    (h) => (h.final[0].result.bytes += '00'),
    (h) => (h.completed = false),
    (h) => (h.publicKey = '00'.repeat(32)),
  ];
  fc.assert(
    fc.property(fc.nat(7), fc.nat(alters.length - 1), (i, k) => {
      const bad = structuredClone(r);
      alters[k](bad['generated.json'].histories[i]);
      assert.throws(() => reconcileServiceInboundEvidence(bad));
    }),
    { seed: 150973, numRuns: 160 },
  );
});
test('160 generated service-inbound control corruptions reject missing refusal, activation, SIGKILL and cold HTTP evidence', () => {
  const r = serviceInboundEvidence();
  reconcileServiceInboundEvidence(r);
  const alters = [
    (r) => (r['control-reader.json'].baseline.result.kind = 'decision'),
    (r) => (r['control-witness.json'].mutant.result.kind = 'unknown'),
    (r) => (r['control-publisher.json'].publisherPolicyOmissions = 1),
    (r) => (r['control-publisher.json'].publisherLookup.result.kind = 'decision'),
    (r) => r['control-witness.json'].redundantWitness.pop(),
    (r) => r['control-registration.json'].activation.pop(),
    (r) => (r['control-signature.json'].mutant.result.bytes += '00'),
    (r) => (r['restart-signed.json'].replies = 1),
    (r) => (r['restart-verified.json'].signal = 'SIGTERM'),
    (r) => (r['native-http.json'].pages[0].retry.bytes = 'aa'),
    (r) => (r['native-http.json'].afterCold.receivedThrough = 1),
    (r) => (r['native-http.json'].refused[0].status = 200),
    (r) => r['generated.json'].coverage.read--,
  ];
  fc.assert(
    fc.property(fc.nat(alters.length - 1), (k) => {
      const bad = structuredClone(r);
      alters[k](bad);
      assert.throws(() => reconcileServiceInboundEvidence(bad));
    }),
    { seed: 150974, numRuns: 160 },
  );
});

function activationEvidence() {
  const hash = (v) => createHash('sha256').update(v).digest('hex'),
    keys = generateKeyPairSync('ed25519');
  const lp = (...vs) =>
    Buffer.concat(
      vs.map((v) => {
        const b = Buffer.from(v),
          n = Buffer.alloc(2);
        n.writeUInt16BE(b.length);
        return Buffer.concat([n, b]);
      }),
    );
  const signed = (domain, body) =>
    sign(null, lp(domain, hash(JSON.stringify(body))), keys.privateKey).toString('hex');
  const pin = {
    v: 1,
    serviceId: 'ab'.repeat(16),
    origin: 'https://fixture.invalid',
    rpId: 'fixture.invalid',
    authRoot: keys.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex'),
  };
  const context = (nonce, expiresAt) => ({
    v: 1,
    pin,
    accountId: 'a'.repeat(43),
    requestDigest: '12'.repeat(32),
    offerHead: '23'.repeat(32),
    completionDigest: hash('{}'),
    credentialId: 'AQ',
    nonce: nonce.repeat(32),
    expiresAt,
  });
  const challenge = (nonce, expiry) => {
    const c = context(nonce, expiry);
    return {
      v: 1,
      kind: 'promotion-activation-challenge',
      context: c,
      signature: signed('done/promotion-activation-challenge/v1', c),
    };
  };
  const c1 = challenge('34', 601000),
    c2 = challenge('45', 1201000);
  const assertion = (c) => ({
    response: {
      clientDataJSON: Buffer.from(
        JSON.stringify({
          type: 'webauthn.get',
          origin: pin.origin,
          challenge: Buffer.from(
            hash(lp('done/promotion-activation/v1', hash(JSON.stringify(c.context)))),
            'hex',
          ).toString('base64url'),
        }),
      ).toString('base64url'),
    },
  });
  const response = assertion(c2),
    oldResponse = assertion(c1),
    proof = hash(JSON.stringify(response));
  const receipt = (c = c2, asserted = response) => {
    const body = {
      v: 2,
      kind: 'promotion-receipt',
      offer: {
        epoch: { accountId: c.context.accountId, requestDigest: c.context.requestDigest },
        head: c.context.offerHead,
      },
      completion: {},
      epochSignature: '00'.repeat(64),
      activation: { context: c.context, proofHash: hash(JSON.stringify(asserted)) },
    };
    return { ...body, signature: signed('done/promotion-receipt/v2', body) };
  };
  const accepted = receipt(),
    refused = { ok: false, refusal: 'fixture' },
    values = {};
  const remember = (v) => {
    const h = hash(JSON.stringify(v));
    values[h] = v;
    return h;
  };
  const first = remember(c1),
    second = remember(c2),
    rec = remember(accepted),
    bad = remember(refused);
  const initial = {
    inventory: '00'.repeat(32),
    accountState: 'pending',
    challengeNonce: null,
    proofHash: null,
    receipt: null,
  };
  let last = initial,
    now = 1000;
  const observations = [];
  const step = (cmd, result, change = {}, extras = {}) => {
    const before = structuredClone(last),
      nowBefore = now;
    if (cmd === 'advance') now += 600000;
    last = { ...last, ...change };
    observations.push({
      cmd,
      nowBefore,
      nowAfter: now,
      before,
      after: structuredClone(last),
      result,
      ...extras,
    });
  };
  step('challenge', first, { inventory: '01'.repeat(32), challengeNonce: c1.context.nonce });
  step('advance', null);
  step('challenge', second, { inventory: '02'.repeat(32), challengeNonce: c2.context.nonce });
  step(
    'old',
    bad,
    {},
    { chosenNonce: c1.context.nonce, proofHash: hash(JSON.stringify(oldResponse)) },
  );
  step(
    'finish',
    rec,
    { inventory: '03'.repeat(32), accountState: 'active', proofHash: proof, receipt: rec },
    { chosenNonce: c2.context.nonce, proofHash: proof },
  );
  step('restart', null);
  step('changed', bad);
  step('abandon', bad);
  const history = {
    commands: observations.map((o) => o.cmd),
    initial,
    observations,
    state: 'active',
    issued: 2,
    completed: true,
  };
  const r = {
    'before.json': {
      commit: '4f71bac',
      sources: [],
      assertionCalls: 0,
      receiptVersion: 1,
      receipt: { v: 1, kind: 'promotion-receipt' },
      accountState: 'active',
      activatedWithoutFreshAssertion: true,
      newReaderRefusesActualOldReceipt: true,
      finishFields: ['retryKey', 'requestDigest', 'completion'],
    },
    'generated-activation.json': {
      seed: 9110401,
      status: 'passed',
      numRuns: 120,
      numShrinks: 0,
      failed: false,
      counterexample: null,
      counterexamplePath: null,
      histories: Array.from({ length: 120 }, () => structuredClone(history)),
      values,
    },
    'control-generated.json': {
      seed: 9110402,
      failed: true,
      numShrinks: 1,
      path: '0:0',
      counterexample: [[1]],
      attempts: [2, 1].map((n) => ({
        delays: [n],
        old: c1,
        fresh: c2,
        assertion: oldResponse,
        result: receipt(c2, oldResponse),
      })),
    },
    'native-cancel.json': {
      seenAbort: true,
      beforeRelease: { settled: false, otherDone: false, pending: 1 },
      finishes: 0,
      result: accepted,
    },
  };
  for (const alg of [-8, -7])
    r['activation-' + alg + '.json'] = {
      challenge: c2,
      receipt: accepted,
      assertion: response,
      assertionHash: proof,
      counter: 17,
    };
  for (const gate of ['assertion', 'expiry', 'target'])
    r['control-' + gate + '.json'] = {
      gate,
      observations: ['baseline', 'mutant'].map((variant) => ({
        variant,
        challenge: c2,
        result: variant === 'baseline' ? refused : accepted,
        before: '11'.repeat(32),
        after: (variant === 'baseline' ? '11' : '22').repeat(32),
        assertion: gate === 'assertion' ? {} : response,
        completionDigest: gate === 'target' ? '66'.repeat(32) : c2.context.completionDigest,
        now: 1201000,
        accountState: variant === 'baseline' ? 'pending' : 'active',
      })),
    };
  for (const side of ['before-commit', 'after-commit'])
    r['restart-' + side + '.json'] = {
      side,
      operation: 'challenge-promotion',
      code: null,
      signal: 'SIGKILL',
      before: '00'.repeat(32),
      after: (side === 'before-commit' ? '11' : '00').repeat(32),
      result: c2,
      retry: c2,
    };
  for (const gate of ['signature', 'target'])
    r['control-client-' + gate + '.json'] = {
      gate,
      baselinePrompts: 0,
      mutantPrompts: 1,
      marker: 'admission-offered',
    };
  for (const stage of ['prompt', 'lost-finish'])
    r['native-' + stage + '.json'] = {
      stage,
      coldPrompts: stage === 'prompt' ? 1 : 0,
      beforeCrash: stage === 'prompt' ? null : accepted,
      receipt: accepted,
    };
  return r;
}

test('activation wrapper binds six commands, 25 cases and the complete 26-file historical reproduction', () => {
  const graph = JSON.parse(readFileSync('docs/release-validation-graph.json')),
    m = compileManifest(process.cwd(), graph),
    [s, ...rest] = selectStages(m, 'wrapper-account-activation');
  assert.deepEqual(rest, []);
  validateStage(s);
  assert.equal(s.expect.cases.length, 25);
  assert.deepEqual(
    s.expect.steps.map((s) => s.deadlineMs),
    [60000, 30000, 120000, 30000, 30000, 180000],
  );
  assert.equal(s.deadlineMs, 450000);
  assert.equal(s.expect.historyInputs.length, 26);
  assert.equal(s.fileOutputs.required.length, 31);
  assert.deepEqual(
    s.expect.historyInputs.map((p) => p.path),
    activationHistoricalFiles,
  );
  assert(s.expect.historyInputs.every((p) => p.reference === activationReference));
  for (const change of [
    { env: { MODE: 'other' } },
    { argv: [...s.argv, '--case', 'one'] },
    { fixture: undefined },
    { deadlineMs: 450001 },
    { fileOutputs: undefined },
    { expect: { kind: 'exit', exitCodes: [0] } },
    { expect: { ...s.expect, cases: s.expect.cases.slice(1) } },
    { expect: { ...s.expect, historyInputs: s.expect.historyInputs.slice(1) } },
  ])
    assert.throws(() => validateStage({ ...s, ...change }));
  assert.throws(() => validateHistoricalInputs(s.expect.historyInputs.slice(0, 9)));
  assert.throws(() =>
    validateHistoricalInputs(s.expect.historyInputs.map((p) => ({ ...p, reference: p.revision }))),
  );
  graph.extraRoots.push({
    id: 'activation-filter',
    argv: ['node', activationCampaign, '--case', 'one'],
  });
  assert(
    compileManifest(process.cwd(), graph).rows.find((r) => r.id === 'command:activation-filter:0')
      .blocked,
  );
});

test('activation trace requires both exit steps and exact nonce-bound cases from all four children', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'done-activation-trace-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'case-reports'));
  const s = activationCampaignStage(process.cwd()),
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
  const children = s.expect.steps.filter((s) => s.kind === 'node');
  const reports = children.map((s) => ({
    schema: 1,
    nonce: 'fresh:' + s.name,
    phase: 'complete',
    cases: s.expect.cases,
    errors: [],
    summary: {
      success: true,
      counts: { tests: s.expect.cases.length, failed: 0, cancelled: 0, skipped: 0, todo: 0 },
    },
  }));
  const run = (v) => {
    v.reports.forEach((r, i) =>
      writeFileSync(join(dir, 'case-reports/' + children[i].name + '.json'), JSON.stringify(r)),
    );
    return reconcileCampaignTrace(s.expect.steps, v.trace, 'fresh', dir, reconcileCases);
  };
  assert.deepEqual(run({ trace, reports }).cases, s.expect.cases);
  for (const alter of [
    ...reports.map((_, i) => (v) => v.reports[i].cases.pop()),
    (v) => (v.trace.steps[0].code = 1),
    (v) => (v.trace.steps[1].code = 1),
    (v) => v.trace.steps[2].argv.pop(),
    (v) => (v.reports[2].nonce = 'stale'),
    (v) => (v.trace.phase = 'running'),
  ]) {
    const v = structuredClone({ trace, reports });
    alter(v);
    assert.throws(() => run(v));
  }
});

test('activation reports bind historical bytes and refuse incomplete summaries, sources and observations', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'done-activation-reports-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const sources = [{ path: activationCampaign, sha256: 'a'.repeat(64) }],
    r = {
      ...activationEvidence(),
      'sources.json': sources,
      'summary.json': {
        status: 'passed',
        startedAt: '2026-09-16T00:00:00.000Z',
        completedAt: '2026-09-16T00:00:01.000Z',
        stages: activationSteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
      },
    };
  const aux = activationReports.filter((f) => f.endsWith('.log') || f.endsWith('.xml'));
  const save = (v) => {
    for (const [f, b] of Object.entries(v)) writeFileSync(join(dir, f), JSON.stringify(b));
    for (const f of aux) writeFileSync(join(dir, f), f === 'types.log' ? '' : 'observed');
  };
  save(r);
  reconcileActivationReports(dir, sources, []);
  for (const alter of [
    (r) => (r['summary.json'].status = 'failed'),
    (r) => (r['sources.json'][0].sha256 = 'b'.repeat(64)),
    (r) => r['before.json'].sources.push({ path: 'extra', sha256: '00' }),
    (r) => r['generated-activation.json'].histories[0].observations.pop(),
  ]) {
    const bad = structuredClone(r);
    alter(bad);
    save(bad);
    assert.throws(() => reconcileActivationReports(dir, sources, []));
  }
  for (const f of [...Object.keys(r), ...aux]) {
    save(r);
    rmSync(join(dir, f));
    assert.throws(() => reconcileActivationReports(dir, sources, []));
  }
});

test('160 generated activation histories reject clock, consumption, inventory, retained-result and signature corruption', () => {
  const r = activationEvidence();
  reconcileActivationEvidence(r);
  const changes = [
    (h) => h.observations.pop(),
    (h) => h.observations[0].nowAfter++,
    (h) => (h.observations[3].chosenNonce = '00'.repeat(32)),
    (h) => (h.observations[4].proofHash = '00'.repeat(32)),
    (h) => (h.observations[5].after.inventory = '77'.repeat(32)),
    (h) => (h.observations[4].after.receipt = null),
    (h) => (h.completed = false),
    (h) => h.issued++,
    (h) => (h.state = 'cancelled'),
  ];
  fc.assert(
    fc.property(fc.nat(119), fc.nat(changes.length - 1), (i, k) => {
      const bad = structuredClone(r);
      changes[k](bad['generated-activation.json'].histories[i]);
      assert.throws(() => reconcileActivationEvidence(bad));
    }),
    { seed: 150975, numRuns: 160 },
  );
  const bad = structuredClone(r),
    g = bad['generated-activation.json'];
  Object.values(g.values).find((v) => v.kind === 'promotion-receipt').signature = '00'.repeat(64);
  assert.throws(() => reconcileActivationEvidence(bad));
});

test('160 generated activation controls reject absent baseline, false mutation, historical proof, SIGKILL and browser recovery claims', () => {
  const r = activationEvidence();
  reconcileActivationEvidence(r);
  const changes = [
    (r) => (r['before.json'].assertionCalls = 1),
    (r) => (r['control-assertion.json'].observations[0].result.ok = true),
    (r) => (r['control-target.json'].observations[1].accountState = 'pending'),
    (r) => (r['control-expiry.json'].observations[0].now = 0),
    (r) => (r['control-generated.json'].numShrinks = 0),
    (r) => (r['restart-after-commit.json'].after = '88'.repeat(32)),
    (r) => (r['restart-before-commit.json'].signal = 'SIGTERM'),
    (r) => (r['control-client-signature.json'].baselinePrompts = 1),
    (r) => (r['native-cancel.json'].beforeRelease.otherDone = true),
    (r) => (r['native-lost-finish.json'].coldPrompts = 1),
    (r) => (r['activation--7.json'].assertionHash = '00'.repeat(32)),
  ];
  fc.assert(
    fc.property(fc.nat(changes.length - 1), (k) => {
      const bad = structuredClone(r);
      changes[k](bad);
      assert.throws(() => reconcileActivationEvidence(bad));
    }),
    { seed: 150976, numRuns: 160 },
  );
});

function boundsEvidence() {
  const key = generateKeyPairSync('ed25519'),
    pub = key.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
  const h = (b) => createHash('sha256').update(b).digest('hex');
  const lp = (a) =>
    Buffer.concat(
      a.map((v) => {
        const b = Buffer.from(String(v)),
          n = Buffer.alloc(2);
        n.writeUInt16BE(b.length);
        return Buffer.concat([n, b]);
      }),
    );
  const signed = (b) => sign(null, b, key.privateKey).toString('hex');
  const rawFields = (c) => {
    const m = c.manifest,
      a = c.admission,
      v = m.v,
      sv = v === 2 ? h(Buffer.from(m.sv, 'hex')) : m.sv,
      ds = v === 2 ? h(Buffer.from(m.ds, 'hex')) : m.ds;
    return {
      manifest: [
        'done/cp-manifest/v' + v,
        v,
        m.workspaceId,
        m.epoch,
        m.epochHead,
        m.generation,
        m.checkpointDigest,
        sv,
        ds,
        m.headVectorDigest,
        m.producer,
      ],
      admission: [
        'done/cp-admit/v' + v,
        v,
        a.workspaceId,
        a.checkpointDigest,
        a.manifestDigest,
        sv,
        ds,
        a.headBaselineDigest,
        a.derivation,
        a.admittingCredential,
        a.selfAdmitted,
        a.decisionParent,
      ],
    };
  };
  const make = (sv, ds, v = 2) => {
    const manifest = {
      v,
      workspaceId: '11'.repeat(16),
      epoch: 1,
      epochHead: '22'.repeat(32),
      generation: 1,
      checkpointDigest: '33'.repeat(32),
      sv,
      ds,
      headVectorDigest: '44'.repeat(32),
      producer: '55'.repeat(16),
      signature: '00'.repeat(64),
    };
    const admission = {
      v,
      workspaceId: manifest.workspaceId,
      checkpointDigest: manifest.checkpointDigest,
      manifestDigest: '66'.repeat(32),
      derivedSv: sv,
      derivedDs: ds,
      headBaselineDigest: manifest.headVectorDigest,
      derivation: 'yjs-13.6.31-sv-ds-v1',
      admittingCredential: manifest.producer,
      selfAdmitted: 1,
      decisionParent: '00'.repeat(32),
      signature: '00'.repeat(64),
    };
    const c = { manifest, admission },
      mb = lp(rawFields(c).manifest);
    manifest.signature = signed(mb);
    admission.manifestDigest = h(mb);
    admission.signature = signed(lp(rawFields(c).admission));
    return c;
  };
  const pack = (c) => {
    const { sv, ds, ...manifest } = c.manifest,
      { derivedSv: _sv, derivedDs: _ds, ...admission } = c.admission;
    return {
      manifest,
      admission,
      coverage: {
        sv: { bytes: sv.length / 2, sha256: h(Buffer.from(sv, 'hex')) },
        ds: { bytes: ds.length / 2, sha256: h(Buffer.from(ds, 'hex')) },
      },
    };
  };
  const messages = (c) =>
    Object.fromEntries(Object.entries(rawFields(c)).map(([k, v]) => [k, lp(v).toString('hex')]));
  const inputs = Array.from({ length: 80 }, () => ({ sv: 5, ds: 2, byte: 7 }));
  const boundaries = [1, 32766, 32767, 32768, 65536];
  for (const n of boundaries) inputs.push({ sv: n, ds: n, byte: 17 });
  const observations = inputs.map((input) => {
    const c = make(
      Buffer.alloc(input.sv, input.byte).toString('hex'),
      Buffer.alloc(input.ds, input.byte).toString('hex'),
    );
    const mutations = ['sv', 'ds'].map((field) => {
      const bad = structuredClone(c),
        af = field === 'sv' ? 'derivedSv' : 'derivedDs';
      bad.manifest[field] = (input.byte === 0 ? '01' : '00') + bad.manifest[field].slice(2);
      bad.admission[af] = bad.manifest[field];
      bad.admission.manifestDigest = h(lp(rawFields(bad).manifest));
      return { field, completion: pack(bad), messages: messages(bad), error: 'signature' };
    });
    return { input, completion: pack(c), messages: messages(c), mutations };
  });
  const r = {
    'generated-codecs.json': {
      seed: 9112071,
      histories: 85,
      oldBoundaries: boundaries,
      generatedInputs: inputs,
      observations,
      publicKey: pub,
      run: {
        numRuns: 80,
        numShrinks: 0,
        failed: false,
        counterexample: null,
        counterexamplePath: null,
      },
    },
  };
  const inventory = '77'.repeat(32),
    refused = { ok: false, refusal: 'fixture' };
  // The upper fixture describes repeated bytes and never embeds the large raw completion.
  const upper = {
    manifest: { ...observations[0].completion.manifest },
    admission: { ...observations[0].completion.admission },
    coverage: {
      sv: { bytes: 16777214, sha256: h(Buffer.alloc(16777214, 1)) },
      ds: { bytes: 2, sha256: h(Buffer.alloc(2)) },
    },
  };
  const upperFields = {
    manifest: [
      'done/cp-manifest/v2',
      2,
      upper.manifest.workspaceId,
      1,
      upper.manifest.epochHead,
      1,
      upper.manifest.checkpointDigest,
      upper.coverage.sv.sha256,
      upper.coverage.ds.sha256,
      upper.manifest.headVectorDigest,
      upper.manifest.producer,
    ],
  };
  upper.manifest.signature = signed(lp(upperFields.manifest));
  upper.admission.manifestDigest = h(lp(upperFields.manifest));
  upper.admission.signature = signed(
    lp([
      'done/cp-admit/v2',
      2,
      upper.admission.workspaceId,
      upper.admission.checkpointDigest,
      upper.admission.manifestDigest,
      upper.coverage.sv.sha256,
      upper.coverage.ds.sha256,
      upper.admission.headBaselineDigest,
      upper.admission.derivation,
      upper.admission.admittingCredential,
      1,
      upper.admission.decisionParent,
    ]),
  );
  r['upper-bound.json'] = {
    combinedBytes: 16777216,
    completionJsonBytes: 67110864,
    receiptJsonBytes: 67112864,
    completion: upper,
    publicKey: pub,
    receiptHash: inventory,
    coldReceiptHash: inventory,
    rowsBefore: inventory,
    rowsAfter: inventory,
    oversize: ['sv', 'ds'].map((field) => ({
      field,
      combinedBytes: 16777217,
      errors: ['bound', 'bound', 'bound'],
      result: refused,
    })),
    malformed: ['', 'A0', '0', 'gg', null, [], 42].flatMap((value) =>
      ['sv', 'ds'].map((field) => ({ field, value, error: 'invalid' })),
    ),
  };
  const control = {
    semanticRederivation: ['sv', 'ds'],
    omittedSignatureFields: [
      'manifest.sv',
      'manifest.ds',
      'admission.derivedSv',
      'admission.derivedDs',
    ],
    observations: [],
    omitted: [],
  };
  for (const field of ['sv', 'ds']) {
    const real = { sv: '00', ds: '0000' },
      badParts = { ...real, [field]: '0100' },
      c = make(badParts.sv, badParts.ds),
      base = make(real.sv, real.ds);
    control.observations.push({
      field,
      real,
      badParts,
      completion: structuredClone(c),
      publicKey: pub,
      error: 'coverage',
      serviceResult: { kind: 'promotion-receipt', completion: structuredClone(c) },
    });
    for (const which of ['manifest', 'admission']) {
      if (which === 'admission') c.admission.manifestDigest = base.admission.manifestDigest;
      const a = rawFields(base)[which],
        b = rawFields(c)[which],
        at = which === 'manifest' ? (field === 'sv' ? 7 : 8) : field === 'sv' ? 5 : 6,
        one = lp(a.filter((_, i) => i !== at)),
        changed = lp(b.filter((_, i) => i !== at));
      control.omitted.push({
        field,
        which,
        publicKey: pub,
        one: one.toString('hex'),
        changed: changed.toString('hex'),
        signature: signed(one),
        baseline: lp(a).toString('hex'),
        baselineChanged: lp(b).toString('hex'),
        baselineSignature: signed(lp(a)),
      });
    }
  }
  r['controls.json'] = control;
  const v1 = make('00', '0000', 1),
    pairs = [
      [1, 1],
      [1, 2],
      [2, 1],
      [3, 2],
      [2, 3],
    ];
  r['versions.json'] = {
    oldCompletion: v1,
    publicKey: pub,
    pairs,
    refusals: pairs.map((versions) => ({ versions, error: 'Unsupported', result: refused })),
    genuineRefusal: refused,
    oldError: 'Unsupported',
    rowsBefore: inventory,
    rowsAfterRefusals: inventory,
    retainedBefore: inventory,
    retainedAfter: inventory,
    retainedReceipt: { kind: 'promotion-receipt', completion: v1 },
    coldBegin: refused,
    coldFinish: refused,
  };
  const histories = [];
  for (const kind of ['sv', 'ds'])
    for (const count of [12000, 12317, 13001]) {
      const doc = new Y.Doc({ gc: false }),
        text = doc.getText('master');
      doc.clientID = 10000;
      doc.transact(() => {
        if (kind === 'sv') {
          for (let i = 0; i < count; i++) {
            doc.clientID = 10000 + i;
            text.insert(text.length, 'x');
          }
        } else {
          text.insert(0, '.x'.repeat(count));
          for (let i = count - 1; i >= 0; i--) text.delete(i * 2 + 1, 1);
        }
      });
      const sv = Buffer.from(Y.encodeStateVector(doc)),
        ds = Buffer.from(Y.encodeSnapshot(Y.createSnapshot(Y.snapshot(doc).ds, new Map()))),
        update = Buffer.from(Y.encodeStateAsUpdate(doc));
      histories.push({
        kind,
        count,
        svBytes: sv.length,
        dsBytes: ds.length,
        checkpointBytes: update.length,
        updateBase64: update.toString('base64'),
        visible: text.toString(),
        completion: pack(make(sv.toString('hex'), ds.toString('hex'))),
        publicKey: pub,
      });
      doc.destroy();
    }
  r['long-histories.json'] = histories;
  for (const kind of ['sv', 'ds']) {
    const h = histories.find((x) => x.kind === kind);
    r['native-long-' + kind + '.json'] = {
      ...h,
      v: 2,
      updateBytes: h.checkpointBytes,
      receiptHash: inventory,
      coldReceiptHash: inventory,
      before: inventory,
      after: inventory,
      markerBefore: inventory,
      markerAfter: inventory,
      errors: ['Unsupported', 'Malformed'],
    };
    const c = control.observations.find((x) => x.field === kind).completion;
    r['native-lie-' + kind + '.json'] = {
      kind,
      completion: c,
      publicKey: pub,
      error: 'Retained completion changed',
      finishCalls: 0,
      before: inventory,
      after: inventory,
      carrierBefore: inventory,
      carrierAfter: inventory,
    };
  }
  r['native-v1.json'] = {
    stage: 'admission-offered',
    completion: v1,
    publicKey: pub,
    error: 'Unsupported',
    before: inventory,
    after: inventory,
    carrierBefore: inventory,
    carrierAfter: inventory,
  };
  r['native-preflight.json'] = {
    testBound: 32,
    stage: 'genesis-prepared',
    error: 'coverage',
    admissionCalls: 0,
    before: inventory,
    after: inventory,
    carrierBefore: inventory,
    carrierAfter: inventory,
  };
  const cases = [];
  for (const bytes of [32766, 32767, 32768])
    for (const field of ['sv', 'ds'])
      for (const name of ['manifest', 'admission', 'parser'])
        cases.push({
          bytes,
          field,
          name,
          error:
            bytes > 32767
              ? name === 'parser'
                ? 'Invalid coverage bytes'
                : 'Protocol field too long'
              : null,
        });
  for (const kind of ['sv', 'ds']) {
    const h = histories.find((x) => x.kind === kind);
    cases.push({
      history: kind,
      count: 12000,
      svBytes: h.svBytes,
      dsBytes: h.dsBytes,
      updateBytes: h.checkpointBytes,
      refusedBoth: true,
      errors: ['Protocol field too long', 'Protocol field too long'],
    });
  }
  r['reproduction.json'] = {
    commit: '6398e33',
    source: { path: 'account-protocol/admission.ts', sha256: 'aa'.repeat(32) },
    cases,
  };
  return r;
}

test('admission-bounds wrapper binds five commands, eleven cases, historical files and unchanged child limits', () => {
  const graph = JSON.parse(readFileSync('docs/release-validation-graph.json')),
    m = compileManifest(process.cwd(), graph),
    [s, ...rest] = selectStages(m, 'wrapper-account-admission-bounds');
  assert.deepEqual(rest, []);
  validateStage(s);
  assert.equal(s.expect.cases.length, 11);
  assert.equal(s.deadlineMs, 420000);
  assert.deepEqual(
    s.expect.steps.map((v) => v.deadlineMs),
    [60000, 30000, 30000, 120000, 180000],
  );
  assert.deepEqual(
    s.expect.historyInputs.map((v) => [v.reference, v.path]),
    boundsHistoricalFiles.map((p) => [boundsReference, p]),
  );
  assert.equal(s.fileOutputs.required.length, 23);
  for (const change of [
    { argv: [...s.argv, '--case', 'one'] },
    { env: { MODE: 'other' } },
    { fixture: undefined },
    { deadlineMs: 420001 },
    { fileOutputs: undefined },
    { expect: { kind: 'exit', exitCodes: [0] } },
    { expect: { ...s.expect, cases: s.expect.cases.slice(1) } },
    { expect: { ...s.expect, historyInputs: s.expect.historyInputs.slice(1) } },
  ])
    assert.throws(() => validateStage({ ...s, ...change }));
  graph.extraRoots.push({ id: 'bounds-filter', argv: ['node', boundsCampaign, '--case', 'one'] });
  assert(
    compileManifest(process.cwd(), graph).rows.find((r) => r.id === 'command:bounds-filter:0')
      .blocked,
  );
});

test('admission-bounds trace needs all three exit steps and both exact child case domains', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'done-bounds-trace-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'case-reports'));
  const s = boundsCampaignStage(process.cwd()),
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
  const children = s.expect.steps.filter((s) => s.kind === 'node'),
    reports = children.map((s) => ({
      schema: 1,
      nonce: 'fresh:' + s.name,
      phase: 'complete',
      cases: s.expect.cases,
      errors: [],
      summary: {
        success: true,
        counts: { tests: s.expect.cases.length, failed: 0, cancelled: 0, skipped: 0, todo: 0 },
      },
    }));
  const run = (v) => {
    v.reports.forEach((r, i) =>
      writeFileSync(join(dir, 'case-reports/' + children[i].name + '.json'), JSON.stringify(r)),
    );
    return reconcileCampaignTrace(s.expect.steps, v.trace, 'fresh', dir, reconcileCases);
  };
  assert.deepEqual(run({ trace, reports }).cases, s.expect.cases);
  for (const alter of [
    ...[0, 1, 2].map((i) => (v) => (v.trace.steps[i].code = 1)),
    ...[0, 1].map((i) => (v) => v.reports[i].cases.pop()),
    (v) => v.trace.steps[2].argv.pop(),
    (v) => (v.reports[1].nonce = 'stale'),
    (v) => (v.trace.phase = 'running'),
  ]) {
    const bad = structuredClone({ trace, reports });
    alter(bad);
    assert.throws(() => run(bad));
  }
});

test('admission-bounds reports bind sources and historical reads with all semantic and auxiliary files', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'done-bounds-reports-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const sources = [{ path: boundsCampaign, sha256: 'a'.repeat(64) }],
    history = [{ path: 'account-protocol/admission.ts', sha256: 'aa'.repeat(32) }];
  const r = {
    ...boundsEvidence(),
    'sources.json': sources,
    'summary.json': {
      status: 'passed',
      startedAt: '2026-09-16T00:00:00.000Z',
      completedAt: '2026-09-16T00:00:01.000Z',
      stages: boundsSteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
    },
  };
  const aux = boundsReports.filter((f) => f.endsWith('.log') || f.endsWith('.xml'));
  const save = (v) => {
    for (const [f, b] of Object.entries(v)) writeFileSync(join(dir, f), JSON.stringify(b));
    for (const f of aux) writeFileSync(join(dir, f), f === 'types.log' ? '' : 'observed');
  };
  save(r);
  reconcileBoundsReports(dir, sources, history);
  for (const alter of [
    (r) => (r['summary.json'].status = 'failed'),
    (r) => (r['sources.json'][0].sha256 = 'b'.repeat(64)),
    (r) => (r['reproduction.json'].source.sha256 = '00'.repeat(32)),
    (r) => r['long-histories.json'].pop(),
    (r) => (r['reproduction.json'].cases[14].error = 'Protocol field too long'),
  ]) {
    const bad = structuredClone(r);
    alter(bad);
    save(bad);
    assert.throws(() => reconcileBoundsReports(dir, sources, history));
  }
  for (const file of [...Object.keys(r), ...aux]) {
    save(r);
    rmSync(join(dir, file));
    assert.throws(() => reconcileBoundsReports(dir, sources, history));
  }
});

test('160 generated descriptor-report corruptions reject changed decoded bytes, missing cases and invalid signatures', () => {
  const r = boundsEvidence(),
    g = r['generated-codecs.json'];
  reconcileBoundsCodecs(g);
  const changes = [
    (o) => (o.input.byte = (o.input.byte + 1) % 256),
    (o) => (o.completion.coverage.sv.sha256 = '00'.repeat(32)),
    (o) => (o.completion.manifest.signature = '00'.repeat(64)),
    (o) => (o.messages.admission = '00'),
    (o) => o.mutations.pop(),
    (o) => (o.mutations[0].completion.admission.manifestDigest = '00'.repeat(32)),
    (o) => (o.mutations[1].error = null),
  ];
  fc.assert(
    fc.property(fc.nat(84), fc.nat(changes.length - 1), (i, k) => {
      const bad = structuredClone(g);
      changes[k](bad.observations[i]);
      assert.throws(() => reconcileBoundsCodecs(bad));
    }),
    { seed: 150978, numRuns: 160 },
  );
  for (const change of [
    (v) => v.observations.pop(),
    (v) => v.generatedInputs.pop(),
    (v) => (v.run.failed = true),
  ]) {
    const bad = structuredClone(g);
    change(bad);
    assert.throws(() => reconcileBoundsCodecs(bad));
  }
  const u = r['upper-bound.json'];
  reconcileBoundsUpper(u);
  for (const change of [
    (v) => v.combinedBytes++,
    (v) => v.completion.coverage.sv.bytes++,
    (v) => (v.rowsAfter = '00'.repeat(32)),
    (v) => (v.oversize[0].result.ok = true),
    (v) => v.malformed.pop(),
  ]) {
    const bad = structuredClone(u);
    change(bad);
    assert.throws(() => reconcileBoundsUpper(bad));
  }
});

test('160 generated bounds controls reject rescued signatures, rewritten carriers, network activity and incomplete replay', () => {
  const r = boundsEvidence();
  reconcileBoundsControls(r['controls.json']);
  reconcileBoundsVersions(r['versions.json']);
  reconcileBoundsNativeControls(r);
  const controls = [
    (c) => c.observations.pop(),
    (c) => (c.observations[0].serviceResult.completion.manifest.signature = '00'.repeat(64)),
    (c) => (c.omitted[0].baselineChanged = c.omitted[0].baseline),
    (c) => (c.omitted[3].signature = '00'.repeat(64)),
  ];
  const native = [
    (r) => r['native-lie-sv.json'].finishCalls++,
    (r) => (r['native-lie-ds.json'].carrierAfter = '00'.repeat(32)),
    (r) => (r['native-v1.json'].completion.manifest.v = 2),
    (r) => r['native-preflight.json'].admissionCalls++,
    (r) => (r['native-preflight.json'].stage = 'genesis'),
    (r) => (r['native-preflight.json'].after = '00'.repeat(32)),
  ];
  fc.assert(
    fc.property(fc.nat(controls.length - 1), fc.nat(native.length - 1), (a, b) => {
      const c = structuredClone(r['controls.json']);
      controls[a](c);
      assert.throws(() => reconcileBoundsControls(c));
      const n = structuredClone(r);
      native[b](n);
      assert.throws(() => reconcileBoundsNativeControls(n));
    }),
    { seed: 150979, numRuns: 160 },
  );
  const h = r['long-histories.json'][0];
  reconcileBoundsReplay(h);
  for (const change of [
    (h) => (h.visible += 'lost'),
    (h) => (h.completion.coverage.ds.sha256 = '00'.repeat(32)),
    (h) => (h.updateBase64 = Buffer.from([0]).toString('base64')),
    (h) => h.checkpointBytes++,
  ]) {
    const bad = structuredClone(h);
    change(bad);
    assert.throws(() => reconcileBoundsReplay(bad));
  }
  const doc = new Y.Doc({ gc: false });
  doc.getText('master').insert(0, 'before');
  const vector = Y.encodeStateVector(doc);
  doc.getText('master').insert(6, 'dependent');
  const suffix = Buffer.from(Y.encodeStateAsUpdate(doc, vector)).toString('base64');
  doc.destroy();
  assert.throws(() => reconcileBoundsReplay({ ...h, updateBase64: suffix }), /Incomplete replay/);
  const bad = structuredClone(r['versions.json']);
  bad.retainedAfter = '00'.repeat(32);
  assert.throws(() => reconcileBoundsVersions(bad));
});
