export const boundsReference = '6398e33';
export const boundsHistoricalFiles = [
  'account-protocol/admission.ts',
  'account-service/authority.ts',
  'src/crdt/promotionAdmission.ts',
];
import { historicalInputs, validateHistoricalInputs } from './historical-inputs.mjs';
import { createHash, createPublicKey, verify } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatedNodeDeclarations } from './census.mjs';
import * as Y from 'yjs';
export const boundsCampaign = 'scripts/account-admission-bounds/run.mjs';
export const boundsFiles = ['protocol', 'native'].map(
  (n) => 'test/account-admission-bounds/' + n + '.test.mjs',
);
export const boundsSteps = [
  {
    name: 'types',
    kind: 'exit',
    argv: ['node', 'node_modules/typescript/bin/tsc', '-b', '--noEmit'],
    deadlineMs: 60000,
  },
  {
    name: 'reproduction',
    kind: 'exit',
    argv: ['node', 'scripts/account-admission-bounds/reproduce.mjs'],
    deadlineMs: 30000,
  },
  {
    name: 'vectors',
    kind: 'exit',
    deadlineMs: 30000,
    argv: ['node', 'scripts/account-admission-bounds/vectors.mjs', '--check'],
  },
  ...[
    ['protocol', 120000],
    ['native', 180000],
  ].map(([name, deadlineMs]) => ({
    name,
    kind: 'node',
    deadlineMs,
    argv: [
      'node',
      '--test',
      '--test-concurrency=1',
      '--test-reporter=spec',
      '--test-reporter-destination=stdout',
      '--test-reporter=junit',
      '--test-reporter-destination=$REPORT/' + name + '.xml',
      'test/account-admission-bounds/' + name + '.test.mjs',
    ],
  })),
];
export const boundsReports = [
  'sources.json',
  'summary.json',
  ...boundsSteps.map((s) => s.name + '.log'),
  ...boundsSteps
    .filter((s) => s.kind === 'node')
    .flatMap((s) => [s.name + '.xml', 'case-reports/' + s.name + '.json']),
  'reproduction.json',
  'generated-codecs.json',
  'upper-bound.json',
  'controls.json',
  'versions.json',
  'long-histories.json',
  'native-long-sv.json',
  'native-long-ds.json',
  'native-lie-sv.json',
  'native-lie-ds.json',
  'native-v1.json',
  'native-preflight.json',
];
export const boundsFilePolicy = {
  kind: 'account-reports-v1',
  required: boundsReports,
  maxEntries: 32,
  // Includes full generated message pairs and independently replayable long updates.
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 2,
};
export function boundsCampaignStage(root) {
  const steps = boundsSteps.map((s) => {
    if (s.kind === 'exit') return { ...s, expect: { kind: 'exit', exitCodes: [0] } };
    const files = [s.argv.at(-1)];
    const cases = files.flatMap((file) => {
      const d = generatedNodeDeclarations(file, readFileSync(join(root, file), 'utf8'), { root });
      assert(!d.dataInputs?.length);
      return d.cases;
    });
    return { ...s, expect: { kind: 'cases', cases } };
  });
  return {
    id: 'campaign:' + boundsCampaign,
    argv: ['node', boundsCampaign],
    env: {},
    variant: 'account-admission-bounds-campaign-v1',
    expect: {
      kind: 'account-admission-bounds',
      steps,
      cases: steps.flatMap((s) => s.expect.cases ?? []),
      historyInputs: historicalInputs(root, boundsReference, boundsHistoricalFiles),
    },
    deadlineMs: 420000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
    fixture: { kind: 'chromium-cdp', startupMs: 15000 },
    fileOutputs: structuredClone(boundsFilePolicy),
  };
}
export function validateBoundsCampaign(s) {
  assert.equal(s.expect.kind, 'account-admission-bounds');
  assert.equal(s.variant, 'account-admission-bounds-campaign-v1');
  assert.deepEqual(s.argv, ['node', boundsCampaign]);
  assert.deepEqual(s.env, {});
  assert.deepEqual(s.fileOutputs, boundsFilePolicy);
  assert.deepEqual(s.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(s.expect.dataInputs, undefined);
  assert.equal(s.deadlineMs, 420000);
  assert.equal(s.graceMs, 5000);
  assert.equal(s.processPolicy, 'inherited-group-v1');
  validateHistoricalInputs(s.expect.historyInputs);
  assert.deepEqual(
    s.expect.historyInputs.map(({ reference, path }) => [reference, path]),
    boundsHistoricalFiles.map((path) => [boundsReference, path]),
  );
  assert.deepEqual(
    s.expect.steps.map(({ expect: _e, ...step }) => step),
    boundsSteps,
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
export function reconcileBoundsReports(directory, sources, historyInputs) {
  const json = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const summary = json('summary.json');
  assert.equal(summary.status, 'passed', 'Bounds summary failed');
  assert.equal(summary.error, undefined);
  for (const key of ['startedAt', 'completedAt'])
    assert(
      typeof summary[key] === 'string' && new Date(summary[key]).toISOString() === summary[key],
    );
  assert(Date.parse(summary.completedAt) >= Date.parse(summary.startedAt));
  assert.deepEqual(
    summary.stages,
    boundsSteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
    'Bounds summary stages differ',
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
        'docs/account-admission-bounds.md',
        'docs/selections/row-7-checkpoint.md',
        'docs/review/remediation/S0-5/A-schemas.md',
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
        'scripts/account-admission-bounds/run.mjs',
        'scripts/account-admission-bounds/reproduce.mjs',
        'scripts/account-admission-bounds/vectors.mjs',
        'scripts/generate-checkpoint-vectors.mjs',
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
    'Bounds source pins differ',
  );
  const before = json('reproduction.json');
  assert.equal(before.commit, boundsReference);
  assert.deepEqual(
    before.source,
    historyInputs
      .filter((p) => p.path === 'account-protocol/admission.ts')
      .map(({ path, sha256 }) => ({ path, sha256 }))[0],
    'Bounds reproduction historical bytes differ',
  );
  reconcileBoundsEvidence(
    Object.fromEntries(
      boundsReports
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
  for (const f of boundsReports.filter(
    (f) => (f.endsWith('.log') && f !== 'types.log') || f.endsWith('.xml'),
  ))
    assert(readFileSync(join(directory, f)).length, 'Empty bounds auxiliary report');
}

const hash = (v) => createHash('sha256').update(v).digest('hex');
const hex = (v, n) =>
  assert(
    typeof v === 'string' &&
      (n ? new RegExp(`^[0-9a-f]{${2 * n}}$`).test(v) : /^(?:[0-9a-f]{2})+$/.test(v)),
  );
const keys = (v, names) => assert.deepEqual(Object.keys(v).sort(), [...names].sort());
const lp = (fields) =>
  Buffer.concat(
    fields.map((v) => {
      const b = Buffer.from(String(v)),
        n = Buffer.alloc(2);
      n.writeUInt16BE(b.length);
      return Buffer.concat([n, b]);
    }),
  );
function fields(bytes) {
  const b = Buffer.from(bytes, 'hex'),
    out = [];
  let at = 0;
  while (at < b.length) {
    assert(at + 2 <= b.length);
    const n = b.readUInt16BE(at);
    at += 2;
    assert(at + n <= b.length);
    out.push(b.subarray(at, at + n).toString('utf8'));
    at += n;
  }
  assert.equal(lp(out).toString('hex'), bytes);
  return out;
}
function signature(key, sig, bytes, expected = true, checked) {
  hex(key, 32);
  hex(sig, 64);
  const identity = key + ':' + sig + ':' + bytes.toString('hex');
  const actual = checked?.has(identity)
    ? checked.get(identity)
    : verify(
        null,
        bytes,
        createPublicKey({
          key: Buffer.from('302a300506032b6570032100' + key, 'hex'),
          type: 'spki',
          format: 'der',
        }),
        Buffer.from(sig, 'hex'),
      );
  checked?.set(identity, actual);
  assert.equal(actual, expected, 'Observed signature result differs');
}
function descriptor(v) {
  keys(v, ['bytes', 'sha256']);
  assert(Number.isInteger(v.bytes) && v.bytes > 0 && v.bytes <= 16777216);
  hex(v.sha256, 32);
}
function compact(c) {
  const { sv, ds, ...manifest } = c.manifest,
    { derivedSv, derivedDs, ...admission } = c.admission;
  for (const v of [sv, ds, derivedSv, derivedDs]) hex(v);
  assert.equal(sv, derivedSv);
  assert.equal(ds, derivedDs);
  return {
    manifest,
    admission,
    coverage: {
      sv: { bytes: sv.length / 2, sha256: hash(Buffer.from(sv, 'hex')) },
      ds: { bytes: ds.length / 2, sha256: hash(Buffer.from(ds, 'hex')) },
    },
  };
}
function messages(c) {
  keys(c, ['manifest', 'admission', 'coverage']);
  keys(c.coverage, ['sv', 'ds']);
  descriptor(c.coverage.sv);
  descriptor(c.coverage.ds);
  assert(c.coverage.sv.bytes + c.coverage.ds.bytes <= 16777216);
  const m = c.manifest,
    a = c.admission;
  keys(m, [
    'v',
    'workspaceId',
    'epoch',
    'epochHead',
    'generation',
    'checkpointDigest',
    'headVectorDigest',
    'producer',
    'signature',
  ]);
  keys(a, [
    'v',
    'workspaceId',
    'checkpointDigest',
    'manifestDigest',
    'headBaselineDigest',
    'derivation',
    'admittingCredential',
    'selfAdmitted',
    'decisionParent',
    'signature',
  ]);
  assert.equal(m.v, 2);
  assert.equal(a.v, 2);
  assert.equal(m.epoch, 1);
  assert.equal(m.generation, 1);
  for (const f of ['epochHead', 'checkpointDigest', 'headVectorDigest']) hex(m[f], 32);
  for (const f of ['workspaceId', 'producer']) hex(m[f], 16);
  assert.equal(a.workspaceId, m.workspaceId);
  assert.equal(a.checkpointDigest, m.checkpointDigest);
  assert.equal(a.headBaselineDigest, m.headVectorDigest);
  assert.equal(a.admittingCredential, m.producer);
  assert.equal(a.derivation, 'yjs-13.6.31-sv-ds-v1');
  assert.equal(a.selfAdmitted, 1);
  assert.equal(a.decisionParent, '00'.repeat(32));
  const manifest = lp([
    'done/cp-manifest/v2',
    2,
    m.workspaceId,
    1,
    m.epochHead,
    1,
    m.checkpointDigest,
    c.coverage.sv.sha256,
    c.coverage.ds.sha256,
    m.headVectorDigest,
    m.producer,
  ]);
  assert.equal(a.manifestDigest, hash(manifest));
  return {
    manifest,
    admission: lp([
      'done/cp-admit/v2',
      2,
      a.workspaceId,
      a.checkpointDigest,
      a.manifestDigest,
      c.coverage.sv.sha256,
      c.coverage.ds.sha256,
      a.headBaselineDigest,
      a.derivation,
      a.admittingCredential,
      1,
      a.decisionParent,
    ]),
  };
}
function signedCompletion(c, key, expected = true, observed, checked) {
  const bytes = messages(c);
  for (const kind of ['manifest', 'admission']) {
    signature(key, c[kind].signature, bytes[kind], expected, checked);
    if (observed) assert.equal(observed[kind], bytes[kind].toString('hex'));
  }
}
function refused(v) {
  assert(v && v.ok === false);
}
function sameHash(a, b) {
  hex(a, 32);
  assert.equal(b, a);
}
function error(value, pattern) {
  assert(typeof value === 'string' && value.length > 0);
  if (pattern) assert.match(value, pattern);
}
function oldCompletion(c, key) {
  const m = c.manifest,
    a = c.admission;
  assert.equal(m.v, 1);
  assert.equal(a.v, 1);
  for (const v of [m.sv, m.ds, a.derivedSv, a.derivedDs]) hex(v);
  assert.equal(m.sv, a.derivedSv);
  assert.equal(m.ds, a.derivedDs);
  const mb = lp([
    'done/cp-manifest/v1',
    1,
    m.workspaceId,
    m.epoch,
    m.epochHead,
    m.generation,
    m.checkpointDigest,
    m.sv,
    m.ds,
    m.headVectorDigest,
    m.producer,
  ]);
  assert.equal(a.manifestDigest, hash(mb));
  signature(key, m.signature, mb);
  signature(
    key,
    a.signature,
    lp([
      'done/cp-admit/v1',
      1,
      a.workspaceId,
      a.checkpointDigest,
      a.manifestDigest,
      a.derivedSv,
      a.derivedDs,
      a.headBaselineDigest,
      a.derivation,
      a.admittingCredential,
      a.selfAdmitted,
      a.decisionParent,
    ]),
  );
}
export function reconcileBoundsCodecs(g) {
  // Exact byte triples share only deterministic signature work in this invocation.
  // Every input, message, descriptor and mutation is still checked; no state escapes.
  const checked = new Map();
  assert.equal(g.seed, 9112071);
  assert.equal(g.histories, 85);
  assert.equal(g.observations.length, 85);
  assert.equal(g.generatedInputs.length, 85);
  assert.deepEqual(g.oldBoundaries, [1, 32766, 32767, 32768, 65536]);
  assert.deepEqual(g.run, {
    numRuns: 80,
    numShrinks: 0,
    failed: false,
    counterexample: null,
    counterexamplePath: null,
  });
  for (let i = 0; i < 85; i++) {
    const o = g.observations[i],
      input = g.generatedInputs[i];
    assert.deepEqual(o.input, input);
    keys(input, ['sv', 'ds', 'byte']);
    for (const f of ['sv', 'ds'])
      assert(Number.isInteger(input[f]) && input[f] >= 1 && input[f] <= 80000);
    assert(Number.isInteger(input.byte) && input.byte >= 0 && input.byte <= 255);
    if (i >= 80)
      assert.deepEqual(input, {
        sv: g.oldBoundaries[i - 80],
        ds: g.oldBoundaries[i - 80],
        byte: 17,
      });
    for (const f of ['sv', 'ds'])
      assert.deepEqual(o.completion.coverage[f], {
        bytes: input[f],
        sha256: hash(Buffer.alloc(input[f], input.byte)),
      });
    signedCompletion(o.completion, g.publicKey, true, o.messages, checked);
    assert.deepEqual(
      o.mutations.map((m) => m.field),
      ['sv', 'ds'],
    );
    for (const m of o.mutations) {
      const expected = structuredClone(o.completion),
        b = Buffer.alloc(input[m.field], input.byte);
      b[0] = input.byte === 0 ? 1 : 0;
      expected.coverage[m.field].sha256 = hash(b);
      const mm = expected.manifest;
      expected.admission.manifestDigest = hash(
        lp([
          'done/cp-manifest/v2',
          2,
          mm.workspaceId,
          1,
          mm.epochHead,
          1,
          mm.checkpointDigest,
          expected.coverage.sv.sha256,
          expected.coverage.ds.sha256,
          mm.headVectorDigest,
          mm.producer,
        ]),
      );
      assert.deepEqual(m.completion, expected);
      signedCompletion(m.completion, g.publicKey, false, m.messages, checked);
      error(m.error);
    }
  }
}
export function reconcileBoundsUpper(u) {
  assert.equal(u.combinedBytes, 16777216);
  assert(u.completionJsonBytes > 4 * u.combinedBytes && u.completionJsonBytes < 72 * 1024 * 1024);
  assert(u.receiptJsonBytes > u.completionJsonBytes && u.receiptJsonBytes < 72 * 1024 * 1024);
  assert.deepEqual(u.completion.coverage, {
    sv: { bytes: 16777214, sha256: hash(Buffer.alloc(16777214, 1)) },
    ds: { bytes: 2, sha256: hash(Buffer.alloc(2)) },
  });
  signedCompletion(u.completion, u.publicKey);
  sameHash(u.receiptHash, u.coldReceiptHash);
  sameHash(u.rowsBefore, u.rowsAfter);
  assert.deepEqual(
    u.oversize.map((v) => v.field),
    ['sv', 'ds'],
  );
  for (const v of u.oversize) {
    assert.equal(v.combinedBytes, 16777217);
    assert.equal(v.errors.length, 3);
    v.errors.forEach((e) => error(e, /bound/));
    refused(v.result);
  }
  const malformed = [];
  for (const value of ['', 'A0', '0', 'gg', null, [], 42])
    for (const field of ['sv', 'ds']) malformed.push({ field, value });
  assert.deepEqual(
    u.malformed.map(({ field, value }) => ({ field, value })),
    malformed,
  );
  u.malformed.forEach((v) => error(v.error));
}
export function reconcileBoundsControls(c) {
  assert.deepEqual(c.semanticRederivation, ['sv', 'ds']);
  assert.deepEqual(c.omittedSignatureFields, [
    'manifest.sv',
    'manifest.ds',
    'admission.derivedSv',
    'admission.derivedDs',
  ]);
  assert.deepEqual(
    c.observations.map((o) => o.field),
    ['sv', 'ds'],
  );
  for (const o of c.observations) {
    assert.deepEqual(o.real, { sv: '00', ds: '0000' });
    assert.deepEqual(o.badParts, { ...o.real, [o.field]: '0100' });
    assert.equal(o.completion.manifest[o.field], o.badParts[o.field]);
    signedCompletion(compact(o.completion), o.publicKey);
    error(o.error, /coverage/);
    assert.equal(o.serviceResult.kind, 'promotion-receipt');
    assert.deepEqual(o.serviceResult.completion, o.completion);
  }
  assert.deepEqual(
    c.omitted.map((o) => [o.field, o.which]),
    [
      ['sv', 'manifest'],
      ['sv', 'admission'],
      ['ds', 'manifest'],
      ['ds', 'admission'],
    ],
  );
  for (const o of c.omitted) {
    const a = fields(o.baseline),
      b = fields(o.baselineChanged),
      at = o.which === 'manifest' ? (o.field === 'sv' ? 7 : 8) : o.field === 'sv' ? 5 : 6;
    assert.equal(a.length, o.which === 'manifest' ? 11 : 12);
    assert.equal(a[0], o.which === 'manifest' ? 'done/cp-manifest/v2' : 'done/cp-admit/v2');
    assert.notEqual(a[at], b[at]);
    assert.equal(lp(a.filter((_, i) => i !== at)).toString('hex'), o.one);
    assert.equal(lp(b.filter((_, i) => i !== at)).toString('hex'), o.changed);
    assert.equal(o.one, o.changed);
    signature(o.publicKey, o.baselineSignature, Buffer.from(o.baseline, 'hex'));
    signature(o.publicKey, o.baselineSignature, Buffer.from(o.baselineChanged, 'hex'), false);
    signature(o.publicKey, o.signature, Buffer.from(o.one, 'hex'));
    signature(o.publicKey, o.signature, Buffer.from(o.changed, 'hex'));
  }
}
export function reconcileBoundsVersions(v) {
  const pairs = [
    [1, 1],
    [1, 2],
    [2, 1],
    [3, 2],
    [2, 3],
  ];
  assert.deepEqual(v.pairs, pairs);
  assert.deepEqual(
    v.refusals.map((r) => r.versions),
    pairs,
  );
  for (const r of v.refusals) {
    error(r.error, /Unsupported/);
    refused(r.result);
  }
  refused(v.genuineRefusal);
  error(v.oldError, /Unsupported/);
  oldCompletion(v.oldCompletion, v.publicKey);
  sameHash(v.rowsBefore, v.rowsAfterRefusals);
  sameHash(v.retainedBefore, v.retainedAfter);
  refused(v.coldBegin);
  refused(v.coldFinish);
  assert.equal(v.retainedReceipt.kind, 'promotion-receipt');
  assert.deepEqual(v.retainedReceipt.completion, v.oldCompletion);
}
export function reconcileBoundsReplay(o, native = false) {
  assert(['sv', 'ds'].includes(o.kind));
  assert(Number.isInteger(o.count) && o.count >= 12000 && o.count <= 13001);
  assert(typeof o.updateBase64 === 'string' && o.updateBase64.length > 0);
  const update = Buffer.from(o.updateBase64, 'base64');
  assert.equal(update.toString('base64'), o.updateBase64);
  assert(update.length < 1024 * 1024);
  const doc = new Y.Doc({ gc: false });
  try {
    Y.applyUpdate(doc, update);
    assert(!doc.store.pendingStructs && !doc.store.pendingDs, 'Incomplete replay');
    assert.equal(o.visible, (o.kind === 'sv' ? 'x' : '.').repeat(o.count));
    assert.equal(doc.getText('master').toString(), o.visible);
    const sv = Y.encodeStateVector(doc),
      ds = Y.encodeSnapshot(Y.createSnapshot(Y.snapshot(doc).ds, new Map()));
    assert.equal(o.svBytes, sv.length);
    assert.equal(o.dsBytes, ds.length);
    assert((o.kind === 'sv' ? sv : ds).length > 32767);
    assert.deepEqual(o.completion.coverage, {
      sv: { bytes: sv.length, sha256: hash(sv) },
      ds: { bytes: ds.length, sha256: hash(ds) },
    });
    signedCompletion(o.completion, o.publicKey);
  } finally {
    doc.destroy();
  }
  if (native) {
    assert.equal(o.v, 2);
    assert.equal(o.count, 12000);
    assert(Number.isInteger(o.updateBytes) && o.updateBytes > 0 && o.updateBytes < 1024 * 1024);
    sameHash(o.receiptHash, o.coldReceiptHash);
    sameHash(o.before, o.after);
    sameHash(o.markerBefore, o.markerAfter);
    assert.equal(o.errors.length, 2);
    o.errors.forEach((e) => error(e, /Unsupported|Malformed/));
  } else assert.equal(o.checkpointBytes, update.length);
}
export function reconcileBoundsNativeControls(reports) {
  for (const kind of ['sv', 'ds']) {
    const o = reports['native-lie-' + kind + '.json'];
    assert.equal(o.kind, kind);
    assert.equal(o.completion.manifest[kind], '0100');
    signedCompletion(compact(o.completion), o.publicKey);
    error(o.error, /Retained completion changed/);
    assert.equal(o.finishCalls, 0);
    sameHash(o.before, o.after);
    sameHash(o.carrierBefore, o.carrierAfter);
  }
  const v = reports['native-v1.json'];
  assert.equal(v.stage, 'admission-offered');
  oldCompletion(v.completion, v.publicKey);
  error(v.error, /Unsupported|Malformed/);
  sameHash(v.before, v.after);
  sameHash(v.carrierBefore, v.carrierAfter);
  const p = reports['native-preflight.json'];
  assert.equal(p.testBound, 32);
  assert.equal(p.stage, 'genesis-prepared');
  assert.equal(p.admissionCalls, 0);
  error(p.error, /coverage/);
  sameHash(p.before, p.after);
  sameHash(p.carrierBefore, p.carrierAfter);
}
export function reconcileBoundsEvidence(r) {
  const before = r['reproduction.json'];
  assert.equal(before.commit, boundsReference);
  assert.equal(before.cases.length, 20);
  let i = 0;
  for (const bytes of [32766, 32767, 32768])
    for (const field of ['sv', 'ds'])
      for (const name of ['manifest', 'admission', 'parser']) {
        const row = before.cases[i++];
        assert.equal(row.bytes, bytes);
        assert.equal(row.field, field);
        assert.equal(row.name, name);
        if (bytes === 32768)
          error(
            row.error,
            name === 'parser' ? /^Invalid coverage bytes$/ : /^Protocol field too long$/,
          );
        else assert.equal(row.error, null);
      }
  for (const kind of ['sv', 'ds']) {
    const o = before.cases[i++];
    assert.equal(o.history, kind);
    assert.equal(o.count, 12000);
    assert(o[kind + 'Bytes'] > 32767);
    assert(o.updateBytes > 0 && o.updateBytes < 216 * 1024);
    assert.equal(o.refusedBoth, true);
    assert.deepEqual(o.errors, ['Protocol field too long', 'Protocol field too long']);
  }
  reconcileBoundsCodecs(r['generated-codecs.json']);
  reconcileBoundsUpper(r['upper-bound.json']);
  reconcileBoundsControls(r['controls.json']);
  reconcileBoundsVersions(r['versions.json']);
  const histories = r['long-histories.json'];
  assert.deepEqual(
    histories.map((o) => [o.kind, o.count]),
    ['sv', 'ds'].flatMap((k) => [12000, 12317, 13001].map((n) => [k, n])),
  );
  histories.forEach((o) => reconcileBoundsReplay(o));
  for (const k of ['sv', 'ds']) {
    const o = r['native-long-' + k + '.json'];
    reconcileBoundsReplay(o, true);
    assert.equal(
      o.updateBytes,
      histories.find((h) => h.kind === k && h.count === 12000).checkpointBytes,
    );
  }
  reconcileBoundsNativeControls(r);
}
