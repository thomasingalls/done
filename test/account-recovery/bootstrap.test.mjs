import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  hkdfSync,
  sign,
  verify,
} from 'node:crypto';
import { generateRecovery } from '../../src/account/recovery.ts';
import { createRecoveryBootstrap } from '../../src/account/recoveryBootstrap.ts';
import {
  parseRecoveryHeadAssertion,
  recoveryHeadAssertionMessage,
  verifyRecoveryHeadAssertion,
  parseRecoveryBootstrap,
  recoveryBootstrapMessage,
  prepareRecoveryBootstrap,
  verifyRecoveryBootstrap,
} from '../../account-protocol/recoveryBootstrap.ts';

// Independent Node framing, key import and envelope opening; no production serializer/digest here.
const lp = (...fields) =>
  Buffer.concat(
    fields.map((value) => {
      const bytes = Buffer.from(value, 'ascii'),
        size = Buffer.alloc(2);
      size.writeUInt16BE(bytes.length);
      return Buffer.concat([size, bytes]);
    }),
  );
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const key = (seed) =>
  createPrivateKey({
    key: Buffer.from('302e020100300506032b657004220420' + seed, 'hex'),
    type: 'pkcs8',
    format: 'der',
  });
const pub = (key) =>
  createPublicKey(key).export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
const signed = (key, bytes) => sign(null, bytes, key).toString('hex');
const headBytes = (h) =>
  lp(
    'done/head-assert/v1',
    h.workspaceId,
    String(h.epoch),
    h.head,
    h.clientNonce,
    String(h.issuedAt),
  );
const bootstrapBytes = (r) =>
  lp(
    'done/recovery-bootstrap/v1',
    String(r.v),
    r.workspaceId,
    r.lineageId,
    String(r.observedEpoch),
    r.observedHeadDigest,
    r.clientNonce,
    r.priorRecoveryStateDigest,
    r.recoveredRoot,
    r.newCredentialId,
    r.newWPub,
    r.newSPub,
    r.newRecoveryStateDigest,
    r.conflictParent,
  );
const stateDigest = (r) =>
  hash(
    lp(
      'done/recovery-state/v1',
      '0',
      r.rPub,
      hash(lp('done/recovery-envelope/v1', '1', r.envelope.salt, r.envelope.nonce, r.envelope.ct)),
      r.rootCommitment,
      r.bootstrapSigner,
    ),
  );
function openSigner(draft, code) {
  const k = hkdfSync(
    'sha256',
    Buffer.from(code.replaceAll('-', '')),
    Buffer.from(draft.envelope.salt, 'hex'),
    lp('done/recovery/v1', draft.principalId),
    32,
  );
  const ciphertext = Buffer.from(draft.envelope.ct, 'hex');
  const cipher = createDecipheriv('aes-256-gcm', k, Buffer.from(draft.envelope.nonce, 'hex'));
  cipher.setAAD(lp('done/recovery/v1', draft.principalId, '1', draft.rPub));
  cipher.setAuthTag(ciphertext.subarray(-16));
  const payload = Buffer.concat([cipher.update(ciphertext.subarray(0, -16)), cipher.final()]);
  try {
    return key(payload.subarray(64).toString('hex'));
  } finally {
    payload.fill(0);
  }
}
async function fixture({ epoch = 7, issuedAt = 0 } = {}) {
  const authority = key('11'.repeat(32)),
    candidateSigner = key('22'.repeat(32));
  const pin = {
    v: 1,
    serviceId: '33'.repeat(16),
    origin: 'https://recovery.example',
    rpId: 'recovery.example',
    authRoot: pub(authority),
  };
  const scope = {
    principalId: '44'.repeat(16),
    workspaceId: '55'.repeat(16),
    lineageId: '66'.repeat(32),
    authRoot: pin.authRoot,
  };
  const { draft, code } = await generateRecovery(scope);
  const assertion = {
    v: 1,
    workspaceId: scope.workspaceId,
    epoch,
    head: '77'.repeat(32),
    clientNonce: '88'.repeat(32),
    issuedAt,
    signature: '',
  };
  assertion.signature = signed(authority, headBytes(assertion));
  const expected = { workspaceId: scope.workspaceId, clientNonce: assertion.clientNonce };
  const head = await verifyRecoveryHeadAssertion(assertion, pin, expected);
  const signer = await crypto.subtle.importKey(
    'pkcs8',
    candidateSigner.export({ format: 'der', type: 'pkcs8' }),
    'Ed25519',
    false,
    ['sign'],
  );
  const candidate = {
    credentialId: '99'.repeat(16),
    wPub: 'aa'.repeat(32),
    sPub: pub(candidateSigner),
  };
  const context = {
    head,
    recovery: draft,
    currentRecoveryStateDigest: stateDigest(draft),
    candidate,
    conflictParent: assertion.head,
  };
  const proof = await createRecoveryBootstrap(context, code, signer);
  const recoverySigner = openSigner(draft, code);
  const resign = (proof, recovery = recoverySigner, device = candidateSigner) => ({
    ...proof,
    signature: signed(recovery, bootstrapBytes(proof)),
    countersignature: signed(device, bootstrapBytes(proof)),
  });
  return {
    authority,
    candidateSigner,
    recoverySigner,
    signer,
    scope,
    pin,
    draft,
    code,
    assertion,
    expected,
    context,
    proof,
    resign,
  };
}

