import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as Y from 'yjs';
import { vitestStage } from './vitest-adapter.mjs';
import {
  inboundPrepReports,
  reconcileInboundPrepEvidence,
} from './account-inbound-prep-wrapper.mjs';
export const inboundCodecsCampaign = 'scripts/account-inbound-codecs/run.mjs';
export const inboundCodecsFiles = [
  ['test/accountInboundCodec.test.ts', 'test/accountInboundControls.test.ts'],
  [
    'test/accountInboundPrep.test.ts',
    'test/networkEnvelope.test.ts',
    'test/positionDecision.test.ts',
    'test/yjsDelivery.test.ts',
    'test/sourceCapture.test.ts',
  ],
];
export const inboundCodecsSteps = [
  ...inboundCodecsFiles.map((files, i) => ({
    name: i === 0 ? 'codecs' : 'regressions',
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
  })),
  {
    name: 'node-import',
    kind: 'exit',
    argv: [
      'node',
      '--input-type=module',
      '-e',
      "import {decodeInboundRequest} from './account-protocol/inboundTransport.ts'; import fs from 'node:fs'; const f=JSON.parse(fs.readFileSync(process.env.ACCOUNT_REPORT_DIR+'/independent-bytes.json')); const r=decodeInboundRequest(new Uint8Array(Buffer.from(f.request,'hex'))); if(r.reader===r.publisher)throw Error('Reader collapsed into publisher'); console.log('Shared v2 codec imports directly in Node; independent request decoded.');",
    ],
    deadlineMs: 15000,
  },
];
export const inboundCodecsMutations = {
  'page-signature': [["if (!pageVerified) fail('unverified');", 'void pageVerified;']],
  'request-binding': [
    [
      "if (p.request !== hex(new Uint8Array(await subtle.digest('SHA-256', request)))) fail('request');",
      'void request;',
    ],
  ],
  'prefix-proof': [
    [
      'const proof = await verifyPositionResponse(entry.proof, subject(entry.envelope), a, subtle);',
      'const proof = decodePositionResponse(entry.proof);',
    ],
  ],
  actor: [["if (!actorAllowed) fail('actor');", 'void actorAllowed;']],
  'record-binding': [
    [
      "if (expectedRecord && hex(record) !== hex(expectedRecord)) fail('record');",
      'void expectedRecord;',
    ],
  ],
  'batch-count': [["if (!fits) fail('size');", 'void fits;']],
  'buffer-copy': [['return bytes.slice();', 'return bytes;']],
  'late-close': [
    ["current();\n    if (kind === 'conflict')", "void 0;\n    if (kind === 'conflict')"],
  ],
};
const inboundPrepEvidenceFiles = inboundPrepReports.filter(
  (f) =>
    f.endsWith('.json') &&
    !f.startsWith('case-reports/') &&
    !['sources.json', 'summary.json'].includes(f),
);
export const inboundCodecsReports = [
  'sources.json',
  'summary.json',
  'results.xml',
  ...inboundCodecsSteps.map((s) => s.name + '.log'),
  ...inboundCodecsSteps
    .filter((s) => s.kind === 'vitest')
    .map((s) => 'case-reports/' + s.name + '.json'),
  'independent-bytes.json',
  'generated.json',
  'wire-corruptions.json',
  ...Object.keys(inboundCodecsMutations).map((n) => 'control-' + n + '.json'),
  ...inboundPrepEvidenceFiles.map((f) => 'regression-artifacts/' + f),
];
export const inboundCodecsFilePolicy = {
  kind: 'account-reports-v1',
  required: inboundCodecsReports,
  maxEntries: 40,
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 2,
};
export function inboundCodecsCampaignStage(root) {
  const steps = inboundCodecsSteps.map((s, i) => {
    if (s.kind === 'exit') return structuredClone(s);
    const declarations = inboundCodecsFiles[i].map((f) => vitestStage(root, f).expect),
      dataInputs = declarations.flatMap((d) => d.dataInputs ?? []);
    return {
      ...s,
      expect: {
        kind: 'vitest',
        files: inboundCodecsFiles[i],
        cases: declarations.flatMap((d) => d.cases),
        ...(dataInputs.length ? { dataInputs } : {}),
      },
    };
  });
  return {
    id: 'campaign:' + inboundCodecsCampaign,
    argv: ['node', inboundCodecsCampaign],
    env: {},
    variant: 'account-inbound-codecs-campaign-v1',
    expect: {
      kind: 'account-inbound-codecs',
      steps,
      cases: steps.flatMap((s) => s.expect?.cases ?? []),
      dataInputs: steps[1].expect.dataInputs,
    },
    deadlineMs: 135000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
    fileOutputs: structuredClone(inboundCodecsFilePolicy),
  };
}
export function validateInboundCodecsCampaign(s) {
  assert.equal(s.expect.kind, 'account-inbound-codecs');
  assert.equal(s.variant, 'account-inbound-codecs-campaign-v1');
  assert.deepEqual(s.argv, ['node', inboundCodecsCampaign]);
  assert.deepEqual(s.env, {});
  assert.deepEqual(s.fileOutputs, inboundCodecsFilePolicy);
  assert.equal(s.fixture, undefined);
  assert.equal(s.expect.historyInputs, undefined);
  assert.equal(s.deadlineMs, 135000);
  assert.equal(s.graceMs, 5000);
  assert.equal(s.processPolicy, 'inherited-group-v1');
  assert.deepEqual(
    s.expect.steps.map(({ expect: _e, ...step }) => step),
    inboundCodecsSteps,
  );
  assert.deepEqual(
    s.expect.cases,
    s.expect.steps.flatMap((step) => step.expect?.cases ?? []),
  );
  for (const [i, step] of s.expect.steps.entries()) {
    if (i === 2) {
      assert.equal(step.expect, undefined);
      continue;
    }
    assert.equal(step.expect.kind, 'vitest');
    assert.deepEqual(step.expect.files, inboundCodecsFiles[i]);
    assert(step.expect.cases.length > 0);
    assert.deepEqual(step.expect.dataInputs, i === 1 ? s.expect.dataInputs : undefined);
  }
  assert.deepEqual(
    s.expect.dataInputs.map((i) => i.path),
    ['test/vectors/envelope.json', 'test/vectors/private-envelope.json'],
  );
}
export function reconcileInboundCodecsReports(directory, sources, root) {
  const json = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const summary = json('summary.json');
  assert.equal(summary.status, 'passed', 'Inbound codecs summary failed');
  assert.equal(summary.error, undefined);
  for (const key of ['startedAt', 'completedAt'])
    assert(
      typeof summary[key] === 'string' && new Date(summary[key]).toISOString() === summary[key],
    );
  assert(Date.parse(summary.completedAt) >= Date.parse(summary.startedAt));
  assert.deepEqual(
    summary.stages,
    inboundCodecsSteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
    'Inbound codecs summary stages differ',
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
        'scripts/account-inbound-codecs/run.mjs',
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
    'Inbound codecs source pins differ',
  );
  const source = readFileSync(join(root, 'src/crdt/accountInbound.ts'), 'utf8');
  assert.equal(
    hash(source),
    sources.find((s) => s.path === 'src/crdt/accountInbound.ts')?.sha256,
    'Inbound codec mutation source differs',
  );
  reconcileInboundCodecsEvidence(
    Object.fromEntries(
      inboundCodecsReports
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
  reconcileInboundPrepEvidence(
    Object.fromEntries(inboundPrepEvidenceFiles.map((f) => [f, json('regression-artifacts/' + f)])),
  );
  for (const file of ['results.xml', ...inboundCodecsSteps.map((s) => s.name + '.log')])
    assert(readFileSync(join(directory, file)).length, 'Empty inbound codecs auxiliary report');
}

const hash = (v) => createHash('sha256').update(v).digest('hex');
const hex = (v) =>
  typeof v === 'string' && v.length > 0 && v.length <= 65536 && /^(?:[0-9a-f]{2})+$/.test(v);
const sha = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const frame = (wire, domain, size) => {
  assert(hex(wire));
  const bytes = Buffer.from(wire, 'hex'),
    v = JSON.parse(bytes.toString());
  assert.equal(JSON.stringify(v), bytes.toString());
  assert.equal(v[0], domain);
  assert.equal(v.length, size);
  return v;
};
// Byte equality, event framing, plaintext replay and actual guard-removal observations.
// Signature authentication remains the responsibility of the executed codec/verifier tests.
export function reconcileInboundCodecsEvidence(r, source) {
  const f = r['independent-bytes.json'],
    request = frame(f.request, 'done/private-read/v2', 15),
    page = frame(f.page, 'done/private-read-page/v2', 7),
    record = frame(f.record, 'done/account-inbound/v1', 13);
  assert.equal(request[1], 2);
  assert.equal(page[1], 2);
  assert.equal(record[1], 1);
  assert.notEqual(request[5], request[6]);
  assert.equal(page[2], hash(Buffer.from(f.request, 'hex')));
  assert.equal(record[11], f.request);
  assert.equal(record[12], f.page);
  assert.deepEqual(record.slice(3, 7), [request[7], request[8], request[5], request[6]]);
  assert.equal(record[7], 'received');
  assert.equal(record[8], page[4]);
  assert.equal(f.observedRecord, f.record);
  assert.deepEqual(f.observedUpdates, f.updates);
  assert(f.updates.length > 0 && f.updates.every(hex));
  const g = r['generated.json'];
  assert.equal(g.status, 'passed');
  assert.equal(g.seed, 9152026);
  assert.equal(g.runs, 400);
  assert.equal(g.histories.length, 400);
  const replayed = new Map();
  for (const h of g.histories) {
    assert(typeof h.text === 'string' && h.text.length <= 160);
    assert(Number.isInteger(h.nonce) && h.nonce >= 1 && h.nonce <= 250);
    assert(hex(h.update));
    assert(sha(h.expectedRecord));
    assert.equal(h.observedRecord, h.expectedRecord, 'Inbound generated live record differs');
    assert.equal(h.coldRecord, h.expectedRecord, 'Inbound generated cold record differs');
    assert.deepEqual(h.observedUpdates, [h.update]);
    assert.deepEqual(h.coldUpdates, [h.update]);
    assert.match(h.actorRefusal, /actor/);
    if (!replayed.has(h.update)) {
      const doc = new Y.Doc();
      try {
        Y.applyUpdate(doc, Buffer.from(h.update, 'hex'));
        assert.equal(doc.store.pendingStructs, null);
        assert.equal(doc.store.pendingDs, null);
        replayed.set(h.update, doc.getText('master').toString());
      } finally {
        doc.destroy();
      }
    }
    assert.equal(replayed.get(h.update), h.text, 'Inbound generated plaintext differs');
  }
  const corrupt = r['wire-corruptions.json'];
  assert.equal(corrupt.status, 'passed');
  assert.equal(corrupt.seed, 9162026);
  assert.equal(corrupt.page, hash(Buffer.from(f.page, 'hex')));
  assert.equal(corrupt.mutations.length, 500);
  const bytes = Buffer.from(f.page, 'hex');
  for (const m of corrupt.mutations) {
    assert(Number.isInteger(m.index) && m.index >= 0 && m.index < bytes.length);
    assert(Number.isInteger(m.mask) && m.mask >= 1 && m.mask <= 255);
    assert.equal(m.original, bytes[m.index]);
    assert.equal(m.changed, m.original ^ m.mask, 'Inbound wire mutation missing');
    assert(typeof m.reason === 'string' && m.reason.length > 0);
  }
  for (const [mode, changes] of Object.entries(inboundCodecsMutations)) {
    const c = r['control-' + mode + '.json'];
    assert.equal(c.mode, mode);
    assert.deepEqual(c.changes, changes);
    assert.equal(c.mutation.before, hash(source));
    let after = source;
    for (const [from, to] of changes) {
      assert.equal(after.split(from).length, 2);
      after = after.replace(from, to);
    }
    if (mode === 'prefix-proof')
      after =
        "import { decodePositionResponse } from '../../account-protocol/positionDecision';\n" +
        after;
    assert.equal(c.mutation.after, hash(after), 'Inbound guard mutation differs');
    assert.equal(c.mutation.hits, changes.length);
    assert(sha(c.mutation.bundle));
    assert(hex(c.request) && hex(c.page));
    const o = c.observation;
    if (mode === 'buffer-copy') {
      assert.equal(o.normalRetained, o.normalRequest);
      assert.equal(o.mutantRequest, o.normalRequest);
      assert.notEqual(o.mutantRetained, o.mutantRequest);
      assert(typeof o.coldError === 'string' && o.coldError.length > 0);
      continue;
    }
    assert(typeof o.normalError === 'string' && o.normalError.length > 0);
    assert.equal(o.mutantKind, 'received', 'Inbound guard removal no longer admits bad result');
    if (mode === 'record-binding') {
      assert.match(o.normalError, /record/);
      assert.notEqual(o.storedBaseline, o.heldBaseline);
    } else if (mode === 'late-close') {
      assert.match(o.normalError, /closed/);
      assert.equal(o.closed, true);
    } else {
      assert(sha(o.record));
      assert.equal(o.updates, mode === 'batch-count' ? 256 : 1);
      assert.deepEqual(o.actor, { id: (mode === 'actor' ? '22' : '11').repeat(16), kind: 'human' });
      if (mode === 'prefix-proof') assert.equal(o.prefix.position, 1);
    }
  }
}
