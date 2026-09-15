import {
  inboundCodecsCampaign,
  inboundCodecsCampaignStage,
  inboundCodecsSteps,
  inboundCodecsReports,
  inboundCodecsMutations,
  reconcileInboundCodecsReports,
  reconcileInboundCodecsEvidence,
} from '../../scripts/release-validation/account-inbound-codecs-wrapper.mjs';
import { createHash } from 'node:crypto';
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
test('inbound preparation wrapper binds two exact invocations, 72 cases and both vector inputs', () => {
  const graph = JSON.parse(readFileSync('docs/release-validation-graph.json')),
    m = compileManifest(process.cwd(), graph),
    [s, ...rest] = selectStages(m, 'wrapper-account-inbound-prep');
  assert.deepEqual(rest, []);
  validateStage(s);
  assert.equal(s.expect.cases.length, 72);
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
test('inbound codecs wrapper retains three exact commands, 114 cases and isolated preparation reports', () => {
  const graph = JSON.parse(readFileSync('docs/release-validation-graph.json')),
    m = compileManifest(process.cwd(), graph),
    [s, ...rest] = selectStages(m, 'wrapper-account-inbound-codecs');
  assert.deepEqual(rest, []);
  validateStage(s);
  assert.equal(s.expect.cases.length, 114);
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