test('recovery proofs use selected LP bytes and both independently verified signatures', async () => {
  const f = await fixture();
  assert.deepEqual(Buffer.from(recoveryHeadAssertionMessage(f.assertion)), headBytes(f.assertion));
  assert.deepEqual(Buffer.from(recoveryBootstrapMessage(f.proof)), bootstrapBytes(f.proof));
  assert.equal(
    verify(
      null,
      bootstrapBytes(f.proof),
      createPublicKey(f.recoverySigner),
      Buffer.from(f.proof.signature, 'hex'),
    ),
    true,
  );
  assert.equal(
    verify(
      null,
      bootstrapBytes(f.proof),
      createPublicKey(f.candidateSigner),
      Buffer.from(f.proof.countersignature, 'hex'),
    ),
    true,
  );
  assert.equal(f.proof.priorRecoveryStateDigest, stateDigest(f.draft));
  assert.equal(f.proof.newRecoveryStateDigest, stateDigest(f.draft));
  assert.equal(f.proof.clientNonce, f.assertion.clientNonce);
  assert.deepEqual(await verifyRecoveryBootstrap(f.proof, f.context), f.proof);
  assert(Object.isFrozen(f.proof));
});

test('fresh-nonce correlation and a held pin reject relay replay or a substituted authority', async () => {
  const f = await fixture();
  await assert.rejects(
    verifyRecoveryHeadAssertion(f.assertion, f.pin, {
      ...f.expected,
      clientNonce: '12'.repeat(32),
    }),
    /request changed/,
  );
  await assert.rejects(
    verifyRecoveryHeadAssertion(f.assertion, f.pin, {
      ...f.expected,
      workspaceId: '12'.repeat(16),
    }),
    /request changed/,
  );
  const rogue = key('13'.repeat(32));
  await assert.rejects(
    verifyRecoveryHeadAssertion(
      { ...f.assertion, signature: signed(rogue, headBytes(f.assertion)) },
      f.pin,
      f.expected,
    ),
  );
  await assert.rejects(
    prepareRecoveryBootstrap({ ...f.context, head: { ...f.context.head } }),
    /Unverified/,
  );
  const next = { ...f.assertion, clientNonce: '14'.repeat(32) };
  next.signature = signed(f.authority, headBytes(next));
  const head = await verifyRecoveryHeadAssertion(next, f.pin, {
    ...f.expected,
    clientNonce: next.clientNonce,
  });
  await assert.rejects(verifyRecoveryBootstrap(f.proof, { ...f.context, head }), /target changed/);
});

test('service signatures and a proposed verifier cannot replace the factor-opened bootstrap signer', async () => {
  const f = await fixture();
  await assert.rejects(verifyRecoveryBootstrap(f.resign(f.proof, f.authority), f.context));
  const forged = { ...f.draft, bootstrapSigner: f.pin.authRoot };
  await assert.rejects(
    prepareRecoveryBootstrap({ ...f.context, recovery: forged }),
    /state or authority changed/,
  );
  // Even if a hostile locator supplies a matching public digest, the actual code cannot open
  // a recovery payload with the attacker's signer. This must fail before producing its signature.
  await assert.rejects(
    createRecoveryBootstrap(
      { ...f.context, recovery: forged, currentRecoveryStateDigest: stateDigest(forged) },
      f.code,
      f.signer,
    ),
    /Bootstrap key mismatch/,
  );
});

test('valid signatures for another candidate, head or conflict cannot be redirected into this attempt', async () => {
  const f = await fixture();
  for (const changes of [
    { newCredentialId: '12'.repeat(16) },
    { newWPub: '12'.repeat(32) },
    { workspaceId: '12'.repeat(16) },
    { lineageId: '12'.repeat(32) },
    { observedEpoch: 8 },
    { observedHeadDigest: '12'.repeat(32) },
    { recoveredRoot: '12'.repeat(32) },
    { conflictParent: '12'.repeat(32) },
    { priorRecoveryStateDigest: '12'.repeat(32) },
    { newRecoveryStateDigest: '12'.repeat(32) },
  ])
    await assert.rejects(
      verifyRecoveryBootstrap(f.resign({ ...f.proof, ...changes }), f.context),
      /target changed/,
    );
  const other = key('15'.repeat(32));
  await assert.rejects(
    verifyRecoveryBootstrap(
      f.resign({ ...f.proof, newSPub: pub(other) }, f.recoverySigner, other),
      f.context,
    ),
    /target changed/,
  );
  await assert.rejects(
    verifyRecoveryBootstrap(f.resign(f.proof, f.recoverySigner, other), f.context),
  );
});

