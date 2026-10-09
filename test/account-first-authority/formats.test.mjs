import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyVectors } from '../../scripts/account-first-authority/vectors.mjs';
import { verifyPinnedAuthority } from '../../account-protocol/authority.ts';
import { verifyPendingProof } from '../../account-protocol/preparation.ts';
import {
  verifyAdmissionRequest,
  verifyOffer,
  verifyReceipt,
  verifyCompletion,
  verifySignature,
  parseReceipt,
} from '../../account-protocol/admission.ts';
import { verifyBindingProof } from '../../account-protocol/slot.ts';
import { assertion as verifyAssertion } from '../../account-service/webauthn.ts';
import { canonical as serviceCanonical } from '../../account-service/protocol.ts';
import {
  fixedFixture,
  hash,
  lp,
  signed,
  checks,
  certFields,
  manifestFields,
  semanticFields,
  bindingFields,
  message,
  at,
  replace,
  changed,
  omit,
} from './oracle.mjs';
import { cases, runtimeBytes, expectedBytes } from './cases.mjs';
const evidence = (name, data) => {
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
      JSON.stringify(data, null, 2) + '\n',
    );
  }
};
const find = (f, id) => cases(f).find((c) => c.id === id);

test('published fixed vectors match runtime and independent encoders with every declared binding exercised', async () => {
  const v = await verifyVectors();
  assert.equal(v.vectors.length, 17);
  for (const c of v.vectors) assert.ok(c.negatives.length > 0);
  assert.notEqual(v.genesisHeads.empty, v.genesisHeads.explicitZero);
  evidence('vectors', {
    cases: v.vectors.length,
    inputNegatives: v.vectors.reduce((n, c) => n + c.negatives.length, 0),
    encodedFieldControls: v.vectors.reduce((n, c) => n + c.encodedBindingControls.length, 0),
    runtimeParserRefusals: v.vectors
      .flatMap((c) => c.negatives)
      .filter((n) => n.runtime === 'parser-refusal').length,
    vectorSha256: hash(JSON.stringify(v)),
  });
});

test('200 shrinking-enabled recursive property reorderings preserve the complete byte contracts', async () => {
  const f = fixedFixture(),
    all = cases(f);
  const shuffle = (v, salt) =>
    Array.isArray(v)
      ? v.map((e, i) => shuffle(e, salt + i))
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => hash(salt + ':' + a).localeCompare(hash(salt + ':' + b)))
              .map(([k, x]) => [k, shuffle(x, salt + ':' + k)]),
          )
        : v;
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 0, max: all.length - 1 }),
      fc.integer(),
      async (index, salt) => {
        const c = all[index],
          input = shuffle(c.input, String(salt));
        assert.deepEqual(await runtimeBytes(c, input), expectedBytes(c, c.input));
      },
    ),
    { seed: 5110912, numRuns: 200 },
  );
  evidence('properties', {
    seed: 5110912,
    runs: 200,
    shrinking: true,
    property: 'Recursive input property ordering is immaterial; array order retained',
  });
});

