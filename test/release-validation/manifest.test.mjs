import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as fc from 'fast-check';
import { catalogueCensus, directNodeCensus } from '../../scripts/release-validation/census.mjs';
import {
  compileManifest,
  selectStages,
  assertManifestCoverage,
  boundedStage,
} from '../../scripts/release-validation/manifest.mjs';
import { packageGraph } from '../../scripts/release-validation/inventory.mjs';
import { digest } from '../../scripts/release-validation/identity.mjs';
import {
  preparationCampaign,
  preparationCommand,
  preparationTestStage,
} from '../../scripts/release-validation/command-wrappers.mjs';
import {
  coreCampaign,
  coreCampaignStage,
  coreFiles,
  coreReports,
  reconcileCoreReports,
} from '../../scripts/release-validation/account-core-wrapper.mjs';
import { validateStage } from '../../scripts/release-validation/stage.mjs';
import {
  authorityCampaign,
  authorityCampaignStage,
  authorityFiles,
  authorityReports,
  reconcileAuthorityReports,
  reconcileAuthorityControls,
} from '../../scripts/release-validation/account-authority-wrapper.mjs';
import { generateKeyPairSync, sign } from 'node:crypto';

function authorityEvidence(
  serviceId = 'ab'.repeat(16),
  first = '01'.repeat(32),
  second = '02'.repeat(32),
) {
  const make = () => {
    const keys = generateKeyPairSync('ed25519');
    return {
      keys,
      pin: {
        v: 1,
        serviceId,
        origin: 'http://localhost:4999',
        rpId: 'localhost',
        authRoot: keys.publicKey
          .export({ format: 'der', type: 'spki' })
          .subarray(-32)
          .toString('hex'),
      },
    };
  };
  const expected = make(),
    attacker = make();
  const proof = (owner, nonce) => {
    const p = owner.pin;
    const message = Buffer.concat(
      [
        'done/service-authority-bootstrap/v1',
        '1',
        p.serviceId,
        p.origin,
        p.rpId,
        p.authRoot,
        nonce,
      ].map((v) => {
        const b = Buffer.from(v),
          size = Buffer.alloc(2);
        size.writeUInt16BE(b.length);
        return Buffer.concat([size, b]);
      }),
    );
    return {
      v: 1,
      pin: p,
      nonce,
      signature: sign(null, message, owner.keys.privateKey).toString('hex'),
    };
  };
  return {
    pin: {
      expected: expected.pin,
      nonce: first,
      proof: proof(attacker, first),
      baseline: 'refused',
      mutant: attacker.pin,
    },
    replay: {
      expected: expected.pin,
      requestedNonce: second,
      proof: proof(expected, first),
      baseline: 'refused',
      mutant: expected.pin,
    },
  };
}

import {
  promotionCampaign,
  promotionCampaignStage,
  promotionFiles,
  promotionReports,
  reconcilePromotionReports,
  reconcilePromotionControls,
} from '../../scripts/release-validation/account-promotion-wrapper.mjs';

function promotionEvidence(originalId = 'ab'.repeat(16), substitutedId = 'cd'.repeat(16)) {
  return {
    current: {
      baseline: 'refused',
      mutant: 'accepted-abandoned-account',
      baselineOk: false,
      mutantOk: true,
      acceptedStatus: 'eligible',
    },
    mac: {
      baseline: 'refused',
      mutant: 'accepted-substituted-intent',
      originalId,
      substitutedId,
      acceptedId: substitutedId,
    },
  };
}

import {
  genesisCampaign,
  genesisCampaignStage,
  genesisFiles,
  genesisReports,
  reconcileGenesisReports,
  reconcileGenesisControls,
  reconcileGenesisHistories,
} from '../../scripts/release-validation/account-genesis-wrapper.mjs';
import { assertHistoricalInputs } from '../../scripts/release-validation/historical-inputs.mjs';

// Synthetic report observations exercise reconciliation, not native cryptographic validity.
function genesisEvidence(digest = '01'.repeat(32), changedDigest = '02'.repeat(32)) {
  const original = {
    v: 1,
    kind: 'promotion-genesis-candidate',
    generation: 1,
    proposedEpoch: 1,
    checkpoint: { v: 1, salt: '00'.repeat(16), nonce: '00'.repeat(12), ct: '01'.repeat(32) },
    wraps: [
      { recipient: 'device', id: 'device' },
      { recipient: 'recovery', id: 'recovery', enc: '01'.repeat(32), ct: '02'.repeat(48) },
    ],
    signature: '01'.repeat(64),
  };
  const report = (control) => ({
    control,
    baseline: 'refused',
    observed: 'forged artifact accepted with semantic refusal disabled',
    original: structuredClone(original),
    candidate: { ...structuredClone(original), signature: '02'.repeat(64) },
  });
  const snapshot = report('snapshot'),
    wrap = report('wrap');
  snapshot.candidate.checkpoint.ct = '02'.repeat(32);
  snapshot.semantic = { expectedSha256: digest, actualSha256: changedDigest };
  wrap.candidate.wraps[1].ct = '03'.repeat(48);
  wrap.semantic = { oracle: 'refused' };
  return { snapshot, wrap };
}
function genesisHistories() {
  return {
    seed: 9222026,
    numRuns: 40,
    histories: Array.from({ length: 40 }, (_, i) => ({
      ops: [{ at: i, remove: i % 7, insert: 'text' + i, disk: i % 2 === 0 }],
      reverse: i % 2 === 0,
      abort: i % 3 === 0,
      restart: i % 4 === 0,
      forgery: ['snapshot', 'wrap', 'coverage', 'recipient', 'actor'][i % 5],
      status: 'passed',
    })),
  };
}

import {
  admissionCampaign,
  admissionCampaignStage,
  admissionFiles,
  admissionReports,
  reconcileAdmissionReports,
  reconcileAdmissionControls,
  reconcileAdmissionHistories,
} from '../../scripts/release-validation/account-admission-wrapper.mjs';

// Synthetic report observations; cryptographic and database validity belong to the native/service tests.
function admissionEvidence(digest = '01'.repeat(32), accountId = 'A'.repeat(43)) {
  const result = {
    v: 2,
    kind: 'promotion-receipt',
    signature: '01'.repeat(64),
    offer: {
      kind: 'promotion-offer',
      head: '02'.repeat(32),
      epoch: {
        kind: 'first-authorization-epoch',
        epoch: 1,
        generation: 1,
        accountId,
        requestDigest: digest,
      },
    },
    activation: { context: { accountId, requestDigest: digest, offerHead: '02'.repeat(32) } },
  };
  const gate = (name) => ({
    gate: name,
    baseline: 'refused',
    baselineOk: false,
    accountState: 'active',
    observed: 'account activated after approval verification removed',
    expectedAccountId: accountId,
    requestDigest: digest,
    originalSignature: '01'.repeat(64),
    approvalSignature: '00'.repeat(64),
    result: structuredClone(result),
  });
  const accepted = { ...structuredClone(result), signature: '00'.repeat(64) };
  return {
    origin: gate('origin'),
    certification: gate('certification'),
    receipt: {
      baseline: 'refused',
      beforeStage: 'admission-offered',
      afterStage: 'admission-receipted',
      observed: 'invalid service receipt retained with verification disabled',
      accepted,
      retained: structuredClone(accepted),
    },
  };
}
function admissionHistories(commands = ['offer', 'finish']) {
  // Independent closed-form event ordering; the adapter uses a transition fold.
  const firstOffer = commands.indexOf('offer'),
    abandon = commands.indexOf('abandon');
  const activation = commands.findIndex(
    (c, i) => c === 'finish' && firstOffer >= 0 && i > firstOffer,
  );
  const state =
    activation >= 0 && (abandon < 0 || activation < abandon)
      ? 'active'
      : abandon >= 0
        ? 'cancelled'
        : firstOffer >= 0
          ? 'offered'
          : 'pending';
  return {
    service: {
      seed: 9232026,
      histories: Array.from({ length: 80 }, () => ({ commands: [...commands], state })),
    },
    native: {
      seed: 9242026,
      histories: Array.from({ length: 30 }, (_, i) => ({
        ops: [{ at: i, remove: i % 6, insert: 'text' + i, disk: i % 2 === 0 }],
        reverse: i % 2 === 0,
        fault: [
          'none',
          'lost-begin',
          'lost-finish',
          'admission-requested',
          'admission-offered',
          'admission-receipted',
          'changed-offer',
        ][i % 7],
        retries: 1 + (i % 3),
        status: 'passed',
      })),
    },
  };
}

