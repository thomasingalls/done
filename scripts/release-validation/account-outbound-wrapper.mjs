import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatedNodeDeclarations } from './census.mjs';
import { vitestStage } from './vitest-adapter.mjs';

export const outboundCampaign = 'scripts/account-outbound/run.mjs';
export const outboundSteps = [
  {
    name: 'legacy-vectors',
    kind: 'exit',
    argv: ['node', 'scripts/generate-envelope-vectors.mjs', '--check'],
    deadlineMs: 15000,
  },
  {
    name: 'vectors',
    kind: 'exit',
    argv: ['node', 'scripts/generate-private-envelope-vectors.mjs', '--check'],
    deadlineMs: 15000,
  },
  {
    name: 'preparation',
    kind: 'node',
    argv: ['node', '--test', '--test-reporter=spec', 'test/account-outbound/preparation.test.mjs'],
    deadlineMs: 30000,
  },
  {
    name: 'codec',
    kind: 'vitest',
    argv: [
      'node',
      'node_modules/vitest/vitest.mjs',
      'run',
      'test/networkEnvelope.test.ts',
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
      'test/account-outbound/native.test.mjs',
    ],
    deadlineMs: 60000,
  },
];
export const outboundReports = [
  'sources.json',
  'summary.json',
  'results.xml',
  ...outboundSteps.map((s) => s.name + '.log'),
  'case-reports/preparation.json',
  'case-reports/codec.json',
  'case-reports/native.json',
  'counterexample-model-budget.json',
  'counterexample-key-domain.json',
  'model-controls.json',
  'preparation-generated.json',
  'codec-controls.json',
  'codec-generated.json',
  'counterexample-listener-gap.json',
];
export const outboundFilePolicy = {
  kind: 'account-reports-v1',
  required: outboundReports,
  maxEntries: 40,
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 2,
};
export function outboundCampaignStage(root) {
  const steps = outboundSteps.map((s) => {
    if (s.kind === 'exit') return structuredClone(s);
    let expect;
    if (s.kind === 'vitest') expect = vitestStage(root, 'test/networkEnvelope.test.ts').expect;
    else {
      const declarations = generatedNodeDeclarations(
        s.argv.at(-1),
        readFileSync(join(root, s.argv.at(-1)), 'utf8'),
        { root },
      );
      assert(!declarations.dataInputs?.length, 'Outbound Node registration input needs review');
      expect = { kind: 'cases', cases: declarations.cases };
    }
    return { ...s, expect };
  });
  return {
    id: 'campaign:' + outboundCampaign,
    argv: ['node', outboundCampaign],
    env: {},
    variant: 'account-outbound-campaign-v1',
    expect: {
      kind: 'account-outbound',
      steps,
      cases: steps.flatMap((s) => s.expect?.cases ?? []),
      dataInputs: steps.find((s) => s.kind === 'vitest').expect.dataInputs,
    },
    deadlineMs: 150000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
    fixture: { kind: 'chromium-cdp', startupMs: 15000 },
    fileOutputs: structuredClone(outboundFilePolicy),
  };
}
export function validateOutboundCampaign(s) {
  assert.equal(s.expect.kind, 'account-outbound');
  assert.equal(s.variant, 'account-outbound-campaign-v1');
  assert.deepEqual(s.argv, ['node', outboundCampaign]);
  assert.deepEqual(s.env, {});
  assert.deepEqual(s.fileOutputs, outboundFilePolicy);
  assert.deepEqual(s.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(s.deadlineMs, 150000);
  assert.equal(s.graceMs, 5000);
  assert.equal(s.processPolicy, 'inherited-group-v1');
  assert.equal(s.expect.historyInputs, undefined);
  assert.deepEqual(
    s.expect.steps.map(({ expect: _expect, ...step }) => step),
    outboundSteps,
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
      assert.deepEqual(step.expect.files, ['test/networkEnvelope.test.ts']);
      assert.deepEqual(step.expect.dataInputs, s.expect.dataInputs);
    }
  }
  assert.deepEqual(
    s.expect.dataInputs.map((i) => i.path),
    ['test/vectors/envelope.json', 'test/vectors/private-envelope.json'],
  );
}
export function reconcileOutboundReports(directory, sources) {
  const json = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const summary = json('summary.json');
  assert.equal(summary.status, 'passed', 'Outbound summary failed');
  assert.equal(summary.error, undefined);
  for (const key of ['startedAt', 'completedAt'])
    assert(
      typeof summary[key] === 'string' && new Date(summary[key]).toISOString() === summary[key],
    );
  assert(Date.parse(summary.completedAt) >= Date.parse(summary.startedAt));
  assert.deepEqual(
    summary.stages,
    outboundSteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
    'Outbound summary stages differ',
  );
  const selected = sources.filter(
    ({ path }) =>
      [
        'package.json',
        'pnpm-lock.yaml',
        'tsconfig.app.json',
        'tsconfig.node.json',
        'vite.config.ts',
        'docs/account-outbound.md',
        'docs/TRD.md',
        'docs/review/remediation/S0-4/A-schemas.md',
        'docs/review/remediation/S0-2/authority-map.md',
        'docs/selections/row-4-envelope-format.md',
        outboundCampaign,
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
    'Outbound source pins differ',
  );
  reconcileOutboundEvidence(
    Object.fromEntries(
      outboundReports
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
  for (const file of ['results.xml', ...outboundSteps.map((s) => s.name + '.log')])
    assert(readFileSync(join(directory, file)).length, 'Empty outbound auxiliary report');
}
export function reconcileOutboundEvidence(r, sources) {
  const budget = r['counterexample-model-budget.json'];
  assert.equal(budget.source, 'test/outboundSpool.test.ts');
  assert.equal(
    budget.sha256,
    sources.find((s) => s.path === budget.source)?.sha256,
    'Outbound model source differs',
  );
  assert.deepEqual(
    [
      budget.actualInvocations,
      budget.durableCount,
      budget.successorActualInvocations,
      budget.successorDurableCount,
    ],
    [3, 1, 2, 1],
    'Outbound budget counterexample missing',
  );
  assert.deepEqual(budget.crashTrace, [
    'reserve once',
    'mint; lose promote',
    'mint; lose promote',
    'mint; lose promote',
  ]);
  assert.deepEqual(budget.successorTrace, [
    'reserve once',
    'mint',
    'verified refusal',
    'mint successor',
  ]);
  const key = r['counterexample-key-domain.json'];
  assert.deepEqual(key.credentials, ['device-A', 'device-B']);
  for (const field of ['sameKg', 'sameInfo', 'equalDerivedKeys']) assert.equal(key[field], true);
  assert.equal(key.countEach, 2 ** 31);
  assert.equal(key.sumUnderOneKey, key.countEach * key.credentials.length);
  assert.equal(key.firstDisallowed, 2 ** 32);
  const model = r['model-controls.json'];
  assert.deepEqual(
    model.map((c) => [c.fault, c.expected]),
    [
      ['listenerGap', 'lost-admission'],
      ['counterOnly', 'position-gap'],
      ['sendEarly', 'changed-retry'],
    ],
  );
  for (const c of model)
    assert(c.observed.includes(c.expected), 'Outbound model control ineffective');
  const codec = r['codec-controls.json'];
  assert.deepEqual(
    codec.map((c) => c.control),
    ['signature', 'digest', 'route'],
  );
  for (const c of codec) {
    assert.equal(c.baseline, 'refused');
    assert.equal(c.mutant, 'bad content-blind acceptance observed');
    const original = c.original,
      accepted = c.accepted,
      expected = c.expected;
    assert.deepEqual(Object.keys(original).sort(), [
      'credential_id',
      'ct',
      'digest',
      'epoch',
      'gen',
      'nonce',
      'seq',
      'sig',
      'v',
      'workspace_id',
    ]);
    for (const [field, bytes] of [
      ['sig', 64],
      ['digest', 32],
      ['nonce', 12],
    ])
      assert(
        typeof original[field] === 'string' &&
          new RegExp('^[a-f0-9]{' + bytes * 2 + '}$').test(original[field]),
      );
    assert(typeof original.ct === 'string' && /^(?:[a-f0-9]{2})+$/.test(original.ct));
    assert.notEqual(original.sig, '00'.repeat(64));
    const changed = structuredClone(original);
    if (c.control === 'signature') changed.sig = '00'.repeat(64);
    if (c.control === 'digest') {
      const bytes = Buffer.from(changed.ct, 'hex');
      bytes[0] ^= 1;
      changed.ct = bytes.toString('hex');
    }
    assert.deepEqual(
      accepted,
      changed,
      'Outbound codec control did not accept intended corruption',
    );
    const route = Object.fromEntries(
      ['v', 'workspace_id', 'credential_id', 'epoch', 'gen'].map((k) => [k, original[k]]),
    );
    if (c.control === 'route') {
      assert.notEqual(original.workspace_id, 'wrong-workspace');
      route.workspace_id = 'wrong-workspace';
    }
    assert.deepEqual(expected, route, 'Outbound codec control changed another route');
  }
  const p = r['preparation-generated.json'];
  assert.equal(p.seed, 9312026);
  assert.equal(p.runs, 1000);
  assert.equal(p.inputs.length, 1000);
  for (const h of p.inputs) {
    assert(Array.isArray(h) && h.length >= 1 && h.length <= 100);
    for (const c of h)
      assert(
        [
          'accept',
          'refuse',
          'remote',
          'reserve',
          'reserveSeal',
          'seal',
          'persist',
          'send',
          'crash',
          'compact',
          'rotate',
        ].includes(c),
      );
  }
  const c = r['codec-generated.json'];
  assert.equal(c.seed, 9302026);
  assert.equal(c.runs, 100);
  assert.equal(c.inputs.length, 100);
  for (const h of c.inputs) {
    assert(Number.isInteger(h.mutation) && h.mutation >= 0 && h.mutation <= 0x7fffffff);
    assert(h.updates.length >= 1 && h.updates.length <= 8);
    for (const u of h.updates) assert(typeof u === 'string' && /^(?:[a-f0-9]{2}){1,128}$/.test(u));
  }
  const gap = r['counterexample-listener-gap.json'];
  assert.equal(gap.acceptedText, 'base retained original');
  assert.equal(gap.recoveredText, gap.acceptedText, 'Outbound journal recovery differs');
  assert.equal(gap.observerCalls, 1);
  assert.equal(gap.observerFailed, true);
  assert.equal(gap.journalOnlyBeforeRendererCrash, true);
  assert.equal(gap.replayedOutgoingCallbacks, 0);
  assert(gap.recovery.kinds.includes('state') && !gap.recovery.kinds.includes('outbound'));
  assert(Number.isInteger(gap.recovery.journal) && gap.recovery.journal >= 0);
  assert.equal(gap.recovery.fields.length, gap.recovery.kinds.length);
  assert(
    Array.isArray(gap.persistedStoresAfterCompaction) &&
      gap.persistedStoresAfterCompaction.length > 0,
  );
}
