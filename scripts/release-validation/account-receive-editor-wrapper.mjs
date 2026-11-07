import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatedNodeDeclarations } from './census.mjs';
import { vitestStage } from './vitest-adapter.mjs';
export const receiveEditorCampaign = 'scripts/account-receive-editor/run.mjs';
export const receiveEditorFiles = [
  'test/ownedReceiveQueue.test.ts',
  'test/admissionQueue.test.ts',
  'test/workspaceAdmission.test.ts',
  'test/sourceCapture.test.ts',
];
export const receiveEditorSteps = [
  {
    name: 'types',
    kind: 'exit',
    argv: ['node', 'node_modules/typescript/bin/tsc', '-b', '--noEmit'],
    deadlineMs: 30000,
  },
  {
    name: 'properties',
    kind: 'vitest',
    argv: [
      'node',
      'node_modules/vitest/vitest.mjs',
      'run',
      ...receiveEditorFiles,
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
      'test/account-receive-editor/native.test.mjs',
    ],
    deadlineMs: 480000,
  },
];
export const receiveEditorReports = [
  'sources.json',
  'summary.json',
  'results.xml',
  ...receiveEditorSteps.flatMap((s) => [
    s.name + '.log',
    ...(s.kind === 'exit' ? [] : ['case-reports/' + s.name + '.json']),
  ]),
  'baseline-before.json',
  'baseline-after.json',
  'control-early.json',
  'control-relabel.json',
  'generated-editor.json',
];
export const receiveEditorFilePolicy = {
  kind: 'account-reports-v1',
  required: receiveEditorReports,
  maxEntries: 24,
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 2,
};
export function receiveEditorCampaignStage(root) {
  const steps = receiveEditorSteps.map((s) => {
    if (s.kind === 'exit') return { ...s, expect: { kind: 'exit', exitCodes: [0] } };
    if (s.kind === 'node') {
      const d = generatedNodeDeclarations(
        s.argv.at(-1),
        readFileSync(join(root, s.argv.at(-1)), 'utf8'),
        { root },
      );
      assert(!d.dataInputs?.length);
      return { ...s, expect: { kind: 'cases', cases: d.cases } };
    }
    const d = receiveEditorFiles.map((f) => vitestStage(root, f).expect);
    assert(d.every((v) => !v.dataInputs?.length));
    return {
      ...s,
      expect: { kind: 'vitest', files: receiveEditorFiles, cases: d.flatMap((v) => v.cases) },
    };
  });
  return {
    id: 'campaign:' + receiveEditorCampaign,
    argv: ['node', receiveEditorCampaign],
    env: {},
    variant: 'account-receive-editor-campaign-v1',
    expect: {
      kind: 'account-receive-editor',
      steps,
      cases: steps.flatMap((s) => s.expect.cases ?? []),
    },
    deadlineMs: 570000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
    fixture: { kind: 'chromium-cdp', startupMs: 15000 },
    fileOutputs: structuredClone(receiveEditorFilePolicy),
  };
}
export function validateReceiveEditorCampaign(s) {
  assert.equal(s.expect.kind, 'account-receive-editor');
  assert.equal(s.variant, 'account-receive-editor-campaign-v1');
  assert.deepEqual(s.argv, ['node', receiveEditorCampaign]);
  assert.deepEqual(s.env, {});
  assert.deepEqual(s.fileOutputs, receiveEditorFilePolicy);
  assert.deepEqual(s.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(s.expect.dataInputs, undefined);
  assert.equal(s.deadlineMs, 570000);
  assert.equal(s.graceMs, 5000);
  assert.equal(s.processPolicy, 'inherited-group-v1');
  assert.equal(s.expect.historyInputs, undefined);
  assert.deepEqual(
    s.expect.steps.map(({ expect: _e, ...step }) => step),
    receiveEditorSteps,
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
    assert.equal(step.expect.kind, step.kind === 'node' ? 'cases' : 'vitest');
    assert(step.expect.cases.length > 0);
    assert.equal(step.expect.dataInputs, undefined);
    if (step.kind === 'vitest') assert.deepEqual(step.expect.files, receiveEditorFiles);
  }
}
export function reconcileReceiveEditorReports(directory, sources) {
  const json = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const summary = json('summary.json');
  assert.equal(summary.status, 'passed', 'ReceiveEditor summary failed');
  assert.equal(summary.error, undefined);
  for (const key of ['startedAt', 'completedAt'])
    assert(
      typeof summary[key] === 'string' && new Date(summary[key]).toISOString() === summary[key],
    );
  assert(Date.parse(summary.completedAt) >= Date.parse(summary.startedAt));
  assert.deepEqual(
    summary.stages,
    receiveEditorSteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
    'ReceiveEditor summary stages differ',
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
        'docs/account-receive-editor.md',
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
        'scripts/account-receive-editor/run.mjs',
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
    'ReceiveEditor source pins differ',
  );
  reconcileReceiveEditorEvidence(
    Object.fromEntries(
      [
        'baseline-before.json',
        'baseline-after.json',
        'control-early.json',
        'control-relabel.json',
        'generated-editor.json',
      ].map((f) => [f, json(f)]),
    ),
  );
  // TypeScript emits nothing on success; presence and the trace exit are required.
  readFileSync(join(directory, 'types.log'));
  for (const file of [
    'results.xml',
    ...receiveEditorSteps.filter((s) => s.kind !== 'exit').map((s) => s.name + '.log'),
  ])
    assert(readFileSync(join(directory, file)).length, 'Empty receiveEditor auxiliary report');
}

const sortCaptures = (rows, initial = []) => {
  assert(Array.isArray(rows));
  assert.equal(new Set(rows.map((c) => c.id)).size, rows.length, 'Duplicate source identity');
  for (const c of rows) {
    assert(typeof c.id === 'string' && c.id.length > 0);
    assert(Array.isArray(c.sources) && c.sources.length > 0);
    for (const source of c.sources) {
      if (source.kind === 'system') {
        assert.equal(source.actor, 'system');
        assert.deepEqual(
          c,
          initial.find((entry) => entry.id === c.id),
          'System source was not present unchanged before the first action',
        );
      } else assert.equal(source.kind, 'human');
      assert(typeof source.actor === 'string' && source.actor.length > 0);
      assert(Array.isArray(source.bytes) && source.bytes.length > 0);
      assert(source.bytes.every((n) => Number.isInteger(n) && n >= 0 && n <= 255));
    }
  }
  return [...rows].sort((a, b) => a.id.localeCompare(b.id));
};
const sameCaptures = (a, b, initial) =>
  assert.deepEqual(
    sortCaptures(a, initial),
    sortCaptures(b, initial),
    'Source identities or bytes differ',
  );
function position(observed, through) {
  assert.equal(observed.state, 'ready');
  assert.equal(observed.receivedThrough, through, 'Editor receive position differs');
  assert.equal(observed.observedThrough, through);
  assert.match(observed.link, /^[0-9a-f]{64}$/);
  if (!through) assert.equal(observed.link, '00'.repeat(32));
}
// Corroborates measured editor text, ordered cursor and exact source continuity.
// Native tests retain signature/AEAD/CRDT coverage authority; this is not a second crypto verifier.
export function reconcileReceiveEditorEvidence(r) {
  for (const side of ['before', 'after']) {
    const c = r['baseline-' + side + '.json'];
    assert.equal(c.side, side);
    assert.equal(typeof c.initial, 'string');
    assert.deepEqual(c.held, { visible: c.initial, queuedVisible: c.initial, resultPending: true });
    assert.equal(c.recovered.visible, (side === 'after' ? 'REMOTE ' : '') + c.initial);
    position(c.recovered.status, side === 'after' ? 1 : 0);
    sameCaptures(c.recovered.captures, c.before, c.before);
    assert.equal(c.result.kind, side === 'before' ? 'received' : 'duplicate');
    assert.equal(c.result.recorded, side === 'before');
    assert.equal(c.final.visible, 'REMOTE ' + c.initial);
    position(c.final.status, 1);
    assert.deepEqual(c.result.status, c.final.status);
    if (side === 'after') assert.deepEqual(c.recovered.status, c.final.status);
    sameCaptures(c.final.captures, c.before, c.before);
  }
  const early = r['control-early.json'];
  assert.equal(typeof early.initial, 'string');
  assert.deepEqual(early.held, { visible: 'REMOTE ' + early.initial, resultPending: true });
  assert.equal(early.recovered.visible, early.initial);
  position(early.recovered.status, 0);
  sameCaptures(early.recovered.captures, early.before, early.before);
  const relabel = r['control-relabel.json'];
  const before = sortCaptures(relabel.before, relabel.before),
    after = sortCaptures(relabel.after, relabel.before);
  assert.equal(after.length, before.length + 1);
  for (const c of before)
    assert.deepEqual(
      after.find((a) => a.id === c.id),
      c,
    );
  const added = after.filter((c) => !before.some((b) => b.id === c.id));
  assert.equal(added.length, 1);
  assert.equal(added[0].sources.length, 1);
  assert.deepEqual(
    added[0].sources[0].bytes,
    relabel.original,
    'Relabeled source is not the original remote update',
  );
  sameCaptures(relabel.observed.captures, after, relabel.before);
  assert.equal(relabel.observed.visible, 'REMOTE ' + relabel.initial);
  position(relabel.observed.status, 1);
  const g = r['generated-editor.json'];
  assert.equal(g.status, 'passed');
  assert.equal(g.seed, 9202026);
  assert.equal(g.runs, 10);
  assert.equal(g.histories.length, 10);
  for (const h of g.histories) {
    assert.equal(typeof h.initial, 'string');
    assert(h.actions.length >= 3 && h.actions.length <= 6);
    assert.equal(h.observations.length, h.actions.length, 'Incomplete editor history');
    let text = h.initial,
      through = 0,
      link = '00'.repeat(32);
    // Preserve first observations. Never replace known identities with later bytes.
    const known = new Map(sortCaptures(h.before, h.before).map((c) => [c.id, c]));
    for (let i = 0; i < h.actions.length; i++) {
      const action = h.actions[i],
        o = h.observations[i];
      assert.equal(o.action, action);
      assert(['receive', 'local', 'duplicate', 'invalid', 'compact', 'restart'].includes(action));
      if (action === 'receive') {
        text = `R${through} ` + text;
        through++;
        assert.equal(o.outcome.kind, 'received');
        assert.equal(o.outcome.recorded, true);
        assert.deepEqual(o.outcome.status, o.status);
        assert.notEqual(o.status.link, link);
        link = o.status.link;
      } else if (action === 'local') text += 'L';
      else if (action === 'invalid') assert.equal(o.outcome, 'receive-refused');
      else if (action === 'duplicate' && through) {
        assert.equal(o.outcome.kind, 'duplicate');
        assert.equal(o.outcome.recorded, false);
        assert.deepEqual(o.outcome.status, o.status);
      }
      if (['local', 'restart', 'compact'].includes(action) || (action === 'duplicate' && !through))
        assert.equal(o.outcome, null);
      assert.equal(o.visible, text, 'Editor action text differs');
      position(o.status, through);
      assert.equal(o.status.link, link, 'Editor link changed without receive');
      const current = sortCaptures(o.captures, h.before);
      for (const [id, c] of known)
        assert.deepEqual(
          current.find((v) => v.id === id),
          c,
          'Original source changed or missing',
        );
      const added = current.filter((c) => !known.has(c.id));
      assert.equal(added.length, action === 'local' ? 1 : 0, 'Unexpected source allocation');
      for (const c of added) known.set(c.id, c);
    }
    assert.equal(h.final.visible, text);
    position(h.final.status, through);
    assert.equal(h.final.status.link, link);
    sameCaptures(h.final.captures, [...known.values()], h.before);
  }
}
