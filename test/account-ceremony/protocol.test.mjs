import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  ceremonyCommitment,
  ceremonyTranscriptBytes,
  ceremonyWrapInfo,
  deriveCeremonyOpening,
  normalizeCeremonyCode,
  parseCeremonyTranscript,
  parseCeremonyCommitments,
} from '../../account-protocol/ceremony.ts';
import {
  honest,
  published,
  vectors,
  commitments,
  commitment,
  transcript,
  derive,
  change,
  lp,
  sha,
} from './oracle.mjs';

test('unchanged published ceremony and recovery digest reproduce byte for byte', async () => {
  const state = published.inputs.recovery_state;
  assert.equal(
    sha(
      lp(
        'done/recovery-state/v1',
        state.counter,
        state.r_pub,
        state.recovery_envelope_digest,
        state.root_commitment,
        state.bootstrap_signer,
      ),
    ),
    honest.recoveryStateDigest,
  );
  for (const role of ['existing', 'new']) {
    assert.equal(
      await ceremonyCommitment(role, role === 'existing' ? honest.nonceExisting : honest.nonceNew),
      published.derived[`commitment_${role}`],
    );
  }
  assert.equal(
    Buffer.from(ceremonyTranscriptBytes(honest)).toString('hex'),
    published.derived.transcript,
  );
  const result = await deriveCeremonyOpening(honest, commitments(honest));
  assert.deepEqual(result, derive(honest));
  assert.equal(result.transcriptHash, published.derived.transcript_hash);
  assert.equal(result.wrapInfo, published.derived.wrap_info);
  assert.equal(result.sas, published.expected.sas);
  assert.equal(
    Buffer.from(ceremonyWrapInfo(result.transcriptHash)).toString('hex'),
    result.wrapInfo,
  );
  assert(Object.isFrozen(result));
});

const mutations = {
  'substituted-wrapping-key': { wPub: vectors.keypairs.substituted.public_key },
  'substituted-signing-key': { sPub: vectors.signing_keypairs.substituted_signing.public_key },
  'wrong-workspace': { workspaceId: 'different-workspace' },
  'wrong-epoch': { epoch: honest.epoch + 1 },
  'stale-epoch-head': { head: '11'.repeat(32) },
  'wrong-existing-credential': { existingCredentialId: 'different-existing' },
  'wrong-new-credential': { newCredentialId: 'different-new' },
  'wrong-existing-nonce': { nonceExisting: '22'.repeat(32) },
  'wrong-new-nonce': { nonceNew: '33'.repeat(32) },
  'transposed-nonces': { nonceExisting: honest.nonceNew, nonceNew: honest.nonceExisting },
  'substituted-recovery-state': {
    recoveryStateDigest: vectors.must_fail.find((v) => v.name === 'substituted-recovery-state')
      .values.substituted_digest,
  },
};
for (const [name, patch] of Object.entries(mutations)) {
  test(`published negative: ${name}`, async () => {
    const input = { ...honest, ...patch };
    // Fresh matching commitments isolate transcript binding. This does not authorize a restart.
    const result = await deriveCeremonyOpening(input, commitments(input));
    assert.deepEqual(result, derive(input));
    assert.notEqual(result.transcriptHash, published.derived.transcript_hash);
    assert.notEqual(result.sas, published.expected.sas); // these fixed fixtures, not collision-freedom
    assert.notEqual(result.wrapInfo, published.derived.wrap_info);
  });
}
test('published opening/role/domain negatives and complete negative inventory', async () => {
  await assert.rejects(
    deriveCeremonyOpening(change(honest, 'nonceNew'), commitments(honest)),
    /commitment mismatch/,
  );
  const equalNonces = { ...honest, nonceNew: honest.nonceExisting };
  const c = commitments(equalNonces);
  assert.notEqual(c.existing, c.new);
  await assert.rejects(
    deriveCeremonyOpening(equalNonces, { existing: c.existing, new: c.existing }),
    /commitment mismatch/,
  );
  await assert.rejects(
    deriveCeremonyOpening(honest, {
      ...commitments(honest),
      new: commitment('new', honest.nonceNew, 'done/enroll-commit/v2'),
    }),
    /commitment mismatch/,
  );
  assert.notEqual(
    derive(honest, 'done/enroll/v2').sas,
    (await deriveCeremonyOpening(honest, commitments(honest))).sas,
  );
  assert.deepEqual(
    new Set(vectors.must_fail.map((v) => v.name)),
    new Set([
      ...Object.keys(mutations),
      'commitment-opened-with-wrong-nonce',
      'commitment-role-echoed',
      'aad-only-renumbered-commit-label',
      'aad-only-renumbered-transcript-label',
    ]),
  );
});