test('handoff wrapper preserves grouped cases and aliases only its exact command', () => {
  const inventory = JSON.parse(readFileSync('docs/release-validation-graph.json'));
  const plan = compileManifest(process.cwd(), inventory);
  const [stage, ...rest] = selectStages(plan, 'wrapper-account-handoff');
  assert.deepEqual(rest, []);
  assert.deepEqual(stage.argv, ['node', handoffCampaign]);
  assert.equal(stage.expect.cases.length, 21);
  assert.deepEqual([...new Set(stage.expect.cases.map((c) => c.id.split('::')[0]))], handoffFiles);
  assert.deepEqual(stage.fileOutputs.required, handoffReports);
  assert.deepEqual(
    stage.expect.historyInputs.map(({ reference, path }) => [reference, path]),
    [['beed8cf', 'src/crdt/promotionRecord.ts']],
  );
  assertHistoricalInputs(process.cwd(), stage.expect.historyInputs);
  assert.throws(
    () =>
      assertHistoricalInputs(
        process.cwd(),
        stage.expect.historyInputs.map((p) => ({ ...p, sha256: '0'.repeat(64) })),
      ),
    /Historical source changed/,
  );
  assert(plan.rows.some((r) => r.kind === 'command' && r.requires?.includes(stage.id)));
  const changed = structuredClone(inventory);
  changed.extraRoots.push({
    id: 'handoff-filter',
    argv: ['node', handoffCampaign, '--case', 'native'],
  });
  assert(
    compileManifest(process.cwd(), changed).rows.find((r) => r.id === 'command:handoff-filter:0')
      .blocked,
  );
  assert.throws(() => selectStages(plan, 'release'), /Unresolved/);
});

test('handoff wrapper refuses weaker result, output and browser contracts', () => {
  const stage = handoffCampaignStage(process.cwd());
  validateStage(stage);
  for (const extra of [
    { expect: { kind: 'exit', exitCodes: [0] } },
    { expect: { ...stage.expect, kind: 'cases' } },
    { variant: 'current' },
    { argv: [...stage.argv, '--changed'] },
    { env: { MODE: 'changed' } },
    { fileOutputs: undefined },
    { fixture: undefined },
    { fixture: { kind: 'chromium-inherited-profiles', startupMs: 15000 } },
    { deadlineMs: 180001 },
    { graceMs: 5001 },
    { expect: { ...stage.expect, historyInputs: undefined } },
    { expect: { ...stage.expect, historyInputs: [] } },
    {
      expect: {
        ...stage.expect,
        historyInputs: [...stage.expect.historyInputs, ...stage.expect.historyInputs],
      },
    },
    {
      expect: {
        ...stage.expect,
        historyInputs: stage.expect.historyInputs.map((p) => ({ ...p, reference: p.revision })),
      },
    },
  ])
    assert.throws(() => validateStage({ ...stage, ...extra }));
});

import {
  handoffCampaign,
  handoffCampaignStage,
  handoffFiles,
  handoffReports,
  reconcileHandoffReports,
  reconcileHandoffControls,
  reconcileHandoffDer,
  reconcileHandoffHistories,
} from '../../scripts/release-validation/account-handoff-wrapper.mjs';
const handoffServiceKey = generateKeyPairSync('ed25519');
const handoffOriginalKey = generateKeyPairSync('ed25519');
const handoffSubstitutedKey = generateKeyPairSync('ed25519');
const handoffDerKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const spkiEvidence = (key) => key.publicKey.export({ format: 'der', type: 'spki' }).toString('hex');
function handoffEvidence(principal = '01'.repeat(16)) {
  const proof = (publicKey) => {
    const binding = {
      v: 1,
      epoch: 1,
      accountId: 'A'.repeat(43),
      principalId: principal,
      rpId: 'localhost',
      credId: 'credential',
      publicKey,
    };
    const message = [
      'done/slotbind/v1',
      1,
      binding.accountId,
      principal,
      'localhost',
      1,
      'credential',
      publicKey,
    ]
      .map((v) => Buffer.from(String(v)))
      .map((b) => Buffer.concat([Buffer.from([b.length >> 8, b.length & 255]), b]));
    return {
      v: 1,
      kind: 'promotion-slot-binding',
      requestDigest: '01'.repeat(32),
      epochHead: '02'.repeat(32),
      stored: {
        binding,
        bindingSignature: sign(null, Buffer.concat(message), handoffServiceKey.privateKey).toString(
          'hex',
        ),
      },
    };
  };
  const expected = {
    slotId: 'slot',
    accountId: 'A'.repeat(43),
    principalId: principal,
    workspaceId: '03'.repeat(16),
  };
  const accepted = {
    ...expected,
    kind: 'account-selected',
    dbName: 'destination',
    epochHead: '02'.repeat(32),
  };
  return {
    credential: {
      baseline: 'substituted credential refused',
      baselineOk: false,
      authRoot: spkiEvidence(handoffServiceKey).slice(-64),
      original: proof(spkiEvidence(handoffOriginalKey)),
      substitutedKey: spkiEvidence(handoffSubstitutedKey),
      accepted: proof(spkiEvidence(handoffSubstitutedKey)),
    },
    passkey: {
      baseline: 'invalid signature refused',
      baselineUnchanged: true,
      signature: '00'.repeat(64),
      expected,
      accepted,
      classified: { ...accepted, kind: 'account' },
    },
  };
}
function handoffHistories(commands = ['activate', 'issue']) {
  return {
    service: {
      seed: 9252026,
      histories: Array.from({ length: 60 }, () => ({
        commands: [...commands],
        activated: commands.includes('activate'),
        status: 'passed',
      })),
    },
    native: {
      seed: 9272026,
      histories: Array.from({ length: 24 }, () => ({
        ops: [{ at: 4, remove: 0, insert: 'x', disk: false }],
        reverse: false,
        fault: 'none',
        retries: 1,
        status: 'passed',
      })),
    },
  };
}
function handoffDerEvidence(message = Buffer.from('evidence')) {
  const row = {
    message: message.toString('hex'),
    der: sign('sha256', message, handoffDerKey.privateKey).toString('hex'),
  };
  return {
    seed: 9262026,
    publicKey: spkiEvidence(handoffDerKey),
    cases: Array.from({ length: 200 }, () => ({ ...row })),
  };
}

test('handoff reports require successful complete output, exact source pins and signed evidence', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'done-handoff-reports-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const controls = handoffEvidence(),
    histories = handoffHistories();
  const sources = [
    'package.json',
    'src/crdt/example.ts',
    'src/lib/example.tsx',
    'src/account/slotUnlock.ts',
    'src/account/es256Signature.ts',
    'test/slotUnlock.test.ts',
    'test/account-handoff/core.test.mjs',
    'test/account-admission/fixtures.mjs',
    'test/account-genesis/oracle.mjs',
    'test/account-authority/fixtures.mjs',
    'docs/account-handoff.md',
    'docs/account-admission.md',
    handoffCampaign,
  ].map((path) => ({ path, sha256: 'a'.repeat(64) }));
  const good = {
    'summary.json': {
      status: 'passed',
      code: 0,
      timedOut: false,
      startedAt: '2026-09-15T00:00:00.000Z',
      completedAt: '2026-09-15T00:00:01.000Z',
    },
    'sources.json': sources,
    'control-credential.json': controls.credential,
    'control-passkey.json': controls.passkey,
    'generated-der.json': handoffDerEvidence(),
    'generated-service.json': histories.service,
    'generated-native.json': histories.native,
  };
  const save = (r) => {
    for (const [file, value] of Object.entries(r))
      writeFileSync(join(directory, file), JSON.stringify(value));
    for (const file of ['results.xml', 'run.log'])
      writeFileSync(join(directory, file), 'auxiliary');
  };
  save(good);
  reconcileHandoffReports(directory, [
    ...sources,
    { path: 'unrelated.txt', sha256: 'b'.repeat(64) },
  ]);
  for (const change of [
    (r) => (r['summary.json'].status = 'failed'),
    (r) => (r['summary.json'].code = 1),
    (r) => (r['summary.json'].timedOut = true),
    (r) => (r['summary.json'].completedAt = '2026-09-14T00:00:00.000Z'),
    (r) => r['sources.json'].pop(),
    (r) => (r['sources.json'][0].sha256 = 'b'.repeat(64)),
    (r) => r['sources.json'].push(r['sources.json'][0]),
    (r) => (r['control-credential.json'].baselineOk = true),
    (r) => (r['control-passkey.json'].classified.dbName = 'other'),
    (r) => (r['generated-der.json'].cases[0].der = '00'.repeat(70)),
    (r) => (r['generated-service.json'].histories[0].activated = false),
    (r) => r['generated-native.json'].histories.pop(),
  ]) {
    const bad = structuredClone(good);
    change(bad);
    save(bad);
    assert.throws(() => reconcileHandoffReports(directory, sources));
  }
  for (const file of handoffReports) {
    save(good);
    rmSync(join(directory, file));
    assert.throws(() => reconcileHandoffReports(directory, sources));
  }
});

