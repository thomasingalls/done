import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatedNodeDeclarations } from './census.mjs';
import { historicalInput, validateHistoricalInputs } from './historical-inputs.mjs';
import { vitestStage } from './vitest-adapter.mjs';

export const captureCampaign = 'scripts/account-capture/run.mjs';
export const captureSteps = [
  {
    name: 'properties',
    kind: 'vitest',
    argv: [
      'node',
      'node_modules/vitest/vitest.mjs',
      'run',
      'test/sourceCapture.test.ts',
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
      'test/account-capture/native.test.mjs',
    ],
    deadlineMs: 180000,
  },
];
export const captureReports = [
  'sources.json',
  'summary.json',
  'results.xml',
  'properties.log',
  'native.log',
  'case-reports/properties.json',
  'case-reports/native.json',
  'controls.json',
  'generated.json',
  'overhead.json',
];
export const captureFilePolicy = {
  kind: 'account-reports-v1',
  required: captureReports,
  maxEntries: 40,
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 2,
};
export function captureCampaignStage(root) {
  const steps = captureSteps.map((s) => {
    if (s.kind === 'exit') return structuredClone(s);
    let expect;
    if (s.kind === 'vitest') expect = vitestStage(root, 'test/sourceCapture.test.ts').expect;
    else {
      const declarations = generatedNodeDeclarations(
        s.argv.at(-1),
        readFileSync(join(root, s.argv.at(-1)), 'utf8'),
        { root },
      );
      assert(!declarations.dataInputs?.length, 'Capture Node registration input needs review');
      expect = { kind: 'cases', cases: declarations.cases };
    }
    return { ...s, expect };
  });
  return {
    id: 'campaign:' + captureCampaign,
    argv: ['node', captureCampaign],
    env: {},
    variant: 'account-capture-campaign-v1',
    expect: {
      kind: 'account-capture',
      steps,
      cases: steps.flatMap((s) => s.expect?.cases ?? []),
      historyInputs: [historicalInput(root, '18ceb40', 'src/crdt/promotionRecord.ts')],
    },
    deadlineMs: 210000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
    fixture: { kind: 'chromium-cdp', startupMs: 15000 },
    fileOutputs: structuredClone(captureFilePolicy),
  };
}
export function validateCaptureCampaign(s) {
  assert.equal(s.expect.kind, 'account-capture');
  assert.equal(s.variant, 'account-capture-campaign-v1');
  assert.deepEqual(s.argv, ['node', captureCampaign]);
  assert.deepEqual(s.env, {});
  assert.deepEqual(s.fileOutputs, captureFilePolicy);
  assert.deepEqual(s.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(s.deadlineMs, 210000);
  assert.equal(s.graceMs, 5000);
  assert.equal(s.processPolicy, 'inherited-group-v1');
  validateHistoricalInputs(s.expect.historyInputs);
  assert.deepEqual(
    s.expect.historyInputs.map(({ reference, path }) => [reference, path]),
    [['18ceb40', 'src/crdt/promotionRecord.ts']],
  );
  assert.equal(s.expect.dataInputs, undefined);
  assert.deepEqual(
    s.expect.steps.map(({ expect: _expect, ...step }) => step),
    captureSteps,
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
      assert.deepEqual(step.expect.files, ['test/sourceCapture.test.ts']);
      assert(!step.expect.dataInputs?.length, 'Capture registration input needs review');
    }
  }
}
export function reconcileCaptureReports(directory, sources) {
  const json = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const summary = json('summary.json');
  assert.equal(summary.status, 'passed', 'Capture summary failed');
  assert.equal(summary.error, undefined);
  for (const key of ['startedAt', 'completedAt'])
    assert(
      typeof summary[key] === 'string' && new Date(summary[key]).toISOString() === summary[key],
    );
  assert(Date.parse(summary.completedAt) >= Date.parse(summary.startedAt));
  assert.deepEqual(
    summary.stages,
    captureSteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
    'Capture summary stages differ',
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
        'docs/account-outbound.md',
        'docs/TRD.md',
        'docs/review/remediation/S0-4/A-schemas.md',
        'docs/review/remediation/S0-2/authority-map.md',
        'docs/selections/row-4-envelope-format.md',
        captureCampaign,
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
    'Capture source pins differ',
  );
  reconcileCaptureEvidence(
    Object.fromEntries(
      captureReports
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
  for (const file of ['results.xml', ...captureSteps.map((s) => s.name + '.log')])
    assert(readFileSync(join(directory, file)).length, 'Empty capture auxiliary report');
}
export function reconcileCaptureEvidence(r) {
  const { retention, route } = r['controls.json'];
  assert(Number.isInteger(retention.baseline.before) && retention.baseline.before > 0);
  assert.equal(
    retention.baseline.after,
    retention.baseline.before + 1,
    'Capture baseline did not retain edit',
  );
  assert.equal(retention.baseline.text, 'base control original');
  assert.equal(retention.mutant.text, retention.baseline.text);
  assert.equal(retention.mutant.captures, 0, 'Capture retention fault ineffective');
  assert.equal(route.baseline.status, 'refused');
  assert.equal(route.baseline.actualWorkspace, 'ab'.repeat(16));
  assert(/^[a-f0-9]{32}$/.test(route.baseline.expectedWorkspace));
  assert.notEqual(route.baseline.actualWorkspace, route.baseline.expectedWorkspace);
  assert.deepEqual(
    route.mutant,
    { ...route.baseline, status: 'accepted' },
    'Capture route fault ineffective',
  );
  const generated = r['generated.json'];
  assert.equal(generated.status, 'passed');
  assert.equal(generated.seed, 9322026);
  assert.equal(generated.runs, 16);
  assert.equal(generated.histories.length, 16);
  for (const h of generated.histories) {
    assert(h.commands.length >= 2 && h.commands.length <= 6);
    assert.equal(h.steps.length, h.commands.length, 'Capture history incomplete');
    const originals = new Map();
    const observe = (capsules, allowNew, initializationRoute) => {
      assert(Array.isArray(capsules) && capsules.length > 0);
      const ids = new Set();
      for (const c of capsules) {
        assert(typeof c.id === 'string' && /^[a-f0-9]{32}$/.test(c.id) && !ids.has(c.id));
        ids.add(c.id);
        assert(Array.isArray(c.sources) && c.sources.length > 0);
        for (const source of c.sources) {
          assert(typeof source.actor === 'string' && ['human', 'system'].includes(source.kind));
          assert(Array.isArray(source.bytes) && source.bytes.length > 0);
          assert(source.bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255));
        }
        if (originals.has(c.id))
          assert.deepEqual(c, originals.get(c.id), 'Capture first observation changed');
        else {
          if (!allowNew) {
            assert(initializationRoute, 'Unexpected recovered capture');
            for (const field of [
              'v',
              'workspace',
              'principal',
              'credential',
              'epoch',
              'generation',
            ])
              assert.equal(
                c[field],
                initializationRoute[field],
                'Initialization capture route differs',
              );
            assert.deepEqual(
              c.sources,
              [{ actor: c.principal, kind: 'human', bytes: [0, 0] }],
              'Unexpected nonempty initialization capture',
            );
          }
          originals.set(c.id, structuredClone(c));
        }
      }
      assert.deepEqual(
        [...ids].sort(),
        [...originals.keys()].sort(),
        'Previously captured source disappeared',
      );
    };
    observe(h.initial, true);
    let expected = 'base original';
    for (const [i, command] of h.commands.entries()) {
      assert(['x', 'é', '🙂', 'abc'].includes(command.text) && typeof command.cut === 'boolean');
      assert(['flush', 'compact', 'reopen', 'crash'].includes(command.boundary));
      // Spread uses code points; slicing below uses UTF-16 positions, matching the existing command.
      const remove = command.cut ? [...expected][0].length : 0;
      expected = command.text + expected.slice(remove);
      assert.equal(h.steps[i].observed, expected, 'Capture reopened text differs');
      observe(h.steps[i].admitted, true);
      observe(
        h.steps[i].recovered,
        false,
        ['reopen', 'crash'].includes(command.boundary) ? h.initial[0] : undefined,
      );
    }
  }
  const overhead = r['overhead.json'];
  assert.equal(overhead.attempt.status, 'refused');
  assert.equal(overhead.attempt.reason, 'oversize');
  assert(Array.isArray(overhead.update) && overhead.update.length > 10000);
  assert(overhead.update.every((b) => Number.isInteger(b) && b >= 0 && b <= 255));
  assert(Array.isArray(overhead.savedBytes) && overhead.savedBytes.length === 1);
  assert(Array.isArray(overhead.savedBytes[0]) && overhead.savedBytes[0].length === 1);
  const saved = overhead.savedBytes[0][0];
  assert(Array.isArray(saved));
  assert.equal(saved.length, overhead.update.length, 'Capture byte length differs');
  assert(
    saved.every((b, i) => b === overhead.update[i]),
    'Capture byte contents differ',
  );
}
