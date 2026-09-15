import { createPublicKey, verify } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatedNodeDeclarations } from './census.mjs';
import { historicalInput, validateHistoricalInputs } from './historical-inputs.mjs';

export const handoffCampaign = 'scripts/account-handoff/run.mjs';
export const handoffFiles = ['core', 'es256', 'native'].map(
  (name) => `test/account-handoff/${name}.test.mjs`,
);
export const handoffReports = [
  'sources.json',
  'summary.json',
  'results.xml',
  'run.log',
  'control-credential.json',
  'control-passkey.json',
  'generated-der.json',
  'generated-service.json',
  'generated-native.json',
];
export const handoffFilePolicy = {
  kind: 'account-reports-v1',
  required: handoffReports,
  maxEntries: 32,
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 1,
};

export function handoffCampaignStage(root) {
  const cases = handoffFiles.flatMap((file) => {
    const declarations = generatedNodeDeclarations(file, readFileSync(join(root, file), 'utf8'), {
      root,
    });
    assert.deepEqual(declarations.dataInputs, [], 'Review new handoff registration inputs');
    return declarations.cases;
  });
  return {
    id: 'campaign:' + handoffCampaign,
    argv: ['node', handoffCampaign],
    env: {},
    variant: 'account-handoff-campaign-v1',
    expect: {
      kind: 'account-handoff',
      cases,
      historyInputs: [historicalInput(root, 'beed8cf', 'src/crdt/promotionRecord.ts')],
    },
    // Preserve the wrapper's 180-second campaign bound; the owner also drains descendants.
    deadlineMs: 180000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
    fixture: { kind: 'chromium-cdp', startupMs: 15000 },
    fileOutputs: structuredClone(handoffFilePolicy),
  };
}

