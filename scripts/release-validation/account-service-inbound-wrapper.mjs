import { historicalInput, validateHistoricalInputs } from './historical-inputs.mjs';
import { createHash, createPublicKey, verify } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatedNodeDeclarations } from './census.mjs';
export const serviceInboundCampaign = 'scripts/account-service-inbound/run.mjs';
export const serviceInboundFiles = ['core', 'generated', 'controls', 'restart'].map(
  (n) => 'test/account-service-inbound/' + n + '.test.mjs',
);
export const serviceInboundSteps = [
  {
    name: 'types',
    kind: 'exit',
    argv: ['node', 'node_modules/typescript/bin/tsc', '-b'],
    deadlineMs: 60000,
  },
  {
    name: 'service',
    kind: 'node',
    argv: [
      'node',
      '--test',
      '--test-concurrency=1',
      '--test-reporter=spec',
      '--test-reporter-destination=stdout',
      '--test-reporter=junit',
      '--test-reporter-destination=$REPORT/results.xml',
      ...serviceInboundFiles,
    ],
    deadlineMs: 120000,
  },
  {
    name: 'native',
    kind: 'node',
    argv: [
      'node',
      '--test',
      '--test-reporter=spec',
      '--test-concurrency=1',
      'test/account-service-inbound/native.test.mjs',
    ],
    deadlineMs: 90000,
  },
];
export const serviceInboundControls = [
  'reader',
  'publisher',
  'signature',
  'current',
  'registration',
  'witness',
  'expiry',
  'custody',
];
export const serviceInboundReports = [
  'sources.json',
  'summary.json',
  'types.log',
  'service.log',
  'native.log',
  'results.xml',
  'case-reports/service.json',
  'case-reports/native.json',
  'generated.json',
  ...serviceInboundControls.map((n) => 'control-' + n + '.json'),
  'restart-verified.json',
  'restart-signed.json',
  'native-http.json',
];
export const serviceInboundFilePolicy = {
  kind: 'account-reports-v1',
  required: serviceInboundReports,
  maxEntries: 32,
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 2,
};
export function serviceInboundCampaignStage(root) {
  const steps = serviceInboundSteps.map((s) => {
    if (s.kind === 'exit') return { ...s, expect: { kind: 'exit', exitCodes: [0] } };
    const files = s.name === 'service' ? serviceInboundFiles : [s.argv.at(-1)];
    const cases = files.flatMap((file) => {
      const d = generatedNodeDeclarations(file, readFileSync(join(root, file), 'utf8'), { root });
      assert(!d.dataInputs?.length);
      return d.cases;
    });
    return { ...s, expect: { kind: 'cases', cases } };
  });
  return {
    id: 'campaign:' + serviceInboundCampaign,
    argv: ['node', serviceInboundCampaign],
    env: {},
    variant: 'account-service-inbound-campaign-v1',
    expect: {
      kind: 'account-service-inbound',
      steps,
      cases: steps.flatMap((s) => s.expect.cases ?? []),
      historyInputs: ['account-service/delivery.ts'].map((p) =>
        historicalInput(root, '4bb09042f37f68ec31f0d82587af608f599eb096', p),
      ),
    },
    deadlineMs: 270000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
    fixture: { kind: 'chromium-cdp', startupMs: 15000 },
    fileOutputs: structuredClone(serviceInboundFilePolicy),
  };
}
export function validateServiceInboundCampaign(s) {
  assert.equal(s.expect.kind, 'account-service-inbound');
  assert.equal(s.variant, 'account-service-inbound-campaign-v1');
  assert.deepEqual(s.argv, ['node', serviceInboundCampaign]);
  assert.deepEqual(s.env, {});
  assert.deepEqual(s.fileOutputs, serviceInboundFilePolicy);
  assert.deepEqual(s.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(s.expect.dataInputs, undefined);
  assert.equal(s.deadlineMs, 270000);
  assert.equal(s.graceMs, 5000);
  assert.equal(s.processPolicy, 'inherited-group-v1');
  validateHistoricalInputs(s.expect.historyInputs);
  assert.deepEqual(
    s.expect.historyInputs.map(({ reference, path }) => [reference, path]),
    ['account-service/delivery.ts'].map((p) => ['4bb09042f37f68ec31f0d82587af608f599eb096', p]),
  );
  assert.deepEqual(
    s.expect.steps.map(({ expect: _e, ...step }) => step),
    serviceInboundSteps,
  );
  assert.deepEqual(
    s.expect.cases,
    s.expect.steps.flatMap((step) => step.expect.cases ?? []),
  );
  for (const step of s.expect.steps) {
    if (step.kind === 'exit') {
      assert.deepEqual(step.expect, { kind: 'exit', exitCodes: [0] });
      continue;
    }
    assert.equal(step.expect.kind, 'cases');
    assert(step.expect.cases.length > 0);
    assert.equal(step.expect.dataInputs, undefined);
  }
}
export function reconcileServiceInboundReports(directory, sources) {
  const json = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const summary = json('summary.json');
  assert.equal(summary.status, 'passed', 'ServiceInbound summary failed');
  assert.equal(summary.error, undefined);
  for (const key of ['startedAt', 'completedAt'])
    assert(
      typeof summary[key] === 'string' && new Date(summary[key]).toISOString() === summary[key],
    );
  assert(Date.parse(summary.completedAt) >= Date.parse(summary.startedAt));
  assert.deepEqual(
    summary.stages,
    serviceInboundSteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
    'ServiceInbound summary stages differ',
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
        'docs/account-service-inbound.md',
        'docs/account-inbound.md',
        'docs/account-inbound-verification.md',
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
        'scripts/account-service-inbound/run.mjs',
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
    'ServiceInbound source pins differ',
  );
  reconcileServiceInboundEvidence(
    Object.fromEntries(
      serviceInboundReports
        .filter(
          (f) =>
            f.endsWith('.json') &&
            !f.startsWith('case-reports/') &&
            !['sources.json', 'summary.json'].includes(f),
        )
        .map((f) => [f, json(f)]),
    ),
  );
  readFileSync(join(directory, 'types.log'));
  for (const f of ['service.log', 'native.log', 'results.xml'])
    assert(readFileSync(join(directory, f)).length, 'Empty service inbound auxiliary report');
}
const hash = (b) => createHash('sha256').update(b).digest('hex');
const wire = (v) => {
  assert(
    typeof v === 'string' &&
      v.length > 0 &&
      v.length <= 1024 * 1024 &&
      /^(?:[0-9a-f]{2})+$/.test(v),
  );
  return Buffer.from(v, 'hex');
};
const frame = (v, domain, n) => {
  const b = wire(v),
    p = JSON.parse(b.toString());
  assert.equal(b.toString(), JSON.stringify(p));
  assert.equal(p[0], domain);
  assert.equal(p[1], 2);
  assert.equal(p.length, n);
  return p;
};
const query = (v) => {
  const q = frame(v, 'done/private-read/v2', 15);
  assert(Number.isSafeInteger(q[10]) && q[10] >= 0);
  assert(Number.isInteger(q[11]) && q[11] >= 1 && q[11] <= 8);
  return q;
};
const unchanged = (o) => {
  assert.match(o.before, /^[0-9a-f]{64}$/);
  assert.equal(o.after, o.before, 'Read-only inbound operation changed inventory');
};
function page(o, originals, pub) {
  assert.equal(o.result.kind, 'decision');
  const q = query(o.request),
    p = frame(o.result.bytes, 'done/private-read-page/v2', 7);
  assert.equal(p[2], hash(wire(o.request)), 'Inbound page query binding differs');
  assert.equal(p[3], originals.length);
  assert(Array.isArray(p[5]) && p[5].length <= q[11]);
  assert.equal(p[4], q[10] + p[5].length);
  assert(p[4] <= p[3]);
  assert(p[4] === p[3] || p[5].length > 0);
  for (const [i, e] of p[5].entries()) {
    assert.equal(e.length, 2);
    const original = originals[q[10] + i];
    assert.equal(e[0], original.envelope, 'Original inbound envelope changed');
    assert.equal(e[1], original.result.bytes, 'Original inbound acceptance changed');
  }
  if (pub !== undefined) {
    assert.match(pub, /^[0-9a-f]{64}$/);
    const key = createPublicKey({
      key: Buffer.from('302a300506032b6570032100' + pub, 'hex'),
      format: 'der',
      type: 'spki',
    });
    assert(
      verify(null, Buffer.from(JSON.stringify(p.slice(0, 6))), key, wire(p[6])),
      'Inbound page signature differs',
    );
  }
  return p[4];
}
// Observed public keys check internal signature consistency, not external trust.
// Original independently framed service/native tests remain authoritative.
export function reconcileServiceInboundEvidence(r) {
  for (const mode of serviceInboundControls) {
    const c = r['control-' + mode + '.json'];
    assert.equal(c.control, mode);
    assert.equal(c.ordinary.length, 2);
    assert.equal(c.originals.length, 1);
    for (const o of c.ordinary) assert.equal(page(o, c.originals, c.publicKey), 1);
    query(c.baseline.request);
    assert.equal(c.baseline.result.kind, 'unknown', 'Inbound omission baseline did not refuse');
    assert.equal(
      page(c.mutant, mode === 'witness' ? [] : c.originals, c.publicKey),
      mode === 'witness' ? 0 : 1,
    );
    if (mode === 'registration') {
      assert.equal(c.activation.length, 2);
      for (const o of c.activation) {
        query(o.request);
        assert.equal(o.result.kind, 'unknown', 'Independent activation binding did not refuse');
      }
    } else assert.deepEqual(c.activation, []);
  }
  for (const cut of ['verified', 'signed']) {
    const c = r['restart-' + cut + '.json'];
    assert.equal(c.cut, cut);
    assert.equal(c.code, null);
    assert.equal(c.signal, 'SIGKILL');
    assert.equal(c.replies, 0);
    unchanged(c);
    assert.equal(c.originals.length, 1);
    assert.equal(page(c, c.originals, c.publicKey), 1);
  }
  const g = r['generated.json'];
  assert.equal(g.seed, 9112031);
  assert.equal(g.status, 'passed');
  assert.equal(g.histories.length, 60);
  assert.equal(g.details.failed, false);
  assert.equal(g.details.numRuns, 60);
  assert.equal(g.details.numShrinks, 0);
  for (const k of ['counterexample', 'counterexamplePath', 'error'])
    assert.equal(g.details[k], null);
  const coverage = {};
  for (const h of g.histories) {
    assert.equal(h.completed, true);
    assert(h.commands.length >= 4 && h.commands.length <= 14);
    assert.equal(h.observations.length, h.commands.length);
    const originals = [];
    let saved,
      inventory,
      quarantined = false;
    for (const [i, c] of h.commands.entries()) {
      assert(
        ['append', 'read', 'restart', 'replay', 'reader', 'publisher', 'ledger'].includes(c.op),
      );
      assert(Number.isInteger(c.limit) && c.limit >= 1 && c.limit <= 8);
      assert(Number.isInteger(c.cursor) && c.cursor >= 0 && c.cursor <= 20);
      const o = h.observations[i];
      assert.equal(o.op, c.op);
      coverage[c.op] = (coverage[c.op] ?? 0) + 1;
      assert.match(o.before, /^[0-9a-f]{64}$/);
      assert.match(o.after, /^[0-9a-f]{64}$/);
      if (inventory !== undefined)
        assert.equal(o.before, inventory, 'Inbound inventory continuity differs');
      inventory = o.after;
      if (c.op === 'append') {
        assert.equal(o.position, originals.length + 1);
        wire(o.envelope);
        if (quarantined) {
          unchanged(o);
          assert.deepEqual(o.result, { kind: 'unknown', reason: 'ledger-integrity' });
          continue;
        }
        assert.equal(o.result.kind, 'decision');
        const result = JSON.parse(wire(o.result.bytes));
        assert.deepEqual(result.slice(0, 3), ['done/position-response/v1', 1, 'accepted']);
        assert.equal(result[5], o.position);
        assert.notEqual(o.after, o.before);
        originals.push({ envelope: o.envelope, result: o.result });
        continue;
      }
      unchanged(o);
      if (c.op === 'restart') {
        quarantined = false;
        continue;
      }
      const q = query(o.request),
        after = c.cursor % (originals.length + 1);
      if (c.op === 'replay' && saved !== undefined)
        assert.equal(o.request, saved, 'Inbound replay query changed');
      else {
        assert.equal(q[10], after);
        assert.equal(q[11], c.limit);
      }
      if (c.op === 'reader' || c.op === 'publisher') {
        assert.equal(q[c.op === 'reader' ? 5 : 6], 'ac'.repeat(16));
        assert.equal(o.result.kind, 'unknown');
      } else if (c.op === 'ledger' && originals.length) {
        assert.deepEqual(o.result, { kind: 'unknown', reason: 'ledger-integrity' });
        quarantined = true;
        assert.match(o.faulted, /^[0-9a-f]{64}$/);
        assert.notEqual(o.faulted, o.before);
      } else if (quarantined) {
        assert.deepEqual(o.result, { kind: 'unknown', reason: 'ledger-integrity' });
      } else {
        page(o, originals, h.publicKey);
        saved = o.request;
      }
    }
    if (quarantined) {
      assert(h.recovery, 'Missing final quarantine and restart proof');
      unchanged(h.recovery);
      assert.equal(h.recovery.before, inventory);
      query(h.recovery.read.request);
      assert.deepEqual(h.recovery.read.result, { kind: 'unknown', reason: 'ledger-integrity' });
      assert.equal(h.recovery.append.position, originals.length + 1);
      wire(h.recovery.append.envelope);
      assert.deepEqual(h.recovery.append.result, { kind: 'unknown', reason: 'ledger-integrity' });
      unchanged(h.recovery.restart);
      assert.equal(h.recovery.restart.before, inventory);
    } else assert.equal(h.recovery, undefined);
    let after = 0;
    assert(h.final.length >= 1 && h.final.length <= Math.max(1, originals.length));
    for (const o of h.final) {
      unchanged(o);
      assert.equal(o.before, inventory);
      assert.equal(query(o.request)[10], after);
      assert.equal(query(o.request)[11], 1);
      after = page(o, originals, h.publicKey);
    }
    assert.equal(after, originals.length, 'Incomplete recovered inbound prefix');
  }
  assert.deepEqual(g.coverage, coverage);
  for (const op of ['append', 'read', 'restart', 'replay', 'reader', 'publisher', 'ledger'])
    assert(coverage[op] > 0, 'Missing generated inbound operation');
  const n = r['native-http.json'];
  assert.deepEqual(
    n.refused.map((o) => [o.tag, o.status]),
    [
      ['v1', 409],
      ['Origin', 403],
      ['Content-Type', 403],
      ['Authorization', 403],
      ['size', 413],
      ['signature', 409],
    ],
  );
  assert.equal(n.originals.length, 2);
  assert.equal(n.pages.length, 2);
  const originals = n.pages.map((o, i) => ({
    envelope: n.originals[i],
    result: {
      kind: 'decision',
      bytes: frame(o.response.bytes, 'done/private-read-page/v2', 7)[5][0][1],
    },
  }));
  for (const [i, o] of n.pages.entries()) {
    assert.equal(o.position, i + 1);
    assert.equal(query(o.request)[10], i);
    assert.equal(o.response.status, 200);
    assert.equal(o.response.cache, 'no-store');
    assert.equal(o.response.type, 'application/octet-stream');
    assert.deepEqual(o.retry, o.response, 'HTTP retry changed original response');
    assert.equal(
      page(
        { request: o.request, result: { kind: 'decision', bytes: o.response.bytes } },
        originals,
      ),
      i + 1,
    );
    assert.equal(o.outcome.kind, 'received');
    assert.equal(o.outcome.status.receivedThrough, i + 1);
  }
  assert.equal(n.duplicate.kind, 'duplicate');
  assert.equal(n.beforeCold.receivedThrough, 2);
  assert.deepEqual(n.afterCold, n.beforeCold, 'Cold HTTP receipt progress changed');
  assert.equal(query(n.end.request)[10], 2);
  assert.equal(n.end.response.status, 200);
  assert.equal(
    page(
      { request: n.end.request, result: { kind: 'decision', bytes: n.end.response.bytes } },
      originals,
    ),
    2,
  );
  assert.equal(n.end.outcome.kind, 'empty');
}