test('80 generated handoff control sets distinguish substituted keys, signature corruption and route mismatches', () => {
  fc.assert(
    fc.property(fc.uint8Array({ minLength: 16, maxLength: 16 }), (bytes) => {
      const good = handoffEvidence(Buffer.from(bytes).toString('hex'));
      reconcileHandoffControls(good.credential, good.passkey);
      for (const change of [
        (r) => (r.credential.baselineOk = true),
        (r) => (r.credential.authRoot = '00'.repeat(32)),
        (r) => (r.credential.original.stored.bindingSignature = '00'.repeat(64)),
        (r) => (r.credential.accepted.stored.bindingSignature = '00'.repeat(64)),
        (r) => (r.credential.substitutedKey = r.credential.original.stored.binding.publicKey),
        (r) => (r.credential.accepted.requestDigest = '03'.repeat(32)),
        (r) => (r.passkey.baselineUnchanged = false),
        (r) => (r.passkey.signature = '01'.repeat(64)),
        (r) => (r.passkey.expected.slotId = 'other'),
        (r) => (r.passkey.accepted.kind = 'local'),
        (r) => (r.passkey.classified.dbName = 'other'),
        (r) => (r.passkey.classified.epochHead = '03'.repeat(32)),
      ]) {
        const bad = structuredClone(good);
        change(bad);
        assert.throws(() => reconcileHandoffControls(bad.credential, bad.passkey));
      }
    }),
    { seed: 150941, numRuns: 80 },
  );
});

test('80 generated DER reports and 160 histories reject signature, completion and activation faults', () => {
  fc.assert(
    fc.property(fc.uint8Array({ maxLength: 1024 }), (bytes) => {
      const good = handoffDerEvidence(Buffer.from(bytes));
      reconcileHandoffDer(good);
      for (const change of [
        (r) => r.seed++,
        (r) => r.cases.pop(),
        (r) => (r.cases[0].message += '00'),
        (r) => (r.cases[0].der = '00'.repeat(70)),
        (r) => (r.publicKey = spkiEvidence(handoffOriginalKey)),
      ]) {
        const bad = structuredClone(good);
        change(bad);
        assert.throws(() => reconcileHandoffDer(bad));
      }
    }),
    { seed: 150942, numRuns: 80 },
  );
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom('issue', 'activate', 'restart', 'wrong'), {
        minLength: 2,
        maxLength: 14,
      }),
      (commands) => {
        const good = handoffHistories(commands);
        reconcileHandoffHistories(good.service, good.native);
        for (const change of [
          (r) => r.service.seed++,
          (r) => r.service.histories.pop(),
          (r) => (r.service.histories[0].activated = !r.service.histories[0].activated),
          (r) => r.service.histories[0].commands.push('unknown'),
          (r) => (r.service.histories[0].status = 'failed'),
          (r) => r.native.histories.pop(),
          (r) => (r.native.histories[0].status = 'failed'),
          (r) => (r.native.histories[0].fault = 'unknown'),
          (r) => (r.native.histories[0].ops[0].insert = ''),
          (r) => (r.native.histories[0].retries = 4),
        ]) {
          const bad = structuredClone(good);
          change(bad);
          assert.throws(() => reconcileHandoffHistories(bad.service, bad.native));
        }
      },
    ),
    { seed: 150943, numRuns: 160 },
  );
});

test('admission wrapper preserves grouped cases and aliases only its exact command', () => {
  const inventory = JSON.parse(readFileSync('docs/release-validation-graph.json'));
  const plan = compileManifest(process.cwd(), inventory);
  const [stage, ...rest] = selectStages(plan, 'wrapper-account-admission');
  assert.deepEqual(rest, []);
  assert.deepEqual(stage.argv, ['node', admissionCampaign]);
  assert.equal(stage.expect.cases.length, 34);
  assert.deepEqual(
    [...new Set(stage.expect.cases.map((c) => c.id.split('::')[0]))],
    admissionFiles,
  );
  assert.deepEqual(stage.fileOutputs.required, admissionReports);
  assert.deepEqual(
    stage.expect.historyInputs.map(({ reference, path }) => [reference, path]),
    [['280f616', 'src/crdt/promotionRecord.ts']],
  );
  assertHistoricalInputs(process.cwd(), stage.expect.historyInputs);
  assert.throws(
    () =>
      assertHistoricalInputs(
        process.cwd(),
        stage.expect.historyInputs.map((p) => ({ ...p, sha256: '0'.repeat(64) })),
      ),
    /Historical source changed/,
  );
  assert(plan.rows.some((r) => r.kind === 'command' && r.requires?.includes(stage.id)));
  const changed = structuredClone(inventory);
  changed.extraRoots.push({
    id: 'admission-filter',
    argv: ['node', admissionCampaign, '--case', 'native'],
  });
  assert(
    compileManifest(process.cwd(), changed).rows.find((r) => r.id === 'command:admission-filter:0')
      .blocked,
  );
  assert.throws(() => selectStages(plan, 'release'), /Unresolved/);
});

test('admission wrapper refuses weaker result, output and browser contracts', () => {
  const stage = admissionCampaignStage(process.cwd());
  validateStage(stage);
  for (const extra of [
    { expect: { kind: 'exit', exitCodes: [0] } },
    { expect: { ...stage.expect, kind: 'cases' } },
    { variant: 'current' },
    { argv: [...stage.argv, '--changed'] },
    { env: { MODE: 'changed' } },
    { fileOutputs: undefined },
    { fixture: undefined },
    { fixture: { kind: 'chromium-inherited-profiles', startupMs: 15000 } },
    { deadlineMs: 180001 },
    { graceMs: 5001 },
    { expect: { ...stage.expect, historyInputs: undefined } },
    { expect: { ...stage.expect, historyInputs: [] } },
    {
      expect: {
        ...stage.expect,
        historyInputs: [...stage.expect.historyInputs, ...stage.expect.historyInputs],
      },
    },
    {
      expect: {
        ...stage.expect,
        historyInputs: stage.expect.historyInputs.map((p) => ({ ...p, reference: p.revision })),
      },
    },
  ])
    assert.throws(() => validateStage({ ...stage, ...extra }));
});

test('admission reports require complete successful output and exact wrapper source pins', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'done-admission-report-control-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const controls = admissionEvidence();
  const sources = [
    { path: 'package.json', sha256: 'a'.repeat(64) },
    { path: 'src/crdt/example.ts', sha256: 'b'.repeat(64) },
    { path: 'wasm/journal-seal/seal.generated.ts', sha256: 'c'.repeat(64) },
    ...[
      'src/account/recoveryOwner.ts',
      'test/account-authority/browser.ts',
      'test/account-core/fixtures.mjs',
      'test/account-core/worker.mjs',
      'test/account-recovery/fixtures.mjs',
      'test/account-promotion/fixtures.mjs',
      'test/account-promotion/browser.ts',
      'src/account/generationWrap.ts',
      'test/vectors/package.json',
      'src/lib/example.tsx',
      'docs/account-admission.md',
      'test/account-authority/fixtures.mjs',
      'test/account-genesis/oracle.mjs',
    ].map((path) => ({ path, sha256: 'e'.repeat(64) })),
  ];
  const good = {
    'summary.json': {
      status: 'passed',
      code: 0,
      timedOut: false,
      startedAt: '2026-09-15T00:00:00.000Z',
      completedAt: '2026-09-15T00:00:01.000Z',
    },
    'sources.json': sources,
    'control-origin.json': controls.origin,
    'control-certification.json': controls.certification,
    'control-receipt.json': controls.receipt,
    'generated-service.json': admissionHistories().service,
    'generated-native.json': admissionHistories().native,
  };
  const save = (reports) => {
    for (const [file, value] of Object.entries(reports))
      writeFileSync(join(directory, file), JSON.stringify(value));
    for (const file of ['results.xml', 'run.log'])
      writeFileSync(join(directory, file), 'auxiliary evidence');
  };
  save(good);
  reconcileAdmissionReports(directory, sources);
  const faults = [
    (r) => {
      r['summary.json'].status = 'failed';
    },
    (r) => {
      r['summary.json'].code = 1;
    },
    (r) => {
      r['summary.json'].timedOut = true;
    },
    (r) => {
      r['summary.json'].launchError = 'error';
    },
    (r) => {
      r['summary.json'].completedAt = 'invalid';
    },
    (r) => {
      r['sources.json'] = [];
    },
    (r) => {
      r['sources.json'].pop();
    },
    (r) => {
      r['sources.json'][1].sha256 = 'd'.repeat(64);
    },
    (r) => {
      r['sources.json'].push(r['sources.json'][0]);
    },
    (r) => {
      r['control-origin.json'].baseline = 'accepted';
    },
    (r) => {
      r['control-receipt.json'].afterStage = 'admission-offered';
    },
  ];
  for (const fault of faults) {
    const bad = structuredClone(good);
    fault(bad);
    save(bad);
    assert.throws(() => reconcileAdmissionReports(directory, sources));
  }
  for (const file of admissionReports) {
    save(good);
    rmSync(join(directory, file));
    assert.throws(() => reconcileAdmissionReports(directory, sources));
  }
});

