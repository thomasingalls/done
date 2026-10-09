import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatedNodeDeclarations } from './census.mjs';
import { historicalInput, validateHistoricalInputs } from './historical-inputs.mjs';

export const admissionCampaign = 'scripts/account-admission/run.mjs';
export const admissionFiles = ['core', 'restart', 'controls', 'native'].map(
  (name) => `test/account-admission/${name}.test.mjs`,
);
export const admissionReports = [
  'sources.json',
  'summary.json',
  'results.xml',
  'run.log',
  'control-origin.json',
  'control-certification.json',
  'control-receipt.json',
  'generated-service.json',
  'generated-native.json',
];
export const admissionFilePolicy = {
  kind: 'account-reports-v1',
  required: admissionReports,
  maxEntries: 32,
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 1,
};

export function admissionCampaignStage(root) {
  const cases = admissionFiles.flatMap((file) => {
    const declarations = generatedNodeDeclarations(file, readFileSync(join(root, file), 'utf8'), {
      root,
    });
    assert.deepEqual(declarations.dataInputs, [], 'Review new admission registration inputs');
    return declarations.cases;
  });
  return {
    id: 'campaign:' + admissionCampaign,
    argv: ['node', admissionCampaign],
    env: {},
    variant: 'account-admission-campaign-v1',
    expect: {
      kind: 'account-admission',
      cases,
      historyInputs: [historicalInput(root, '280f616', 'src/crdt/promotionRecord.ts')],
    },
    // Preserve the wrapper's 180-second campaign bound; the owner also drains descendants.
    deadlineMs: 180000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
    fixture: { kind: 'chromium-cdp', startupMs: 15000 },
    fileOutputs: structuredClone(admissionFilePolicy),
  };
}

export function validateAdmissionCampaign(stage) {
  assert.equal(
    stage.expect.kind,
    'account-admission',
    'Admission wrapper requires report postconditions',
  );
  assert.equal(stage.variant, 'account-admission-campaign-v1');
  assert.deepEqual(stage.argv, ['node', admissionCampaign]);
  assert.deepEqual(stage.env, {});
  assert.deepEqual(stage.fileOutputs, admissionFilePolicy);
  assert.deepEqual(stage.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(stage.deadlineMs, 180000);
  assert.equal(stage.graceMs, 5000);
  assert.equal(stage.processPolicy, 'inherited-group-v1');
  assert.equal(stage.expect.dataInputs, undefined);
  validateHistoricalInputs(stage.expect.historyInputs);
  assert.deepEqual(
    stage.expect.historyInputs.map(({ reference, path }) => [reference, path]),
    [['280f616', 'src/crdt/promotionRecord.ts']],
  );
}

/** Called only after bounded inventory validation and producer drain. Node's owned
 * terminal census is the case authority; JUnit and run.log remain auxiliary evidence. */
export function reconcileAdmissionReports(directory, sources) {
  const json = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const summary = json('summary.json');
  assert.equal(summary.status, 'passed', 'Admission campaign summary failed');
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
        admissionCampaign,
        'docs/account-promotion.md',
        'docs/account-admission.md',
        'test/account-authority/fixtures.mjs',
      ].includes(path) ||
      /^src\/crdt\/[^/]+\.ts$/.test(path) ||
      /^src\/lib\/[^/]+\.tsx?$/.test(path) ||
      /^(?:account-service|account-protocol|test\/account-admission|test\/account-genesis)\/[^/]+\.(?:ts|mjs)$/.test(
        path,
      ),
  );
  const sort = (rows) => [...rows].sort((a, b) => a.path.localeCompare(b.path));
  assert.deepEqual(
    sort(json('sources.json')),
    sort(selected.map(({ path, sha256 }) => ({ path, sha256 }))),
    'Admission report source pins disagree with owned inputs',
  );
  reconcileAdmissionControls(
    json('control-origin.json'),
    json('control-certification.json'),
    json('control-receipt.json'),
  );
  reconcileAdmissionHistories(json('generated-service.json'), json('generated-native.json'));
  // Presence/bytes are already bound by fileOutputs. Do not credit JUnit as an
  // independent oracle or discard counterexample/ledger diagnostics on failures.
  for (const file of ['run.log', 'results.xml'])
    assert(
      readFileSync(join(directory, file)).length > 0,
      'Empty admission auxiliary report: ' + file,
    );
}

const hex = (value, bytes) =>
  typeof value === 'string' && new RegExp(`^[a-f0-9]{${bytes * 2}}$`).test(value);
