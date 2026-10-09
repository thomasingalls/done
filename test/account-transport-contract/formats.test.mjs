import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import nodeCrypto, { createPublicKey, verify, createDecipheriv } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import fc from 'fast-check';
import { AcceptanceCustody } from '../../account-service/acceptance.ts';
import { parseWitness } from '../../account-service/deliveryWitness.ts';
import {
  corpus,
  b,
  hex,
  hash,
  json,
  encode,
  signBytes,
  privateKey,
  zero,
  refusalParts,
  headParts,
  submissionParts,
  envelopeParts,
  encrypted,
  linkParts,
  pageValues,
  requestValues,
} from './oracle.mjs';
import {
  E,
  S,
  P,
  D,
  I,
  u,
  envelope,
  body,
  submission,
  page,
  edPrivate,
  edPublic,
  ledger,
  assertActual,
} from './runtime.mjs';
const saved = JSON.parse(readFileSync('test/vectors/account-transport.json')),
  f = saved.fixture;
const find = (id) => saved.vectors.find((v) => v.id === id);
const report = (name, value) => {
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
      JSON.stringify(value, null, 2) + '\n',
    );
  }
};
const authority = {
  workspace: f.base.workspace,
  lineage: f.base.lineage,
  head: f.base.head,
  tip: 1,
  acceptanceKey: f.keys.acceptance.publicKey,
};
const route = {
  v: 2,
  workspace_id: f.base.workspace,
  credential_id: f.base.credential,
  epoch: 1,
  gen: 1,
};
const expected = { ...f.subject, parent: zero, previous: zero };
const verifier = await edPublic(f.keys.member.publicKey),
  signer = await edPrivate(f.keys.member.seed);

test('37 fixed constructions agree with runtime; existing envelope vectors remain exact positives with v1 mint refused', async () => {
  assert.deepEqual(corpus(), saved);
  for (const v of saved.vectors) await assertActual(v, f, assert);
  for (const e of f.envelopes) {
    const wire = u(hex(encode(envelopeParts(e))));
    assert.deepEqual(await E.openNetworkEnvelope(wire, e, verifier, u(f.kg)), body(f));
    if (e.v === 2)
      assert.equal(
        hex(await E.sealNetworkEnvelope(e, body(f), u(f.kg), signer, u(e.nonce))),
        hex(wire),
      );
    else
      await assert.rejects(
        E.sealNetworkEnvelope(e, body(f), u(f.kg), signer, u(e.nonce)),
        /require v2/,
      );
  }
  let reused = 0;
  for (const name of ['envelope', 'private-envelope']) {
    const old = JSON.parse(readFileSync('test/vectors/' + name + '.json')),
      key = await edPublic(old.keys.device.public_key);
    for (const v of old.vectors) {
      const i = v.inputs,
        e = {
          v: i.v,
          workspace_id: i.workspace_id,
          credential_id: i.credential_id,
          epoch: i.epoch,
          gen: i.gen,
          seq: i.seq,
          nonce: u(i.nonce),
          ct: u(v.expected.ciphertext),
          digest: u(v.expected.digest),
          sig: u(v.expected.signature),
        },
        wire = E.encodeNetworkEnvelope(e);
      assert.equal(hex(E.envelopeKeyInfo(e)), v.derived.hkdf_info);
      assert.equal(hex(E.envelopeAAD(e)), v.derived.aad);
      assert.equal(
        hex(E.envelopeSignatureMessage(e, e.nonce, e.digest)),
        v.derived.signature_message,
      );
      assert.equal(
        hex(E.encodeEnvelopeBody(await E.openNetworkEnvelope(wire, e, key, u(i.k_g)))),
        v.derived.body,
      );
      if (v.expected.wire) assert.equal(hex(wire), v.expected.wire);
      reused++;
    }
  }
  report('fixed', {
    constructions: saved.vectors.length,
    reusedEnvelopePositives: reused,
    actualGeneratorOpenAndSigning: true,
    wireVersionChanges: false,
  });
});

