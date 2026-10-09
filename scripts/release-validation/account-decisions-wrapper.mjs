import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatedNodeDeclarations } from './census.mjs';
import { vitestStage } from './vitest-adapter.mjs';

export const decisionsCampaign = 'scripts/account-decisions/run.mjs';
export const decisionsSteps = [
  {
    name: 'properties',
    kind: 'vitest',
    argv: [
      'node',
      'node_modules/vitest/vitest.mjs',
      'run',
      'test/positionDecision.test.ts',
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
      'test/account-decisions/native.test.mjs',
    ],
    deadlineMs: 120000,
  },
];
export const decisionsReports = [
  'sources.json',
  'summary.json',
  'results.xml',
  'properties.log',
  'native.log',
  'case-reports/properties.json',
  'case-reports/native.json',
  'controls.json',
  'generated.json',
];
export const decisionsFilePolicy = {
  kind: 'account-reports-v1',
  required: decisionsReports,
  maxEntries: 40,
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 2,
};
export function decisionsCampaignStage(root) {
  const steps = decisionsSteps.map((s) => {
    if (s.kind === 'exit') return structuredClone(s);
    let expect;
    if (s.kind === 'vitest') expect = vitestStage(root, 'test/positionDecision.test.ts').expect;
    else {
      const declarations = generatedNodeDeclarations(
        s.argv.at(-1),
        readFileSync(join(root, s.argv.at(-1)), 'utf8'),
        { root },
      );
      assert(!declarations.dataInputs?.length, 'Decisions Node registration input needs review');
      expect = { kind: 'cases', cases: declarations.cases };
    }
    return { ...s, expect };
  });
  return {
    id: 'campaign:' + decisionsCampaign,
    argv: ['node', decisionsCampaign],
    env: {},
    variant: 'account-decisions-campaign-v1',
    expect: {
      kind: 'account-decisions',
      steps,
      cases: steps.flatMap((s) => s.expect?.cases ?? []),
    },
    deadlineMs: 150000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
    fixture: { kind: 'chromium-cdp', startupMs: 15000 },
    fileOutputs: structuredClone(decisionsFilePolicy),
  };
}
export function validateDecisionsCampaign(s) {
  assert.equal(s.expect.kind, 'account-decisions');
  assert.equal(s.variant, 'account-decisions-campaign-v1');
  assert.deepEqual(s.argv, ['node', decisionsCampaign]);
  assert.deepEqual(s.env, {});
  assert.deepEqual(s.fileOutputs, decisionsFilePolicy);
  assert.deepEqual(s.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(s.deadlineMs, 150000);
  assert.equal(s.graceMs, 5000);
  assert.equal(s.processPolicy, 'inherited-group-v1');
  assert.equal(s.expect.historyInputs, undefined);
  assert.equal(s.expect.dataInputs, undefined);
  assert.deepEqual(
    s.expect.steps.map(({ expect: _expect, ...step }) => step),
    decisionsSteps,
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
      assert.deepEqual(step.expect.files, ['test/positionDecision.test.ts']);
      assert(!step.expect.dataInputs?.length, 'Decisions registration input needs review');
    }
  }
}
export function reconcileDecisionsReports(directory, sources) {
  const json = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const summary = json('summary.json');
  assert.equal(summary.status, 'passed', 'Decisions summary failed');
  assert.equal(summary.error, undefined);
  for (const key of ['startedAt', 'completedAt'])
    assert(
      typeof summary[key] === 'string' && new Date(summary[key]).toISOString() === summary[key],
    );
  assert(Date.parse(summary.completedAt) >= Date.parse(summary.startedAt));
  assert.deepEqual(
    summary.stages,
    decisionsSteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
    'Decisions summary stages differ',
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
        'docs/account-decisions.md',
        'docs/account-spool.md',
        'docs/selections/row-5-finalization.md',
        'docs/selections/row-6-antireplay-retention.md',
        'docs/account-outbound.md',
        'docs/TRD.md',
        'docs/review/remediation/S0-4/A-schemas.md',
        'docs/review/remediation/S0-2/authority-map.md',
        'docs/selections/row-4-envelope-format.md',
        decisionsCampaign,
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
    'Decisions source pins differ',
  );
  reconcileDecisionsEvidence(
    Object.fromEntries(
      decisionsReports
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
  for (const file of ['results.xml', ...decisionsSteps.map((s) => s.name + '.log')])
    assert(readFileSync(join(directory, file)).length, 'Empty decisions auxiliary report');
}
const bytes = (value) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((b) => Number.isInteger(b) && b >= 0 && b <= 255);
const hex = (value, n) =>
  typeof value === 'string' && new RegExp('^[a-f0-9]{' + n * 2 + '}$').test(value);
const lp = (...fields) =>
  Buffer.concat(
    fields.map((value) => {
      const b = Buffer.from(String(value));
      assert(b.length <= 65535);
      const n = Buffer.alloc(2);
      n.writeUInt16BE(b.length);
      return Buffer.concat([n, b]);
    }),
  );
const refusalWire = (p) =>
  Buffer.from(
    JSON.stringify([
      'done/position-response/v1',
      1,
      'refused',
      p.workspace,
      p.credential,
      p.position,
      p.digest,
      p.epoch,
      p.reason,
      p.parent,
      p.signature,
    ]),
  );
function submissionWire(value) {
  const envelope = Buffer.from(value.envelope),
    parent = refusalWire(value.parent);
  const size = (b) => {
    const n = Buffer.alloc(4);
    n.writeUInt32BE(b.length);
    return n;
  };
  return Buffer.concat([
    lp('done/envelope-submission-wire/v1', '1', value.lineage),
    size(envelope),
    envelope,
    size(parent),
    parent,
    Buffer.from(value.signature),
  ]);
}
const subject = (value) =>
  Object.fromEntries(
    ['workspace', 'credential', 'position', 'digest', 'epoch'].map((k) => [k, value[k]]),
  );
export function reconcileDecisionsEvidence(r) {
  const controls = r['controls.json'];
  assert.deepEqual(
    controls.map((c) => c.control),
    ['signature', 'epoch', 'link', 'parent', 'position'],
  );
  for (const c of controls.slice(0, 3)) {
    assert.equal(c.baseline, 'unknown');
    assert.equal(c.badEvidence, c.control === 'link' ? 'accepted' : 'refused');
    assert(bytes(c.bytes));
    const response = c.response,
      expected = c.expected;
    assert.equal(expected.parent, '00'.repeat(32));
    assert.equal(expected.previous, '00'.repeat(32));
    assert.equal(c.authority.workspace, expected.workspace);
    assert(hex(c.authority.acceptanceKey, 32));
    if (c.control === 'link') {
      assert.equal(response.kind, 'accepted');
      assert.deepEqual(subject(response.leaf), subject(expected));
      assert(hex(response.head.link, 32) && hex(response.head.signature, 64));
      const linked = createHash('sha256')
        .update(
          lp(
            'done/accept/v1',
            expected.workspace,
            expected.credential,
            expected.position,
            expected.epoch,
            expected.digest,
            expected.previous,
          ),
        )
        .digest('hex');
      assert.notEqual(response.head.link, linked, 'Link control had the correct predecessor');
      assert.deepEqual(
        [response.head.workspace, response.head.credential, response.head.position],
        [expected.workspace, expected.credential, expected.position],
      );
    } else {
      assert.equal(response.kind, 'refused');
      assert(hex(response.refusal.signature, 64));
      assert.deepEqual(subject(response.refusal), {
        ...subject(expected),
        epoch: expected.epoch - (c.control === 'epoch' ? 1 : 0),
      });
      assert.equal(response.refusal.parent, expected.parent);
    }
    const wire =
      response.kind === 'refused'
        ? [
            'done/position-response/v1',
            1,
            'refused',
            response.refusal.workspace,
            response.refusal.credential,
            response.refusal.position,
            response.refusal.digest,
            response.refusal.epoch,
            response.refusal.reason,
            response.refusal.parent,
            response.refusal.signature,
          ]
        : [
            'done/position-response/v1',
            1,
            'accepted',
            response.head.workspace,
            response.head.credential,
            response.head.position,
            response.head.link,
            response.head.epoch,
            response.head.final,
            response.leaf.epoch,
            response.leaf.digest,
            response.head.signature,
          ];
    assert.equal(
      Buffer.from(c.bytes).toString('utf8'),
      JSON.stringify(wire),
      'Decisions response bytes differ',
    );
  }
  for (const c of controls.slice(3)) {
    assert.equal(c.baseline.accepted, false);
    assert.equal(c.badSubmissionAccepted, true);
    assert.match(
      c.baseline.reason,
      c.control === 'parent' ? /Submission signature mismatch/ : /Successor subject mismatch/,
    );
    assert(bytes(c.bytes) && bytes(c.original.envelope) && bytes(c.original.signature));
    assert.equal(c.original.signature.length, 64);
    assert(hex(c.publicKey, 32));
    assert.equal(c.original.lineage, c.authority.lineage);
    assert(
      Buffer.from(c.bytes).equals(submissionWire(c.accepted)),
      'Decisions submission bytes differ',
    );
    assert.deepEqual(c.accepted.envelope, c.original.envelope);
    assert.deepEqual(c.accepted.signature, c.original.signature);
    assert.equal(c.accepted.lineage, c.original.lineage);
    assert.equal(c.route.workspace_id, c.authority.workspace);
    assert.equal(c.route.epoch, c.authority.tip);
    const p = c.accepted.parent;
    assert.equal(p.workspace, c.route.workspace_id);
    assert.equal(p.credential, c.route.credential_id);
    assert.equal(p.epoch, c.route.epoch);
    assert.equal(p.position, c.envelopePosition + (c.control === 'position' ? 1 : 0));
    if (c.control === 'parent') {
      const before = c.original.parent;
      assert.equal(before.reason, 'stale-epoch');
      assert.equal(p.reason, 'retired-generation');
      assert.notEqual(before.signature, p.signature, 'Parent control did not replace proof');
      assert.deepEqual(
        { ...p, reason: before.reason, signature: before.signature },
        before,
        'Parent control changed unrelated fields',
      );
    } else assert.deepEqual(c.accepted, c.original, 'Position control changed signed submission');
  }
  const g = r['generated.json'];
  assert.equal(g.status, 'passed');
  assert.equal(g.seed, 9622026);
  assert.equal(g.histories.length, 8);
  for (const h of g.histories) {
    assert(h.commands.length >= 2 && h.commands.length <= 5);
    assert.equal(h.observations.length, h.commands.length, 'Decisions history incomplete');
    assert(hex(h.before.inventoryHash, 32));
    for (const [i, kind] of h.commands.entries()) {
      assert(
        ['accepted', 'refused', 'foreign-key', 'foreign-prefix', 'conflict', 'junk'].includes(kind),
      );
      assert.equal(
        h.observations[i].kind,
        ['accepted', 'refused', 'conflict'].includes(kind) ? kind : 'unknown',
        'Wrong observed decision',
      );
      assert.equal(
        h.observations[i].inventoryHash,
        h.before.inventoryHash,
        'Decision inspection mutated storage',
      );
    }
    assert.deepEqual(h.after.budget, h.before.budget, 'Decision inspection consumed budget');
    assert(Array.isArray(h.before.sources) && h.before.sources.length > 0);
    assert.deepEqual(h.after.sources, h.before.sources, 'Decision inspection changed sources');
    assert(Array.isArray(h.before.wire) && h.before.wire.length > 0);
    for (const e of h.before.wire)
      assert(Number.isSafeInteger(e.position) && e.position > 0 && bytes(e.bytes));
    assert.deepEqual(h.recovered.wire, h.before.wire, 'Decision restart changed wire');
    const recovered = new Map(h.recovered.sources.map((c) => [c.id, c]));
    assert.equal(recovered.size, h.recovered.sources.length);
    for (const original of h.before.sources)
      assert.deepEqual(
        recovered.get(original.id),
        original,
        'Decision restart changed original source',
      );
  }
}
