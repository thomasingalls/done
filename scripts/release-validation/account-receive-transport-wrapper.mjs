import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  decodeInboundBatch,
  decodeInboundBatchPages,
} from '../../account-protocol/inboundBatch.ts';
import { generatedNodeDeclarations } from './census.mjs';
import { vitestStage } from './vitest-adapter.mjs';
export const receiveTransportCampaign = 'scripts/account-receive-transport/run.mjs';
export const receiveTransportFiles = [
  'test/privateDeliveryHttp.test.ts',
  'test/ownedReceiveQueue.test.ts',
];
export const receiveTransportSteps = [
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
      ...receiveTransportFiles,
      '--maxWorkers=2',
      '--reporter=verbose',
    ],
    deadlineMs: 60000,
  },
  ...[
    ['native', 120000],
    ['controls', 90000],
    ['generated', 330000],
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
      'test/account-receive-transport/' + name + '.test.mjs',
    ],
  })),
];
export const receiveTransportReports = [
  'sources.json',
  'summary.json',
  ...['native', 'controls', 'generated'].map((n) => n + '.xml'),
  ...receiveTransportSteps.flatMap((s) => [
    s.name + '.log',
    ...(s.kind === 'exit' ? [] : ['case-reports/' + s.name + '.json']),
  ]),
  ...['queue', 'flight', 'bound', 'drain'].map((n) => 'control-' + n + '.json'),
  'generated.json',
];
export const receiveTransportFilePolicy = {
  kind: 'account-reports-v1',
  required: receiveTransportReports,
  maxEntries: 32,
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 2,
};
export function receiveTransportCampaignStage(root) {
  const steps = receiveTransportSteps.map((s) => {
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
    const d = receiveTransportFiles.map((f) => vitestStage(root, f).expect);
    assert(d.every((v) => !v.dataInputs?.length));
    return {
      ...s,
      expect: { kind: 'vitest', files: receiveTransportFiles, cases: d.flatMap((v) => v.cases) },
    };
  });
  return {
    id: 'campaign:' + receiveTransportCampaign,
    argv: ['node', receiveTransportCampaign],
    env: {},
    variant: 'account-receive-transport-campaign-v1',
    expect: {
      kind: 'account-receive-transport',
      steps,
      cases: steps.flatMap((s) => s.expect.cases ?? []),
    },
    deadlineMs: 660000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
    fixture: { kind: 'chromium-cdp', startupMs: 15000 },
    fileOutputs: structuredClone(receiveTransportFilePolicy),
  };
}
export function validateReceiveTransportCampaign(s) {
  assert.equal(s.expect.kind, 'account-receive-transport');
  assert.equal(s.variant, 'account-receive-transport-campaign-v1');
  assert.deepEqual(s.argv, ['node', receiveTransportCampaign]);
  assert.deepEqual(s.env, {});
  assert.deepEqual(s.fileOutputs, receiveTransportFilePolicy);
  assert.deepEqual(s.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(s.expect.dataInputs, undefined);
  assert.equal(s.deadlineMs, 660000);
  assert.equal(s.graceMs, 5000);
  assert.equal(s.processPolicy, 'inherited-group-v1');
  assert.equal(s.expect.historyInputs, undefined);
  assert.deepEqual(
    s.expect.steps.map(({ expect: _e, ...step }) => step),
    receiveTransportSteps,
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
    if (step.kind === 'vitest') assert.deepEqual(step.expect.files, receiveTransportFiles);
  }
}
export function reconcileReceiveTransportReports(directory, sources) {
  const json = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const summary = json('summary.json');
  assert.equal(summary.status, 'passed', 'ReceiveTransport summary failed');
  assert.equal(summary.error, undefined);
  for (const key of ['startedAt', 'completedAt'])
    assert(
      typeof summary[key] === 'string' && new Date(summary[key]).toISOString() === summary[key],
    );
  assert(Date.parse(summary.completedAt) >= Date.parse(summary.startedAt));
  assert.deepEqual(
    summary.stages,
    receiveTransportSteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
    'ReceiveTransport summary stages differ',
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
        'docs/account-receive-transport.md',
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
        'scripts/account-receive-transport/run.mjs',
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
    'ReceiveTransport source pins differ',
  );
  reconcileReceiveTransportEvidence(
    Object.fromEntries(
      [
        ...['queue', 'flight', 'bound', 'drain'].map((n) => 'control-' + n + '.json'),
        'generated.json',
      ].map((f) => [f, json(f)]),
    ),
  );
  readFileSync(join(directory, 'types.log'));
  for (const file of [
    ...['native', 'controls', 'generated'].map((n) => n + '.xml'),
    ...receiveTransportSteps.filter((s) => s.kind !== 'exit').map((s) => s.name + '.log'),
  ])
    assert(readFileSync(join(directory, file)).length, 'Empty receive-transport auxiliary report');
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
const hash = (v) => createHash('sha256').update(v).digest('hex');
const frameBytes = (wire) => {
  assert(
    typeof wire === 'string' &&
      wire.length > 0 &&
      wire.length <= 262144 &&
      /^(?:[0-9a-f]{2})+$/.test(wire),
  );
  return Buffer.from(wire, 'hex');
};
const frame = (wire, domain, n) => {
  const text = frameBytes(wire).toString(),
    v = JSON.parse(text);
  assert.equal(JSON.stringify(v), text);
  assert.equal(v[0], domain);
  assert.equal(v.length, n);
  assert.equal(v[1], 2);
  return v;
};
// Checks measured observations and request/page framing; original native owners
// retain service-signature, local authentication and CRDT verification authority.
export function reconcileReceiveTransportEvidence(r) {
  for (const mode of ['queue', 'flight', 'bound', 'drain']) {
    const c = r['control-' + mode + '.json'];
    assert.equal(c.effective, true);
    assert.deepEqual(
      c.observations.map((o) => o.changed),
      [false, true],
    );
    for (const o of c.observations) {
      if (mode === 'queue') {
        assert.equal(o.through, 1);
        assert.equal(o.result.kind, 'received');
        assert.equal(o.result.status.receivedThrough, 1);
        assert.equal(typeof o.initial, 'string');
        assert.equal(o.text, (o.changed ? '' : 'REMOTE ') + o.initial);
      } else if (mode === 'flight') {
        assert.equal(o.calls, o.changed ? 2 : 1);
        assert.equal(o.result.kind, o.changed ? 'unknown' : 'busy');
      } else if (mode === 'bound') assert.equal(o.length, o.changed ? 17 : null);
      else {
        assert.equal(o.cancelled, true);
        assert.equal(o.settledBeforeCancellationCompleted, o.changed);
        assert.equal(o.settledAfterCancellationCompleted, true);
        assert.equal(o.result, null);
      }
    }
  }
  const g = r['generated.json'];
  assert.equal(g.status, 'passed');
  assert.equal(g.model, 'grouped-http-v2');
  assert.equal(g.seed, 9112042);
  assert.equal(g.runs, 16);
  assert.equal(g.histories.length, 16);
  const coverage = {},
    transports = { single: 0, batch: 0 };
  for (const h of g.histories) {
    assert.equal(h.completed, true);
    assert.equal(typeof h.initial, 'string');
    assert(h.actions.length >= 6 && h.actions.length <= 9);
    assert.equal(h.actions[0], 'lost');
    assert.deepEqual(h.actions.slice(-2), ['receive', 'restart']);
    assert.equal(h.observations.length, h.actions.length, 'Incomplete HTTP history');
    const count = h.actions.filter((a) => a === 'receive').length;
    assert.equal(h.wires.length, count);
    let text = h.initial,
      position = 0,
      link = '00'.repeat(32),
      requestIndex = 0;
    const known = new Map(sortCaptures(h.before, h.before).map((c) => [c.id, c]));
    for (const [i, action] of h.actions.entries()) {
      assert(['receive', 'local', 'lost', 'corrupt', 'restart', 'compact'].includes(action));
      coverage[action] = (coverage[action] ?? 0) + 1;
      const o = h.observations[i];
      assert.equal(o.action, action);
      if (['receive', 'lost', 'corrupt'].includes(action)) {
        const req = h.requests[requestIndex++];
        assert.equal(req.mode, action);
        assert.equal(typeof req.batch, 'boolean');
        const requests = req.batch
          ? decodeInboundBatch(new Uint8Array(frameBytes(req.request)))
          : [frameBytes(req.request)];
        assert.equal(requests.length, req.pages.length);
        assert(requests.length >= 1 && requests.length <= 4);
        if (req.batch) assert(requests.length > 1);
        transports[req.batch ? 'batch' : 'single']++;
        let offered = 0,
          offeredLink = link;
        const kinds = [];
        for (const [index, wire] of requests.entries()) {
          const entry = req.pages[index];
          assert.equal(Buffer.from(wire).toString('hex'), entry.request);
          const q = frame(entry.request, 'done/private-read/v2', 15),
            page = frame(entry.candidatePage, 'done/private-read-page/v2', 7),
            at = position + index,
            present = at < count;
          assert.equal(q[10], at, 'HTTP request did not follow durable progress');
          assert(at <= count);
          assert.equal(q[11], 1);
          assert.equal(page[2], hash(Buffer.from(entry.request, 'hex')));
          assert.equal(page[3], count);
          assert.equal(page[4], at + (present ? 1 : 0));
          assert.equal(page[5].length, present ? 1 : 0);
          assert.match(entry.link, /^[0-9a-f]{64}$/);
          if (present) {
            assert.equal(page[5][0][0], h.wires[at], 'HTTP original wire changed');
            assert.notEqual(entry.link, offeredLink);
            offeredLink = entry.link;
            offered++;
          } else assert.equal(entry.link, offeredLink);
          kinds.push(present ? 'received' : 'empty');
        }
        if (action === 'receive') {
          const delivered = req.batch
            ? decodeInboundBatchPages(new Uint8Array(frameBytes(req.responseBody)))
            : [frameBytes(req.responseBody)];
          assert.deepEqual(
            delivered.map((b) => Buffer.from(b).toString('hex')),
            req.pages.map((p) => p.candidatePage),
            'HTTP response differs from the exact original pages',
          );
          assert.equal(o.outcome.kind, offered ? 'received' : 'empty');
          assert.equal(o.outcome.recorded, offered > 0);
          assert.deepEqual(o.outcome.status, o.status);
          if (req.batch) assert.deepEqual(o.outcome.kinds, kinds);
          for (let n = 0; n < offered; n++) text = `R${position++} ` + text;
          link = offeredLink;
        } else if (action === 'lost') {
          assert.equal(req.responseBody, null);
          assert.equal(o.outcome.kind, 'unknown');
          assert.equal(o.outcome.recorded, false);
        } else {
          assert.equal(req.responseBody, Buffer.from('bad page').toString('hex'));
          if (req.batch) assert.equal(o.outcome.error, 'Error: Invalid inbound batch');
          else assert.match(o.outcome.error, /AdmissionError/);
        }
      } else {
        assert.equal(o.outcome, null);
        if (action === 'local') text += 'L';
      }
      assert.equal(o.visible, text, 'HTTP authored text differs');
      assert.deepEqual(
        o.status,
        { state: 'ready', receivedThrough: position, observedThrough: position ? count : 0, link },
        'HTTP receipt status differs',
      );
      const current = sortCaptures(o.captures, h.before);
      for (const [id, c] of known)
        assert.deepEqual(
          current.find((v) => v.id === id),
          c,
          'Original HTTP source changed or missing',
        );
      const added = current.filter((c) => !known.has(c.id));
      assert.equal(added.length, action === 'local' ? 1 : 0, 'Unexpected HTTP source allocation');
      for (const c of added) known.set(c.id, c);
    }
    assert.equal(requestIndex, h.requests.length, 'Unmatched HTTP request');
    assert.equal(position, count, 'HTTP history did not receive every published original');
    assert.equal(h.final.visible, text);
    assert.deepEqual(h.final.status, h.observations.at(-1).status);
    sameCaptures(h.final.captures, [...known.values()], h.before);
  }
  assert.deepEqual(g.coverage, coverage);
  assert.deepEqual(g.transports, transports);
  assert(transports.single > 0 && transports.batch > 0, 'Missing HTTP transport coverage');
  for (const action of ['receive', 'local', 'lost', 'corrupt', 'restart', 'compact'])
    assert(coverage[action] > 0, 'Missing generated HTTP action');
}