test('every declared encoded leaf has a changed-input negative and an effective omission control', async () => {
  let negatives = 0,
    omissions = 0,
    signatureChecks = 0,
    aeadChecks = 0;
  for (const v of saved.vectors) {
    assert.equal(v.negatives.length, v.encodedBindingControls.length);
    for (const [i, n] of v.negatives.entries()) {
      const o = v.encodedBindingControls[i];
      assert.equal(n.field, o.field);
      assert.notEqual(n.messageHex, v.expected.messageHex);
      assert.notEqual(n.resultHex, v.expected.resultHex);
      // Remove the very field changed by the negative: both encoded messages collapse to the same bytes.
      const p = structuredClone(n.parts),
        [name, ...path] = n.field.split('.'),
        at = p.findIndex((p) => p.name === name);
      if (!path.length) p.splice(at, 1);
      else {
        let value = p[at].value;
        for (const key of path.slice(0, -1)) value = value[Number(key)];
        value.splice(Number(path.at(-1)), 1);
      }
      assert.equal(hex(encode(p)), o.messageHex);
      if (v.kind === 'signature') {
        const seed =
            f.keys[
              v.signer === 'transport-acceptance'
                ? 'acceptance'
                : v.signer === 'transport-reader'
                  ? 'reader'
                  : 'member'
            ].seed,
          key = createPublicKey(privateKey(seed));
        assert(verify(null, b(n.messageHex), key, b(n.resultHex)));
        assert(!verify(null, b(v.expected.messageHex), key, b(n.resultHex)));
        assert(verify(null, encode(p), key, b(o.resultHex)));
        signatureChecks++;
      }
      if (v.kind === 'aead') {
        const e = f.envelopes[v.id.includes('v1') ? 0 : 1],
          key = b(find('transport-envelope-v' + e.v + '-kdf').expected.resultHex),
          cipher = createDecipheriv('aes-256-gcm', key, b(e.nonce)),
          ct = b(n.resultHex);
        cipher.setAAD(b(v.expected.messageHex));
        cipher.setAuthTag(ct.subarray(-16));
        assert.throws(() => Buffer.concat([cipher.update(ct.subarray(0, -16)), cipher.final()]));
        aeadChecks++;
      }
      negatives++;
      omissions++;
    }
  }
  report('encoded-bindings', {
    negatives,
    omissions,
    signatureChecks,
    aeadChecks,
    note: 'Independent encoding/primitive controls; production controls and composite state checks are separate.',
  });
});

test('actual acceptance custody issues the fixed head, refusal, both pages and witness with their distinct purposes', async (t) => {
  const mock = t.mock.method(nodeCrypto, 'generateKeyPairSync', () => ({
    privateKey: privateKey(f.keys.acceptance.seed),
    publicKey: createPublicKey(privateKey(f.keys.acceptance.seed)),
  }));
  syncBuiltinESMExports();
  const pin = {
    v: 1,
    serviceId: f.base.serviceId,
    origin: f.base.origin,
    rpId: new URL(f.base.origin).hostname,
    authRoot: f.keys.wrong.publicKey,
  };
  const custody = new AcceptanceCustody(new Uint8Array(32).fill(1), pin);
  let seal;
  try {
    seal = custody.create(f.scope.request);
  } finally {
    mock.mock.restore();
    syncBuiltinESMExports();
  }
  try {
    assert.equal(seal.publicKey, f.keys.acceptance.publicKey);
    for (const response of f.responses)
      assert.equal(
        hex(custody.issue(seal, f.scope.request, seal.publicKey, response)),
        hex(
          json(
            response.kind === 'accepted'
              ? JSON.parse(b(find('transport-response-accepted').expected.messageHex))
              : JSON.parse(b(find('transport-response-refused').expected.messageHex)),
          ),
        ),
      );
    assert.deepEqual(
      custody.witness(seal, f.scope.request, seal.publicKey, f.scope, f.witness),
      f.witness,
    );
    for (const v of [1, 2])
      for (const [i, p] of f.pages[v - 1].entries()) {
        const method = v === 1 ? 'page' : 'inboundPage';
        assert.equal(
          hex(custody[method](seal, f.scope.request, seal.publicKey, page(p))),
          find('transport-page-v' + v + '-' + (i ? 'full' : 'empty') + '-wire').expected.messageHex,
        );
      }
    assert.throws(() =>
      custody.witness(
        seal,
        f.scope.request,
        seal.publicKey,
        { ...f.scope, request: zero },
        f.witness,
      ),
    );
  } finally {
    custody.close();
  }
});

