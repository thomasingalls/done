import { historicalInput, validateHistoricalInputs } from './historical-inputs.mjs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatedNodeDeclarations } from './census.mjs';
import { vitestStage } from './vitest-adapter.mjs';
export const syncCampaign = 'scripts/account-sync/run.mjs';
export const syncFiles = [
  'test/accountSyncDriver.test.ts',
  'test/accountReceiveDriver.test.ts',
  'test/ownedReceiveQueue.test.ts',
];
export const syncSteps = [
  {
    name: 'types',
    kind: 'exit',
    argv: ['node', 'node_modules/typescript/bin/tsc', '-b'],
    deadlineMs: 60000,
  },
  {
    name: 'units',
    kind: 'vitest',
    argv: [
      'node',
      'node_modules/vitest/vitest.mjs',
      'run',
      ...syncFiles,
      '--maxWorkers=2',
      '--reporter=verbose',
    ],
    deadlineMs: 60000,
  },
  ...[
    ['native', 600000],
    ['controls', 90000],
    ['native-controls', 150000],
    ['generated', 450000],
  ].map(([name, deadlineMs]) => ({
    name,
    deadlineMs,
    kind: 'node',
    argv: [
      'node',
      '--test',
      '--test-concurrency=1',
      '--test-reporter=spec',
      '--test-reporter-destination=stdout',
      '--test-reporter=junit',
      '--test-reporter-destination=$REPORT/' + name + '.xml',
      'test/account-sync/' + name + '.test.mjs',
    ],
  })),
];
export const syncReports = [
  'sources.json',
  'summary.json',
  ...['native', 'controls', 'native-controls', 'generated'].map((n) => n + '.xml'),
  ...syncSteps.flatMap((s) => [
    s.name + '.log',
    ...(s.kind === 'exit' ? [] : ['case-reports/' + s.name + '.json']),
  ]),
  ...[
    'fairness',
    'overlap',
    'halt',
    'resume',
    'wake',
    'dispatch-offline',
    'dispatch-pressure',
    'witness',
    'self',
    'classification',
    'worker-self',
  ].map((n) => 'control-' + n + '.json'),
  'generated-native.json',
];
export const syncFilePolicy = {
  kind: 'account-reports-v1',
  required: syncReports,
  maxEntries: 44,
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 2,
};
export function syncCampaignStage(root) {
  const steps = syncSteps.map((s) => {
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
    const d = syncFiles.map((f) => vitestStage(root, f).expect);
    assert(d.every((v) => !v.dataInputs?.length));
    return {
      ...s,
      expect: { kind: 'vitest', files: syncFiles, cases: d.flatMap((v) => v.cases) },
    };
  });
  return {
    id: 'campaign:' + syncCampaign,
    argv: ['node', syncCampaign],
    env: {},
    variant: 'account-sync-campaign-v1',
    expect: {
      kind: 'account-sync',
      steps,
      cases: steps.flatMap((s) => s.expect.cases ?? []),
      historyInputs: ['src/crdt/accountEnvelopePreparation.ts', 'src/crdt/accountDelivery.ts'].map(
        (p) => historicalInput(root, '4bb09042f37f68ec31f0d82587af608f599eb096', p),
      ),
    },
    deadlineMs: 1410000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
    fixture: { kind: 'chromium-cdp', startupMs: 15000 },
    fileOutputs: structuredClone(syncFilePolicy),
  };
}
export function validateSyncCampaign(s) {
  assert.equal(s.expect.kind, 'account-sync');
  assert.equal(s.variant, 'account-sync-campaign-v1');
  assert.deepEqual(s.argv, ['node', syncCampaign]);
  assert.deepEqual(s.env, {});
  assert.deepEqual(s.fileOutputs, syncFilePolicy);
  assert.deepEqual(s.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(s.expect.dataInputs, undefined);
  assert.equal(s.deadlineMs, 1410000);
  assert.equal(s.graceMs, 5000);
  assert.equal(s.processPolicy, 'inherited-group-v1');
  validateHistoricalInputs(s.expect.historyInputs);
  assert.deepEqual(
    s.expect.historyInputs.map(({ reference, path }) => [reference, path]),
    ['src/crdt/accountEnvelopePreparation.ts', 'src/crdt/accountDelivery.ts'].map((p) => [
      '4bb09042f37f68ec31f0d82587af608f599eb096',
      p,
    ]),
  );
  assert.deepEqual(
    s.expect.steps.map(({ expect: _e, ...step }) => step),
    syncSteps,
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
    if (step.kind === 'vitest') assert.deepEqual(step.expect.files, syncFiles);
  }
}
export function reconcileSyncReports(directory, sources) {
  const json = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const summary = json('summary.json');
  assert.equal(summary.status, 'passed', 'Sync summary failed');
  assert.equal(summary.error, undefined);
  for (const key of ['startedAt', 'completedAt'])
    assert(
      typeof summary[key] === 'string' && new Date(summary[key]).toISOString() === summary[key],
    );
  assert(Date.parse(summary.completedAt) >= Date.parse(summary.startedAt));
  assert.deepEqual(
    summary.stages,
    syncSteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
    'Sync summary stages differ',
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
        'docs/account-outbound-composition.md',
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
        'scripts/account-sync/run.mjs',
        'scripts/generate-private-envelope-vectors.mjs',
        'scripts/generate-envelope-vectors.mjs',
        'scripts/lib/aad-coverage.mjs',
        'scripts/lib/historical-bundle.mjs',
      ].includes(path) ||
      /^(?:src|account-protocol|account-service|test|vite|wasm\/journal-seal)\/.*\.(?:ts|tsx|mjs|json|wasm)$/.test(
        path,
      ),
  );
  const sort = (rows) => [...rows].sort((a, b) => a.path.localeCompare(b.path));
  assert.deepEqual(
    sort(json('sources.json')),
    sort(selected.map(({ path, sha256 }) => ({ path, sha256 }))),
    'Sync source pins differ',
  );
  reconcileSyncEvidence(
    Object.fromEntries(
      [
        ...[
          'fairness',
          'overlap',
          'halt',
          'resume',
          'wake',
          'dispatch-offline',
          'dispatch-pressure',
          'witness',
          'self',
          'classification',
          'worker-self',
        ].map((n) => 'control-' + n + '.json'),
        'generated-native.json',
      ].map((f) => [f, json(f)]),
    ),
  );
  readFileSync(join(directory, 'types.log'));
  for (const file of [
    ...['native', 'controls', 'native-controls', 'generated'].map((n) => n + '.xml'),
    ...syncSteps.filter((s) => s.kind !== 'exit').map((s) => s.name + '.log'),
  ])
    assert(readFileSync(join(directory, file)).length, 'Empty composition auxiliary report');
}