test('100 generated admission control sets reject ineffective approval and receipt faults', () => {
  fc.assert(
    fc.property(fc.uint8Array({ minLength: 32, maxLength: 32 }), (bytes) => {
      const good = admissionEvidence(
        Buffer.from(bytes).toString('hex'),
        Buffer.from(bytes).toString('base64url'),
      );
      reconcileAdmissionControls(good.origin, good.certification, good.receipt);
      const faults = [
        (r) => {
          r.origin.baselineOk = true;
        },
        (r) => {
          r.certification.accountState = 'pending';
        },
        (r) => {
          r.origin.approvalSignature = r.origin.originalSignature;
        },
        (r) => {
          r.certification.originalSignature = '00'.repeat(64);
        },
        (r) => {
          r.origin.expectedAccountId += 'A';
        },
        (r) => {
          r.certification.requestDigest = 'ab';
        },
        (r) => {
          r.origin.result.activation.context.requestDigest = 'ab'.repeat(32) + 'cd';
        },
        (r) => {
          r.certification.result.activation.context.offerHead = '00';
        },
        (r) => {
          r.receipt.accepted.signature = '01'.repeat(64);
        },
        (r) => {
          r.receipt.beforeStage = 'admission-receipted';
        },
        (r) => {
          r.receipt.afterStage = 'admission-offered';
        },
        (r) => {
          r.receipt.retained.signature = '01'.repeat(64);
        },
      ];
      for (const fault of faults) {
        const bad = structuredClone(good);
        fault(bad);
        assert.throws(() => reconcileAdmissionControls(bad.origin, bad.certification, bad.receipt));
      }
    }),
    { seed: 150939, numRuns: 100 },
  );
});

test('160 generated admission histories match event ordering and reject incomplete or inconsistent reports', () => {
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom('offer', 'finish', 'restart', 'abandon', 'wrong'), {
        minLength: 2,
        maxLength: 15,
      }),
      fc.integer({ min: 0, max: 29 }),
      (commands, i) => {
        const good = admissionHistories(commands);
        reconcileAdmissionHistories(good.service, good.native);
        const faults = [
          (r) => {
            r.service.histories.pop();
          },
          (r) => {
            r.service.histories[i].state =
              r.service.histories[i].state === 'active' ? 'pending' : 'active';
          },
          (r) => {
            r.service.histories[i].commands[0] = 'unknown';
          },
          (r) => {
            r.native.histories.splice(i, 1);
          },
          (r) => {
            r.native.histories[i].status = 'failed';
          },
          (r) => {
            r.native.histories[i].ops[0].at = 81;
          },
          (r) => {
            r.native.histories[i].ops[0].remove = 6;
          },
          (r) => {
            r.native.histories[i].ops[0].insert = '';
          },
          (r) => {
            r.native.histories[i].retries = 0;
          },
          (r) => {
            r.native.histories[i].fault = 'unknown';
          },
        ];
        for (const fault of faults) {
          const bad = structuredClone(good);
          fault(bad);
          assert.throws(() => reconcileAdmissionHistories(bad.service, bad.native));
        }
      },
    ),
    { seed: 150940, numRuns: 160 },
  );
});

test('genesis wrapper preserves grouped cases and aliases only its exact command', () => {
  const inventory = JSON.parse(readFileSync('docs/release-validation-graph.json'));
  const plan = compileManifest(process.cwd(), inventory);
  const [stage, ...rest] = selectStages(plan, 'wrapper-account-genesis');
  assert.deepEqual(rest, []);
  assert.deepEqual(stage.argv, ['node', genesisCampaign]);
  assert.equal(stage.expect.cases.length, 17);
  assert.deepEqual([...new Set(stage.expect.cases.map((c) => c.id.split('::')[0]))], genesisFiles);
  assert.deepEqual(stage.fileOutputs.required, genesisReports);
  assert.deepEqual(
    stage.expect.historyInputs.map(({ reference, path }) => [reference, path]),
    [['a4e1c15', 'src/crdt/promotionRecord.ts']],
  );
  assertHistoricalInputs(process.cwd(), stage.expect.historyInputs);
  assert.throws(
    () =>
      assertHistoricalInputs(
        process.cwd(),
        stage.expect.historyInputs.map((p) => ({ ...p, sha256: '0'.repeat(64) })),
      ),
    /Historical source changed/,
  );
  assert(plan.rows.some((r) => r.kind === 'command' && r.requires?.includes(stage.id)));
  const changed = structuredClone(inventory);
  changed.extraRoots.push({
    id: 'genesis-filter',
    argv: ['node', genesisCampaign, '--case', 'native'],
  });
  assert(
    compileManifest(process.cwd(), changed).rows.find((r) => r.id === 'command:genesis-filter:0')
      .blocked,
  );
  assert.throws(() => selectStages(plan, 'release'), /Unresolved/);
});

test('genesis wrapper refuses weaker result, output and browser contracts', () => {
  const stage = genesisCampaignStage(process.cwd());
  validateStage(stage);
  for (const extra of [
    { expect: { kind: 'exit', exitCodes: [0] } },
    { expect: { ...stage.expect, kind: 'cases' } },
    { variant: 'current' },
    { argv: [...stage.argv, '--changed'] },
    { env: { MODE: 'changed' } },
    { fileOutputs: undefined },
    { fixture: undefined },
    { fixture: { kind: 'chromium-inherited-profiles', startupMs: 15000 } },
    { deadlineMs: 180001 },
    { graceMs: 5001 },
    { expect: { ...stage.expect, historyInputs: undefined } },
    { expect: { ...stage.expect, historyInputs: [] } },
    {
      expect: {
        ...stage.expect,
        historyInputs: [...stage.expect.historyInputs, ...stage.expect.historyInputs],
      },
    },
    {
      expect: {
        ...stage.expect,
        historyInputs: stage.expect.historyInputs.map((p) => ({ ...p, reference: p.revision })),
      },
    },
  ])
    assert.throws(() => validateStage({ ...stage, ...extra }));
});

test('genesis reports require complete successful output and exact wrapper source pins', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'done-genesis-report-control-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const controls = genesisEvidence();
  const sources = [
    { path: 'package.json', sha256: 'a'.repeat(64) },
    { path: 'src/crdt/example.ts', sha256: 'b'.repeat(64) },
    { path: 'wasm/journal-seal/seal.generated.ts', sha256: 'c'.repeat(64) },
    ...[
      'src/account/recoveryOwner.ts',
      'test/account-authority/browser.ts',
      'test/account-core/fixtures.mjs',
      'test/account-core/worker.mjs',
      'test/account-recovery/fixtures.mjs',
      'test/account-promotion/fixtures.mjs',
      'test/account-promotion/browser.ts',
      'src/account/generationWrap.ts',
      'test/vectors/package.json',
      'src/lib/example.tsx',
    ].map((path) => ({ path, sha256: 'e'.repeat(64) })),
  ];
  const good = {
    'summary.json': {
      status: 'passed',
      code: 0,
      timedOut: false,
      startedAt: '2026-09-15T00:00:00.000Z',
      completedAt: '2026-09-15T00:00:01.000Z',
    },
    'sources.json': sources,
    'control-snapshot.json': controls.snapshot,
    'control-wrap.json': controls.wrap,
    'generated.json': genesisHistories(),
  };
  const save = (reports) => {
    for (const [file, value] of Object.entries(reports))
      writeFileSync(join(directory, file), JSON.stringify(value));
    for (const file of ['results.xml', 'run.log'])
      writeFileSync(join(directory, file), 'auxiliary evidence');
  };
  save(good);
  reconcileGenesisReports(directory, sources);
  const faults = [
    (r) => {
      r['summary.json'].status = 'failed';
    },
    (r) => {
      r['summary.json'].code = 1;
    },
    (r) => {
      r['summary.json'].timedOut = true;
    },
    (r) => {
      r['summary.json'].launchError = 'error';
    },
    (r) => {
      r['summary.json'].completedAt = 'invalid';
    },
    (r) => {
      r['sources.json'] = [];
    },
    (r) => {
      r['sources.json'].pop();
    },
    (r) => {
      r['sources.json'][1].sha256 = 'd'.repeat(64);
    },
    (r) => {
      r['sources.json'].push(r['sources.json'][0]);
    },
    (r) => {
      r['control-snapshot.json'].baseline = 'accepted';
    },
    (r) => {
      r['control-wrap.json'].semantic.oracle = 'opened';
    },
  ];
  for (const fault of faults) {
    const bad = structuredClone(good);
    fault(bad);
    save(bad);
    assert.throws(() => reconcileGenesisReports(directory, sources));
  }
  for (const file of genesisReports) {
    save(good);
    rmSync(join(directory, file));
    assert.throws(() => reconcileGenesisReports(directory, sources));
  }
});

test('100 generated genesis control pairs reject missing semantic differences and unrelated changes', () => {
  fc.assert(
    fc.property(fc.uint8Array({ minLength: 32, maxLength: 32 }), (bytes) => {
      const changed = Buffer.from(bytes);
      changed[0] ^= 1;
      const good = genesisEvidence(Buffer.from(bytes).toString('hex'), changed.toString('hex'));
      reconcileGenesisControls(good.snapshot, good.wrap);
      const faults = [
        (r) => {
          r.snapshot.baseline = 'accepted';
        },
        (r) => {
          r.snapshot.semantic.actualSha256 = r.snapshot.semantic.expectedSha256;
        },
        (r) => {
          r.snapshot.candidate.checkpoint = r.snapshot.original.checkpoint;
        },
        (r) => {
          r.snapshot.candidate.generation = 2;
        },
        (r) => {
          r.snapshot.candidate.wraps[0].id = 'other';
        },
        (r) => {
          r.wrap.candidate.wraps[1].ct = r.wrap.original.wraps[1].ct;
        },
        (r) => {
          r.wrap.candidate.wraps[1].id = 'other';
        },
        (r) => {
          r.wrap.candidate.checkpoint.ct = '00';
        },
        (r) => {
          r.wrap.semantic.oracle = 'opened';
        },
        (r) => {
          r.wrap.candidate.signature = r.wrap.original.signature;
        },
        (r) => {
          r.wrap.control = 'snapshot';
        },
        (r) => {
          delete r.wrap.original;
        },
      ];
      for (const fault of faults) {
        const bad = structuredClone(good);
        fault(bad);
        assert.throws(() => reconcileGenesisControls(bad.snapshot, bad.wrap));
      }
    }),
    { seed: 150937, numRuns: 100 },
  );
});

