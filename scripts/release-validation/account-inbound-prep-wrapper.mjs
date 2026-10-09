import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as Y from 'yjs';
import { vitestStage } from './vitest-adapter.mjs';
export const inboundPrepCampaign = 'scripts/account-inbound-prep/run.mjs';
export const inboundPrepFiles = [
  ['test/accountInboundPrep.test.ts'],
  [
    'test/networkEnvelope.test.ts',
    'test/positionDecision.test.ts',
    'test/yjsDelivery.test.ts',
    'test/sourceCapture.test.ts',
  ],
];
export const inboundPrepSteps = inboundPrepFiles.map((files, i) => ({
  name: i === 0 ? 'preparation' : 'primitives',
  kind: 'vitest',
  argv: [
    'node',
    'node_modules/vitest/vitest.mjs',
    'run',
    ...files,
    '--maxWorkers=2',
    '--reporter=verbose',
    ...(i === 0 ? ['--reporter=junit', '--outputFile.junit=$REPORT/results.xml'] : []),
  ],
  deadlineMs: 60000,
}));
export const inboundPrepReports = [
  'sources.json',
  'summary.json',
  'results.xml',
  ...inboundPrepSteps.flatMap((s) => [s.name + '.log', 'case-reports/' + s.name + '.json']),
  'fixtures.json',
  'generated.json',
  ...[
    'deletion-coverage',
    'baseline',
    'split',
    'pending',
    'early-promotion',
    'global-cursor',
    'relabel',
  ].map((n) => 'control-' + n + '.json'),
];
export const inboundPrepFilePolicy = {
  kind: 'account-reports-v1',
  required: inboundPrepReports,
  maxEntries: 40,
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 2,
};
export function inboundPrepCampaignStage(root) {
  const steps = inboundPrepSteps.map((s, i) => {
    const declarations = inboundPrepFiles[i].map((f) => vitestStage(root, f).expect),
      dataInputs = declarations.flatMap((d) => d.dataInputs ?? []);
    return {
      ...s,
      expect: {
        kind: 'vitest',
        files: inboundPrepFiles[i],
        cases: declarations.flatMap((d) => d.cases),
        ...(dataInputs.length ? { dataInputs } : {}),
      },
    };
  });
  return {
    id: 'campaign:' + inboundPrepCampaign,
    argv: ['node', inboundPrepCampaign],
    env: {},
    variant: 'account-inbound-prep-campaign-v1',
    expect: {
      kind: 'account-inbound-prep',
      steps,
      cases: steps.flatMap((s) => s.expect.cases),
      dataInputs: steps[1].expect.dataInputs,
    },
    deadlineMs: 120000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
    fileOutputs: structuredClone(inboundPrepFilePolicy),
  };
}
export function validateInboundPrepCampaign(s) {
  assert.equal(s.expect.kind, 'account-inbound-prep');
  assert.equal(s.variant, 'account-inbound-prep-campaign-v1');
  assert.deepEqual(s.argv, ['node', inboundPrepCampaign]);
  assert.deepEqual(s.env, {});
  assert.deepEqual(s.fileOutputs, inboundPrepFilePolicy);
  assert.equal(s.fixture, undefined);
  assert.equal(s.deadlineMs, 120000);
  assert.equal(s.graceMs, 5000);
  assert.equal(s.processPolicy, 'inherited-group-v1');
  assert.equal(s.expect.historyInputs, undefined);
  assert.deepEqual(
    s.expect.steps.map(({ expect: _e, ...step }) => step),
    inboundPrepSteps,
  );
  assert.deepEqual(
    s.expect.cases,
    s.expect.steps.flatMap((step) => step.expect.cases),
  );
  for (const [i, step] of s.expect.steps.entries()) {
    assert.equal(step.expect.kind, 'vitest');
    assert.deepEqual(step.expect.files, inboundPrepFiles[i]);
    assert(step.expect.cases.length > 0);
    assert.deepEqual(step.expect.dataInputs, i === 1 ? s.expect.dataInputs : undefined);
  }
  assert.deepEqual(
    s.expect.dataInputs.map((i) => i.path),
    ['test/vectors/envelope.json', 'test/vectors/private-envelope.json'],
  );
}
export function reconcileInboundPrepReports(directory, sources) {
  const json = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const summary = json('summary.json');
  assert.equal(summary.status, 'passed', 'Inbound preparation summary failed');
  assert.equal(summary.error, undefined);
  for (const key of ['startedAt', 'completedAt'])
    assert(
      typeof summary[key] === 'string' && new Date(summary[key]).toISOString() === summary[key],
    );
  assert(Date.parse(summary.completedAt) >= Date.parse(summary.startedAt));
  assert.deepEqual(
    summary.stages,
    inboundPrepSteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
    'Inbound preparation summary stages differ',
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
        'docs/account-inbound.md',
        'docs/selections/row-7-checkpoint.md',
        'docs/selections/row-11-enrollment-ceremony.md',
        'docs/account-transport.md',
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
        'scripts/account-inbound-prep/run.mjs',
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
    'Inbound preparation source pins differ',
  );
  reconcileInboundPrepEvidence(
    Object.fromEntries(
      inboundPrepReports
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
  for (const file of ['results.xml', ...inboundPrepSteps.map((s) => s.name + '.log')])
    assert(
      readFileSync(join(directory, file)).length,
      'Empty inbound preparation auxiliary report',
    );
}

const hash = (v) => createHash('sha256').update(v).digest('hex');
const validHex = (v) =>
  typeof v === 'string' && v.length > 0 && v.length <= 32768 && /^(?:[0-9a-f]{2})+$/.test(v);
// Independent event accounting and plaintext Yjs replay. The tests remain responsible
// for cryptographic binding and full sameDocState checks; this is not a native disk oracle.
export function reconcileInboundPrepEvidence(r) {
  const f = r['fixtures.json'];
  assert.equal(f.entries.length, 4);
  const publishers = ['11'.repeat(16), '22'.repeat(16)];
  assert.equal(f.authority.reader, '33'.repeat(16));
  assert(validHex(f.baseline));
  for (const [i, e] of f.entries.entries()) {
    assert.equal(e.publisher, publishers[Math.floor(i / 2)]);
    assert.equal(e.position, (i % 2) + 1);
    for (const key of ['envelope', 'proof', 'request', 'page', 'previous', 'link'])
      assert(validHex(e[key]), 'Invalid inbound fixture ' + key);
    assert(e.updates.length > 0 && e.updates.length <= 4 && e.updates.every(validHex));
  }
  const cache = new Map();
  const content = (indices) => {
    const key = indices.join(',');
    if (cache.has(key)) return cache.get(key);
    const doc = new Y.Doc({ gc: false });
    try {
      Y.applyUpdate(doc, Buffer.from(f.baseline, 'hex'));
      for (const index of indices)
        for (const update of f.entries[index].updates)
          Y.applyUpdate(doc, Buffer.from(update, 'hex'));
      const result = {
        text: doc.getText('master').toString(),
        pending: doc.store.pendingStructs !== null || doc.store.pendingDs !== null,
      };
      cache.set(key, result);
      return result;
    } finally {
      doc.destroy();
    }
  };
  assert.equal(content([0, 1, 2, 3]).text, f.expected, 'Inbound fixture final text differs');
  const check = (o, indices) => {
    const entries = indices.map((i) => f.entries[i]),
      cursor = {};
    for (const e of entries) cursor[e.publisher] = e.position;
    assert.deepEqual(o.cursor, cursor, 'Inbound cursor differs');
    assert.equal(o.captures, 0, 'Received data was recaptured');
    const expected = content(indices);
    assert.equal(o.text, expected.text, 'Inbound replay text differs');
    assert.equal(o.pending, expected.pending, 'Inbound pending data differs');
    assert.equal(
      o.ledgerHash,
      hash(
        JSON.stringify(
          entries.map((e) => ['received', e.publisher, e.position, e.envelope, e.proof]),
        ),
      ),
      'Inbound ledger changed',
    );
  };
  const g = r['generated.json'];
  assert.equal(g.status, 'passed');
  assert.equal(g.seed, 9142026);
  assert.equal(g.runs, 300);
  assert.equal(g.histories.length, 300);
  for (const h of g.histories) {
    assert(h.history.length >= 4 && h.history.length <= 24);
    assert.equal(h.observations.length, h.history.length, 'Incomplete inbound observations');
    const accepted = [];
    for (const [i, op] of h.history.entries()) {
      assert(Number.isInteger(op.index) && op.index >= 0 && op.index < 4);
      assert(['none', 'before', 'after'].includes(op.cut));
      assert.equal(typeof op.close, 'boolean');
      assert.equal(typeof op.compact, 'boolean');
      const e = f.entries[op.index],
        prior = accepted.filter((index) => f.entries[index].publisher === e.publisher).length;
      if (e.position === prior + 1 && !op.close && op.cut !== 'before') accepted.push(op.index);
      check(h.observations[i], accepted);
    }
    for (let i = 0; i < 4; i++) if (!accepted.includes(i)) accepted.push(i);
    check(h.final, accepted);
    assert.equal(h.final.pending, false);
  }
  const deletion = r['control-deletion-coverage.json'];
  assert.equal(deletion.sameStateVector, true);
  assert.equal(deletion.sameSnapshot, false);
  assert.notEqual(deletion.complete, deletion.omittedDeletion);
  const baseline = r['control-baseline.json'];
  assert.equal(baseline.signatureWithAttackerBaseline, 'accepted');
  assert.equal(baseline.heldBaseline, 'unknown');
  assert.equal(baseline.missingGenesis.pending, true);
  assert.equal(baseline.missingGenesis.expected, f.expected);
  assert.notEqual(baseline.missingGenesis.text, f.expected);
  const split = r['control-split.json'];
  assert.equal(split.received, 1);
  assert.equal(split.contentRecords, 0);
  assert.match(split.error, /Content does not cover/);
  const pending = r['control-pending.json'];
  assert.equal(pending.expected, f.expected);
  assert.notEqual(pending.afterDroppingPendingDeletion, f.expected);
  const early = r['control-early-promotion.json'];
  assert.notEqual(early.beforeKill, early.coldWithoutRemoteCommit);
  assert.equal(early.coldWithoutRemoteCommit, content([]).text);
  assert.equal(early.pending, true);
  const global = r['control-global-cursor.json'];
  assert.equal(global.expected, f.expected);
  assert.notEqual(global.actual, f.expected);
  assert.equal(global.cursor, 2);
  const relabel = r['control-relabel.json'];
  assert.equal(relabel.originalPublisher, publishers[0]);
  assert.equal(relabel.newCapsulePublisher, f.authority.reader);
  assert.equal(relabel.sameUpdate, true);
  assert.equal(relabel.correctReceiverCapsules, 0);
}
