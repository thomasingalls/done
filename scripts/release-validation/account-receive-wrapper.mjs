import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as Y from 'yjs';
import { historicalInput, validateHistoricalInputs } from './historical-inputs.mjs';
import { generatedNodeDeclarations } from './census.mjs';
import { vitestStage } from './vitest-adapter.mjs';
import {
  inboundCodecsReports,
  reconcileInboundCodecsEvidence,
} from './account-inbound-codecs-wrapper.mjs';
export const receiveCampaign = 'scripts/account-receive/run.mjs';
export const receiveFiles = [
  'test/accountReceiveLedger.test.ts',
  'test/accountInboundCodec.test.ts',
  'test/accountInboundControls.test.ts',
];
export const receiveSteps = [
  {
    name: 'properties',
    kind: 'vitest',
    argv: [
      'node',
      'node_modules/vitest/vitest.mjs',
      'run',
      ...receiveFiles,
      '--maxWorkers=2',
      '--reporter=verbose',
    ],
    deadlineMs: 60000,
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
      'test/account-receive/native.test.mjs',
    ],
    deadlineMs: 300000,
  },
];
export const receiveReports = [
  'sources.json',
  'summary.json',
  'results.xml',
  ...receiveSteps.flatMap((s) => [s.name + '.log', 'case-reports/' + s.name + '.json']),
  ...inboundCodecsReports.filter(
    (f) =>
      f.endsWith('.json') &&
      !f.startsWith('case-reports/') &&
      !f.startsWith('regression-artifacts/') &&
      !['sources.json', 'summary.json'].includes(f),
  ),
  'generated-native.json',
  'unit-ledger-histories.json',
  ...['coverage', 'witness', 'split', 'stored-page'].map((n) => 'control-' + n + '.json'),
];
export const receiveFilePolicy = {
  kind: 'account-reports-v1',
  required: receiveReports,
  maxEntries: 40,
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 2,
};
export function receiveCampaignStage(root) {
  const steps = receiveSteps.map((s) => {
    if (s.kind === 'node') {
      const d = generatedNodeDeclarations(
        s.argv.at(-1),
        readFileSync(join(root, s.argv.at(-1)), 'utf8'),
        { root },
      );
      assert(!d.dataInputs?.length);
      return { ...s, expect: { kind: 'cases', cases: d.cases } };
    }
    const d = receiveFiles.map((f) => vitestStage(root, f).expect);
    assert(d.every((v) => !v.dataInputs?.length));
    return {
      ...s,
      expect: { kind: 'vitest', files: receiveFiles, cases: d.flatMap((v) => v.cases) },
    };
  });
  return {
    id: 'campaign:' + receiveCampaign,
    argv: ['node', receiveCampaign],
    env: {},
    variant: 'account-receive-campaign-v1',
    expect: {
      kind: 'account-receive',
      steps,
      cases: steps.flatMap((s) => s.expect.cases),
      historyInputs: [historicalInput(root, '8378596', 'src/crdt/promotionRecord.ts')],
    },
    deadlineMs: 360000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
    fixture: { kind: 'chromium-cdp', startupMs: 15000 },
    fileOutputs: structuredClone(receiveFilePolicy),
  };
}
export function validateReceiveCampaign(s) {
  assert.equal(s.expect.kind, 'account-receive');
  assert.equal(s.variant, 'account-receive-campaign-v1');
  assert.deepEqual(s.argv, ['node', receiveCampaign]);
  assert.deepEqual(s.env, {});
  assert.deepEqual(s.fileOutputs, receiveFilePolicy);
  assert.deepEqual(s.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(s.expect.dataInputs, undefined);
  assert.equal(s.deadlineMs, 360000);
  assert.equal(s.graceMs, 5000);
  assert.equal(s.processPolicy, 'inherited-group-v1');
  validateHistoricalInputs(s.expect.historyInputs);
  assert.deepEqual(
    s.expect.historyInputs.map(({ reference, path }) => [reference, path]),
    [['8378596', 'src/crdt/promotionRecord.ts']],
  );
  assert.deepEqual(
    s.expect.steps.map(({ expect: _e, ...step }) => step),
    receiveSteps,
  );
  assert.deepEqual(
    s.expect.cases,
    s.expect.steps.flatMap((step) => step.expect.cases),
  );
  for (const step of s.expect.steps) {
    assert.equal(step.expect.kind, step.kind === 'node' ? 'cases' : 'vitest');
    assert(step.expect.cases.length > 0);
    assert.equal(step.expect.dataInputs, undefined);
    if (step.kind === 'vitest') assert.deepEqual(step.expect.files, receiveFiles);
  }
}
export function reconcileReceiveReports(directory, sources, root) {
  const json = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const summary = json('summary.json');
  assert.equal(summary.status, 'passed', 'Receive summary failed');
  assert.equal(summary.error, undefined);
  for (const key of ['startedAt', 'completedAt'])
    assert(
      typeof summary[key] === 'string' && new Date(summary[key]).toISOString() === summary[key],
    );
  assert(Date.parse(summary.completedAt) >= Date.parse(summary.startedAt));
  assert.deepEqual(
    summary.stages,
    receiveSteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
    'Receive summary stages differ',
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
        'docs/account-inbound-verification.md',
        'docs/account-receive.md',
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
        'scripts/account-receive/run.mjs',
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
    'Receive source pins differ',
  );
  const source = readFileSync(join(root, 'src/crdt/accountInbound.ts'), 'utf8');
  assert.equal(
    hash(source),
    sources.find((s) => s.path === 'src/crdt/accountInbound.ts')?.sha256,
    'Inbound codec mutation source differs',
  );
  reconcileInboundCodecsEvidence(
    Object.fromEntries(
      receiveReports
        .filter(
          (f) =>
            f.endsWith('.json') &&
            !f.startsWith('case-reports/') &&
            !f.startsWith('regression-artifacts/') &&
            !['sources.json', 'summary.json'].includes(f),
        )
        .map((f) => [f, json(f)]),
    ),
    source,
  );
  reconcileReceiveEvidence(
    Object.fromEntries(
      [
        'generated-native.json',
        'unit-ledger-histories.json',
        ...['coverage', 'witness', 'split', 'stored-page'].map((n) => 'control-' + n + '.json'),
      ].map((f) => [f, json(f)]),
    ),
  );
  for (const file of ['results.xml', ...receiveSteps.map((s) => s.name + '.log')])
    assert(readFileSync(join(directory, file)).length, 'Empty receive auxiliary report');
}

const hash = (v) => createHash('sha256').update(v).digest('hex');
const hex = (v) =>
  typeof v === 'string' && v.length > 0 && v.length <= 262144 && /^(?:[0-9a-f]{2})+$/.test(v);
const frame = (wire, domain, count) => {
  assert(hex(wire));
  const text = Buffer.from(wire, 'hex').toString(),
    v = JSON.parse(text);
  assert.equal(JSON.stringify(v), text);
  assert.equal(v[0], domain);
  assert.equal(v.length, count);
  return v;
};
// Independent retained-event and plaintext coverage accounting. Existing native
// owners perform AEAD/witness/signature checks; this report oracle has no keys.
export function reconcileReceiveEvidence(r) {
  const coverage = r['control-coverage.json'];
  assert.match(coverage.normalError, /coverage/i);
  assert.deepEqual(coverage.omitted, ['startup fallback', 'owner reuse']);
  assert.deepEqual(
    coverage.single.map((s) => s.branch),
    ['reuse', 'fallback'],
  );
  for (const s of coverage.single) assert.match(s.error, /coverage/i);
  assert.equal(coverage.joint.receivedThrough, 1);
  const witness = r['control-witness.json'];
  assert.match(witness.normalError, /incomplete|authentication|coverage/i);
  assert.equal(witness.changed.receivedThrough, 0);
  const split = r['control-split.json'];
  assert.match(split.readbackError, /coverage/i);
  assert.match(split.coldError, /coverage/i);
  const stored = r['control-stored-page.json'];
  assert.match(stored.normalError, /unverified/);
  assert.equal(stored.changed.receivedThrough, 1);
  const u = r['unit-ledger-histories.json'];
  assert.equal(u.status, 'passed');
  assert.equal(u.seed, 9172026);
  assert.equal(u.histories.length, 200);
  const unitReplay = new Map();
  for (const h of u.histories) {
    assert(typeof h.text === 'string' && h.text.length > 0 && h.text.length <= 140);
    assert(Number.isInteger(h.n) && h.n >= 0 && h.n <= 60);
    assert.match(h.missing, /coverage/);
    if (h.n > 0) assert.match(h.withoutDeletion, /coverage/);
    else assert.equal(h.withoutDeletion, null);
    assert([h.insert, h.deletion, h.merged].every(hex));
    const key = JSON.stringify([h.insert, h.deletion, h.merged]);
    if (!unitReplay.has(key)) {
      const a = new Y.Doc({ gc: false }),
        b = new Y.Doc({ gc: false });
      try {
        Y.applyUpdate(a, Buffer.from(h.merged, 'hex'));
        Y.applyUpdate(b, Buffer.from(h.insert, 'hex'));
        Y.applyUpdate(b, Buffer.from(h.deletion, 'hex'));
        assert(
          Y.equalSnapshots(Y.snapshot(a), Y.snapshot(b)),
          'Receive unit deletion coverage differs',
        );
        for (const doc of [a, b]) {
          assert.equal(doc.store.pendingStructs, null);
          assert.equal(doc.store.pendingDs, null);
        }
        unitReplay.set(key, a.getText('master').toString());
      } finally {
        a.destroy();
        b.destroy();
      }
    }
    assert.equal(
      unitReplay.get(key),
      h.text.slice(Math.min(h.text.length, h.n)),
      'Receive unit merged text differs',
    );
  }
  const g = r['generated-native.json'];
  assert.equal(g.status, 'passed');
  assert.equal(g.seed, 9182026);
  assert.equal(g.runs, 12);
  assert.equal(g.histories.length, 12);
  for (const h of g.histories) {
    const n = h.actions.length;
    assert(n >= 1 && n <= 3);
    for (const list of [h.frames, h.wires, h.observations, h.events])
      assert.equal(list.length, n, 'Incomplete receive native history');
    assert(h.frames.every(hex) && h.wires.every(hex));
    let previous = '00'.repeat(32),
      lastSeq = 0;
    for (const [i, action] of h.actions.entries()) {
      assert(['none', 'before', 'after'].includes(action.cut));
      assert.equal(typeof action.compact, 'boolean');
      assert.equal(typeof action.cold, 'boolean');
      const o = h.observations[i];
      assert.equal(
        o.cutCursor,
        action.cut === 'none' ? null : i + (action.cut === 'after' ? 1 : 0),
        'Receive cut cursor differs',
      );
      assert.equal(o.result.kind, action.cut === 'after' ? 'duplicate' : 'received');
      assert.equal(o.result.recorded, action.cut !== 'after', 'Receive retry disposition differs');
      for (const s of [o.status, o.result.status]) {
        assert.equal(s.state, 'ready');
        assert.equal(s.receivedThrough, i + 1);
        assert.equal(s.link, o.link);
        assert.equal(s.observedThrough, n);
      }
      const e = h.events[i];
      assert(Number.isSafeInteger(e.seq) && e.seq > lastSeq);
      lastSeq = e.seq;
      const event = frame(e.bytes, 'done/account-inbound/v1', 13),
        q = frame(o.request, 'done/private-read/v2', 15),
        page = frame(o.page, 'done/private-read-page/v2', 7);
      assert.equal(event[1], 1);
      assert.equal(q[1], 2);
      assert.equal(page[1], 2);
      assert.equal(event[7], 'received');
      assert.equal(event[8], i + 1);
      assert.equal(event[9], previous);
      assert.equal(event[10], o.link);
      assert.equal(event[11], o.request, 'Receive stored request changed');
      assert.equal(event[12], o.page, 'Receive stored page changed');
      assert.deepEqual(event.slice(3, 7), [q[7], q[8], q[5], q[6]]);
      assert.equal(q[10], i);
      assert.equal(page[2], hash(Buffer.from(o.request, 'hex')));
      assert.equal(page[3], n);
      assert.equal(page[4], i + 1);
      assert.equal(page[5].length, 1);
      assert.equal(page[5][0][0], h.wires[i]);
      previous = o.link;
    }
    assert.equal(
      h.value,
      Array.from({ length: n }, (_, i) => String(i)).join(''),
      'Receive recovered text differs',
    );
    assert.equal(h.pending, false);
    assert(h.content.length > 0 && h.content.length <= 128);
    const doc = new Y.Doc({ gc: false });
    try {
      let seq = 0;
      for (const row of h.content) {
        assert(Number.isSafeInteger(row.seq) && row.seq > seq);
        seq = row.seq;
        assert(['update', 'state'].includes(row.kind) && hex(row.bytes));
        Y.applyUpdate(doc, Buffer.from(row.bytes, 'hex'));
      }
      assert.equal(
        doc.getText('remote-fixture').toString(),
        h.value,
        'Receive persisted content differs',
      );
      assert.equal(doc.store.pendingStructs, null);
      assert.equal(doc.store.pendingDs, null);
      const before = Y.snapshot(doc);
      for (const update of h.frames) Y.applyUpdate(doc, Buffer.from(update, 'hex'));
      assert.equal(doc.store.pendingStructs, null, 'Receive originals introduce pending structs');
      assert.equal(doc.store.pendingDs, null, 'Receive originals introduce pending deletions');
      assert(
        Y.equalSnapshots(before, Y.snapshot(doc)),
        'Receive native content does not cover originals',
      );
    } finally {
      doc.destroy();
    }
  }
}