test('160 generated genesis history omissions and corruptions refuse complete-campaign credit', () => {
  const good = genesisHistories();
  reconcileGenesisHistories(good);
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 39 }), fc.integer({ min: 0, max: 9 }), (i, fault) => {
      const bad = structuredClone(good),
        h = bad.histories[i];
      if (fault === 0) bad.histories.splice(i, 1);
      if (fault === 1) h.status = 'failed';
      if (fault === 2) h.ops[0].at = 101;
      if (fault === 3) h.ops[0].remove = -1;
      if (fault === 4) h.ops[0].insert = '';
      if (fault === 5) h.restart = 'false';
      if (fault === 6) h.forgery = 'unknown';
      if (fault === 7) bad.seed++;
      if (fault === 8) bad.numRuns--;
      if (fault === 9) h.ops = [];
      assert.throws(() => reconcileGenesisHistories(bad));
    }),
    { seed: 150938, numRuns: 160 },
  );
});

test('promotion wrapper preserves grouped cases and aliases only its exact command', () => {
  const inventory = JSON.parse(readFileSync('docs/release-validation-graph.json'));
  const plan = compileManifest(process.cwd(), inventory);
  const [stage, ...rest] = selectStages(plan, 'wrapper-account-promotion');
  assert.deepEqual(rest, []);
  assert.deepEqual(stage.argv, ['node', promotionCampaign]);
  assert.equal(stage.expect.cases.length, 18);
  assert.deepEqual(
    [...new Set(stage.expect.cases.map((c) => c.id.split('::')[0]))],
    promotionFiles,
  );
  assert.deepEqual(stage.fileOutputs.required, promotionReports);
  assert(plan.rows.some((r) => r.kind === 'command' && r.requires?.includes(stage.id)));
  const changed = structuredClone(inventory);
  changed.extraRoots.push({
    id: 'promotion-filter',
    argv: ['node', promotionCampaign, '--case', 'native'],
  });
  assert(
    compileManifest(process.cwd(), changed).rows.find((r) => r.id === 'command:promotion-filter:0')
      .blocked,
  );
  assert.throws(() => selectStages(plan, 'release'), /Unresolved/);
});

test('promotion wrapper refuses weaker result, output and browser contracts', () => {
  const stage = promotionCampaignStage(process.cwd());
  validateStage(stage);
  for (const extra of [
    { expect: { kind: 'exit', exitCodes: [0] } },
    { expect: { ...stage.expect, kind: 'cases' } },
    { variant: 'current' },
    { argv: [...stage.argv, '--changed'] },
    { env: { MODE: 'changed' } },
    { fileOutputs: undefined },
    { fixture: undefined },
    { fixture: { kind: 'chromium-inherited-profiles', startupMs: 15000 } },
    { deadlineMs: 120001 },
    { graceMs: 5001 },
  ])
    assert.throws(() => validateStage({ ...stage, ...extra }));
});

test('promotion reports require complete successful output and exact wrapper source pins', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'done-promotion-report-control-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const controls = promotionEvidence();
  const sources = [
    { path: 'package.json', sha256: 'a'.repeat(64) },
    { path: 'src/crdt/example.ts', sha256: 'b'.repeat(64) },
    { path: 'wasm/journal-seal/seal.generated.ts', sha256: 'c'.repeat(64) },
    ...[
      'src/account/recoveryOwner.ts',
      'test/account-authority/browser.ts',
      'test/account-core/fixtures.mjs',
      'test/account-core/worker.mjs',
      'test/account-recovery/fixtures.mjs',
    ].map((path) => ({ path, sha256: 'e'.repeat(64) })),
  ];
  const good = {
    'summary.json': {
      status: 'passed',
      code: 0,
      timedOut: false,
      startedAt: '2026-09-15T00:00:00.000Z',
      completedAt: '2026-09-15T00:00:01.000Z',
    },
    'sources.json': sources,
    'control-current-state.json': controls.current,
    'control-mac.json': controls.mac,
  };
  const save = (reports) => {
    for (const [file, value] of Object.entries(reports))
      writeFileSync(join(directory, file), JSON.stringify(value));
    for (const file of ['results.xml', 'run.log'])
      writeFileSync(join(directory, file), 'auxiliary evidence');
  };
  save(good);
  reconcilePromotionReports(directory, sources);
  const faults = [
    (r) => {
      r['summary.json'].status = 'failed';
    },
    (r) => {
      r['summary.json'].code = 1;
    },
    (r) => {
      r['summary.json'].timedOut = true;
    },
    (r) => {
      r['summary.json'].launchError = 'error';
    },
    (r) => {
      r['summary.json'].completedAt = 'invalid';
    },
    (r) => {
      r['sources.json'] = [];
    },
    (r) => {
      r['sources.json'].pop();
    },
    (r) => {
      r['sources.json'][1].sha256 = 'd'.repeat(64);
    },
    (r) => {
      r['sources.json'].push(r['sources.json'][0]);
    },
    (r) => {
      r['control-current-state.json'].baseline = 'accepted';
    },
    (r) => {
      r['control-mac.json'].acceptedId = r['control-mac.json'].originalId;
    },
  ];
  for (const fault of faults) {
    const bad = structuredClone(good);
    fault(bad);
    save(bad);
    assert.throws(() => reconcilePromotionReports(directory, sources));
  }
  for (const file of promotionReports) {
    save(good);
    rmSync(join(directory, file));
    assert.throws(() => reconcilePromotionReports(directory, sources));
  }
});

test('100 generated promotion control pairs reject ineffective mutations and inconsistent acceptance', () => {
  fc.assert(
    fc.property(fc.uint8Array({ minLength: 16, maxLength: 16 }), (bytes) => {
      const changed = Buffer.from(bytes);
      changed[0] ^= 1;
      const good = promotionEvidence(Buffer.from(bytes).toString('hex'), changed.toString('hex'));
      reconcilePromotionControls(good.current, good.mac);
      const faults = [
        (r) => {
          r.current.baselineOk = true;
        },
        (r) => {
          r.current.mutantOk = false;
        },
        (r) => {
          r.current.acceptedStatus = 'abandoned';
        },
        (r) => {
          r.mac.baseline = 'accepted';
        },
        (r) => {
          r.mac.originalId = r.mac.substitutedId;
        },
        (r) => {
          r.mac.acceptedId = r.mac.originalId;
        },
        (r) => {
          delete r.mac.originalId;
        },
        (r) => {
          r.mac.acceptedId += '00';
        },
      ];
      for (const fault of faults) {
        const bad = structuredClone(good);
        fault(bad);
        assert.throws(() => reconcilePromotionControls(bad.current, bad.mac));
      }
    }),
    { seed: 150936, numRuns: 100 },
  );
});

test('authority wrapper preserves grouped cases and aliases only its exact command', () => {
  const inventory = JSON.parse(readFileSync('docs/release-validation-graph.json'));
  const plan = compileManifest(process.cwd(), inventory);
  const [stage, ...rest] = selectStages(plan, 'wrapper-account-authority');
  assert.deepEqual(rest, []);
  assert.deepEqual(stage.argv, ['node', authorityCampaign]);
  assert.equal(stage.expect.cases.length, 14);
  assert.deepEqual(
    [...new Set(stage.expect.cases.map((c) => c.id.split('::')[0]))],
    authorityFiles,
  );
  assert.deepEqual(stage.fileOutputs.required, authorityReports);
  assert(plan.rows.some((r) => r.kind === 'command' && r.requires?.includes(stage.id)));
  const changed = structuredClone(inventory);
  changed.extraRoots.push({
    id: 'authority-filter',
    argv: ['node', authorityCampaign, '--case', 'native'],
  });
  assert(
    compileManifest(process.cwd(), changed).rows.find((r) => r.id === 'command:authority-filter:0')
      .blocked,
  );
  assert.throws(() => selectStages(plan, 'release'), /Unresolved/);
});

test('authority wrapper refuses weaker result, output and browser contracts', () => {
  const stage = authorityCampaignStage(process.cwd());
  validateStage(stage);
  for (const extra of [
    { expect: { kind: 'exit', exitCodes: [0] } },
    { expect: { ...stage.expect, kind: 'cases' } },
    { variant: 'current' },
    { argv: [...stage.argv, '--changed'] },
    { env: { MODE: 'changed' } },
    { fileOutputs: undefined },
    { fixture: undefined },
    { fixture: { kind: 'chromium-inherited-profiles', startupMs: 15000 } },
    { deadlineMs: 120001 },
    { graceMs: 5001 },
  ])
    assert.throws(() => validateStage({ ...stage, ...extra }));
});

