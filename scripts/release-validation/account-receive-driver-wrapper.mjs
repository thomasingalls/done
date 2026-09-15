import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatedNodeDeclarations } from './census.mjs';
import { vitestStage } from './vitest-adapter.mjs';
export const receiveDriverCampaign = 'scripts/account-receive-driver/run.mjs';
export const receiveDriverFiles = [
  'test/accountReceiveDriver.test.ts',
  'test/ownedReceiveQueue.test.ts',
];
export const receiveDriverSteps = [
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
      ...receiveDriverFiles,
      '--maxWorkers=2',
      '--reporter=verbose',
    ],
    deadlineMs: 60000,
  },
  ...[
    ['native', 180000],
    ['controls', 90000],
    ['native-controls', 90000],
    ['generated', 270000],
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
      'test/account-receive-driver/' + name + '.test.mjs',
    ],
  })),
];
export const receiveDriverReports = [
  'sources.json',
  'summary.json',
  ...['native', 'controls', 'native-controls', 'generated'].map((n) => n + '.xml'),
  ...receiveDriverSteps.flatMap((s) => [
    s.name + '.log',
    ...(s.kind === 'exit' ? [] : ['case-reports/' + s.name + '.json']),
  ]),
  ...['overlap', 'poll', 'halt', 'observer', 'resume', 'dispatch-offline', 'dispatch-pressure'].map(
    (n) => 'control-' + n + '.json',
  ),
  'generated-native.json',
];
export const receiveDriverFilePolicy = {
  kind: 'account-reports-v1',
  required: receiveDriverReports,
  maxEntries: 40,
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 2,
};
export function receiveDriverCampaignStage(root) {
  const steps = receiveDriverSteps.map((s) => {
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
    const d = receiveDriverFiles.map((f) => vitestStage(root, f).expect);
    assert(d.every((v) => !v.dataInputs?.length));
    return {
      ...s,
      expect: { kind: 'vitest', files: receiveDriverFiles, cases: d.flatMap((v) => v.cases) },
    };
  });
  return {
    id: 'campaign:' + receiveDriverCampaign,
    argv: ['node', receiveDriverCampaign],
    env: {},
    variant: 'account-receive-driver-campaign-v1',
    expect: {
      kind: 'account-receive-driver',
      steps,
      cases: steps.flatMap((s) => s.expect.cases ?? []),
    },
    deadlineMs: 750000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
    fixture: { kind: 'chromium-cdp', startupMs: 15000 },
    fileOutputs: structuredClone(receiveDriverFilePolicy),
  };
}
export function validateReceiveDriverCampaign(s) {
  assert.equal(s.expect.kind, 'account-receive-driver');
  assert.equal(s.variant, 'account-receive-driver-campaign-v1');
  assert.deepEqual(s.argv, ['node', receiveDriverCampaign]);
  assert.deepEqual(s.env, {});
  assert.deepEqual(s.fileOutputs, receiveDriverFilePolicy);
  assert.deepEqual(s.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(s.expect.dataInputs, undefined);
  assert.equal(s.deadlineMs, 750000);
  assert.equal(s.graceMs, 5000);
  assert.equal(s.processPolicy, 'inherited-group-v1');
  assert.equal(s.expect.historyInputs, undefined);
  assert.deepEqual(
    s.expect.steps.map(({ expect: _e, ...step }) => step),
    receiveDriverSteps,
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
    if (step.kind === 'vitest') assert.deepEqual(step.expect.files, receiveDriverFiles);
  }
}
export function reconcileReceiveDriverReports(directory, sources) {
  const json = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const summary = json('summary.json');
  assert.equal(summary.status, 'passed', 'ReceiveDriver summary failed');
  assert.equal(summary.error, undefined);
  for (const key of ['startedAt', 'completedAt'])
    assert(
      typeof summary[key] === 'string' && new Date(summary[key]).toISOString() === summary[key],
    );
  assert(Date.parse(summary.completedAt) >= Date.parse(summary.startedAt));
  assert.deepEqual(
    summary.stages,
    receiveDriverSteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
    'ReceiveDriver summary stages differ',
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
        'docs/account-receive-driver.md',
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
        'scripts/account-receive-driver/run.mjs',
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
    'ReceiveDriver source pins differ',
  );
  reconcileReceiveDriverEvidence(
    Object.fromEntries(
      [
        ...[
          'overlap',
          'poll',
          'halt',
          'observer',
          'resume',
          'dispatch-offline',
          'dispatch-pressure',
        ].map((n) => 'control-' + n + '.json'),
        'generated-native.json',
      ].map((f) => [f, json(f)]),
    ),
  );
  readFileSync(join(directory, 'types.log'));
  for (const file of [
    ...['native', 'controls', 'native-controls', 'generated'].map((n) => n + '.xml'),
    ...receiveDriverSteps.filter((s) => s.kind !== 'exit').map((s) => s.name + '.log'),
  ])
    assert(readFileSync(join(directory, file)).length, 'Empty receive-transport auxiliary report');
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
function driverStatus(s, through) {
  assert(
    ['starting', 'working', 'idle', 'retrying', 'offline', 'blocked', 'closed'].includes(s.phase),
  );
  assert.equal(s.receivedThrough, through, 'Polling durable progress differs');
  assert(Number.isInteger(s.failures) && s.failures >= 0 && s.failures <= 6);
  assert(
    s.nextAttemptAt === null || (Number.isSafeInteger(s.nextAttemptAt) && s.nextAttemptAt >= 0),
  );
  assert(
    [
      null,
      'conflict',
      'operation-failed',
      'inbound-size',
      'response-too-large',
      'local-storage',
      'request-expired',
    ].includes(s.reason),
  );
}
// Corroborates scheduler/dispatch measurements and native HTTP/restart/source
// observations. Original property/native cases retain timer and crypto authority.
export function reconcileReceiveDriverEvidence(r) {
  const expected = {
    overlap: [1, 2],
    poll: [2, 1],
    halt: [1, 2],
    observer: [0, 1],
    resume: [1, 0],
  };
  for (const [mode, calls] of Object.entries(expected)) {
    const c = r['control-' + mode + '.json'];
    assert.equal(c.mode, mode);
    assert.equal(c.effective, true);
    assert.deepEqual(
      c.observations.map((o) => o.changed),
      [false, true],
    );
    c.observations.forEach((o, i) => {
      assert.equal(o.calls, calls[i], 'Scheduler omission is not discriminating');
      assert(Number.isInteger(o.timers) && o.timers >= 0 && o.timers <= 1);
      driverStatus(o.status, 0);
      assert.equal(o.disposed.calls, o.calls);
      assert.equal(o.disposed.timers, 0);
      driverStatus(o.disposed.status, 0);
      assert.equal(o.disposed.status.phase, 'closed');
      assert.equal(o.disposed.status.nextAttemptAt, null);
    });
  }
  for (const gate of ['offline', 'pressure']) {
    const c = r['control-dispatch-' + gate + '.json'];
    assert.equal(c.effective, true);
    assert.deepEqual(
      c.observations.map((o) => o.mode),
      ['baseline', 'dispatch'],
    );
    for (const o of c.observations) {
      assert.equal(
        o.calls,
        o.mode === 'dispatch' ? 1 : 0,
        'Native dispatch omission is not discriminating',
      );
      driverStatus(o.held, 0);
      assert(['offline', 'blocked'].includes(o.held.phase));
      driverStatus(o.closed, 0);
      assert.equal(o.closed.phase, 'closed');
      assert.equal(o.closed.nextAttemptAt, null);
    }
  }
  const g = r['generated-native.json'];
  assert.equal(g.status, 'passed');
  assert.equal(g.seed, 9112052);
  assert.equal(g.runs, 10);
  assert.equal(g.histories.length, 10);
  const coverage = {};
  for (const h of g.histories) {
    assert.equal(h.completed, true);
    assert.equal(typeof h.initial, 'string');
    assert(h.actions.length >= 5 && h.actions.length <= 7);
    assert.deepEqual(h.actions.slice(-2), ['publish', 'restart']);
    assert.equal(h.observations.length, h.actions.length, 'Incomplete polling history');
    const count = h.actions.filter((a) => a === 'publish').length;
    assert.equal(h.wires.length, count);
    assert(
      Number.isInteger(h.startupRequests) &&
        h.startupRequests >= 1 &&
        h.startupRequests <= h.requests.length,
    );
    // The fixture is serial and waits for idle at action boundaries. Good data pages
    // are followed by the next request at the resulting durable cursor; lost/halt pages do not advance it.
    const positions = [0];
    let through = 0,
      link = '00'.repeat(32);
    for (const req of h.requests) {
      assert(['good', 'lost', 'halt'].includes(req.mode));
      assert(Number.isInteger(req.available) && req.available >= 0 && req.available <= count);
      const q = frame(req.request, 'done/private-read/v2', 15),
        p = frame(req.candidatePage, 'done/private-read-page/v2', 7);
      assert.equal(q[10], through, 'Poll request did not follow durable progress');
      assert.equal(q[11], 1);
      assert.equal(p[2], hash(Buffer.from(req.request, 'hex')));
      assert.equal(p[3], req.available);
      const advancing = through < req.available;
      assert.equal(p[4], through + (advancing ? 1 : 0));
      assert.equal(p[5].length, advancing ? 1 : 0);
      assert.match(req.link, /^[0-9a-f]{64}$/);
      if (advancing) assert.equal(p[5][0][0], h.wires[through], 'Polling original wire changed');
      else assert.equal(req.link, link);
      if (req.mode === 'good') {
        assert.equal(req.responseBody, req.candidatePage);
        if (advancing) {
          assert.notEqual(link, req.link);
          through++;
          link = req.link;
        }
      } else if (req.mode === 'lost') assert.equal(req.responseBody, null);
      else assert.equal(req.responseBody, Buffer.from('corrupt page').toString('hex'));
      positions.push(through);
    }
    assert.equal(positions[h.startupRequests], 0);
    assert.equal(through, count);
    let available = 0,
      locals = 0,
      lastEnd = h.startupRequests;
    const known = new Map(sortCaptures(h.before).map((c) => [c.id, c]));
    for (const [i, action] of h.actions.entries()) {
      assert(['publish', 'local', 'lost', 'offline', 'halt', 'restart'].includes(action));
      coverage[action] = (coverage[action] ?? 0) + 1;
      const o = h.observations[i];
      assert.equal(o.action, action);
      assert(
        Number.isInteger(o.requestStart) &&
          Number.isInteger(o.requestEnd) &&
          o.requestStart >= lastEnd &&
          o.requestEnd >= o.requestStart &&
          o.requestEnd <= h.requests.length,
      );
      assert.equal(positions[o.requestStart], available);
      if (action === 'publish') available++;
      else if (action === 'local') locals++;
      assert.equal(positions[o.requestEnd], available);
      if (action === 'restart') {
        assert(o.requestEnd > o.requestStart);
        assert.equal(
          frame(h.requests[o.requestStart].request, 'done/private-read/v2', 15)[10],
          available,
        );
      }
      if (['lost', 'halt', 'offline'].includes(action)) {
        driverStatus(o.transition, available);
        assert(
          action === 'offline'
            ? o.transition.phase === 'offline'
            : ['retrying', 'blocked'].includes(o.transition.phase),
        );
      } else assert.equal(o.transition, null);
      driverStatus(o.status, available);
      assert(['idle', 'working'].includes(o.status.phase));
      assert.equal(o.status.failures, 0);
      assert.equal(o.status.reason, null);
      const text =
        Array.from({ length: available }, (_, j) => `REMOTE${available - 1 - j} `).join('') +
        h.initial +
        'L'.repeat(locals);
      assert.equal(o.visible, text, 'Polling authored text differs');
      const current = sortCaptures(o.captures);
      for (const [id, c] of known)
        assert.deepEqual(
          current.find((v) => v.id === id),
          c,
          'Original polling source changed or missing',
        );
      const added = current.filter((c) => !known.has(c.id));
      assert.equal(
        added.length,
        action === 'local' ? 1 : 0,
        'Unexpected polling source allocation',
      );
      for (const c of added) known.set(c.id, c);
      lastEnd = o.requestEnd;
    }
    assert.equal(h.final.visible, h.observations.at(-1).visible);
    driverStatus(h.final.status, available);
    assert(['idle', 'working'].includes(h.final.status.phase));
    assert.equal(h.final.status.failures, 0);
    assert.equal(h.final.status.reason, null);
    sameCaptures(h.final.captures, [...known.values()]);
  }
  assert.deepEqual(g.coverage, coverage);
  for (const a of ['publish', 'local', 'lost', 'offline', 'halt', 'restart'])
    assert(coverage[a] > 0, 'Missing generated polling action');
}