test('fixed proofs cross actual verifier boundaries; genuinely signed wrong purpose, scope and key namespace refuse', async () => {
  const f = fixedFixture(),
    proof = {
      v: 1,
      pin: f.pin,
      nonce: f.nonce,
      signature: signed(
        f.keys.authority,
        expectedBytes(find(f, 'bootstrap'), { pin: f.pin, nonce: f.nonce }),
      ),
    };
  await verifyPinnedAuthority(f.pin, f.nonce, proof);
  const pending = {
    v: 1,
    pin: f.pin,
    nonce: f.nonce,
    state: f.pending,
    signature: signed(
      f.keys.authority,
      expectedBytes(find(f, 'pending'), { pin: f.pin, nonce: f.nonce, state: f.pending }),
    ),
  };
  await verifyPendingProof(f.pin, f.nonce, pending);
  await verifyAdmissionRequest(f.request, f.pending);
  await verifyOffer(f.offer, f.request, f.pin);
  await verifyReceipt(f.receipt, f.request, f.pin, { sv: '00', ds: '0000' });
  const assertionChallenge = JSON.parse(
    Buffer.from(f.assertion.response.clientDataJSON, 'base64url'),
  ).challenge;
  assert.equal(
    await verifyAssertion(f.assertion, assertionChallenge, f.pin, {
      id: f.binding.credId,
      account_id: f.binding.accountId,
      public_key: Buffer.from('a4010103272006215820' + f.pub.passkey, 'hex'),
      spki: f.binding.publicKey,
      state: 'confirmed',
      counter: 0,
    }),
    7,
  );
  assert.equal(hash(serviceCanonical(f.assertion)), f.receipt.activation.proofHash);
  const binding = {
    v: 1,
    kind: 'promotion-slot-binding',
    requestDigest: f.epoch.requestDigest,
    epochHead: f.offer.head,
    stored: {
      binding: f.binding,
      bindingSignature: signed(f.keys.authority, lp(...bindingFields(f.binding))),
    },
  };
  await verifyBindingProof(binding, f.request, f.receipt, f.pin);
  const otherPin = { ...f.pin, authRoot: f.pub.acceptance },
    otherProof = {
      ...proof,
      pin: otherPin,
      signature: signed(
        f.keys.acceptance,
        expectedBytes(find(f, 'bootstrap'), { pin: otherPin, nonce: f.nonce }),
      ),
    };
  assert.equal(
    checks(
      f.keys.acceptance,
      expectedBytes(find(f, 'bootstrap'), { pin: otherPin, nonce: f.nonce }),
      otherProof.signature,
    ),
    true,
  );
  await assert.rejects(verifyPinnedAuthority(f.pin, f.nonce, otherProof), /pin changed/);
  await assert.rejects(
    verifyOffer(
      { ...f.offer, signature: signed(f.keys.authority, message('epoch', f.epoch)) },
      f.request,
      f.pin,
    ),
    /signature/,
  );
  const wrongOwner = { ...f.epoch, owner: '56'.repeat(16) },
    wrongOffer = { ...f.offer, epoch: wrongOwner, head: hash(message('epoch', wrongOwner)) };
  wrongOffer.signature = signed(f.keys.authority, message('offer', wrongOffer));
  await assert.rejects(verifyOffer(wrongOffer, f.request, f.pin), /target changed/);
  for (const role of ['candidate', 'certification', 'origin']) {
    const r = structuredClone(f.request);
    if (role === 'candidate')
      r.candidate.signature = signed(f.keys.authority, message('candidate', r.candidate));
    if (role === 'certification')
      r.certification.signature = signed(f.keys.bootstrap, lp(...certFields(r)));
    if (role === 'origin') r.originSignature = signed(f.keys.authority, message('request', r));
    await assert.rejects(verifyAdmissionRequest(r, f.pending), /signature/);
  }
  await assert.rejects(
    verifyReceipt(
      { ...f.receipt, signature: signed(f.keys.acceptance, message('receipt', f.receipt)) },
      f.request,
      f.pin,
    ),
    /signature/,
  );
  const wrongBinding = structuredClone(binding);
  wrongBinding.stored.binding.credId = f.candidate.signer;
  wrongBinding.stored.bindingSignature = signed(
    f.keys.authority,
    lp(...bindingFields(wrongBinding.stored.binding)),
  );
  await assert.rejects(
    verifyBindingProof(wrongBinding, f.request, f.receipt, f.pin),
    /target changed/,
  );
  evidence('verifier-boundaries', {
    positive: ['pin', 'pending', 'request', 'offer', 'receipt', 'binding'],
    genuinelySignedNegatives: [
      'substituted pinned root',
      'wrong signature purpose',
      'wrong epoch owner',
      'wrong candidate signer',
      'wrong certification signer',
      'wrong origin signer',
      'acceptance key issuing receipt',
      'workspace signing ID as passkey ID',
    ],
  });
});