test('authority reports require complete successful output and exact wrapper source pins', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'done-authority-report-control-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const controls = authorityEvidence();
  const sources = [
    { path: 'package.json', sha256: 'a'.repeat(64) },
    { path: 'src/crdt/example.ts', sha256: 'b'.repeat(64) },
    { path: 'wasm/journal-seal/seal.generated.ts', sha256: 'c'.repeat(64) },
  ];
  const good = {
    'summary.json': {
      status: 'passed',
      code: 0,
      timedOut: false,
      startedAt: '2026-09-15T00:00:00.000Z',
      completedAt: '2026-09-15T00:00:01.000Z',
    },
    'sources.json': sources,
    'control-pin.json': controls.pin,
    'control-nonce.json': controls.replay,
  };
  const save = (reports) => {
    for (const [file, value] of Object.entries(reports))
      writeFileSync(join(directory, file), JSON.stringify(value));
    for (const file of ['results.xml', 'run.log'])
      writeFileSync(join(directory, file), 'auxiliary evidence');
  };
  save(good);
  reconcileAuthorityReports(directory, sources);
  const faults = [
    (r) => {
      r['summary.json'].status = 'failed';
    },
    (r) => {
      r['summary.json'].code = 1;
    },
    (r) => {
      r['summary.json'].timedOut = true;
    },
    (r) => {
      r['summary.json'].launchError = 'error';
    },
    (r) => {
      r['summary.json'].completedAt = 'invalid';
    },
    (r) => {
      r['sources.json'] = [];
    },
    (r) => {
      r['sources.json'].pop();
    },
    (r) => {
      r['sources.json'][1].sha256 = 'd'.repeat(64);
    },
    (r) => {
      r['sources.json'].push(r['sources.json'][0]);
    },
    (r) => {
      r['control-pin.json'].baseline = 'accepted';
    },
    (r) => {
      r['control-nonce.json'].mutant = r['control-pin.json'].mutant;
    },
  ];
  for (const fault of faults) {
    const bad = structuredClone(good);
    fault(bad);
    save(bad);
    assert.throws(() => reconcileAuthorityReports(directory, sources));
  }
  for (const file of authorityReports) {
    save(good);
    rmSync(join(directory, file));
    assert.throws(() => reconcileAuthorityReports(directory, sources));
  }
});

test('100 generated signed authority controls distinguish substituted roots and stale challenges', () => {
  fc.assert(
    fc.property(
      fc.uint8Array({ minLength: 16, maxLength: 16 }),
      fc.uint8Array({ minLength: 32, maxLength: 32 }),
      (id, nonce) => {
        const second = Buffer.from(nonce);
        second[0] ^= 1;
        const good = authorityEvidence(
          Buffer.from(id).toString('hex'),
          Buffer.from(nonce).toString('hex'),
          second.toString('hex'),
        );
        reconcileAuthorityControls(good.pin, good.replay);
        const faults = [
          (r) => {
            r.pin.expected = r.pin.proof.pin;
          },
          (r) => {
            r.replay.requestedNonce = r.replay.proof.nonce;
          },
          (r) => {
            r.pin.nonce = second.toString('hex');
          },
          (r) => {
            r.replay.expected = r.pin.proof.pin;
          },
          (r) => {
            r.pin.proof.signature = '00'.repeat(64);
          },
          (r) => {
            r.replay.proof.nonce = second.toString('hex');
          },
          (r) => {
            r.pin.proof.signature = r.replay.proof.signature;
          },
          (r) => {
            r.pin.mutant = r.pin.expected;
          },
          (r) => {
            r.replay.baseline = 'accepted';
          },
          (r) => {
            r.pin.proof.v = 2;
          },
        ];
        for (const fault of faults) {
          const bad = structuredClone(good);
          fault(bad);
          assert.throws(() => reconcileAuthorityControls(bad.pin, bad.replay));
        }
      },
    ),
    { seed: 150935, numRuns: 100 },
  );
});
import {
  recoveryCampaign,
  recoveryCampaignStage,
  recoveryFiles,
  recoveryReports,
  reconcileRecoveryReports,
  reconcileRecoveryProfiles,
} from '../../scripts/release-validation/account-recovery-wrapper.mjs';

const recoveryOwner = { custodyOutput: '/owned/custody', browserExecutable: '/pinned/chromium' };
function profileRecords(pids = [101, 102, 103], owner = recoveryOwner) {
  const profile = join(owner.custodyOutput, 'recovery', 'profiles', 'source-false');
  return pids.map((pid, i) => ({
    pid,
    workerPid: 10,
    name: 'source-false',
    profile,
    executable: owner.browserExecutable,
    ownership: 'inherited-worker-group',
    closed: true,
    exit: 0,
    signal: null,
    ...(i ? { reopen: { priorPid: pids[i - 1], ordinal: i } } : {}),
    argv: [
      '--use-mock-keychain',
      '--password-store=basic',
      '--remote-debugging-port=0',
      '--user-data-dir=' + profile,
    ],
    endpoint: 'ws://127.0.0.1:12345/devtools/browser/11111111-1111-1111-1111-111111111111',
  }));
}

test('recovery wrapper preserves its complete grouped selection and exact command identity', () => {
  const inventory = JSON.parse(readFileSync('docs/release-validation-graph.json'));
  const plan = compileManifest(process.cwd(), inventory);
  const [stage, ...rest] = selectStages(plan, 'wrapper-account-recovery');
  assert.deepEqual(rest, []);
  assert.deepEqual(stage.argv, ['node', recoveryCampaign]);
  assert.deepEqual([...new Set(stage.expect.cases.map((c) => c.id.split('::')[0]))], recoveryFiles);
  assert.equal(stage.expect.cases.length, 25);
  assert.deepEqual(stage.fileOutputs.required, recoveryReports);
  assert(plan.rows.some((r) => r.kind === 'command' && r.requires?.includes(stage.id)));
  const changed = structuredClone(inventory);
  changed.extraRoots.push({
    id: 'recovery-filter',
    argv: ['node', recoveryCampaign, '--case', 'native'],
  });
  const variants = compileManifest(process.cwd(), changed);
  assert(variants.rows.find((r) => r.id === 'command:recovery-filter:0').blocked);
  assert.throws(() => selectStages(plan, 'release'), /Unresolved/);
});

test('recovery wrapper refuses weaker result, report and persistent-browser contracts', () => {
  const stage = recoveryCampaignStage(process.cwd());
  validateStage(stage);
  for (const extra of [
    { expect: { kind: 'exit', exitCodes: [0] } },
    { expect: { ...stage.expect, kind: 'cases' } },
    { variant: 'node-inherited-chromium-v1' },
    { argv: [...stage.argv, '--changed'] },
    { env: { MODE: 'changed' } },
    { fileOutputs: undefined },
    { fixture: undefined },
    { fixture: { kind: 'chromium-cdp', startupMs: 15000 } },
    { deadlineMs: 120001 },
    { graceMs: 5001 },
  ])
    assert.throws(() => validateStage({ ...stage, ...extra }));
});

test('recovery evidence requires both factor controls, a substituted sealed root and bound source reports', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'done-recovery-report-control-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sources = [{ path: 'package.json', sha256: 'a'.repeat(64) }];
  const good = {
    'summary.json': {
      status: 'passed',
      code: 0,
      timedOut: false,
      startedAt: '2026-09-15T00:00:00.000Z',
      completedAt: '2026-09-15T00:00:01.000Z',
    },
    'sources.json': sources,
    'control-root.json': {
      original: {
        authRoot: 'ab'.repeat(32),
        rootCommitment: 'cd'.repeat(32),
        envelope: { ct: 'ef' },
      },
      draft: { authRoot: '12'.repeat(32), rootCommitment: '34'.repeat(32), envelope: { ct: 'ef' } },
      result: { stage: 'recovery-confirmed' },
    },
    'recovery-profiles.json': profileRecords(),
    ...Object.fromEntries(
      ['recovery', 'passkey'].flatMap((gate) => [
        [`control-${gate}-baseline.json`, { result: { refusal: 'invalid-proof' } }],
        [`control-${gate}-mutant.json`, { result: { stage: 'recovery-confirmed' } }],
      ]),
    ),
  };
  const save = (reports) => {
    for (const [file, value] of Object.entries(reports))
      writeFileSync(join(directory, file), JSON.stringify(value));
    for (const file of ['results.xml', 'run.log'])
      writeFileSync(join(directory, file), 'auxiliary evidence');
  };
  save(good);
  reconcileRecoveryReports(directory, sources, recoveryOwner);
  const faults = [
    (r) => {
      r['summary.json'].status = 'failed';
    },
    (r) => {
      r['summary.json'].code = 1;
    },
    (r) => {
      r['summary.json'].timedOut = true;
    },
    (r) => {
      r['summary.json'].launchError = 'error';
    },
    (r) => {
      r['summary.json'].completedAt = 'invalid';
    },
    (r) => {
      r['sources.json'] = [];
    },
    (r) => {
      r['sources.json'][0].sha256 = 'b'.repeat(64);
    },
    (r) => {
      r['sources.json'].push(r['sources.json'][0]);
    },
    (r) => {
      r['control-root.json'].result.stage = 'refused';
    },
    (r) => {
      r['control-root.json'].draft.authRoot = r['control-root.json'].original.authRoot;
    },
    (r) => {
      r['control-root.json'].draft.rootCommitment = r['control-root.json'].original.rootCommitment;
    },
    (r) => {
      r['control-root.json'].draft.envelope.ct = 'different';
    },
    ...['recovery', 'passkey'].flatMap((gate) => [
      (r) => {
        r[`control-${gate}-baseline.json`].result = { stage: 'recovery-confirmed' };
      },
      (r) => {
        r[`control-${gate}-mutant.json`].result = { refusal: 'invalid-proof' };
      },
    ]),
  ];
  for (const fault of faults) {
    const bad = structuredClone(good);
    fault(bad);
    save(bad);
    assert.throws(() => reconcileRecoveryReports(directory, sources, recoveryOwner));
  }
  for (const file of recoveryReports) {
    save(good);
    rmSync(join(directory, file));
    assert.throws(() => reconcileRecoveryReports(directory, sources, recoveryOwner));
  }
});

