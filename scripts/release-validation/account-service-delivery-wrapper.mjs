import { historicalInput, validateHistoricalInputs } from './historical-inputs.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatedNodeDeclarations } from './census.mjs';

export const serviceDeliveryCampaign = 'scripts/account-service-delivery/run.mjs';
export const serviceDeliveryFiles = ['core', 'generated', 'restart', 'controls'].map(
  (name) => `test/account-service-delivery/${name}.test.mjs`,
);
export const serviceDeliverySteps = [
  {
    name: 'service',
    kind: 'node',
    argv: [
      'node',
      '--test',
      '--test-reporter=spec',
      '--test-reporter-destination=stdout',
      '--test-reporter=junit',
      '--test-reporter-destination=$REPORT/results.xml',
      ...serviceDeliveryFiles,
    ],
    deadlineMs: 90000,
  },
];
export const serviceDeliveryReports = [
  'sources.json',
  'summary.json',
  'results.xml',
  'service.log',
  'case-reports/service.json',
  'generated.json',
  ...['commit', 'generation', 'current', 'witness'].map((c) => `control-${c}.json`),
];
export const serviceDeliveryFilePolicy = {
  kind: 'account-reports-v1',
  required: serviceDeliveryReports,
  maxEntries: 40,
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 2,
};
export function serviceDeliveryCampaignStage(root) {
  const cases = serviceDeliveryFiles.flatMap((file) => {
    const d = generatedNodeDeclarations(file, readFileSync(join(root, file), 'utf8'), { root });
    assert(!d.dataInputs?.length, 'Service delivery registration input needs review');
    return d.cases;
  });
  const steps = serviceDeliverySteps.map((s) => ({ ...s, expect: { kind: 'cases', cases } }));
  return {
    id: 'campaign:' + serviceDeliveryCampaign,
    argv: ['node', serviceDeliveryCampaign],
    env: {},
    variant: 'account-service-delivery-campaign-v1',
    expect: {
      kind: 'account-service-delivery',
      steps,
      cases: steps.flatMap((s) => s.expect?.cases ?? []),
      historyInputs: [historicalInput(root, '2cb42a2', 'account-service/core.ts')],
    },
    deadlineMs: 95000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
    fileOutputs: structuredClone(serviceDeliveryFilePolicy),
  };
}
export function validateServiceDeliveryCampaign(s) {
  assert.equal(s.expect.kind, 'account-service-delivery');
  assert.equal(s.variant, 'account-service-delivery-campaign-v1');
  assert.deepEqual(s.argv, ['node', serviceDeliveryCampaign]);
  assert.deepEqual(s.env, {});
  assert.deepEqual(s.fileOutputs, serviceDeliveryFilePolicy);
  assert.equal(s.fixture, undefined);
  assert.equal(s.deadlineMs, 95000);
  assert.equal(s.graceMs, 5000);
  assert.equal(s.processPolicy, 'inherited-group-v1');
  validateHistoricalInputs(s.expect.historyInputs);
  assert.deepEqual(
    s.expect.historyInputs.map(({ reference, path }) => [reference, path]),
    [['2cb42a2', 'account-service/core.ts']],
  );
  assert.equal(s.expect.dataInputs, undefined);
  assert.deepEqual(
    s.expect.steps.map(({ expect: _expect, ...step }) => step),
    serviceDeliverySteps,
  );
  assert.deepEqual(
    s.expect.cases,
    s.expect.steps.flatMap((step) => step.expect?.cases ?? []),
  );
  for (const step of s.expect.steps) {
    assert.equal(step.expect.kind, 'cases');
    assert(step.expect.cases.length > 0);
  }
}
export function reconcileServiceDeliveryReports(directory, sources) {
  const json = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const summary = json('summary.json');
  assert.equal(summary.status, 'passed', 'Service delivery summary failed');
  assert.equal(summary.error, undefined);
  for (const key of ['startedAt', 'completedAt'])
    assert(
      typeof summary[key] === 'string' && new Date(summary[key]).toISOString() === summary[key],
    );
  assert(Date.parse(summary.completedAt) >= Date.parse(summary.startedAt));
  assert.deepEqual(
    summary.stages,
    serviceDeliverySteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
    'Service delivery summary stages differ',
  );
  const selected = sources.filter(
    ({ path }) =>
      [
        'package.json',
        'pnpm-lock.yaml',
        'tsconfig.app.json',
        'tsconfig.node.json',
        'vite.config.ts',
        'docs/account-source-capture.md',
        'docs/account-service-delivery.md',
        'docs/account-delivery.md',
        'docs/account-admission.md',
        'docs/account-decisions.md',
        'docs/account-spool.md',
        'docs/selections/row-5-finalization.md',
        'docs/selections/row-6-antireplay-retention.md',
        'docs/account-outbound.md',
        'docs/TRD.md',
        'docs/review/remediation/S0-4/A-schemas.md',
        'docs/review/remediation/S0-2/authority-map.md',
        'docs/selections/row-4-envelope-format.md',
        serviceDeliveryCampaign,
        'scripts/generate-private-envelope-vectors.mjs',
        'scripts/generate-envelope-vectors.mjs',
        'scripts/lib/aad-coverage.mjs',
      ].includes(path) ||
      /^(?:src|account-protocol|account-service|test|vite|wasm\/journal-seal)\/.*\.(?:ts|tsx|mjs|json|wasm)$/.test(
        path,
      ),
  );
  const sort = (rows) => [...rows].sort((a, b) => a.path.localeCompare(b.path));
  assert.deepEqual(
    sort(json('sources.json')),
    sort(selected.map(({ path, sha256 }) => ({ path, sha256 }))),
    'Service delivery source pins differ',
  );
  reconcileServiceDeliveryEvidence(
    Object.fromEntries(
      serviceDeliveryReports
        .filter(
          (f) =>
            f.endsWith('.json') &&
            !f.startsWith('case-reports/') &&
            !['sources.json', 'summary.json'].includes(f),
        )
        .map((f) => [f, json(f)]),
    ),
    sources,
  );
  for (const file of ['results.xml', ...serviceDeliverySteps.map((s) => s.name + '.log')])
    assert(readFileSync(join(directory, file)).length, 'Empty service delivery auxiliary report');
}
const hex = (v, length) =>
  typeof v === 'string' &&
  v.length > 0 &&
  /^(?:[0-9a-f]{2})+$/.test(v) &&
  (length === undefined || v.length === length * 2);
