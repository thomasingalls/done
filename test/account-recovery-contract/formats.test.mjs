import test from 'node:test';
import assert from 'node:assert/strict';
import nodeCrypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import {
  generateRecovery,
  withRecoveryKeys,
  confirmRecovery,
  normalizeRecoveryCode,
} from '../../src/account/recovery.ts';
import {
  rootCommitment,
  envelopeBytes,
  recoveryStateDigest,
  draftDigest,
  confirmationBytes,
  parseDraft,
} from '../../account-protocol/recovery.ts';
import { generationInfo } from '../../account-protocol/genesis.ts';
import { openGeneration, sealGeneration } from '../../src/account/generationWrap.ts';
import {
  challenge,
  canonical,
  hash as runtimeHash,
  retryHash,
} from '../../account-service/protocol.ts';
import { recoveryChallenge, verifyRecoveryProof } from '../../account-service/recovery.ts';
import {
  corpus,
  fixture,
  bytes,
  lp,
  hash,
  seal,
  open,
  hpke,
  signature,
  canonical as independentCanonical,
} from './oracle.mjs';
const saved = JSON.parse(readFileSync('test/vectors/account-recovery.json'));
const f = saved.fixture,
  v = (id) => saved.vectors.find((v) => v.id === id);
const report = (name, value) => {
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
      JSON.stringify(value, null, 2) + '\n',
    );
  }
};
const importPrivate = (raw, kind, extractable = false) =>
  crypto.subtle.importKey(
    'pkcs8',
    bytes(
      (kind === 'X25519'
        ? '302e020100300506032b656e04220420'
        : '302e020100300506032b657004220420') + raw,
    ),
    kind,
    extractable,
    kind === 'X25519' ? ['deriveBits'] : ['sign'],
  );
const openDraft = (draft) =>
  withRecoveryKeys(draft, f.code, crypto.subtle, async (r, s) => {
    assert.equal(r.extractable, false);
    assert.equal(s.extractable, false);
    return 'opened';
  });
const reseal = (payload, draft = f.draft) => ({
  ...draft,
  envelope: {
    ...draft.envelope,
    ct: seal(
      bytes(f.key),
      bytes(f.nonce),
      lp('done/recovery/v1', draft.principalId, '1', draft.rPub),
      payload,
    ).toString('hex'),
  },
});

test('fixed corpus independently reproduces; amended row 14 agrees and historical scalar-only ciphertext refuses', async () => {
  assert.deepEqual(corpus(), saved);
  assert.equal(f.rPub, '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a');
  assert.equal(
    f.bootstrapSigner,
    'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
  );
  const row = JSON.parse(readFileSync('test/vectors/recovery-code.json'));
  assert.equal(row.seal_vectors[0].expected.ct, f.ct);
  assert.equal(row.seal_vectors[0].inputs.payload, f.payload);
  for (const sealVector of row.seal_vectors) {
    const i = sealVector.inputs;
    const draft = {
      ...f.draft,
      principalId: i.principal_id,
      envelope: { ...f.draft.envelope, ct: sealVector.expected.ct },
    };
    assert.equal(
      await withRecoveryKeys(draft, i.code, crypto.subtle, async () => 'opened'),
      'opened',
    );
  }
  for (const n of row.normalization_vectors) {
    assert.equal(normalizeRecoveryCode(n.inputs.typed), n.expected.canonical);
    assert.equal(
      await withRecoveryKeys(f.draft, n.inputs.typed, crypto.subtle, async () => 'opened'),
      'opened',
    );
  }
  for (const bad of row.rejected_inputs) assert.throws(() => normalizeRecoveryCode(bad.input));
  const historical = JSON.parse(
    readFileSync('test/vectors/historical/recovery-code.scalar-only.json'),
  ).seal_vectors[0];
  assert.equal(bytes(historical.expected.ct).length, 48);
  assert.equal(
    open(
      bytes(historical.derived.k_rec),
      bytes(historical.inputs.nonce),
      bytes(historical.derived.aad),
      bytes(historical.expected.ct),
    ).toString('hex'),
    f.rPrivate,
  );
  assert.throws(() =>
    parseDraft({ ...f.draft, envelope: { ...f.draft.envelope, ct: historical.expected.ct } }),
  );
});