export function validateHandoffCampaign(stage) {
  assert.equal(
    stage.expect.kind,
    'account-handoff',
    'Handoff wrapper requires report postconditions',
  );
  assert.equal(stage.variant, 'account-handoff-campaign-v1');
  assert.deepEqual(stage.argv, ['node', handoffCampaign]);
  assert.deepEqual(stage.env, {});
  assert.deepEqual(stage.fileOutputs, handoffFilePolicy);
  assert.deepEqual(stage.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(stage.deadlineMs, 180000);
  assert.equal(stage.graceMs, 5000);
  assert.equal(stage.processPolicy, 'inherited-group-v1');
  assert.equal(stage.expect.dataInputs, undefined);
  validateHistoricalInputs(stage.expect.historyInputs);
  assert.deepEqual(
    stage.expect.historyInputs.map(({ reference, path }) => [reference, path]),
    [['beed8cf', 'src/crdt/promotionRecord.ts']],
  );
}

/** Called only after bounded inventory validation and producer drain. Node's owned
 * terminal census is the case authority; JUnit and run.log remain auxiliary evidence. */
export function reconcileHandoffReports(directory, sources) {
  const json = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const summary = json('summary.json');
  assert.equal(summary.status, 'passed', 'Handoff campaign summary failed');
  assert.equal(summary.code, 0);
  assert.equal(summary.timedOut, false);
  assert.equal(summary.launchError, undefined);
  for (const key of ['startedAt', 'completedAt'])
    assert(
      typeof summary[key] === 'string' && new Date(summary[key]).toISOString() === summary[key],
      'Invalid campaign time',
    );
  assert(Date.parse(summary.completedAt) >= Date.parse(summary.startedAt));
  const selected = sources.filter(
    ({ path }) =>
      [
        'package.json',
        'pnpm-lock.yaml',
        'tsconfig.node.json',
        'tsconfig.app.json',
        'src/account/recovery.ts',
        'src/account/slotUnlock.ts',
        'src/account/es256Signature.ts',
        'test/slotUnlock.test.ts',
        'src/account/generationWrap.ts',
        'test/vectors/package.json',
        'test/account-promotion/fixtures.mjs',
        'test/account-promotion/browser.ts',
        'src/account/recoveryOwner.ts',
        'test/account-authority/browser.ts',
        'test/account-core/fixtures.mjs',
        'test/account-core/worker.mjs',
        'test/account-recovery/fixtures.mjs',
        'wasm/journal-seal/seal.generated.ts',
        handoffCampaign,
        'docs/account-promotion.md',
        'docs/account-handoff.md',
        'docs/account-admission.md',
        'test/account-authority/fixtures.mjs',
      ].includes(path) ||
      /^src\/crdt\/[^/]+\.ts$/.test(path) ||
      /^src\/lib\/[^/]+\.tsx?$/.test(path) ||
      /^(?:account-service|account-protocol|test\/account-handoff|test\/account-admission|test\/account-genesis)\/[^/]+\.(?:ts|mjs)$/.test(
        path,
      ),
  );
  const sort = (rows) => [...rows].sort((a, b) => a.path.localeCompare(b.path));
  assert.deepEqual(
    sort(json('sources.json')),
    sort(selected.map(({ path, sha256 }) => ({ path, sha256 }))),
    'Handoff report source pins disagree with owned inputs',
  );
  reconcileHandoffControls(json('control-credential.json'), json('control-passkey.json'));
  reconcileHandoffDer(json('generated-der.json'));
  reconcileHandoffHistories(json('generated-service.json'), json('generated-native.json'));
  // Presence/bytes are already bound by fileOutputs. Do not credit JUnit as an
  // independent oracle or discard counterexample/ledger diagnostics on failures.
  for (const file of ['run.log', 'results.xml'])
    assert(
      readFileSync(join(directory, file)).length > 0,
      'Empty handoff auxiliary report: ' + file,
    );
}

const hex = (value, bytes) =>
  typeof value === 'string' && new RegExp(`^[a-f0-9]{${bytes * 2}}$`).test(value);
const edPrefix = '302a300506032b6570032100';
const publicKey = (value) =>
  createPublicKey({ key: Buffer.from(value, 'hex'), format: 'der', type: 'spki' });

// Construct row-12 bytes locally: no protocol/runtime parser or serializer is used.
function signedBinding(proof, root) {
  assert.deepEqual(Object.keys(proof).sort(), [
    'epochHead',
    'kind',
    'requestDigest',
    'stored',
    'v',
  ]);
  assert.equal(proof.v, 1);
  assert.equal(proof.kind, 'promotion-slot-binding');
  assert(hex(proof.requestDigest, 32) && hex(proof.epochHead, 32));
  assert.deepEqual(Object.keys(proof.stored).sort(), ['binding', 'bindingSignature']);
  const b = proof.stored.binding;
  assert.deepEqual(Object.keys(b).sort(), [
    'accountId',
    'credId',
    'epoch',
    'principalId',
    'publicKey',
    'rpId',
    'v',
  ]);
  assert.equal(b.v, 1);
  assert.equal(b.epoch, 1);
  assert.equal(b.rpId, 'localhost');
  assert(typeof b.accountId === 'string' && /^[A-Za-z0-9_-]{43}$/.test(b.accountId));
  assert(hex(b.principalId, 16));
  assert(typeof b.credId === 'string' && /^[A-Za-z0-9_-]{1,1364}$/.test(b.credId));
  assert(
    typeof b.publicKey === 'string' &&
      b.publicKey.startsWith(edPrefix) &&
      hex(b.publicKey.slice(edPrefix.length), 32),
  );
  assert(hex(proof.stored.bindingSignature, 64));
  const chunks = [
    'done/slotbind/v1',
    '1',
    b.accountId,
    b.principalId,
    b.rpId,
    '1',
    b.credId,
    b.publicKey,
  ].flatMap((value) => {
    const bytes = Buffer.from(value),
      length = Buffer.alloc(2);
    length.writeUInt16BE(bytes.length);
    return [length, bytes];
  });
  assert(
    verify(
      null,
      Buffer.concat(chunks),
      publicKey(edPrefix + root),
      Buffer.from(proof.stored.bindingSignature, 'hex'),
    ),
    'Handoff binding signature invalid',
  );
}
export function reconcileHandoffControls(credential, passkey) {
  assert.equal(credential.baseline, 'substituted credential refused');
  assert.equal(credential.baselineOk, false, 'Handoff credential baseline did not refuse');
  assert(hex(credential.authRoot, 32));
  signedBinding(credential.original, credential.authRoot);
  signedBinding(credential.accepted, credential.authRoot);
  const original = credential.original,
    accepted = credential.accepted;
  assert.notEqual(
    credential.substitutedKey,
    original.stored.binding.publicKey,
    'Handoff credential key was not substituted',
  );
  assert.equal(
    accepted.stored.binding.publicKey,
    credential.substitutedKey,
    'Handoff control did not sign substituted key',
  );
  assert.deepEqual(
    accepted,
    {
      ...original,
      stored: {
        binding: { ...original.stored.binding, publicKey: credential.substitutedKey },
        bindingSignature: accepted.stored.bindingSignature,
      },
    },
    'Handoff substituted binding changed target',
  );
  assert.equal(passkey.baseline, 'invalid signature refused');
  assert.equal(passkey.baselineUnchanged, true, 'Handoff passkey baseline mutated storage');
  assert.equal(passkey.signature, '00'.repeat(64), 'Handoff passkey signature was not corrupted');
  assert.equal(passkey.accepted.kind, 'account-selected');
  assert.deepEqual(Object.keys(passkey.accepted).sort(), [
    'accountId',
    'dbName',
    'epochHead',
    'kind',
    'principalId',
    'slotId',
    'workspaceId',
  ]);
  assert.deepEqual(Object.keys(passkey.expected).sort(), [
    'accountId',
    'principalId',
    'slotId',
    'workspaceId',
  ]);
  for (const key of ['slotId', 'accountId', 'principalId', 'workspaceId']) {
    assert(typeof passkey.expected[key] === 'string' && passkey.expected[key].length > 0);
    assert.equal(
      passkey.accepted[key],
      passkey.expected[key],
      'Handoff passkey control selected another target',
    );
  }
  assert(hex(passkey.accepted.epochHead, 32));
  assert(typeof passkey.accepted.dbName === 'string' && passkey.accepted.dbName.length > 0);
  assert.deepEqual(
    passkey.classified,
    { ...passkey.accepted, kind: 'account' },
    'Handoff passkey control did not classify selected route',
  );
}

export function reconcileHandoffDer(report) {
  assert.equal(report.seed, 9262026);
  assert(typeof report.publicKey === 'string' && /^[a-f0-9]{182}$/.test(report.publicKey));
  const key = publicKey(report.publicKey);
  assert.equal(key.asymmetricKeyType, 'ec');
  assert.equal(key.asymmetricKeyDetails.namedCurve, 'prime256v1');
  assert(
    Array.isArray(report.cases) && report.cases.length === 200,
    'Incomplete handoff DER cases',
  );
  for (const row of report.cases) {
    assert.deepEqual(Object.keys(row).sort(), ['der', 'message']);
    assert(typeof row.message === 'string' && /^(?:[a-f0-9]{2}){0,1024}$/.test(row.message));
    assert(typeof row.der === 'string' && /^(?:[a-f0-9]{2}){8,72}$/.test(row.der));
    // This validates retained DER evidence, not the runtime's DER-to-P1363 conversion.
    // The grouped test's live Node assertions remain authority for that conversion.
    assert(
      verify('sha256', Buffer.from(row.message, 'hex'), key, Buffer.from(row.der, 'hex')),
      'Handoff DER signature invalid',
    );
  }
}

export function reconcileHandoffHistories(service, native) {
  assert.equal(service.seed, 9252026);
  assert(
    Array.isArray(service.histories) && service.histories.length === 60,
    'Incomplete handoff service histories',
  );
  for (const history of service.histories) {
    assert.deepEqual(Object.keys(history).sort(), ['activated', 'commands', 'status']);
    assert.equal(history.status, 'passed');
    assert(
      Array.isArray(history.commands) &&
        history.commands.length >= 2 &&
        history.commands.length <= 14,
    );
    for (const command of history.commands)
      assert(['issue', 'activate', 'restart', 'wrong'].includes(command));
    assert.equal(
      history.activated,
      history.commands.includes('activate'),
      'Handoff service history activation disagrees',
    );
  }
  assert.equal(native.seed, 9272026);
  assert(
    Array.isArray(native.histories) && native.histories.length === 24,
    'Incomplete handoff native histories',
  );
  for (const history of native.histories) {
    assert.deepEqual(Object.keys(history).sort(), ['fault', 'ops', 'retries', 'reverse', 'status']);
    assert.equal(history.status, 'passed');
    assert.equal(typeof history.reverse, 'boolean');
    assert(Number.isInteger(history.retries) && history.retries >= 1 && history.retries <= 3);
    assert(
      [
        'none',
        'handoff-prepared',
        'index',
        'handoff-selected',
        'lost-binding',
        'bad-passkey',
      ].includes(history.fault),
    );
    assert(Array.isArray(history.ops) && history.ops.length >= 1 && history.ops.length <= 8);
    for (const op of history.ops) {
      assert.deepEqual(Object.keys(op).sort(), ['at', 'disk', 'insert', 'remove']);
      assert(Number.isInteger(op.at) && op.at >= 0 && op.at <= 80);
      assert(Number.isInteger(op.remove) && op.remove >= 0 && op.remove <= 5);
      assert(typeof op.insert === 'string' && op.insert.length >= 1 && op.insert.length <= 12);
      assert.equal(typeof op.disk, 'boolean');
    }
  }
}
