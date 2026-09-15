import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { generatedNodeDeclarations } from './census.mjs';
import { historicalInput, validateHistoricalInputs } from './historical-inputs.mjs';
import { vitestStage } from './vitest-adapter.mjs';

export const spoolCampaign = 'scripts/account-spool/run.mjs';
export const spoolSteps = [
  {
    name: 'properties',
    kind: 'vitest',
    argv: [
      'node',
      'node_modules/vitest/vitest.mjs',
      'run',
      'test/spoolRecord.test.ts',
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
      'test/account-spool/native.test.mjs',
    ],
    deadlineMs: 240000,
  },
];
export const spoolReports = [
  'sources.json',
  'summary.json',
  'results.xml',
  'properties.log',
  'native.log',
  'case-reports/properties.json',
  'case-reports/native.json',
  'controls.json',
  'generated.json',
  'missing-tail-baseline.json',
  'missing-tail-control.json',
];
export const spoolFilePolicy = {
  kind: 'account-reports-v1',
  required: spoolReports,
  maxEntries: 40,
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 2,
};
export function spoolCampaignStage(root) {
  const steps = spoolSteps.map((s) => {
    if (s.kind === 'exit') return structuredClone(s);
    let expect;
    if (s.kind === 'vitest') expect = vitestStage(root, 'test/spoolRecord.test.ts').expect;
    else {
      const declarations = generatedNodeDeclarations(
        s.argv.at(-1),
        readFileSync(join(root, s.argv.at(-1)), 'utf8'),
        { root },
      );
      assert(!declarations.dataInputs?.length, 'Spool Node registration input needs review');
      expect = { kind: 'cases', cases: declarations.cases };
    }
    return { ...s, expect };
  });
  return {
    id: 'campaign:' + spoolCampaign,
    argv: ['node', spoolCampaign],
    env: {},
    variant: 'account-spool-campaign-v1',
    expect: {
      kind: 'account-spool',
      steps,
      cases: steps.flatMap((s) => s.expect?.cases ?? []),
      historyInputs: [historicalInput(root, '7210b7d', 'src/crdt/promotionRecord.ts')],
    },
    deadlineMs: 270000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
    fixture: { kind: 'chromium-cdp', startupMs: 15000 },
    fileOutputs: structuredClone(spoolFilePolicy),
  };
}
export function validateSpoolCampaign(s) {
  assert.equal(s.expect.kind, 'account-spool');
  assert.equal(s.variant, 'account-spool-campaign-v1');
  assert.deepEqual(s.argv, ['node', spoolCampaign]);
  assert.deepEqual(s.env, {});
  assert.deepEqual(s.fileOutputs, spoolFilePolicy);
  assert.deepEqual(s.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(s.deadlineMs, 270000);
  assert.equal(s.graceMs, 5000);
  assert.equal(s.processPolicy, 'inherited-group-v1');
  validateHistoricalInputs(s.expect.historyInputs);
  assert.deepEqual(
    s.expect.historyInputs.map(({ reference, path }) => [reference, path]),
    [['7210b7d', 'src/crdt/promotionRecord.ts']],
  );
  assert.equal(s.expect.dataInputs, undefined);
  assert.deepEqual(
    s.expect.steps.map(({ expect: _expect, ...step }) => step),
    spoolSteps,
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
      assert.deepEqual(step.expect.files, ['test/spoolRecord.test.ts']);
      assert(!step.expect.dataInputs?.length, 'Spool registration input needs review');
    }
  }
}
export function reconcileSpoolReports(directory, sources) {
  const json = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  assert(
    !existsSync(join(directory, 'missing-tail-counterexample.json')),
    'Unexpected missing-tail counterexample',
  );
  const summary = json('summary.json');
  assert.equal(summary.status, 'passed', 'Spool summary failed');
  assert.equal(summary.error, undefined);
  for (const key of ['startedAt', 'completedAt'])
    assert(
      typeof summary[key] === 'string' && new Date(summary[key]).toISOString() === summary[key],
    );
  assert(Date.parse(summary.completedAt) >= Date.parse(summary.startedAt));
  assert.deepEqual(
    summary.stages,
    spoolSteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
    'Spool summary stages differ',
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
        'docs/account-spool.md',
        'docs/account-outbound.md',
        'docs/TRD.md',
        'docs/review/remediation/S0-4/A-schemas.md',
        'docs/review/remediation/S0-2/authority-map.md',
        'docs/selections/row-4-envelope-format.md',
        spoolCampaign,
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
    'Spool source pins differ',
  );
  reconcileSpoolEvidence(
    Object.fromEntries(
      spoolReports
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
  for (const file of ['results.xml', ...spoolSteps.map((s) => s.name + '.log')])
    assert(readFileSync(join(directory, file)).length, 'Empty spool auxiliary report');
}
const byteArray = (value) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((b) => Number.isInteger(b) && b >= 0 && b <= 255);
const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const envelope = (e) => {
  assert(Number.isSafeInteger(e.position) && e.position > 0);
  assert(byteArray(e.bytes), 'Missing spool wire');
};
export function reconcileSpoolEvidence(r) {
  const { earlyReturn, reuse } = r['controls.json'];
  envelope(earlyReturn.envelope);
  assert.equal(
    earlyReturn.persistedBeforeCrash,
    0,
    'Early-return fault did not lose persisted wire',
  );
  assert.equal(earlyReturn.persistedAfterCrash, 0);
  assert.deepEqual(
    reuse,
    { nativeInvocations: 2, durableAttempts: 1 },
    'Spool grant-reuse fault ineffective',
  );
  const baseline = r['missing-tail-baseline.json'],
    fault = r['missing-tail-control.json'];
  envelope(baseline.before);
  assert.equal(baseline.refused, true);
  assert.match(baseline.reason, /Spool ledger is incomplete/);
  assert.equal(baseline.invocations, 1);
  envelope(fault.before);
  envelope(fault.after);
  assert.equal(fault.after.position, fault.before.position);
  assert(
    !sameBytes(fault.after.bytes, fault.before.bytes),
    'Missing-tail fault did not remint wire',
  );
  assert.equal(fault.invocations, 2);
  const generated = r['generated.json'];
  assert.equal(generated.status, 'passed');
  assert.equal(generated.seed, 9502026);
  assert.equal(generated.histories.length, 8);
  for (const h of generated.histories) {
    assert(h.commands.length >= 2 && h.commands.length <= 4);
    assert.equal(h.steps.length, h.commands.length, 'Spool history incomplete');
    let expected = 'base original',
      priorInvocations = 0,
      priorAttempts = 0;
    const sources = new Map(),
      saved = new Map();
    const ledger = (state, invocations) => {
      assert(
        Number.isSafeInteger(invocations) && invocations >= priorInvocations,
        'Spool invocation count regressed',
      );
      assert(
        Number.isSafeInteger(state.attempts) &&
          state.attempts <= 128 &&
          state.attempts >= invocations &&
          state.attempts >= priorAttempts,
        'Spool invocation grant missing',
      );
      priorInvocations = invocations;
      priorAttempts = state.attempts;
      assert(
        Array.isArray(state.positions) && state.positions.length <= 64,
        'Generated spool ledger exceeds fixture bound',
      );
      const refs = new Set(),
        attempts = [];
      for (const [i, p] of state.positions.entries()) {
        assert.equal(p.position, i + 1, 'Spool position gap');
        assert(typeof p.persisted === 'boolean');
        assert(/^[a-f0-9]{32}$/.test(p.source.id) && /^[a-f0-9]{64}$/.test(p.source.hash));
        assert(Number.isSafeInteger(p.source.index) && p.source.index >= 0);
        const ref = p.source.id + ':' + p.source.index;
        assert(!refs.has(ref), 'Duplicate spool source');
        refs.add(ref);
        if (sources.has(p.position))
          assert.deepEqual(p.source, sources.get(p.position), 'Spool source reassigned');
        else sources.set(p.position, structuredClone(p.source));
        assert(Array.isArray(p.attempts));
        attempts.push(...p.attempts);
      }
      assert.deepEqual(
        attempts.toSorted((a, b) => a - b),
        Array.from({ length: state.attempts }, (_, i) => i + 1),
        'Spool grant events differ',
      );
      assert.equal(state.positions.length, sources.size, 'Spool position disappeared');
    };
    const wires = (state, values) => {
      const current = new Map();
      for (const e of values) {
        envelope(e);
        assert(!current.has(e.position), 'Duplicate persisted wire');
        current.set(e.position, e.bytes);
      }
      assert.deepEqual(
        [...current.keys()].sort((a, b) => a - b),
        state.positions.filter((p) => p.persisted).map((p) => p.position),
        'Spool persisted coverage differs',
      );
      for (const [position, bytes] of saved)
        assert(
          current.has(position) && sameBytes(current.get(position), bytes),
          'Persisted spool wire changed or disappeared',
        );
      for (const [position, bytes] of current)
        if (!saved.has(position)) saved.set(position, bytes.slice());
    };
    for (const [i, command] of h.commands.entries()) {
      assert(['x', 'é', '🙂'].includes(command.text));
      assert(
        [
          'normal',
          'position-before',
          'position-after',
          'attempt-before',
          'attempt-after',
          'envelope-before',
          'envelope-after',
          'compact',
        ].includes(command.boundary),
      );
      expected = command.text + expected;
      const step = h.steps[i];
      assert.equal(step.observed, expected, 'Spool reopened text differs');
      ledger(step.ledgerBeforeRecovery, step.invocationsBeforeRecovery);
      ledger(step.ledger, step.invocations);
      wires(step.ledger, step.envelopes);
    }
    const final = h.final;
    assert.equal(final.observed, expected);
    ledger(final.ledger, final.invocations);
    wires(final.ledger, final.envelopes);
    assert(
      final.ledger.positions.every((p) => p.persisted),
      'Spool drain incomplete',
    );
    assert(Array.isArray(final.sources) && final.sources.length > 0 && final.sources.length <= 64);
    const expectedRefs = [];
    for (const c of final.sources) {
      assert(
        /^[a-f0-9]{32}$/.test(c.id) &&
          Number.isSafeInteger(c.count) &&
          c.count > 0 &&
          c.count <= 32,
      );
      for (let i = 0; i < c.count; i++) expectedRefs.push(c.id + ':' + i);
    }
    assert.equal(
      new Set(expectedRefs).size,
      expectedRefs.length,
      'Duplicate captured source identity',
    );
    assert.deepEqual(
      final.ledger.positions.map((p) => p.source.id + ':' + p.source.index).sort(),
      expectedRefs.sort(),
      'Spool final source coverage differs',
    );
  }
}