test('submissions bind exact envelope and authenticated parent, while parent identity excludes its signature bytes', async () => {
  for (const s of f.submissions) {
    const wire = S.encodeSubmission(submission(s)),
      result = await S.verifySubmission(wire, route, verifier, authority);
    assert.equal(result.parentId, s.parent ? hash(encode(refusalParts(s.parent))) : zero);
  }
  const first = f.submissions[0],
    second = f.submissions[1];
  const other = encrypted(
      { ...f.envelopes[1], seq: 2, nonce: 'ae'.repeat(12) },
      f.body,
      f.kg,
      f.keys.member.seed,
    ),
    otherWire = hex(encode(envelopeParts(other)));
  await assert.rejects(
    S.verifySubmission(
      S.encodeSubmission(submission({ ...first, envelope: otherWire })),
      route,
      verifier,
      authority,
    ),
    /Submission signature/,
  );
  const changedParent = { ...f.refusal, digest: 'de'.repeat(32) };
  changedParent.signature = signBytes(encode(refusalParts(changedParent)), f.keys.acceptance.seed);
  await assert.rejects(
    S.verifySubmission(
      S.encodeSubmission(submission({ ...second, parent: changedParent })),
      route,
      verifier,
      authority,
    ),
    /Submission signature/,
  );
  const signatureOnly = { ...f.refusal, signature: 'ab'.repeat(64) };
  assert.equal(await P.refusalId(signatureOnly), await P.refusalId(f.refusal));
  await assert.rejects(
    S.verifySubmission(
      S.encodeSubmission(submission({ ...second, parent: signatureOnly })),
      route,
      verifier,
      authority,
    ),
    /Position signature/,
  );
  for (const label of [
    'done/env-sig/v2',
    'done/position-refuse/v1',
    'done/service-delivery-witness/v1',
  ]) {
    const parts = submissionParts(first);
    parts[0].value = label;
    const wrong = { ...first, signature: signBytes(encode(parts), f.keys.member.seed) };
    await assert.rejects(
      S.verifySubmission(S.encodeSubmission(submission(wrong)), route, verifier, authority),
    );
  }
  await assert.rejects(
    S.verifySubmission(
      S.encodeSubmission(submission(first)),
      route,
      await edPublic(f.keys.acceptance.publicKey),
      authority,
    ),
  );
  const sameDigestParent = { ...f.refusal, digest: f.subject.digest };
  sameDigestParent.signature = signBytes(
    encode(refusalParts(sameDigestParent)),
    f.keys.acceptance.seed,
  );
  const invalid = { ...first, parent: sameDigestParent };
  invalid.signature = signBytes(encode(submissionParts(invalid)), f.keys.member.seed);
  await assert.rejects(
    S.verifySubmission(S.encodeSubmission(submission(invalid)), route, verifier, authority),
    /Successor subject/,
  );
});