test('closed scalar bounds reject aliases, coercion, excess/missing fields and malformed openings', async () => {
  for (const key of Object.keys(honest)) {
    const missing = { ...honest };
    delete missing[key];
    assert.throws(() => parseCeremonyTranscript(missing));
    for (const value of [null, undefined, {}, [], true])
      assert.throws(() => parseCeremonyTranscript({ ...honest, [key]: value }));
  }
  for (const epoch of [0, -0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '9'])
    assert.throws(() => parseCeremonyTranscript({ ...honest, epoch }));
  for (const key of ['head', 'wPub', 'sPub', 'recoveryStateDigest', 'nonceExisting', 'nonceNew'])
    for (const value of ['ab'.repeat(31), 'ab'.repeat(33), 'AB'.repeat(32), 'gg'.repeat(32)])
      assert.throws(() => parseCeremonyTranscript({ ...honest, [key]: value }));
  for (const key of ['workspaceId', 'existingCredentialId', 'newCredentialId']) {
    for (const value of ['', 'a'.repeat(129), 'bad space', 'é', '\n', 'x\u0000'])
      assert.throws(() => parseCeremonyTranscript({ ...honest, [key]: value }));
    assert.equal(parseCeremonyTranscript({ ...honest, [key]: 'a'.repeat(128) })[key].length, 128);
  }
  assert.throws(() => parseCeremonyTranscript({ ...honest, extra: 1 }));
  assert.throws(() =>
    parseCeremonyTranscript({ ...honest, newCredentialId: honest.existingCredentialId }),
  );
  for (const input of [
    null,
    [],
    {},
    { ...commitments(honest), extra: 1 },
    { existing: '00', new: 'ff' },
  ])
    assert.throws(() => parseCeremonyCommitments(input));
  for (const role of ['', 'Existing', 'candidate', {}, null])
    assert.throws(() => ceremonyCommitment(role, honest.nonceNew));
  assert.throws(() => ceremonyWrapInfo('bad'));
  const reverse = Object.fromEntries(Object.entries(honest).reverse());
  assert.deepEqual(parseCeremonyTranscript(reverse), honest);
  assert.deepEqual(Buffer.from(ceremonyTranscriptBytes(reverse)), transcript(honest));
});

test('input and commitments are detached before the first asynchronous digest', async () => {
  const input = { ...honest },
    c = commitments(input);
  let release,
    count = 0;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const subtle = new Proxy(crypto.subtle, {
    get(target, key) {
      if (key === 'digest')
        return async (...args) => {
          if (++count <= 2) await gate;
          return target.digest(...args);
        };
      return target[key].bind(target);
    },
  });
  const pending = deriveCeremonyOpening(input, c, subtle);
  input.wPub = 'ff'.repeat(32);
  input.nonceNew = 'ff'.repeat(32);
  c.new = 'ff'.repeat(32);
  release();
  assert.deepEqual(await pending, derive(honest));
});

test('five-symbol normalization has bounded ASCII input and no comparison oracle', () => {
  for (const [input, expected] of [
    ['r76mr', 'R76MR'],
    [' o-I l 2-3\r\n', '01123'],
    ['\t00000\t', '00000'],
  ])
    assert.equal(normalizeCeremonyCode(input), expected);
  for (const input of [
    null,
    12345,
    {},
    '',
    '1234',
    '123456',
    '12U45',
    'ſ2345',
    'ı2345',
    '１２３４５',
    '\u00a012345',
    '\0' + '12345',
    '-'.repeat(65) + '12345',
  ])
    assert.throws(() => normalizeCeremonyCode(input));
  assert.equal(normalizeCeremonyCode('0'.repeat(5)), '00000'); // valid syntax is not a match
});

test('100 generated contexts agree with Node HKDF and bind every field without assuming SAS collision-freedom', async () => {
  const hex32 = fc
    .uint8Array({ minLength: 32, maxLength: 32 })
    .map((b) => Buffer.from(b).toString('hex'));
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        workspaceId: hex32,
        epoch: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER - 1 }),
        head: hex32,
        existingCredentialId: hex32.map((h) => `e${h}`),
        newCredentialId: hex32.map((h) => `n${h}`),
        wPub: hex32,
        sPub: hex32,
        recoveryStateDigest: hex32,
        nonceExisting: hex32,
        nonceNew: hex32,
      }),
      async (input) => {
        const expected = derive(input),
          actual = await deriveCeremonyOpening(input, commitments(input));
        assert.deepEqual(actual, expected);
        assert.equal(normalizeCeremonyCode(actual.sas.toLowerCase()), actual.sas);
        for (const key of Object.keys(input)) {
          const changed = change(input, key);
          assert.notEqual(sha(ceremonyTranscriptBytes(changed)), actual.transcriptHash, key);
          assert.deepEqual(Buffer.from(ceremonyTranscriptBytes(changed)), transcript(changed), key);
        }
      },
    ),
    { seed: 16091607, numRuns: 100 },
  );
});
