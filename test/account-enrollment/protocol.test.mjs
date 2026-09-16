import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { lp, nonce, possessionMessage } from './fixtures.mjs';
import {
  parseEnrollmentCandidate,
  parseEnrollmentContext,
  parseEnrollmentChallenge,
  parseEnrollmentReceipt,
  parseEnrollmentResult,
  enrollmentContextBytes,
  enrollmentChallengeMessage,
  enrollmentPossessionMessage,
  enrollmentReceiptMessage,
  enrollmentNonce,
  verifyEnrollmentChallenge,
  verifyEnrollmentReceipt,
  verifyEnrollmentPossession,
} from '../../account-protocol/enrollment.ts';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const fixture = () => {
  const root = generateKeyPairSync('ed25519'),
    device = generateKeyPairSync('ed25519');
  const pub = (k) => k.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
  const context = {
    v: 1,
    pin: {
      v: 1,
      serviceId: '11'.repeat(16),
      origin: 'http://localhost:4999',
      rpId: 'localhost',
      authRoot: pub(root.publicKey),
    },
    accountId: randomBytes(32).toString('base64url'),
    attemptId: randomBytes(32).toString('base64url'),
    candidate: {
      v: 1,
      workspaceId: '22'.repeat(16),
      lineageId: '33'.repeat(32),
      head: '44'.repeat(32),
      credentialId: '55'.repeat(16),
      sPub: pub(device.publicKey),
      wPub: '66'.repeat(32),
    },
    epoch: 1,
    certifiedSetDigest: '77'.repeat(32),
    recoveryStateDigest: '88'.repeat(32),
    passkeyId: 'AQ',
    nonce: '99'.repeat(32),
    expiresAt: 601000,
  };
  const challenge = {
    v: 1,
    kind: 'enrollment-preparation-challenge',
    context,
    signature: sign(
      null,
      lp('done/enrollment-preparation-challenge/v1', JSON.stringify(context)),
      root.privateKey,
    ).toString('hex'),
  };
  const body = {
    v: 1,
    kind: 'enrollment-preparation-receipt',
    context,
    receiptId: randomBytes(32).toString('base64url'),
    preparedAt: 2000,
    expiresAt: 602000,
    assertionHash: 'aa'.repeat(32),
    possessionHash: 'bb'.repeat(32),
  };
  const receipt = {
    ...body,
    signature: sign(
      null,
      lp('done/enrollment-preparation-receipt/v1', JSON.stringify(body)),
      root.privateKey,
    ).toString('hex'),
  };
  return { context, challenge, receipt, root, device };
};
test('fixed-order closed messages match independent length-prefixed bytes and Node signatures', async () => {
  const x = fixture(),
    c = x.context;
  assert.equal(enrollmentContextBytes(c), JSON.stringify(c));
  assert.deepEqual(
    Buffer.from(enrollmentChallengeMessage(c)),
    lp('done/enrollment-preparation-challenge/v1', JSON.stringify(c)),
  );
  assert.deepEqual(Buffer.from(enrollmentPossessionMessage(c)), possessionMessage(c));
  assert.equal(await enrollmentNonce(c), nonce(c));
  const { signature: _signature, ...body } = x.receipt;
  assert.deepEqual(
    Buffer.from(enrollmentReceiptMessage(x.receipt)),
    lp('done/enrollment-preparation-receipt/v1', JSON.stringify(body)),
  );
  await verifyEnrollmentChallenge(x.challenge, c.pin, c.candidate, 1000);
  await verifyEnrollmentReceipt(x.receipt, c.pin, c.candidate);
  await verifyEnrollmentPossession(
    c,
    sign(null, possessionMessage(c), x.device.privateKey).toString('hex'),
  );
  assert.notEqual(sha(enrollmentChallengeMessage(c)), sha(enrollmentPossessionMessage(c)));
  const reversed = Object.fromEntries(Object.entries(c).reverse());
  assert.equal(enrollmentContextBytes(reversed), JSON.stringify(c));
});
test('every bound identity/key/context field is signed; no supplied pin can replace the expected root', async () => {
  const x = fixture(),
    c = x.context;
  const paths = [
    'accountId',
    'attemptId',
    'candidate.workspaceId',
    'candidate.lineageId',
    'candidate.head',
    'candidate.credentialId',
    'candidate.sPub',
    'candidate.wPub',
    'certifiedSetDigest',
    'recoveryStateDigest',
    'passkeyId',
    'nonce',
    'expiresAt',
    'pin.serviceId',
    'pin.authRoot',
  ];
  for (const path of paths) {
    const changed = structuredClone(x.challenge),
      keys = path.split('.');
    let target = changed.context;
    for (const k of keys.slice(0, -1)) target = target[k];
    const k = keys.at(-1);
    target[k] =
      k === 'expiresAt'
        ? target[k] + 1
        : k === 'passkeyId'
          ? 'Ag'
          : ['accountId', 'attemptId'].includes(k)
            ? randomBytes(32).toString('base64url')
            : 'ee'.repeat(target[k].length / 2);
    // Supply the altered public candidate too: an unchanged signature still cannot bless it.
    await assert.rejects(
      verifyEnrollmentChallenge(changed, c.pin, changed.context.candidate, 1001),
      undefined,
      path,
    );
  }
  const foreign = fixture();
  await assert.rejects(verifyEnrollmentReceipt(foreign.receipt, c.pin, foreign.context.candidate));
  await assert.rejects(verifyEnrollmentPossession(c, x.challenge.signature));
  await assert.rejects(verifyEnrollmentChallenge(x.challenge, c.pin, c.candidate, c.expiresAt));
});
test('strict parser bounds reject extensions, aliases, invalid deadlines and contradictory state', () => {
  const x = fixture();
  for (const c of [
    { ...x.context, epoch: 2 },
    { ...x.context, expiresAt: 1.5 },
    { ...x.context, passkeyId: 'AR' },
    { ...x.context, nonce: 'AA'.repeat(32) },
    { ...x.context, passkeyId: 'AQ'.repeat(1024) },
    { ...x.context, extra: 1 },
  ])
    assert.throws(() => parseEnrollmentContext(c));
  for (const c of [
    { ...x.context.candidate, credentialId: '00' },
    { ...x.context.candidate, v: 2 },
    { ...x.context.candidate, extra: 1 },
  ])
    assert.throws(() => parseEnrollmentCandidate(c));
  assert.throws(() =>
    parseEnrollmentChallenge({ ...x.challenge, kind: 'promotion-activation-challenge' }),
  );
  assert.throws(() => parseEnrollmentReceipt({ ...x.receipt, expiresAt: x.receipt.expiresAt + 1 }));
  assert.throws(() =>
    parseEnrollmentReceipt({
      ...x.receipt,
      preparedAt: x.context.expiresAt,
      expiresAt: x.context.expiresAt + 600000,
    }),
  );
  const r = { ok: true, stage: 'prepared', challenge: x.challenge, receipt: x.receipt };
  assert.deepEqual(parseEnrollmentResult(r), r);
  for (const change of [
    { receipt: null },
    { stage: 'certified' },
    { stage: 'challenge' },
    { extra: 1 },
    { ok: false },
    { challenge: { ...x.challenge, context: { ...x.context, nonce: 'ff'.repeat(32) } } },
  ])
    assert.throws(() => parseEnrollmentResult({ ...r, ...change }));
});
test('generated public-key substitutions change both assertion and possession bytes', async () => {
  const x = fixture(),
    before = await enrollmentNonce(x.context);
  await fc.assert(
    fc.asyncProperty(fc.uint8Array({ minLength: 32, maxLength: 32 }), async (bytes) => {
      const candidate = { ...x.context.candidate, wPub: Buffer.from(bytes).toString('hex') };
      fc.pre(candidate.wPub !== x.context.candidate.wPub);
      const c = { ...x.context, candidate };
      assert.notEqual(await enrollmentNonce(c), before);
      assert.notDeepEqual(enrollmentPossessionMessage(c), enrollmentPossessionMessage(x.context));
      await assert.rejects(
        verifyEnrollmentChallenge({ ...x.challenge, context: c }, c.pin, candidate, 1000),
      );
    }),
    { seed: 160901, numRuns: 100 },
  );
});