test('accepted leaf and previous link are independently reconstructed; valid service signatures are neither fresh membership nor arbitrary acceptance', async () => {
  const accepted = P.encodePositionResponse(f.responses[1]);
  assert.equal((await P.verifyPositionResponse(accepted, expected, authority)).kind, 'accepted');
  const refusal = P.encodePositionResponse(f.responses[0]);
  assert.equal(
    (await P.verifyPositionResponse(refusal, { ...expected, ...f.refusal }, authority)).kind,
    'refused',
  );
  assert.equal(
    (await P.verifyPositionResponse(accepted, { ...expected, digest: 'ef'.repeat(32) }, authority))
      .kind,
    'conflict',
  );
  assert.equal(
    (
      await P.verifyPositionResponse(
        accepted,
        { ...expected, previous: 'ef'.repeat(32) },
        authority,
      )
    ).kind,
    'unknown',
  );
  for (const change of [
    { leaf: { ...f.responses[1].leaf, digest: 'ef'.repeat(32) } },
    { head: { ...f.head, final: true } },
    { head: { ...f.head, epoch: 2 } },
    { head: { ...f.head, credential: 'ab'.repeat(16) } },
  ])
    assert.equal(
      (
        await P.verifyPositionResponse(
          P.encodePositionResponse({ ...f.responses[1], ...change }),
          expected,
          authority,
        )
      ).kind,
      'unknown',
    );
  for (const key of [
    'workspace',
    'credential',
    'position',
    'epoch',
    'digest',
    'reason',
    'parent',
  ]) {
    const r = {
      ...f.refusal,
      [key]:
        typeof f.refusal[key] === 'number'
          ? f.refusal[key] + 1
          : key === 'reason'
            ? 'other-reason'
            : 'ab'.repeat(key === 'parent' || key === 'digest' ? 32 : 16),
    };
    await assert.rejects(P.verifyRefusalClaim(r, authority));
  }
  const future = { ...f.head, epoch: 2 };
  future.signature = signBytes(encode(headParts(future)), f.keys.acceptance.seed);
  assert.equal(
    (
      await P.verifyPositionResponse(
        P.encodePositionResponse({ ...f.responses[1], head: future }),
        expected,
        authority,
      )
    ).kind,
    'unknown',
  );
  const forged = { ...f.head, signature: signBytes(encode(headParts(f.head)), f.keys.member.seed) };
  assert.equal(
    (
      await P.verifyPositionResponse(
        P.encodePositionResponse({ ...f.responses[1], head: forged }),
        expected,
        authority,
      )
    ).kind,
    'unknown',
  );
});

test('v1 pages bind exact signed request, extent and every nested byte; v2 keeps a separate namespace', async () => {
  const request = D.encodeReadRequest(f.requests[0]);
  for (const p of f.pages[0])
    assert.deepEqual(
      await D.verifyReadPage(D.encodeReadPage(page(p)), request, f.keys.acceptance.publicKey),
      page(p),
    );
  const original = f.pages[0][1],
    wire = D.encodeReadPage(page(original));
  for (const change of [{ through: 2 }, { request: zero }, { entries: [] }])
    await assert.rejects(
      D.verifyReadPage(
        D.encodeReadPage(page({ ...original, ...change })),
        request,
        f.keys.acceptance.publicKey,
      ),
    );
  const changed = { ...f.requests[0], nonce: 'aa'.repeat(32) };
  changed.signature = signBytes(json(requestValues(changed, 1)), f.keys.member.seed);
  await assert.rejects(
    D.verifyReadPage(wire, D.encodeReadRequest(changed), f.keys.acceptance.publicKey),
  );
  const changedSig = { ...f.requests[0], signature: 'aa'.repeat(64) };
  assert.notEqual(
    await D.requestHash(request),
    await D.requestHash(D.encodeReadRequest(changedSig)),
  );
  for (const v of [1, 2]) {
    const decoder = v === 1 ? D.decodeReadRequest : I.decodeInboundRequest,
      other = v === 1 ? I.encodeInboundRequest(f.requests[1]) : D.encodeReadRequest(f.requests[0]);
    assert.throws(() => decoder(other));
    const decodePage = v === 1 ? D.decodeReadPage : I.decodeInboundPage,
      otherPage = v === 1 ? I.encodeInboundPage(page(f.pages[1][1])) : wire;
    assert.throws(() => decodePage(otherPage));
  }
});

