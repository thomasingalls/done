import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPublicKey, verify } from 'node:crypto';
import { generatedNodeDeclarations } from './census.mjs';

export const authorityCampaign = 'scripts/account-authority/run.mjs';
export const authorityFiles = ['core', 'properties', 'restart', 'controls', 'native'].map(
  (name) => `test/account-authority/${name}.test.mjs`,
);
export const authorityReports = [
  'sources.json',
  'summary.json',
  'results.xml',
  'run.log',
  'control-pin.json',
  'control-nonce.json',
];
export const authorityFilePolicy = {
  kind: 'account-reports-v1',
  required: authorityReports,
  maxEntries: 32,
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 1,
};

export function authorityCampaignStage(root) {
  const cases = authorityFiles.flatMap((file) => {
    const declarations = generatedNodeDeclarations(file, readFileSync(join(root, file), 'utf8'), {
      root,
    });
    assert.deepEqual(declarations.dataInputs, [], 'Review new authority registration inputs');
    return declarations.cases;
  });
  return {
    id: 'campaign:' + authorityCampaign,
    argv: ['node', authorityCampaign],
    env: {},
    variant: 'account-authority-campaign-v1',
    expect: { kind: 'account-authority', cases },
    // Preserve the wrapper's 120-second campaign bound; the owner also drains descendants.
    deadlineMs: 120000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
    fixture: { kind: 'chromium-cdp', startupMs: 15000 },
    fileOutputs: structuredClone(authorityFilePolicy),
  };
}

export function validateAuthorityCampaign(stage) {
  assert.equal(
    stage.expect.kind,
    'account-authority',
    'Authority wrapper requires report postconditions',
  );
  assert.equal(stage.variant, 'account-authority-campaign-v1');
  assert.deepEqual(stage.argv, ['node', authorityCampaign]);
  assert.deepEqual(stage.env, {});
  assert.deepEqual(stage.fileOutputs, authorityFilePolicy);
  assert.deepEqual(stage.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(stage.deadlineMs, 120000);
  assert.equal(stage.graceMs, 5000);
  assert.equal(stage.processPolicy, 'inherited-group-v1');
}

/** Called only after bounded inventory validation and producer drain. Node's owned
 * terminal census is the case authority; JUnit and run.log remain auxiliary evidence. */
export function reconcileAuthorityReports(directory, sources) {
  const json = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const summary = json('summary.json');
  assert.equal(summary.status, 'passed', 'Authority campaign summary failed');
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
        'wasm/journal-seal/seal.generated.ts',
        authorityCampaign,
        'docs/account-authority.md',
      ].includes(path) ||
      /^src\/crdt\/[^/]+\.ts$/.test(path) ||
      /^(?:account-service|account-protocol|test\/account-authority)\/[^/]+\.(?:ts|mjs)$/.test(
        path,
      ),
  );
  const sort = (rows) => [...rows].sort((a, b) => a.path.localeCompare(b.path));
  assert.deepEqual(
    sort(json('sources.json')),
    sort(selected.map(({ path, sha256 }) => ({ path, sha256 }))),
    'Authority report source pins disagree with owned inputs',
  );
  reconcileAuthorityControls(json('control-pin.json'), json('control-nonce.json'));
  // Presence/bytes are already bound by fileOutputs. Do not credit JUnit as an
  // independent oracle or discard counterexample/ledger diagnostics on failures.
  for (const file of ['run.log', 'results.xml'])
    assert(
      readFileSync(join(directory, file)).length > 0,
      'Empty authority auxiliary report: ' + file,
    );
}

function pinShape(pin) {
  assert(pin && typeof pin === 'object');
  assert.deepEqual(Object.keys(pin).sort(), ['authRoot', 'origin', 'rpId', 'serviceId', 'v']);
  assert.equal(pin.v, 1);
  assert(
    /^[a-f0-9]{32}$/.test(pin.serviceId) && /^[a-f0-9]{64}$/.test(pin.authRoot),
    'Malformed authority report pin',
  );
  assert(
    typeof pin.origin === 'string' && pin.origin.length <= 2048 && typeof pin.rpId === 'string',
  );
  const url = new URL(pin.origin);
  assert(
    url.origin === pin.origin &&
      url.hostname === pin.rpId &&
      (url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost')),
    'Malformed authority report policy',
  );
}
function signedProof(proof) {
  assert(proof && typeof proof === 'object');
  assert.deepEqual(Object.keys(proof).sort(), ['nonce', 'pin', 'signature', 'v']);
  assert.equal(proof.v, 1);
  pinShape(proof.pin);
  assert(
    /^[a-f0-9]{64}$/.test(proof.nonce) && /^[a-f0-9]{128}$/.test(proof.signature),
    'Malformed authority report proof',
  );
  const p = proof.pin;
  // Independent Node verification of the archived response's own message. This
  // does not make its self-declared root a trusted pin or its nonce a fresh request.
  const message = Buffer.concat(
    [
      'done/service-authority-bootstrap/v1',
      '1',
      p.serviceId,
      p.origin,
      p.rpId,
      p.authRoot,
      proof.nonce,
    ].map((value) => {
      const bytes = Buffer.from(value),
        length = Buffer.alloc(2);
      length.writeUInt16BE(bytes.length);
      return Buffer.concat([length, bytes]);
    }),
  );
  const key = createPublicKey({
    key: Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      Buffer.from(p.authRoot, 'hex'),
    ]),
    format: 'der',
    type: 'spki',
  });
  assert(
    verify(null, message, key, Buffer.from(proof.signature, 'hex')),
    'Authority control signature invalid',
  );
}
export function reconcileAuthorityControls(pin, replay) {
  for (const record of [pin, replay]) {
    assert.equal(record.baseline, 'refused', 'Authority baseline did not refuse');
    pinShape(record.expected);
    signedProof(record.proof);
    assert.deepEqual(
      record.mutant,
      record.proof.pin,
      'Authority mutant did not accept the proof pin',
    );
  }
  assert(/^[a-f0-9]{64}$/.test(pin.nonce));
  assert.equal(pin.nonce, pin.proof.nonce, 'Pin control also changed its nonce');
  assert.notEqual(
    pin.expected.authRoot,
    pin.proof.pin.authRoot,
    'Pin control did not substitute the root',
  );
  assert.equal(pin.expected.origin, pin.proof.pin.origin, 'Pin control changed policy');
  assert.equal(pin.expected.rpId, pin.proof.pin.rpId, 'Pin control changed policy');
  assert.deepEqual(replay.expected, replay.proof.pin, 'Nonce control also changed its pin');
  assert(/^[a-f0-9]{64}$/.test(replay.requestedNonce));
  assert.notEqual(
    replay.requestedNonce,
    replay.proof.nonce,
    'Nonce control did not replay an old challenge',
  );
}
