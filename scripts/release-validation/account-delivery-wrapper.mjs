import { historicalInput, validateHistoricalInputs } from './historical-inputs.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatedNodeDeclarations } from './census.mjs';
import { vitestStage } from './vitest-adapter.mjs';

export const deliveryCampaign = 'scripts/account-delivery/run.mjs';
export const deliverySteps = [
  {
    name: 'properties',
    kind: 'vitest',
    argv: [
      'node',
      'node_modules/vitest/vitest.mjs',
      'run',
      'test/accountDelivery.test.ts',
      '--maxWorkers=2',
      '--reporter=verbose',
    ],
    deadlineMs: 30000,
  },
  {
    name: 'native',
    kind: 'node',
    argv: [
      'node',
      '--test',
      '--test-reporter=spec',
      '--test-reporter-destination=stdout',
      '--test-reporter=junit',
      '--test-reporter-destination=$REPORT/results.xml',
      'test/account-delivery/native.test.mjs',
    ],
    deadlineMs: 480000,
  },
];
export const deliveryReports = [
  'sources.json',
  'summary.json',
  'results.xml',
  'properties.log',
  'native.log',
  'case-reports/properties.json',
  'case-reports/native.json',
  'controls.json',
  'generated.json',
  'unit-histories.json',
  'authority-control.json',
  'prefix-control.json',
];
export const deliveryFilePolicy = {
  kind: 'account-reports-v1',
  required: deliveryReports,
  maxEntries: 40,
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 2,
};
export function deliveryCampaignStage(root) {
  const steps = deliverySteps.map((s) => {
    if (s.kind === 'exit') return structuredClone(s);
    let expect;
    if (s.kind === 'vitest') expect = vitestStage(root, 'test/accountDelivery.test.ts').expect;
    else {
      const declarations = generatedNodeDeclarations(
        s.argv.at(-1),
        readFileSync(join(root, s.argv.at(-1)), 'utf8'),
        { root },
      );
      assert(!declarations.dataInputs?.length, 'Delivery Node registration input needs review');
      expect = { kind: 'cases', cases: declarations.cases };
    }
    return { ...s, expect };
  });
  return {
    id: 'campaign:' + deliveryCampaign,
    argv: ['node', deliveryCampaign],
    env: {},
    variant: 'account-delivery-campaign-v1',
    expect: {
      kind: 'account-delivery',
      steps,
      cases: steps.flatMap((s) => s.expect?.cases ?? []),
      historyInputs: [historicalInput(root, '81a4655', 'src/crdt/promotionRecord.ts')],
    },
    deadlineMs: 510000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
    fixture: { kind: 'chromium-cdp', startupMs: 15000 },
    fileOutputs: structuredClone(deliveryFilePolicy),
  };
}
export function validateDeliveryCampaign(s) {
  assert.equal(s.expect.kind, 'account-delivery');
  assert.equal(s.variant, 'account-delivery-campaign-v1');
  assert.deepEqual(s.argv, ['node', deliveryCampaign]);
  assert.deepEqual(s.env, {});
  assert.deepEqual(s.fileOutputs, deliveryFilePolicy);
  assert.deepEqual(s.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(s.deadlineMs, 510000);
  assert.equal(s.graceMs, 5000);
  assert.equal(s.processPolicy, 'inherited-group-v1');
  validateHistoricalInputs(s.expect.historyInputs);
  assert.deepEqual(
    s.expect.historyInputs.map(({ reference, path }) => [reference, path]),
    [['81a4655', 'src/crdt/promotionRecord.ts']],
  );
  assert.equal(s.expect.dataInputs, undefined);
  assert.deepEqual(
    s.expect.steps.map(({ expect: _expect, ...step }) => step),
    deliverySteps,
  );
  assert.deepEqual(
    s.expect.cases,
    s.expect.steps.flatMap((step) => step.expect?.cases ?? []),
  );
  for (const step of s.expect.steps) {
    if (step.kind === 'exit') {
      assert.equal(step.expect, undefined);
      continue;
    }
    assert.equal(step.expect.kind, step.kind === 'node' ? 'cases' : 'vitest');
    assert(step.expect.cases.length > 0);
    if (step.kind === 'vitest') {
      assert.deepEqual(step.expect.files, ['test/accountDelivery.test.ts']);
      assert(!step.expect.dataInputs?.length, 'Delivery registration input needs review');
    }
  }
}
export function reconcileDeliveryReports(directory, sources) {
  const json = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const summary = json('summary.json');
  assert.equal(summary.status, 'passed', 'Delivery summary failed');
  assert.equal(summary.error, undefined);
  for (const key of ['startedAt', 'completedAt'])
    assert(
      typeof summary[key] === 'string' && new Date(summary[key]).toISOString() === summary[key],
    );
  assert(Date.parse(summary.completedAt) >= Date.parse(summary.startedAt));
  assert.deepEqual(
    summary.stages,
    deliverySteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
    'Delivery summary stages differ',
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
        'docs/account-delivery.md',
        'docs/account-decisions.md',
        'docs/account-spool.md',
        'docs/selections/row-5-finalization.md',
        'docs/selections/row-6-antireplay-retention.md',
        'docs/account-outbound.md',
        'docs/TRD.md',
        'docs/review/remediation/S0-4/A-schemas.md',
        'docs/review/remediation/S0-2/authority-map.md',
        'docs/selections/row-4-envelope-format.md',
        deliveryCampaign,
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
    'Delivery source pins differ',
  );
  reconcileDeliveryEvidence(
    Object.fromEntries(
      deliveryReports
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
  for (const file of ['results.xml', ...deliverySteps.map((s) => s.name + '.log')])
    assert(readFileSync(join(directory, file)).length, 'Empty delivery auxiliary report');
}
const bytes = (v) =>
  Array.isArray(v) && v.length > 0 && v.every((b) => Number.isInteger(b) && b >= 0 && b <= 255);
const pendingFor = (saved) => [{ position: saved.position, bytes: saved.bytes }];
function responseCount(status) {
  assert(Array.isArray(status.responses) && status.responses.length <= 2);
  const positions = new Set();
  return status.responses.reduce((n, p) => {
    assert([1, 2].includes(p.position) && !positions.has(p.position));
    positions.add(p.position);
    assert(Number.isSafeInteger(p.count) && p.count > 0 && p.count <= 6);
    return n + p.count;
  }, 0);
}
// This report oracle uses recorded event kinds and positions, not product decision code.
function stateOf(events) {
  const accepted = events.filter((e) => ['accepted', 'finalized'].includes(e.kind));
  const final = accepted.filter((e) => e.kind === 'finalized');
  const denied = events.filter((e) => e.kind === 'refused');
  const conflict =
    events.some((e) => e.kind === 'conflict') ||
    denied.some((d) => accepted.some((a) => d.position <= a.position)) ||
    final.some((f) => accepted.some((a) => a.position > f.position)) ||
    new Set(final.map((f) => f.position)).size > 1;
  return {
    state: conflict ? 'conflict' : denied.length ? 'closed' : final.length ? 'finalized' : 'ready',
    acceptedThrough: Math.max(0, ...accepted.map((e) => e.position)),
    count: events.length,
  };
}
export function reconcileDeliveryEvidence(r) {
  const unit = r['unit-histories.json'];
  for (const [key, value] of Object.entries({
    failed: false,
    interrupted: false,
    numRuns: 500,
    numSkips: 0,
    numShrinks: 0,
    seed: 1121060,
    counterexample: null,
    counterexamplePath: null,
    error: null,
    errorInstance: null,
  }))
    assert.deepEqual(unit[key], value, 'Delivery unit histories incomplete: ' + key);
  assert.deepEqual(unit.failures, []);
  assert.deepEqual(unit.executionSummary, []);
  assert.equal(unit.runConfiguration.seed, 1121060);
  assert.equal(unit.runConfiguration.numRuns, 500);
  assert.equal(unit.runConfiguration.path, '');
  assert.equal(unit.runConfiguration.endOnFailure, false);
  assert.deepEqual(unit.runConfiguration.examples, []);
  assert(
    Number.isSafeInteger(unit.prefixes) &&
      unit.prefixes >= 1500 &&
      unit.prefixes <= 60000 &&
      unit.prefixes % 3 === 0,
    'Delivery unit prefix count outside the generated population',
  );
  const c = r['controls.json'],
    early = c.earlyReturn,
    closure = c.missingClosure;
  assert.equal(early.escaped.kind, 'ready');
  assert.equal(early.escaped.position, 1);
  assert(bytes(early.escaped.bytes));
  assert.deepEqual(early.pending, [], 'Early-return mutant persisted submission');
  assert.equal(early.baseline.kind, 'ready');
  assert.equal(early.baseline.position, 1);
  assert(bytes(early.baseline.bytes));
  assert.deepEqual(
    early.baselinePending,
    pendingFor(early.baseline),
    'Baseline submission was not persisted',
  );
  assert.equal(closure.before.state, 'closed');
  assert.match(closure.refusalReason, /incomplete|commitment/);
  assert.equal(closure.after.state, 'ready');
  assert.deepEqual(
    closure.pending,
    early.baselinePending,
    'Missing-witness control changed pending bytes',
  );
  assert.equal(responseCount(closure.before), 1);
  assert.equal(responseCount(closure.after), 0);
  assert.deepEqual(
    r['authority-control.json'],
    [
      { control: false, returned: false, persisted: 0 },
      { control: true, returned: true, persisted: 1 },
    ],
    'Authority control did not distinguish recheck',
  );
  const prefix = r['prefix-control.json'];
  assert.deepEqual(
    prefix.map((p) => p.reverse),
    [false, true],
  );
  for (const p of prefix) {
    assert.equal(p.mutant.state, 'closed');
    assert.equal(p.actual.state, 'conflict');
    assert.equal(responseCount(p.mutant), 2);
    assert.equal(responseCount(p.actual), 2);
    assert.deepEqual(
      { ...p.mutant, state: p.actual.state },
      p.actual,
      'Prefix replay changed unrelated status',
    );
  }
  const g = r['generated.json'];
  assert.equal(g.status, 'passed');
  assert.equal(g.seed, 9812027);
  assert.equal(g.histories.length, 8);
  for (const h of g.histories) {
    assert(['before', 'after'].includes(h.side) && typeof h.compact === 'boolean');
    assert(h.answers.length >= 3 && h.answers.length <= 6);
    assert.equal(h.observations.length, h.answers.length, 'Delivery observations incomplete');
    assert.equal(h.saved.kind, 'ready');
    assert.equal(h.saved.position, 1);
    assert(bytes(h.saved.bytes));
    assert.deepEqual(h.retry, h.saved, 'Retry bytes changed');
    assert.deepEqual(
      h.postCrashPending,
      h.side === 'after' ? pendingFor(h.saved) : [],
      'Wrong submission commit recovery',
    );
    const events = [],
      seen = new Map();
    for (const [index, event] of h.answers.entries()) {
      assert(['accepted', 'refused', 'finalized', 'conflict', 'junk'].includes(event.kind));
      assert([1, 2].includes(event.position));
      const o = h.observations[index];
      assert(bytes(o.bytes));
      const key = event.kind + ':' + event.position,
        previous = stateOf(events);
      if (seen.has(key))
        assert.deepEqual(o.bytes, seen.get(key), 'Duplicate response bytes changed');
      const shouldRecord = event.kind !== 'junk' && previous.state !== 'conflict' && !seen.has(key);
      assert.equal(o.recorded, shouldRecord, 'Wrong delivery recordedness');
      if (shouldRecord) {
        events.push(event);
        seen.set(key, o.bytes);
      }
      const expected = stateOf(events);
      assert.equal(o.status.state, expected.state, 'Wrong delivery state');
      assert.equal(o.status.acceptedThrough, expected.acceptedThrough, 'Wrong accepted prefix');
      assert.equal(responseCount(o.status), expected.count, 'Wrong delivery response count');
      assert.deepEqual(
        o.pending,
        expected.state === 'ready' && expected.acceptedThrough === 0 ? pendingFor(h.saved) : [],
        'Wrong pending delivery',
      );
    }
    assert.deepEqual(
      h.beforeReopen,
      h.observations.at(-1).status,
      'Delivery changed before reopen',
    );
    assert.deepEqual(h.recovered.status, h.beforeReopen, 'Delivery status changed on reopen');
    assert(Array.isArray(h.before.wires) && h.before.wires.length >= 2);
    assert.deepEqual(h.recovered.wires, h.before.wires, 'Delivery restart changed envelopes');
    assert(Array.isArray(h.before.sources) && h.before.sources.length > 0);
    const retained = new Map(h.recovered.sources.map((s) => [s.id, s]));
    assert.equal(retained.size, h.recovered.sources.length);
    for (const source of h.before.sources)
      assert.deepEqual(retained.get(source.id), source, 'Delivery restart lost original source');
  }
}