const framingCases = () => [
  ['transport-envelope-body', E.decodeEnvelopeBody, E.ENVELOPE_BODY_LIMIT],
  ...[1, 2].map((v) => [
    'transport-envelope-v' + v + '-wire',
    E.decodeNetworkEnvelope,
    E.ENVELOPE_WIRE_LIMIT,
  ]),
  ...['first', 'successor'].map((v) => [
    'transport-submission-' + v + '-wire',
    S.decodeSubmission,
    S.SUBMISSION_LIMIT,
  ]),
  ...['accepted', 'refused'].map((v) => [
    'transport-response-' + v,
    P.decodePositionResponse,
    P.RESPONSE_LIMIT,
  ]),
  ['transport-submit-carrier', D.decodeSubmit, D.SUBMIT_BODY_LIMIT],
  ['transport-read-v1-wire', D.decodeReadRequest, D.READ_REQUEST_LIMIT],
  ['transport-read-v2-wire', I.decodeInboundRequest, D.READ_REQUEST_LIMIT],
  ...[1, 2].flatMap((v) =>
    ['full', 'empty'].map((kind) => [
      'transport-page-v' + v + '-' + kind + '-wire',
      v === 1 ? D.decodeReadPage : I.decodeInboundPage,
      D.READ_PAGE_LIMIT,
    ]),
  ),
];
test('every truncated frame and trailing byte refuses; canonical JSON, versions, lengths and detached copies are checked', () => {
  let cuts = 0,
    refused = 0,
    parsedChanges = 0;
  for (const [id, decode, limit] of framingCases()) {
    const vector = find(id),
      bytes = u(vector.expected.messageHex);
    decode(bytes);
    for (let n = 0; n < bytes.length; n++) {
      assert.throws(() => decode(bytes.slice(0, n)), id + ':' + n);
      cuts++;
    }
    assert.throws(() => decode(new Uint8Array([...bytes, 0])));
    assert.throws(() => decode(new Uint8Array(limit + 1)));
    for (const n of vector.negatives) {
      try {
        decode(u(n.messageHex));
        parsedChanges++;
      } catch {
        refused++;
      }
    }
    if (vector.parts[0].codec === 'json') {
      const text = Buffer.from(bytes).toString();
      for (const bad of [
        text + ' ',
        text.replace('done', '\\u0064one'),
        text.replace(',1,', ',1.0,'),
        text.replace(',2,', ',2e0,'),
      ])
        if (bad !== text) assert.throws(() => decode(new Uint8Array(Buffer.from(bad))));
      assert.throws(() => decode(new Uint8Array([0xef, 0xbb, 0xbf, ...bytes])));
    }
  }
  const original = u(find('transport-envelope-v2-wire').expected.messageHex),
    decoded = E.decodeNetworkEnvelope(original),
    ct = decoded.ct.slice();
  original.fill(0);
  assert.deepEqual(decoded.ct, ct);
  assert.throws(() => E.encodeEnvelopeBody({ ...body(f), updates: [] }));
  assert.throws(() => E.encodeEnvelopeBody({ ...body(f), updates: Array(257).fill(u('00')) }));
  assert.throws(() => E.encodeNetworkEnvelope({ ...envelope(f.envelopes[1]), seq: 0 }));
  assert.throws(() => I.encodeInboundRequest({ ...f.requests[1], after: -0 }));
  assert.equal(
    hex(D.encodeReadRequest({ ...f.requests[0], after: -0 })),
    hex(D.encodeReadRequest(f.requests[0])),
    'V1 object encoder normalizes -0; canonical wire still refuses it',
  );
  report('framing', {
    truncatedPrefixes: cuts,
    changedFramesRefused: refused,
    changedFramesParsedWithoutAuthentication: parsedChanges,
  });
});