const sortCaptures = (rows) => {
  assert(Array.isArray(rows));
  assert.equal(new Set(rows.map((c) => c.id)).size, rows.length, 'Duplicate source identity');
  for (const c of rows) {
    assert(typeof c.id === 'string' && c.id.length > 0);
    assert(Array.isArray(c.sources) && c.sources.length > 0);
    for (const source of c.sources) {
      assert.equal(source.kind, 'human');
      assert(typeof source.actor === 'string' && source.actor.length > 0);
      assert(Array.isArray(source.bytes) && source.bytes.length > 0);
      assert(source.bytes.every((n) => Number.isInteger(n) && n >= 0 && n <= 255));
    }
  }
  return [...rows].sort((a, b) => a.id.localeCompare(b.id));
};
const sameCaptures = (a, b) =>
  assert.deepEqual(sortCaptures(a), sortCaptures(b), 'Source identities or bytes differ');
const hash = (v) => createHash('sha256').update(v).digest('hex');
const frame = (wire, domain, n) => {
  assert(
    typeof wire === 'string' &&
      wire.length > 0 &&
      wire.length <= 262144 &&
      /^(?:[0-9a-f]{2})+$/.test(wire),
  );
  const text = Buffer.from(wire, 'hex').toString(),
    v = JSON.parse(text);
  assert.equal(JSON.stringify(v), text);
  assert.equal(v[0], domain);
  assert.equal(v.length, n);
  assert.equal(v[1], 2);
  return v;
};
function syncStatus(s, through, selfRefusal = false) {
  for (const lane of ['send', 'receive']) {
    const v = s[lane],
      progress = lane === 'send' ? 'acceptedThrough' : 'receivedThrough';
    assert(
      ['starting', 'working', 'idle', 'retrying', 'offline', 'blocked', 'closed'].includes(v.phase),
    );
    assert(Number.isSafeInteger(v[progress]) && v[progress] >= 0);
    if (through !== undefined)
      assert.equal(v[progress], through, 'Composed durable progress differs');
    assert(Number.isInteger(v.failures) && v.failures >= 0 && v.failures <= 6);
    assert(
      v.nextAttemptAt === null || (Number.isSafeInteger(v.nextAttemptAt) && v.nextAttemptAt >= 0),
    );
    assert(
      [
        null,
        'closed',
        'conflict',
        'finalized',
        'envelope-size',
        'operation-failed',
        'inbound-size',
        'response-too-large',
        'local-storage',
        'request-expired',
      ].includes(v.reason) ||
        (selfRefusal && ['integrity', 'network-unavailable'].includes(v.reason)),
    );
  }
}
const bytes = (wire) => {
  assert(
    typeof wire === 'string' &&
      wire.length > 0 &&
      wire.length <= 2 * 1024 * 1024 &&
      /^(?:[0-9a-f]{2})+$/.test(wire),
  );
  return Buffer.from(wire, 'hex');
};
// Independent bounded framing and ciphertext digest checks; signature/decryption
// authority remains with the original native protocol cases.
function submission(wire) {
  const reader = (b) => {
    let at = 0;
    const take = (n) => {
      assert(Number.isInteger(n) && n >= 0 && at + n <= b.length, 'Truncated composition wire');
      const v = b.subarray(at, at + n);
      at += n;
      return v;
    };
    const count = (n) => (n === 2 ? take(2).readUInt16BE() : take(4).readUInt32BE());
    return {
      take,
      count,
      text: () => new TextDecoder('utf-8', { fatal: true }).decode(take(count(2))),
      end: () => assert.equal(at, b.length, 'Trailing composition bytes'),
    };
  };
  const s = reader(bytes(wire));
  assert.equal(s.text(), 'done/envelope-submission-wire/v1');
  assert.equal(s.text(), '1');
  const lineage = s.text();
  assert.match(lineage, /^[0-9a-f]{64}$/);
  const e = reader(s.take(s.count(4)));
  s.take(s.count(4));
  s.take(64);
  s.end();
  assert.equal(e.text(), 'done/envelope-wire/v2');
  assert.equal(e.text(), '2');
  const workspace = e.text(),
    credential = e.text();
  assert(workspace.length && credential.length);
  const number = () => {
    const v = e.text();
    assert(/^[1-9][0-9]*$/.test(v));
    assert(Number.isSafeInteger(Number(v)));
    return Number(v);
  };
  const epoch = number(),
    gen = number(),
    position = number(),
    nonce = [...e.take(12)],
    digest = e.take(32).toString('hex'),
    ct = e.take(e.count(4));
  assert(ct.length >= 16);
  assert.equal(hash(ct), digest, 'Composition ciphertext digest differs');
  e.take(64);
  e.end();
  return { lineage, workspace, credential, epoch, gen, position, nonce };
}
const bytesOfRecord = (row) => Buffer.from(row.bytes).toString();
function validateRecords(rows) {
  assert(Array.isArray(rows));
  const seen = new Set();
  for (const row of rows) {
    assert(['state', 'update', 'heads', 'outbound'].includes(row.kind));
    assert(Number.isSafeInteger(row.gen) && row.gen > 0);
    assert(Number.isSafeInteger(row.seq) && row.seq > 0);
    const key = row.gen + ':' + row.seq;
    assert(!seen.has(key));
    seen.add(key);
    assert(Array.isArray(row.bytes) && row.bytes.length > 0);
    assert(row.bytes.every((v) => Number.isInteger(v) && v >= 0 && v <= 255));
  }
}
// Corroborates actual scheduler decisions, dispatch, witness refusal, and the
// composition histories. It does not substitute for their existing test oracles.
export function reconcileSyncEvidence(r) {
  for (const [mode, pair] of Object.entries({
    fairness: ['receive', 'send'],
    overlap: [1, 2],
    halt: ['receive', 'send'],
    resume: ['send', 'receive'],
    wake: [3, 2],
  })) {
    const c = r['control-' + mode + '.json'];
    assert.equal(c.effective, true);
    assert.deepEqual(
      c.observations.map((o) => o.mutant),
      [false, true],
    );
    c.observations.forEach((o, i) => {
      assert.equal(o.observed, pair[i], 'Scheduler omission is not discriminating');
      assert(o.held.calls.length > 0 && o.held.calls.every((l) => ['send', 'receive'].includes(l)));
      assert.equal(
        typeof o.observed === 'number'
          ? o.held.calls.length
          : mode === 'resume'
            ? o.held.calls[0]
            : o.held.calls.at(-1),
        o.observed,
      );
      assert(Number.isInteger(o.held.timers) && o.held.timers >= 0 && o.held.timers <= 1);
      syncStatus(o.held.status, 0);
      syncStatus(o.disposed.status, 0);
      assert.deepEqual(o.disposed.calls, o.held.calls);
      assert.equal(o.disposed.timers, 0);
      for (const lane of ['send', 'receive']) {
        assert.equal(o.disposed.status[lane].phase, 'closed');
        assert.equal(o.disposed.status[lane].nextAttemptAt, null);
      }
    });
  }
  for (const gate of ['offline', 'pressure']) {
    const c = r['control-dispatch-' + gate + '.json'];
    assert.equal(c.effective, true);
    assert.deepEqual(
      c.observations.map((o) => o.mutant),
      [false, true],
    );
    for (const o of c.observations) {
      assert.equal(
        o.calls,
        o.mutant ? 1 : 0,
        'Native submit dispatch omission is not discriminating',
      );
      syncStatus(o.held);
      syncStatus(o.closed);
      for (const lane of ['send', 'receive']) {
        assert.equal(o.closed[lane].phase, 'closed');
        assert.equal(o.closed[lane].nextAttemptAt, null);
      }
    }
  }
  const witness = r['control-witness.json'];
  assert.equal(witness.effective, true);
  assert.deepEqual(
    witness.observations.map((o) => [o.mutant, o.opened]),
    [
      [false, false],
      [true, true],
    ],
    'Witness omission is not discriminating',
  );
  assert(
    typeof witness.observations[0].error === 'string' && witness.observations[0].error.length > 0,
  );
  assert(typeof witness.observations[1].master === 'string');
  syncStatus(witness.observations[1].status);
  for (const lane of ['send', 'receive'])
    assert.equal(witness.observations[1].status[lane].phase, 'offline');
  for (const mode of ['self', 'classification']) {
    const c = r['control-' + mode + '.json'];
    assert.equal(c.effective, true);
    assert.deepEqual(
      c.observations.map((o) => [o.mode, o.advanced, o.editorState]),
      [
        ['baseline', false, 'active'],
        [mode, false, mode === 'self' ? 'active' : 'closed'],
      ],
      'Self-stream control is not discriminating',
    );
    for (const o of c.observations) {
      syncStatus(o.status, undefined, true);
      assert.equal(o.status.receive.receivedThrough, 0);
      assert.equal(o.status.send.acceptedThrough, 0);
      assert(Number.isSafeInteger(o.reads) && o.reads > 0);
      assert(typeof o.initial === 'string');
      assert.equal(o.visible, o.mode === 'classification' ? null : o.initial);
      assert.equal(o.storage.newDeliveryDecisions, o.mode === 'self' ? 1 : 0);
      const incoming = (rows) =>
        rows.filter(
          (row) =>
            row.kind === 'update' ||
            (row.kind === 'heads' && bytesOfRecord(row).startsWith('["done/account-inbound/')),
        );
      for (const rows of [o.storage.before, o.storage.after]) validateRecords(rows);
      assert.deepEqual(
        incoming(o.storage.after),
        incoming(o.storage.before),
        'Refused self writing or inbound receipt persisted',
      );
      const decisions = o.storage.after.filter(
        (row) =>
          row.kind === 'heads' &&
          !o.storage.before.some((prior) => prior.gen === row.gen && prior.seq === row.seq) &&
          bytesOfRecord(row).startsWith('["done/account-delivery/v1"') &&
          JSON.parse(bytesOfRecord(row))[9] === 'response',
      );
      assert.equal(decisions.length, o.storage.newDeliveryDecisions);
      if (o.mode === 'baseline') {
        assert.equal(o.status.receive.phase, 'blocked');
        assert.equal(o.status.receive.reason, 'integrity');
      } else if (o.mode === 'self') {
        for (const lane of ['send', 'receive']) {
          assert.equal(o.status[lane].phase, 'blocked');
          assert.equal(o.status[lane].reason, 'conflict');
        }
      }
    }
  }
  assert.deepEqual(
    r['control-self.json'].observations[0],
    r['control-classification.json'].observations[0],
  );
  const worker = r['control-worker-self.json'];
  assert.equal(worker.effective, true);
  assert.deepEqual(
    worker.observations.map((o) => o.mutant),
    [false, true],
  );
  for (const o of worker.observations) {
    assert.equal(o.closedState, 'closed');
    assert.equal(o.bundle.guardCount, 1);
    assert.equal(o.bundle.omissionCount, o.mutant ? 1 : 0);
    assert(/^\/[A-Za-z0-9_.-]+\.js$/.test(o.bundle.entry));
    assert(Array.isArray(o.bundle.assets) && o.bundle.assets.length > 1);
    assert.equal(new Set(o.bundle.assets.map((a) => a.path)).size, o.bundle.assets.length);
    for (const a of o.bundle.assets) {
      assert(/^\/[A-Za-z0-9_./-]+$/.test(a.path) && !a.path.includes('..'));
      assert(Number.isSafeInteger(a.bytes) && a.bytes > 0);
      assert.match(a.sha256, /^[0-9a-f]{64}$/);
    }
    const url = new URL(o.workerUrl);
    assert.equal(url.hostname, 'localhost');
    assert.match(url.pathname, /^\/assets\/accountOwner\.worker-[A-Za-z0-9_-]+\.js$/);
    assert(o.bundle.assets.some((a) => a.path === url.pathname));
    assert(o.bundle.assets.some((a) => a.path === o.bundle.entry));
    for (const rows of [o.before, o.after]) validateRecords(rows);
    assert(Array.isArray(o.nativeBefore) && o.nativeBefore.length > 0);
    assert(Array.isArray(o.nativeAfter) && o.nativeAfter.length > 0);
    if (o.mutant) {
      assert.equal(o.error, null);
      assert.equal(o.errorCode, null);
      assert.equal(o.result.kind, 'received');
      assert.equal(o.result.recorded, true);
      for (const status of [o.result.status, o.status]) {
        assert.equal(status.state, 'ready');
        assert.equal(status.receivedThrough, 1);
        assert.equal(status.observedThrough, 1);
        assert.match(status.link, /^[0-9a-f]{64}$/);
      }
      assert.equal(o.result.status.link, o.status.link);
      assert.equal(o.mirrorState, 'active');
      assert.equal(o.visible, 'REMOTE ' + o.initial);
      assert.notDeepEqual(o.nativeAfter, o.nativeBefore);
      assert(
        o.after.some(
          (row) =>
            row.kind === 'heads' && bytesOfRecord(row).startsWith('["done/account-inbound/v1"'),
        ),
      );
    } else {
      assert.equal(o.result, null);
      assert.equal(o.status, null);
      assert.equal(o.visible, null);
      assert.equal(o.error, 'WorkerChannelError: Worker operation could not finish.');
      assert.equal(o.errorCode, 'closed');
      assert.deepEqual(o.nativeAfter, o.nativeBefore, 'Refused Worker page changed native records');
    }
  }
  const g = r['generated-native.json'];
  assert.equal(g.status, 'passed');
  assert.equal(g.seed, 9112062);
  assert.equal(g.runs, 8);
  assert.equal(g.histories.length, 8);
  const coverage = {};
  for (const h of g.histories) {
    assert.equal(h.completed, true);
    assert.equal(typeof h.initial, 'string');
    assert(h.actions.length >= 5 && h.actions.length <= 7);
    assert.deepEqual(h.actions.slice(-2), ['edit', 'restart']);
    assert.equal(h.observations.length, h.actions.length);
    const known = new Map(sortCaptures(h.before).map((c) => [c.id, c])),
      firstWires = new Map(),
      wireMeta = new Map(),
      assignments = new Map();
    let seals = 0,
      expected = h.initial,
      edits = 0,
      priorSend = 0,
      priorRead = 0,
      priorAfter = 0,
      priorAttempts = 0;
    for (const sent of h.submissions) {
      const m = submission(sent.wire);
      assert.equal(sent.position, m.position);
      if (firstWires.has(m.position))
        assert.equal(sent.wire, firstWires.get(m.position), 'Original submission changed on retry');
      else {
        assert.equal(m.position, firstWires.size + 1);
        firstWires.set(m.position, sent.wire);
        wireMeta.set(m.position, m);
      }
      assert(
        Number.isSafeInteger(sent.sealCount) &&
          sent.sealCount >= m.position &&
          sent.sealCount >= seals,
      );
      seals = sent.sealCount;
      assert.equal(sent.responseStatus, 200);
      bytes(sent.responseBody);
      assert(['lost', 'delivered'].includes(sent.reply));
    }
    for (const req of h.reads) {
      const q = frame(req.request, 'done/private-read/v2', 15);
      assert(
        Number.isSafeInteger(req.sentPositions) &&
          req.sentPositions >= 0 &&
          req.sentPositions <= firstWires.size,
      );
      assert(
        Number.isSafeInteger(q[10]) && q[10] >= priorAfter && q[10] <= req.sentPositions,
        'Composed read cursor regressed or exceeded submitted positions',
      );
      priorAfter = q[10];
      assert.equal(q[11], 1);
      assert(['lost', 'continued'].includes(req.reply));
    }
    const checkState = (o) => {
      const n = o.spool.positions.length;
      syncStatus(o.status, n);
      assert.equal(o.wires.length, n);
      assert.equal(o.nonces.length, n);
      assert.equal(
        new Set(o.nonces.map((v) => JSON.stringify(v))).size,
        n,
        'Composition nonce reused',
      );
      assert(
        Number.isSafeInteger(o.spool.attempts) &&
          o.spool.attempts >= n &&
          o.spool.attempts >= priorAttempts,
      );
      priorAttempts = o.spool.attempts;
      const refs = [];
      o.spool.positions.forEach((p, i) => {
        assert.equal(p.position, i + 1);
        assert.equal(p.persisted, true);
        assert(
          p.attempts.length > 0 &&
            p.attempts.every((a) => Number.isSafeInteger(a) && a > 0 && a <= o.spool.attempts),
        );
        assert.equal(new Set(p.attempts).size, p.attempts.length);
        const sources = [p.source, ...(p.additional ?? [])];
        for (const s of sources) {
          assert(typeof s.id === 'string' && Number.isSafeInteger(s.index) && s.index >= 0);
          assert.match(s.hash, /^[0-9a-f]{64}$/);
          refs.push([s.id, s.index]);
        }
        if (assignments.has(p.position))
          assert.deepEqual(
            sources,
            assignments.get(p.position),
            'Original source assignment changed',
          );
        else assignments.set(p.position, sources);
        assert.equal(o.wires[i].position, p.position);
        assert.equal(
          o.wires[i].wire,
          firstWires.get(p.position),
          'Persisted composition wire differs',
        );
        assert.deepEqual(
          o.nonces[i],
          wireMeta.get(p.position).nonce,
          'Observed seal nonce differs from transmitted envelope',
        );
      });
      assert.deepEqual(
        refs,
        o.captures.flatMap((c) => c.sources.map((_, i) => [c.id, i])),
        'Composed source coverage differs',
      );
      assert.equal(o.visible, expected, 'Composed authored text differs');
      const current = sortCaptures(o.captures);
      for (const [id, c] of known)
        assert.deepEqual(
          current.find((v) => v.id === id),
          c,
          'Original composed source changed or missing',
        );
      return current;
    };
    for (const [i, action] of h.actions.entries()) {
      assert(
        ['edit', 'offline-edit', 'lost-send', 'lost-read', 'compact', 'restart'].includes(action),
      );
      coverage[action] = (coverage[action] ?? 0) + 1;
      const o = h.observations[i];
      assert.equal(o.action, action);
      for (const [lane, prior, all] of [
        ['send', priorSend, h.submissions],
        ['read', priorRead, h.reads],
      ]) {
        assert(
          Number.isInteger(o[lane + 'Start']) &&
            Number.isInteger(o[lane + 'End']) &&
            o[lane + 'Start'] >= prior &&
            o[lane + 'End'] >= o[lane + 'Start'] &&
            o[lane + 'End'] <= all.length,
          'Incomplete composition request window',
        );
      }
      const edited = !['compact', 'restart'].includes(action);
      if (edited) expected += ' [' + edits++ + ']';
      if (action === 'offline-edit') {
        syncStatus(o.transition);
        for (const lane of ['send', 'receive']) assert.equal(o.transition[lane].phase, 'offline');
      } else if (action.startsWith('lost-')) {
        syncStatus(o.transition);
        const lane = action === 'lost-send' ? 'send' : 'receive';
        assert(o.transition[lane].failures > 0);
        const requests = lane === 'send' ? h.submissions : h.reads;
        assert(
          requests
            .slice(
              o[lane === 'send' ? 'sendStart' : 'readStart'],
              o[lane === 'send' ? 'sendEnd' : 'readEnd'],
            )
            .some((q) => q.reply === 'lost'),
          'Missing observed lost reply',
        );
      } else assert.equal(o.transition, null);
      const current = checkState(o),
        added = current.filter((c) => !known.has(c.id));
      assert.equal(added.length, edited ? 1 : 0, 'Unexpected composed source allocation');
      for (const c of added) known.set(c.id, c);
      priorSend = o.sendEnd;
      priorRead = o.readEnd;
    }
    checkState(h.final);
    sameCaptures(h.final.captures, [...known.values()]);
    assert.equal(h.positions, firstWires.size);
    assert.equal(h.final.spool.positions.length, firstWires.size);
    assert.equal(seals, firstWires.size);
  }
  assert.deepEqual(g.coverage, coverage);
  for (const action of ['edit', 'offline-edit', 'lost-send', 'lost-read', 'compact', 'restart'])
    assert(coverage[action] > 0, 'Missing generated composition action');
}