test('a self-consistent substituted service root still fails the code-sealed root anchor', async () => {
  const f = await fixture(),
    rogue = key('16'.repeat(32));
  const pin = { ...f.pin, authRoot: pub(rogue) };
  const assertion = { ...f.assertion, signature: signed(rogue, headBytes(f.assertion)) };
  const head = await verifyRecoveryHeadAssertion(assertion, pin, f.expected);
  const recovery = {
    ...f.draft,
    authRoot: pin.authRoot,
    rootCommitment: hash(
      lp('done/pkg-root/v1', f.draft.workspaceId, f.draft.lineageId, pin.authRoot),
    ),
  };
  await assert.rejects(
    createRecoveryBootstrap(
      {
        ...f.context,
        head,
        recovery,
        currentRecoveryStateDigest: stateDigest(recovery),
      },
      f.code,
      f.signer,
    ),
    /Sealed root mismatch/,
  );
});

test('wrong code, damaged envelope and mismatched local signing key do not produce a bootstrap', async () => {
  const f = await fixture();
  const wrong = (f.code[0] === '0' ? '1' : '0') + f.code.slice(1);
  await assert.rejects(createRecoveryBootstrap(f.context, wrong, f.signer));
  const damaged = { ...f.draft, envelope: { ...f.draft.envelope, ct: '00'.repeat(112) } };
  await assert.rejects(
    createRecoveryBootstrap(
      { ...f.context, recovery: damaged, currentRecoveryStateDigest: stateDigest(damaged) },
      f.code,
      f.signer,
    ),
  );
  const other = await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']);
  await assert.rejects(createRecoveryBootstrap(f.context, f.code, other.privateKey));
});

test('an old recovery capability cannot authorize a fresh bootstrap after recovery state changes', async () => {
  const f = await fixture(),
    replacement = await generateRecovery(f.scope);
  const context = {
    ...f.context,
    recovery: replacement.draft,
    currentRecoveryStateDigest: stateDigest(replacement.draft),
  };
  await assert.rejects(verifyRecoveryBootstrap(f.proof, context), /target changed/);
  const updated = {
    ...f.proof,
    priorRecoveryStateDigest: context.currentRecoveryStateDigest,
    newRecoveryStateDigest: context.currentRecoveryStateDigest,
  };
  await assert.rejects(verifyRecoveryBootstrap(f.resign(updated), context));
  const fresh = await createRecoveryBootstrap(context, replacement.code, f.signer);
  assert.deepEqual(await verifyRecoveryBootstrap(fresh, context), fresh);
});

test('input mutation across crypto awaits cannot change the checked target or retained result', async () => {
  const f = await fixture();
  const assertion = structuredClone(f.assertion),
    expected = { ...f.expected },
    pin = { ...f.pin };
  const checkingHead = verifyRecoveryHeadAssertion(assertion, pin, expected);
  assertion.head = '12'.repeat(32);
  expected.clientNonce = '13'.repeat(32);
  pin.authRoot = '14'.repeat(32);
  assert.deepEqual((await checkingHead).assertion, f.assertion);
  const proof = structuredClone(f.proof),
    recovery = structuredClone(f.draft),
    candidate = { ...f.context.candidate };
  const context = { ...f.context, recovery, candidate };
  const checking = verifyRecoveryBootstrap(proof, context);
  proof.newWPub = '12'.repeat(32);
  recovery.bootstrapSigner = '13'.repeat(32);
  recovery.envelope.ct = '00'.repeat(112);
  candidate.sPub = '14'.repeat(32);
  context.conflictParent = '15'.repeat(32);
  assert.deepEqual(await checking, f.proof);
  const prepared = await prepareRecoveryBootstrap(f.context);
  assert(Object.isFrozen(prepared.context.recovery.envelope));
  assert(Object.isFrozen(prepared.context.candidate));
});

test('strict proof parsing rejects ambiguous and oversized inputs before verification', async () => {
  const f = await fixture();
  for (const value of [
    { ...f.proof, extra: true },
    { ...f.proof, v: 2 },
    { ...f.proof, kind: 'rotation-request' },
    { ...f.proof, observedEpoch: '7' },
    { ...f.proof, observedEpoch: -0 },
    { ...f.proof, observedEpoch: Number.MAX_SAFE_INTEGER + 1 },
    { ...f.proof, newWPub: f.proof.newWPub.toUpperCase() },
    { ...f.proof, signature: '00'.repeat(63) },
    { ...f.proof, newCredentialId: 'a'.repeat(5000) },
  ])
    assert.throws(() => parseRecoveryBootstrap(value));
  for (const issuedAt of [-1, -0, 1.5, '0', NaN, Infinity])
    assert.throws(() => parseRecoveryHeadAssertion({ ...f.assertion, issuedAt }));
});

test('first-epoch recovery and clock-independent head assertions work; exact proof retry is stateless', async () => {
  for (const issuedAt of [0, Number.MAX_SAFE_INTEGER]) {
    const f = await fixture({ epoch: 1, issuedAt });
    assert.equal(f.context.head.assertion.issuedAt, issuedAt);
    assert.deepEqual(await verifyRecoveryBootstrap(f.proof, f.context), f.proof);
    // Deliberate: this is retryable evidence, not the future service's single-use commit gate.
    assert.deepEqual(await verifyRecoveryBootstrap(f.proof, f.context), f.proof);
  }
});