test('service witness binds exact chain/count/scope and rejects stale, reordered, incomplete or modified rows', async () => {
  let previous = zero;
  for (const e of f.events) {
    assert.equal(ledger.extend(previous, e.ordinal, u(e.submission), u(e.response)), e.hash);
    previous = e.hash;
  }
  const auth = { a: authority, scope: f.scope };
  await ledger.verifyLedgerWitness(f.witness, auth, 2, previous);
  await ledger.verifyLedgerWitness(null, auth, 0, zero);
  for (const [w, count, commit] of [
    [null, 2, previous],
    [f.witness, 1, previous],
    [f.witness, 2, zero],
    [{ ...f.witness, signature: '00'.repeat(64) }, 2, previous],
  ])
    await assert.rejects(ledger.verifyLedgerWitness(w, auth, count, commit));
  for (const name of Object.keys(f.scope))
    await assert.rejects(
      ledger.verifyLedgerWitness(
        f.witness,
        {
          a: authority,
          scope: {
            ...f.scope,
            [name]: 'ab'.repeat(name === 'workspace' || name === 'credential' ? 16 : 32),
          },
        },
        2,
        previous,
      ),
    );
  for (const key of ['submission', 'response']) {
    const e = f.events[0],
      changed = hex(new Uint8Array([...u(e[key]), 0]));
    assert.notEqual(
      ledger.extend(
        e.previous,
        e.ordinal,
        u(key === 'submission' ? changed : e.submission),
        u(key === 'response' ? changed : e.response),
      ),
      e.hash,
    );
  }
  assert.notEqual(
    ledger.extend(zero, 2, u(f.events[1].submission), u(f.events[1].response)),
    f.events[1].hash,
  );
  assert.throws(() => parseWitness({ ...f.witness, extra: 1 }));
  assert.throws(() => parseWitness({ ...f.witness, events: 0 }));
  report('witness', {
    fixedEvents: 2,
    actualInternalSeams: true,
    nullOnlyAtZero: true,
    scopeBindings: Object.keys(f.scope),
    note: 'Internal pure functions exposed in a disposable source copy; existing service tests separately exercise durable census.',
  });
});

test('200 shrinking-enabled signed histories preserve their prefix and exact nested pages under mutation', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.uint8Array({ minLength: 1, maxLength: 40 }), { minLength: 1, maxLength: 4 }),
      fc.nat(),
      async (updates, pick) => {
        let previous = zero;
        const entries = [];
        for (const [i, update] of updates.entries()) {
          const e = encrypted(
              {
                ...f.envelopes[1],
                seq: i + 1,
                nonce: (i + 1).toString(16).padStart(2, '0').repeat(12),
              },
              { ...f.body, updates: [hex(update)] },
              f.kg,
              f.keys.member.seed,
            ),
            wire = u(hex(encode(envelopeParts(e)))),
            s = { ...f.subject, position: i + 1, digest: e.digest },
            h = { ...f.head, position: i + 1, link: hash(encode(linkParts(s, previous))) };
          h.signature = signBytes(encode(headParts(h)), f.keys.acceptance.seed);
          const response = P.encodePositionResponse({
            kind: 'accepted',
            head: h,
            leaf: { epoch: 1, digest: e.digest },
          });
          assert.equal(
            (await P.verifyPositionResponse(response, { ...s, parent: zero, previous }, authority))
              .kind,
            'accepted',
          );
          assert.deepEqual(await E.openNetworkEnvelope(wire, route, verifier, u(f.kg)), {
            ...body(f),
            updates: [new Uint8Array(update)],
          });
          entries.push({ envelope: hex(wire), proof: hex(response) });
          previous = h.link;
        }
        const r = { ...f.requests[0], limit: updates.length };
        r.signature = signBytes(json(requestValues(r, 1)), f.keys.member.seed);
        const request = D.encodeReadRequest(r),
          p = { request: hash(request), through: entries.length, next: entries.length, entries };
        p.signature = signBytes(json(pageValues(p, 1)), f.keys.acceptance.seed);
        await D.verifyReadPage(D.encodeReadPage(page(p)), request, f.keys.acceptance.publicKey);
        if (entries.length > 1)
          await assert.rejects(
            D.verifyReadPage(
              D.encodeReadPage(page({ ...p, entries: [...entries].reverse() })),
              request,
              f.keys.acceptance.publicKey,
            ),
          );
        const broken = structuredClone(p),
          entry = broken.entries[pick % entries.length],
          data = b(entry.proof);
        data[pick % data.length] ^= 1;
        entry.proof = hex(data);
        await assert.rejects(
          D.verifyReadPage(D.encodeReadPage(page(broken)), request, f.keys.acceptance.publicKey),
        );
      },
    ),
    { seed: 5110914, numRuns: 200 },
  );
  report('properties', {
    seed: 5110914,
    runs: 200,
    shrinkingEnabled: true,
    independent: 'OpenSSL envelope and accepted chain oracle',
    mutations:
      'Nested proof byte changed and multi-entry page reversed without resigning; every accepted prefix independently reconstructed',
  });
});