const zeroSignature = '00'.repeat(64);
function receiptTarget(receipt) {
  assert.equal(receipt.v, 2);
  assert.equal(receipt.kind, 'promotion-receipt');
  assert.equal(receipt.offer.kind, 'promotion-offer');
  const epoch = receipt.offer.epoch,
    context = receipt.activation.context;
  assert.equal(epoch.kind, 'first-authorization-epoch');
  assert.equal(epoch.epoch, 1);
  assert.equal(epoch.generation, 1);
  assert(typeof epoch.accountId === 'string' && /^[A-Za-z0-9_-]{43}$/.test(epoch.accountId));
  assert(hex(epoch.requestDigest, 32) && hex(receipt.offer.head, 32));
  assert.equal(context.accountId, epoch.accountId, 'Admission activation account differs');
  assert.equal(context.requestDigest, epoch.requestDigest, 'Admission activation request differs');
  assert.equal(context.offerHead, receipt.offer.head, 'Admission activation offer differs');
  assert(hex(receipt.signature, 64));
}
export function reconcileAdmissionControls(origin, certification, receipt) {
  for (const [gate, report] of [
    ['origin', origin],
    ['certification', certification],
  ]) {
    assert.equal(report.gate, gate, 'Admission approval control changed gate');
    assert.equal(report.baseline, 'refused');
    assert.equal(report.baselineOk, false, 'Admission approval baseline did not refuse');
    assert.equal(report.observed, 'account activated after approval verification removed');
    assert.equal(report.accountState, 'active', 'Admission approval mutant did not activate');
    assert(hex(report.originalSignature, 64) && report.originalSignature !== zeroSignature);
    assert.equal(
      report.approvalSignature,
      zeroSignature,
      'Admission approval signature was not corrupted',
    );
    receiptTarget(report.result);
    assert.equal(
      report.result.offer.epoch.accountId,
      report.expectedAccountId,
      'Admission control activated another account',
    );
    assert(hex(report.requestDigest, 32));
    assert.equal(
      report.result.offer.epoch.requestDigest,
      report.requestDigest,
      'Admission control accepted another request',
    );
  }
  assert.equal(receipt.baseline, 'refused');
  assert.equal(receipt.beforeStage, 'admission-offered', 'Invalid receipt baseline advanced Local');
  assert.equal(
    receipt.afterStage,
    'admission-receipted',
    'Invalid receipt mutant did not retain Local',
  );
  assert.equal(receipt.observed, 'invalid service receipt retained with verification disabled');
  receiptTarget(receipt.accepted);
  assert.equal(
    receipt.accepted.signature,
    zeroSignature,
    'Admission receipt signature was not corrupted',
  );
  assert.deepEqual(
    receipt.retained,
    receipt.accepted,
    'Admission control did not retain the accepted receipt',
  );
}

export function reconcileAdmissionHistories(service, native) {
  assert.equal(service.seed, 9232026);
  assert(
    Array.isArray(service.histories) && service.histories.length === 80,
    'Incomplete admission service histories',
  );
  for (const history of service.histories) {
    assert.deepEqual(Object.keys(history).sort(), ['commands', 'state']);
    assert(
      Array.isArray(history.commands) &&
        history.commands.length >= 2 &&
        history.commands.length <= 15,
    );
    // Report-level replay of the recorded commands, separate from the service fixture's ledger.
    let state = 'pending';
    for (const command of history.commands) {
      assert(['offer', 'finish', 'restart', 'abandon', 'wrong'].includes(command));
      if (command === 'offer' && state === 'pending') state = 'offered';
      if (command === 'finish' && state === 'offered') state = 'active';
      if (command === 'abandon' && state !== 'active') state = 'cancelled';
    }
    assert.equal(history.state, state, 'Admission service history final state disagrees');
  }
  assert.equal(native.seed, 9242026);
  assert(
    Array.isArray(native.histories) && native.histories.length === 30,
    'Incomplete admission native histories',
  );
  for (const history of native.histories) {
    assert.deepEqual(Object.keys(history).sort(), ['fault', 'ops', 'retries', 'reverse', 'status']);
    assert.equal(history.status, 'passed');
    assert.equal(typeof history.reverse, 'boolean');
    assert(Number.isInteger(history.retries) && history.retries >= 1 && history.retries <= 3);
    assert(
      [
        'none',
        'lost-begin',
        'lost-finish',
        'admission-requested',
        'admission-offered',
        'admission-receipted',
        'changed-offer',
      ].includes(history.fault),
    );
    assert(Array.isArray(history.ops) && history.ops.length >= 1 && history.ops.length <= 10);
    for (const op of history.ops) {
      assert.deepEqual(Object.keys(op).sort(), ['at', 'disk', 'insert', 'remove']);
      assert(Number.isInteger(op.at) && op.at >= 0 && op.at <= 80);
      assert(Number.isInteger(op.remove) && op.remove >= 0 && op.remove <= 5);
      assert(typeof op.insert === 'string' && op.insert.length >= 1 && op.insert.length <= 14);
      assert.equal(typeof op.disk, 'boolean');
    }
  }
}