test('actual generator and opener reproduce full deterministic payload, KDF/AAD, root and key checks', async (t) => {
  const r = {
    privateKey: await importPrivate(f.rPrivate, 'X25519', true),
    publicKey: await crypto.subtle.importKey('raw', bytes(f.rPub), 'X25519', true, []),
  };
  const s = {
    privateKey: await importPrivate(f.bootstrapSeed, 'Ed25519', true),
    publicKey: await crypto.subtle.importKey('raw', bytes(f.bootstrapSigner), 'Ed25519', true, [
      'verify',
    ]),
  };
  const draws = [
    Buffer.from([...f.code].map((c) => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'.indexOf(c))),
    bytes(f.salt),
    bytes(f.nonce),
  ];
  const random = t.mock.method(crypto, 'getRandomValues', (array) => {
    const next = draws.shift();
    assert.equal(array.length, next.length);
    array.set(next);
    return array;
  });
  const keys = t.mock.method(crypto.subtle, 'generateKey', async (kind) =>
    kind === 'X25519' ? r : s,
  );
  try {
    const actual = await generateRecovery({
      principalId: f.principalId,
      workspaceId: f.workspaceId,
      lineageId: f.lineageId,
      authRoot: f.authRoot,
    });
    assert.equal(actual.code.replaceAll('-', ''), f.code);
    assert.deepEqual(actual.draft, f.draft);
    assert.equal(draws.length, 0);
  } finally {
    random.mock.restore();
    keys.mock.restore();
  }
  const signed = [],
    original = crypto.subtle.sign.bind(crypto.subtle);
  const spy = t.mock.method(crypto.subtle, 'sign', async (algorithm, key, message) => {
    const result = await original(algorithm, key, message);
    if (algorithm === 'Ed25519')
      signed.push({
        messageHex: Buffer.from(message).toString('hex'),
        signature: Buffer.from(result).toString('hex'),
      });
    return result;
  });
  try {
    assert.equal(await openDraft(f.draft), 'opened');
  } finally {
    spy.mock.restore();
  }
  assert.deepEqual(signed, [
    {
      messageHex: v('recovery-key-check').expected.messageHex,
      signature: v('recovery-key-check').expected.signature,
    },
  ]);
  assert.equal(await rootCommitment(f.draft), f.root);
  assert.equal(
    Buffer.from(envelopeBytes(f.draft)).toString('hex'),
    v('recovery-envelope').expected.messageHex,
  );
  assert.equal(await recoveryStateDigest(f.draft), f.stateDigest);
  assert.equal(await draftDigest(f.draft), f.draftDigest);
  assert.equal(
    Buffer.from(confirmationBytes(f.challenge, f.draftDigest)).toString('hex'),
    v('recovery-confirm').expected.messageHex,
  );
  const proof = await confirmRecovery(f.draft, f.code, f.challenge, f.draftDigest);
  assert.equal(proof, v('recovery-confirm').expected.signature);
  await verifyRecoveryProof(f.bootstrapSigner, f.challenge, f.draftDigest, proof);
});

test('actual service challenge encoders use exact operation, scope and fresh nonce; proof/retry hashes preserve their byte rules', async (t) => {
  const random = t.mock.method(nodeCrypto, 'randomBytes', (size) => {
    assert.equal(size, 32);
    return bytes(Buffer.from(f.serviceNonce, 'base64url').toString('hex'));
  });
  syncBuiltinESMExports();
  let count = 0;
  try {
    for (const op of ['register', 'confirm-registration', 'authenticate']) {
      const args = [op, f.attemptId, f.accountId, f.rpId, f.origin];
      assert.equal(
        challenge(...args),
        bytes(v('account-challenge-' + op).expected.resultHex).toString('base64url'),
      );
      for (let i = 0; i < args.length; i++) {
        assert.notEqual(challenge(...args.with(i, args[i] + '~')), challenge(...args));
        count++;
      }
    }
    const args = [f.attemptId, f.accountId, f.recoveryId, f.draftDigest, f.rpId, f.origin];
    assert.equal(recoveryChallenge(...args), f.challenge);
    for (let i = 0; i < args.length; i++) {
      assert.notEqual(recoveryChallenge(...args.with(i, args[i] + '~')), f.challenge);
      count++;
    }
    random.mock.mockImplementation((size) => Buffer.alloc(size, 0x74));
    assert.notEqual(recoveryChallenge(...args), f.challenge);
    for (const op of ['register', 'confirm-registration', 'authenticate'])
      assert.notEqual(
        challenge(op, f.attemptId, f.accountId, f.rpId, f.origin),
        bytes(v('account-challenge-' + op).expected.resultHex).toString('base64url'),
      );
  } finally {
    random.mock.restore();
    syncBuiltinESMExports();
  }
  const proof = {
    id: 'credential',
    response: {
      authenticatorData: 'AQID',
      clientDataJSON: 'eyJ0eXBlIjoiZ2V0In0',
      signature: 'BAUG',
    },
    extra: [true, 3, null],
  };
  assert.equal(canonical(proof), independentCanonical(proof));
  assert.equal(runtimeHash(canonical(proof)), hash(independentCanonical(proof)));
  assert.equal(retryHash(f.serviceNonce), hash(Buffer.from(f.serviceNonce, 'base64url')));
  assert.notEqual(retryHash(f.serviceNonce), hash(f.serviceNonce));
  report('challenge-bindings', {
    argumentMutations: count,
    freshNonceMutations: 4,
    proofCanonicalization: true,
    retryDecodedBytes: true,
  });
});

test('authenticated wrong private/public pairs, sealed roots, segment order and widths refuse before releasing keys', async () => {
  const outcomes = [];
  const attempt = async (name, draft, pattern) => {
    await assert.rejects(openDraft(draft), pattern);
    outcomes.push(name);
  };
  for (const [name, offset, pattern] of [
    ['wrapping-private', 1, /Recovery key mismatch/],
    ['sealed-root', 32, /Sealed root mismatch/],
    ['bootstrap-private', 64, /Bootstrap key mismatch/],
  ]) {
    const payload = bytes(f.payload);
    payload[offset] ^= 1;
    await attempt(name, reseal(payload), pattern);
  }
  const payload = bytes(f.payload);
  await attempt(
    'swapped-root-signer',
    reseal(
      Buffer.concat([payload.subarray(0, 32), payload.subarray(64), payload.subarray(32, 64)]),
    ),
    /Sealed root mismatch/,
  );
  for (const n of [0, 32, 64, 95, 97, 128])
    await attempt('payload-length-' + n, reseal(Buffer.alloc(n)), /canonical hex/);
  for (const key of ['workspaceId', 'lineageId', 'authRoot']) {
    const draft = structuredClone(f.draft);
    draft[key] = key === 'authRoot' ? 'ac'.repeat(32) : draft[key] + '-other';
    await attempt('public-' + key, draft, /Recovery context mismatch/);
    draft.rootCommitment = hash(
      lp('done/pkg-root/v1', draft.workspaceId, draft.lineageId, draft.authRoot),
    );
    await attempt('recomputed-' + key, draft, /Sealed root mismatch/);
  }
  for (const key of ['principalId', 'rPub', 'bootstrapSigner']) {
    const draft = structuredClone(f.draft);
    draft[key] = key === 'principalId' ? 'other-principal' : '02'.repeat(32);
    await attempt('public-' + key, draft);
  }
  for (const key of ['salt', 'nonce', 'ct']) {
    const draft = structuredClone(f.draft);
    const changed = bytes(draft.envelope[key]);
    changed[0] ^= 1;
    draft.envelope[key] = changed.toString('hex');
    await attempt(key, draft);
  }
  await assert.rejects(
    withRecoveryKeys(f.draft, '0'.repeat(25), crypto.subtle, async () => assert.fail('released')),
  );
  for (const key of ['v', 'envelope']) {
    const draft = structuredClone(f.draft);
    if (key === 'v') draft.v = 0;
    else draft.envelope.v = 0;
    await attempt(key + '-version', draft);
  }
  report('payload-refusals', outcomes);
});

test('every encoded field mutation and omission changes its independent result; signatures and AEAD reject valid wrong-purpose bytes', async () => {
  let negatives = 0,
    omissions = 0,
    signatureChecks = 0,
    aeadChecks = 0;
  for (const item of saved.vectors) {
    for (const altered of [...item.negatives, ...item.encodedBindingControls]) {
      assert.notEqual(altered.resultHex, item.expected.resultHex, item.id);
      if (item.kind === 'signature') {
        const pub = await crypto.subtle.importKey(
          'raw',
          bytes(f.bootstrapSigner),
          'Ed25519',
          false,
          ['verify'],
        );
        assert(
          await crypto.subtle.verify(
            'Ed25519',
            pub,
            bytes(altered.resultHex),
            bytes(altered.messageHex),
          ),
        );
        assert.equal(
          await crypto.subtle.verify(
            'Ed25519',
            pub,
            bytes(altered.resultHex),
            bytes(item.expected.messageHex),
          ),
          false,
        );
        signatureChecks++;
      }
      if (item.id === 'recovery-seal') {
        assert.throws(() =>
          open(
            bytes(f.key),
            bytes(f.nonce),
            bytes(item.expected.messageHex),
            bytes(altered.resultHex),
          ),
        );
        aeadChecks++;
      }
    }
    negatives += item.negatives.length;
    omissions += item.encodedBindingControls.length;
  }
  const proof = v('recovery-confirm').expected.signature;
  for (const [challengeValue, digest] of [
    [f.serviceNonce, f.draftDigest],
    [f.challenge, 'cd'.repeat(32)],
  ])
    await assert.rejects(verifyRecoveryProof(f.bootstrapSigner, challengeValue, digest, proof));
  for (const label of [
    'done/recovery-key-check/v1',
    'done/recovery-bootstrap/v1',
    'done/recovery-replace/v1',
  ]) {
    const message = lp(label, f.challenge, f.draftDigest),
      forged = signature(message, f.bootstrapSeed);
    await assert.rejects(
      verifyRecoveryProof(f.bootstrapSigner, f.challenge, f.draftDigest, forged),
    );
  }
  await assert.rejects(
    confirmRecovery(f.draft, f.code, f.challenge, 'cd'.repeat(32)),
    /Recovery context mismatch/,
  );
  report('encoded-bindings', {
    fixed: saved.vectors.length,
    negatives,
    omissions,
    signatureChecks,
    aeadChecks,
    note: 'Encoded-field controls use independent primitives; production guard controls are reported separately.',
  });
});

test('recovery-opened key consumes fixed HPKE wrap with exact generation info; each binding and low-order recipient refuses', async () => {
  const fixed = v('recovery-generation-wrap');
  const info = generationInfo({ ...f.draft, generation: 1 });
  assert.equal(Buffer.from(info).toString('hex'), fixed.expected.messageHex);
  assert.deepEqual(hpke(f), {
    enc: fixed.expected.enc,
    ct: fixed.expected.ct,
    key: fixed.expected.key,
    nonce: fixed.expected.nonce,
  });
  await withRecoveryKeys(f.draft, f.code, crypto.subtle, async (r) => {
    assert.equal(
      Buffer.from(await openGeneration(fixed.expected, r, bytes(f.rPub), info)).toString('hex'),
      f.generationKey,
    );
    for (const negative of fixed.negatives)
      await assert.rejects(
        openGeneration(fixed.expected, r, bytes(f.rPub), lp(...negative.fields)),
      );
    for (const negative of fixed.encodedBindingControls)
      await assert.rejects(
        openGeneration(fixed.expected, r, bytes(f.rPub), bytes(negative.messageHex)),
      );
    for (const enc of ['00'.repeat(32), '01' + '00'.repeat(31)])
      await assert.rejects(openGeneration({ enc, ct: fixed.expected.ct }, r, bytes(f.rPub), info));
  });
  // Sender is fixed only for this probe; production generates a new context each invocation.
  const sender = {
    privateKey: await importPrivate(f.senderPrivate, 'X25519'),
    publicKey: await crypto.subtle.importKey('raw', bytes(fixed.expected.enc), 'X25519', true, []),
  };
  const subtle = new Proxy(crypto.subtle, {
    get(target, key) {
      if (key === 'generateKey') return async () => sender;
      return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
    },
  });
  assert.deepEqual(await sealGeneration(bytes(f.rPub), info, bytes(f.generationKey), subtle), {
    enc: fixed.expected.enc,
    ct: fixed.expected.ct,
  });
});

test('200 generated contexts, normalized codes and authentic payload faults: runtime and independent oracle agree', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.uint8Array({ minLength: 32, maxLength: 32 }),
      fc.integer({ min: 0, max: 2 }),
      fc.integer({ min: 1, max: 255 }),
      fc.boolean(),
      async (root, part, delta, lower) => {
        const x = fixture({
          authRoot: Buffer.from(root).toString('hex'),
          workspaceId: 'w-' + root[0],
          lineageId: 'l-' + root[1],
        });
        const code = lower
          ? x.code.toLowerCase().replaceAll('0', 'o').replaceAll('1', 'l').match(/.{5}/g).join(' ')
          : x.code;
        assert.equal(
          await withRecoveryKeys(x.draft, code, crypto.subtle, async () => 'opened'),
          'opened',
        );
        assert.equal(await draftDigest(x.draft), x.draftDigest);
        const damaged = bytes(x.payload);
        damaged[part * 32 + 1] ^= delta;
        const ct = seal(bytes(x.key), bytes(x.nonce), lp(...x.aadFields), damaged).toString('hex');
        let calls = 0;
        await assert.rejects(
          withRecoveryKeys(
            { ...x.draft, envelope: { ...x.draft.envelope, ct } },
            code,
            crypto.subtle,
            async () => {
              calls++;
            },
          ),
        );
        assert.equal(calls, 0);
      },
    ),
    { seed: 5110913, numRuns: 200 },
  );
  report('properties', {
    seed: 5110913,
    runs: 200,
    shrinkingEnabled: true,
    generator: 'root/scope, normalization, payload segment and nonzero changed byte',
    controls: 'Each authentic reseal must refuse before callback',
  });
});