export function reconcileServiceDeliveryEvidence(r) {
  const expected = {
    commit: ['accepted', 1, 'active', 0, 'active'],
    generation: ['refused', 1, 'active', 1, 'active'],
    current: ['unknown', 0, 'pending', 1, 'pending'],
    witness: ['unknown', 1, 'active', 2, 'active'],
  };
  for (const [name, [outcome, persisted, account, mutantRows, mutantAccount]] of Object.entries(
    expected,
  )) {
    const c = r['control-' + name + '.json'];
    assert.deepEqual(
      c.baseline,
      { outcome, persisted, account },
      'Service control baseline differs: ' + name,
    );
    assert.equal(c.outcome, 'accepted');
    assert.equal(c.persisted, mutantRows);
    assert.equal(c.account, mutantAccount);
    if (name === 'witness')
      assert.deepEqual(c.redundant, Array(2).fill({ kind: 'unknown', reason: 'ledger-integrity' }));
  }
  const g = r['generated.json'];
  assert.equal(g.status, 'passed');
  assert.equal(g.seed, 9822026);
  assert.equal(g.histories.length, 80);
  for (const h of g.histories) {
    assert(h.commands.length >= 3 && h.commands.length <= 16);
    assert.equal(h.observations.length, h.commands.length, 'Service observations incomplete');
    const retained = [],
      ledger = [];
    let through = 0;
    const checkRows = (rows) => {
      assert.deepEqual(rows, ledger, 'Service ledger changed');
    };
    for (const [i, cmd] of h.commands.entries()) {
      assert(
        ['accept', 'refuse', 'retry', 'restart', 'gap', 'future', 'before', 'after'].includes(cmd),
      );
      const o = h.observations[i];
      if (
        cmd === 'restart' ||
        (cmd === 'retry' && retained.length) ||
        cmd === 'gap' ||
        cmd === 'future'
      ) {
        assert.equal(o.kind, cmd === 'restart' ? 'restart' : cmd === 'retry' ? 'retry' : 'unknown');
        assert(hex(o.before, 32));
        assert.equal(o.after, o.before, 'Read-only service operation changed inventory');
        checkRows(o.rows);
        if (cmd === 'retry') {
          assert.equal(o.index, i % retained.length);
          assert.deepEqual(o.result, retained[o.index], 'Service retry changed response');
        } else if (cmd !== 'restart') assert.equal(o.result.kind, 'unknown');
        continue;
      }
      assert.equal(o.kind, 'decision');
      assert(hex(o.requestHash, 32));
      const kind = cmd === 'refuse' ? 'refused' : 'accepted';
      assert.equal(o.proofKind, kind);
      assert.equal(o.subject.position, through + 1);
      assert.equal(o.subject.epoch, 1);
      assert(hex(o.subject.digest, 32));
      assert.equal(o.result.kind, 'decision');
      assert(hex(o.result.bytes));
      const response = JSON.parse(Buffer.from(o.result.bytes, 'hex'));
      assert.equal(response[0], 'done/position-response/v1');
      assert.equal(response[1], 1);
      assert.equal(response[2], kind);
      assert.deepEqual(response.slice(3, 6), [
        o.subject.workspace,
        o.subject.credential,
        o.subject.position,
      ]);
      assert.equal(response[kind === 'accepted' ? 10 : 6], o.subject.digest);
      if (cmd === 'before' || cmd === 'after') {
        assert.equal(o.first.kind, 'unknown');
        assert.deepEqual(
          o.firstRows,
          cmd === 'before' ? ledger : o.rows,
          'Service commit cut recorded wrong rows',
        );
      } else {
        assert.deepEqual(o.first, o.result);
        assert.deepEqual(o.firstRows, o.rows);
      }
      ledger.push({
        ordinal: ledger.length + 1,
        kind,
        position: o.subject.position,
        digest: o.subject.digest,
      });
      checkRows(o.rows);
      retained.push(o.result);
      if (kind === 'accepted') through++;
      assert.deepEqual(
        o.rows.filter((r) => r.kind === 'accepted').map((r) => r.position),
        Array.from({ length: through }, (_, i) => i + 1),
      );
    }
    assert.deepEqual(h.recovered, retained, 'Cold service retry changed response');
    checkRows(h.finalRows);
  }
}