test('100 generated persistent-profile histories preserve one profile and refuse broken lifetime chains', () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 100, max: 1000000 }), { minLength: 3, maxLength: 3 }),
      fc.integer({ min: 1, max: 100000 }),
      (pids, directory) => {
        const owner = { ...recoveryOwner, custodyOutput: '/owned/' + directory };
        const good = profileRecords(pids, owner);
        reconcileRecoveryProfiles(good, owner);
        const faults = [
          (r) => r.pop(),
          (r) => r.reverse(),
          (r) => {
            r[2].pid = r[0].pid;
          },
          (r) => {
            r[1].workerPid++;
          },
          (r) => {
            r[1].profile += '-foreign';
          },
          (r) => {
            r[1].executable += '-foreign';
          },
          (r) => {
            r[1].closed = false;
          },
          (r) => {
            r[1].exit = 1;
          },
          (r) => {
            r[1].copy = {};
          },
          (r) => {
            r[1].argv = [];
          },
          (r) => {
            r[1].endpoint = 'ws://external.invalid:123/browser';
          },
          (r) => {
            r[1].reopen.ordinal = 2;
          },
          (r) => {
            r[1].reopen.priorPid = r[2].pid;
          },
          (r) => {
            r[0].reopen = { priorPid: r[2].pid, ordinal: 0 };
          },
        ];
        for (const fault of faults) {
          const bad = structuredClone(good);
          fault(bad);
          assert.throws(() => reconcileRecoveryProfiles(bad, owner));
        }
      },
    ),
    { seed: 150934, numRuns: 100 },
  );
});

test('preparation wrappers retain grouped Node execution and vector aliases share only exact invocations', () => {
  const inventory = JSON.parse(readFileSync('docs/release-validation-graph.json'));
  const plan = compileManifest(process.cwd(), inventory);
  const selected = selectStages(plan, 'wrapper-preparation');
  assert.equal(selected.length, 31);
  assert.equal(selected.filter((s) => s.id.startsWith('vector:')).length, 29);
  assert.equal(new Set(selected.map((s) => digest(s.argv))).size, selected.length);
  const tests = selected.find((s) => s.variant === 'crypto-preparation-tests-v1');
  assert.equal(tests.expect.cases.length, 6);
  assert.equal(tests.argv.includes('--test-concurrency=1'), false);
  assert.deepEqual(tests.dependsOn, ['campaign:' + preparationCampaign]);
  assert.throws(() => selectStages(plan, 'release'), /Unresolved/);
  const changed = structuredClone(inventory);
  changed.extraRoots.push(
    { id: 'vector-variant', argv: [...inventory.vectors[0].argv, '--changed'] },
    { id: 'prep-record', argv: ['node', preparationCampaign, '--record'] },
  );
  const variants = compileManifest(process.cwd(), changed);
  for (const id of ['command:vector-variant:0', 'command:prep-record:0'])
    assert(variants.rows.find((r) => r.id === id).blocked, id);
});

test('160 generated wrapper argument and environment variants cannot borrow a check receipt', () => {
  const command = { argv: ['node', preparationCampaign], env: {} };
  assert.deepEqual(preparationCommand(process.cwd(), command, 'check'), {
    requires: ['campaign:' + preparationCampaign],
  });
  fc.assert(
    fc.property(fc.string({ maxLength: 60 }), (value) => {
      for (const changed of [
        { ...command, env: { MODE: value } },
        { ...command, argv: [...command.argv, value] },
        { ...command, argv: [command.argv.join(' ')] },
      ])
        assert.equal(preparationCommand(process.cwd(), changed, 'check'), null);
    }),
    { seed: 150931, numRuns: 160 },
  );
});

test('report-writing preparation remains a separate variant with required retained output', () => {
  const inventory = JSON.parse(readFileSync('docs/release-validation-graph.json'));
  const plan = compileManifest(process.cwd(), inventory);
  const stages = selectStages(plan, 'wrapper-file-output');
  assert.equal(stages.length, 2);
  const report = stages.find((s) => s.id === 'variant:preparation-reports');
  assert.equal(report.expect.cases.length, 1);
  assert.deepEqual(report.fileOutputs.required, ['contract-probes.json']);
  const ordinary = selectStages(plan, 'wrapper-preparation');
  assert(
    ordinary.every((s) => !s.fileOutputs),
    'Do not silently add an environment variant to the package command',
  );
  assert.equal(
    plan.rows.find((r) => r.id === 'campaign:scripts/account-handoff/run.mjs').stage.expect.kind,
    'account-handoff',
  );
  assert(plan.rows.find((r) => r.id === 'campaign:scripts/account-editing/run.mjs').blocked);
});

test('core wrapper executes the actual grouped campaign and aliases only its exact commands', () => {
  const inventory = JSON.parse(readFileSync('docs/release-validation-graph.json'));
  const plan = compileManifest(process.cwd(), inventory);
  const [stage, ...rest] = selectStages(plan, 'wrapper-account-core');
  assert.deepEqual(rest, []);
  assert.deepEqual(stage.argv, ['node', coreCampaign]);
  assert.deepEqual([...new Set(stage.expect.cases.map((c) => c.id.split('::')[0]))], coreFiles);
  assert.equal(stage.expect.cases.length, 30);
  assert.deepEqual(stage.fileOutputs.required, coreReports);
  assert(plan.rows.some((r) => r.kind === 'command' && r.requires?.includes(stage.id)));
  const changed = structuredClone(inventory);
  changed.extraRoots.push({ id: 'core-filter', argv: ['node', coreCampaign, '--case', 'native'] });
  const other = compileManifest(process.cwd(), changed);
  assert(other.rows.find((r) => r.id === 'command:core-filter:0').blocked);
  assert.throws(() => selectStages(plan, 'release'), /Unresolved/);
});

test('core wrapper cannot borrow exit-only, missing reports, changed bounds or browser ownership', () => {
  const stage = coreCampaignStage(process.cwd());
  validateStage(stage);
  for (const extra of [
    { expect: { kind: 'exit', exitCodes: [0] } },
    { expect: { ...stage.expect, kind: 'cases' } },
    { variant: 'current' },
    { argv: [...stage.argv, '--changed'] },
    { env: { MODE: 'changed' } },
    { fileOutputs: undefined },
    { fixture: undefined },
    { deadlineMs: 120001 },
    { graceMs: 5001 },
  ])
    assert.throws(() => validateStage({ ...stage, ...extra }));
});