test('signed descriptors are not plaintext evidence; explicit zero-position genesis baseline refuses', async () => {
  const f = fixedFixture(),
    c = structuredClone(f.completion);
  c.manifest.sv = c.admission.derivedSv = '0100';
  c.manifest.signature = signed(f.keys.device, lp(...manifestFields(c.manifest)));
  c.admission.manifestDigest = hash(lp(...manifestFields(c.manifest)));
  c.admission.signature = signed(f.keys.device, lp(...semanticFields(c.admission)));
  await verifyCompletion(c, f.request, f.offer); // Content-blind service cannot rederive Yjs coverage.
  await assert.rejects(
    verifyCompletion(c, f.request, f.offer, { sv: '00', ds: '0000' }),
    /coverage/,
  );
  const zero = structuredClone(f.completion),
    head = hash(lp('done/headvec/v1', f.candidate.signer, '0', '00'.repeat(32)));
  zero.manifest.headVectorDigest = zero.admission.headBaselineDigest = head;
  zero.manifest.signature = signed(f.keys.device, lp(...manifestFields(zero.manifest)));
  zero.admission.manifestDigest = hash(lp(...manifestFields(zero.manifest)));
  zero.admission.signature = signed(f.keys.device, lp(...semanticFields(zero.admission)));
  await assert.rejects(verifyCompletion(zero, f.request, f.offer), /coverage/);
  evidence('semantic-boundary', {
    signedDescriptorLie:
      'passes content-blind verification; refuses with independently supplied coverage',
    signedZeroPositionBaseline: 'refuses; only empty first-genesis baseline accepted',
  });
});

test('closed nested objects, versions and array order are enforced before durable authority acceptance', async () => {
  const f = fixedFixture();
  const objects = (v, path = []) =>
    v && typeof v === 'object'
      ? [
          ...(Array.isArray(v) ? [] : [path]),
          ...Object.entries(v).flatMap(([k, x]) => objects(x, [...path, k])),
        ]
      : [];
  let extras = 0;
  for (const path of objects(f.receipt)) {
    const r = path.length
      ? replace(f.receipt, path, { ...at(f.receipt, path), unexpected: true })
      : { ...f.receipt, unexpected: true };
    assert.throws(() => parseReceipt(r));
    extras++;
  }
  for (const mutate of [
    (r) => (r.v = 1),
    (r) => (r.completion.manifest.v = 1),
    (r) => (r.completion.admission.v = 1),
    (r) => r.offer.epoch.capabilities.reverse(),
    (r) =>
      r.offer.epoch.heads.push({ credential: f.candidate.signer, n: 0, link: '00'.repeat(32) }),
  ]) {
    const r = structuredClone(f.receipt);
    mutate(r);
    await assert.rejects(verifyReceipt(r, f.request, f.pin));
  }
  for (const field of ['actors', 'wraps']) {
    const r = structuredClone(f.request);
    r.candidate[field].reverse();
    await assert.rejects(verifyAdmissionRequest(r, f.pending));
  }
  evidence('parser-boundaries', { nestedExtraFieldCases: extras, versionAndArrayCases: 7 });
});

test('six production message-builder field omissions rescue real signature failures', async () => {
  const f = fixedFixture(),
    results = [];
  for (const [id, path] of [
    ['candidate', ['preparation']],
    ['origin', ['candidate', 'preparation']],
    ['epoch', ['requestDigest']],
    ['offer', ['head']],
    ['receipt', ['activation', 'proofHash']],
    ['activation', ['nonce']],
  ]) {
    const c = find(f, id),
      input = replace(c.input, path, changed(at(c.input, path))),
      real = await runtimeBytes(c, c.input),
      realSig = signed(f.keys[c.signer], real);
    await assert.rejects(
      verifySignature(f.pub[c.signer], realSig, await runtimeBytes(c, input)),
      /signature/,
    );
    const subtle = crypto.subtle,
      old = Object.getOwnPropertyDescriptor(subtle, 'digest'),
      digest = subtle.digest.bind(subtle);
    let intercepted = 0;
    Object.defineProperty(subtle, 'digest', {
      configurable: true,
      value: async (algorithm, data) => {
        const body = JSON.parse(new TextDecoder().decode(data));
        intercepted++;
        return digest(algorithm, new TextEncoder().encode(JSON.stringify(omit(body, path))));
      },
    });
    try {
      const faulty = await runtimeBytes(c, c.input),
        altered = await runtimeBytes(c, input);
      assert.equal(intercepted, 2);
      assert.deepEqual(faulty, altered);
      assert.notDeepEqual(faulty, real);
      await verifySignature(f.pub[c.signer], signed(f.keys[c.signer], faulty), altered);
      results.push({
        id,
        path: path.join('.'),
        correctVerifierRefuses: true,
        productionDigestOmissionRescues: true,
      });
    } finally {
      if (old) Object.defineProperty(subtle, 'digest', old);
      else delete subtle.digest;
    }
  }
  evidence('production-omissions', {
    scope:
      'Production message builders and signature verifier under injected digest omission; not a bypass of every composite target/semantic predicate',
    results,
  });
});