test('160 generated core report corruptions refuse successful-looking campaign evidence', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'done-core-report-control-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sources = [{ path: 'package.json', sha256: 'a'.repeat(64) }];
  const good = {
    'summary.json': {
      status: 'passed',
      code: 0,
      timedOut: false,
      startedAt: '2026-09-15T00:00:00.000Z',
      completedAt: '2026-09-15T00:00:01.000Z',
    },
    'sources.json': sources,
    'control-replay-baseline.json': {
      first: { stage: 'account-proof', receiptId: 'a' },
      second: { stage: 'account-proof', receiptId: 'a' },
    },
    'control-replay-mutant.json': {
      first: { stage: 'account-proof', receiptId: 'b' },
      second: { stage: 'account-proof', receiptId: 'c' },
    },
    ...Object.fromEntries(
      ['purpose', 'key'].flatMap((name) => [
        [`control-${name}-baseline.json`, { result: { refusal: 'invalid-proof' } }],
        [`control-${name}-mutant.json`, { result: { stage: 'account-proof' } }],
      ]),
    ),
  };
  const save = (reports) => {
    for (const [file, value] of Object.entries(reports))
      writeFileSync(join(directory, file), JSON.stringify(value));
    for (const file of ['results.xml', 'run.log'])
      writeFileSync(join(directory, file), 'auxiliary evidence');
  };
  save(good);
  reconcileCoreReports(directory, sources);
  fc.assert(
    fc.property(
      fc.string({ maxLength: 50 }).filter((s) => s !== 'passed'),
      (value) => {
        const bad = structuredClone(good);
        bad['summary.json'].status = value;
        save(bad);
        assert.throws(
          () => reconcileCoreReports(directory, sources),
          /Core campaign summary failed/,
        );
      },
    ),
    { seed: 150933, numRuns: 160 },
  );
  const faults = [
    (r) => {
      r['summary.json'].code = 1;
    },
    (r) => {
      r['summary.json'].timedOut = true;
    },
    (r) => {
      r['summary.json'].launchError = 'failure';
    },
    (r) => {
      r['summary.json'].completedAt = r['summary.json'].startedAt.replace('15T', '14T');
    },
    (r) => {
      r['sources.json'] = [];
    },
    (r) => {
      r['sources.json'][0].sha256 = 'b'.repeat(64);
    },
    (r) => {
      r['sources.json'].push(r['sources.json'][0]);
    },
    (r) => {
      r['control-replay-baseline.json'].second.receiptId = 'b';
    },
    (r) => {
      r['control-replay-mutant.json'].second.receiptId = 'b';
    },
    (r) => {
      r['control-key-baseline.json'].result = { stage: 'account-proof' };
    },
    (r) => {
      r['control-purpose-mutant.json'].result = { refusal: 'invalid-proof' };
    },
  ];
  for (const fault of faults) {
    const bad = structuredClone(good);
    fault(bad);
    save(bad);
    assert.throws(() => reconcileCoreReports(directory, sources));
  }
  for (const file of coreReports) {
    save(good);
    rmSync(join(directory, file));
    assert.throws(() => reconcileCoreReports(directory, sources));
  }
});

test('a changed preparation shell glob refuses before losing or inventing a test file', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'done-wrapper-glob-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, 'test/account-crypto-prep');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'census.test.mjs'), '');
  assert.throws(
    () => preparationTestStage(root, 'prep'),
    /changed crypto preparation command glob/,
  );
  writeFileSync(join(dir, 'contracts.test.mjs'), '');
  writeFileSync(join(dir, 'new.test.mjs'), '');
  assert.throws(
    () => preparationTestStage(root, 'prep'),
    /changed crypto preparation command glob/,
  );
});

test('finite catalogue evaluation expands real crash boundaries and keeps discriminating mutations', () => {
  const genesis = catalogueCensus(readFileSync('scripts/local-genesis/catalog.mjs', 'utf8'));
  assert.equal(genesis.cases.length, 17);
  assert.equal(genesis.mutants.length, 4);
  assert(genesis.cases.some((c) => c.id === 'G03.kill-claim'));
  assert(genesis.cases.some((c) => c.id === 'G11.kill-index'));
  assert.equal(
    genesis.mutants.find((m) => m.id === 'forget-completed-stage').assertion,
    'missing-complete-refuses',
  );
  const clear = catalogueCensus(readFileSync('scripts/local-clear/catalog.mjs', 'utf8'));
  assert.equal(clear.cases.length, 17);
  assert.equal(clear.cases.filter((c) => c.id.includes('.kill-')).length, 7);
});

test('catalogue code, unknown expressions and unbound mutations refuse without executing', () => {
  const valid =
    "export const cases = [{id: 'C01.a'}]; export const mutants = [{id: 'omit', case: 'C01.a', assertion: 'specific-refusal'}];";
  for (const text of [
    "throw Error('must never execute');" + valid,
    "import './side-effect.mjs';" + valid,
    valid.replace("[{id: 'C01.a'}]", 'unknown()'),
    valid.replace("case: 'C01.a'", "case: 'C01.absent'"),
  ])
    assert.throws(() => catalogueCensus(text), /Unresolved|Unbound/);
});

test('direct Node census refuses dynamic, nested, conditional and filtered declarations', () => {
  const prefix = "import test from 'node:test';";
  assert.deepEqual(directNodeCensus('test/x.mjs', prefix + "test('a', () => {});"), [
    { id: 'test/x.mjs::a', outcome: 'pass' },
  ]);
  for (const text of [
    "for (const x of ['a']) test(x, () => {});",
    "if (true) test('a', () => {});",
    "test.skip('a', () => {});",
    "test('a', t => t.test('nested', () => {}));",
    "const register = test; register('a', () => {});",
    "test('a', () => {}); test('a', () => {});",
  ])
    assert.throws(
      () => directNodeCensus('test/x.mjs', prefix + text),
      /Unresolved|Dynamic|duplicate/,
    );
});

test('manifest keeps full file, catalogue, construction and wrapper-variant obligations separate', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'done-manifest-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(
    'scripts/x/catalog.mjs',
    "export const cases = [{id: 'C01.a'}]; export const mutants = [{id: 'omit', case: 'C01.a', assertion: 'specific-refusal'}];",
  );
  const inventory = {
    tests: [
      {
        path: 'test/x.test.mjs',
        status: 'required',
        invocation: { argv: ['node', '--test', 'test/x.test.mjs'] },
      },
    ],
    catalogues: [
      { path: 'scripts/x/catalog.mjs', runner: 'scripts/x/run.mjs', disposition: 'required' },
    ],
    vectors: [{ path: 'test/vectors/x.json', argv: ['node', 'scripts/x/vectors.mjs', '--check'] }],
    packageDispositions: { required: ['check'] },
    packageGraph: packageGraph({
      check:
        'MODE=a node scripts/x/run.mjs && MODE=b node scripts/x/run.mjs && node scripts/check-traceability.mjs --check',
    }),
    extraRoots: [{ id: 'before', argv: ['node', 'scripts/profile.mjs', '063cd72'] }],
    campaigns: [
      { path: 'scripts/x/run.mjs', disposition: 'required-or-transitive', runCallSites: [] },
    ],
    constructions: [
      {
        id: 'contract',
        tests: ['test/x.test.mjs'],
        vectorCases: ['x'],
        vectorFile: 'test/vectors/x.json',
        requirements: ['binding'],
      },
    ],
  };
  const plan = compileManifest(root, inventory);
  assert.equal(plan.rows.find((r) => r.id === 'command:check:0').env.MODE, 'a');
  assert.equal(plan.rows.find((r) => r.id === 'command:check:1').env.MODE, 'b');
  assert.deepEqual(plan.rows.find((r) => r.id === 'command:check:2').orderedAfter, [
    'command:check:1',
  ]);
  assert.equal(plan.rows.find((r) => r.id === 'command:before:0').argv.at(-1), '063cd72');
  assert.deepEqual(plan.rows.find((r) => r.id === 'construction:contract').requires, [
    'test:test/x.test.mjs',
    'vector:test/vectors/x.json',
  ]);
  assert.equal(selectStages(plan, 'vectors').length, 1);
  assert.throws(() => selectStages(plan, 'release'), /Unresolved/);
  const changed = structuredClone(inventory);
  changed.extraRoots.pop();
  assert.notEqual(digest(compileManifest(root, changed)), digest(plan));
  const lost = structuredClone(plan);
  lost.rows = lost.rows.filter((r) => r.id !== 'test:test/x.test.mjs');
  lost.selections.release = lost.selections.release.filter((id) => id !== 'test:test/x.test.mjs');
  assert.throws(() => assertManifestCoverage(lost, inventory), /independently required/);
});

test('resolved receipt dependencies survive transitive aliases and cannot be reordered or cycled', () => {
  const stage = (id) =>
    boundedStage(id, ['node', 'scripts/' + id + '.mjs'], { kind: 'exit', exitCodes: [0] });
  const plan = {
    selections: { release: ['trace', 'vectors'] },
    rows: [
      { id: 'vectors', stage: stage('vectors') },
      { id: 'alias', requires: ['vectors'] },
      { id: 'trace', stage: stage('trace'), orderedAfter: ['alias'] },
    ],
  };
  const selected = selectStages(plan, 'release');
  assert.deepEqual(
    selected.map((s) => s.id),
    ['vectors', 'trace'],
  );
  assert.deepEqual(selected[1].dependsOn, ['vectors']);
  plan.rows[0].orderedAfter = ['trace'];
  assert.throws(() => selectStages(plan, 'release'), /cycle/);
});

test('160 generated catalogue case omissions change the exact denominator independently of outcomes', () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 0, max: 40 }), { minLength: 2, maxLength: 15 }),
      (ids) => {
        const source = (values) =>
          `export const cases = ${JSON.stringify(values.map((id) => ({ id: 'C01.' + id })))}; export const mutants = [{id: 'omit', case: 'C01.${ids[0]}', assertion: 'expected-assertion'}];`;
        const all = catalogueCensus(source(ids)),
          missing = catalogueCensus(source(ids.slice(0, -1)));
        assert.deepEqual(
          all.cases.map((c) => c.id),
          ids.map((id) => 'C01.' + id),
        );
        assert.notEqual(digest(all), digest(missing));
      },
    ),
    { seed: 130902, numRuns: 160 },
  );
});
