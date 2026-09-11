import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fixture,
  encode,
  hex,
  lp,
  zero,
  encrypted,
  envelopeParts,
  submissionParts,
  refusalParts,
  headParts,
  witnessParts,
  signBytes,
  pageValues,
  json,
} from './oracle.mjs';
import { S, P, D, u, submission, page, edPublic, ledger } from './runtime.mjs';
const f = fixture(),
  verifier = await edPublic(f.keys.member.publicKey);
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
// Alter the bytes supplied to actual WebCrypto verification, never its boolean result.
// This models the matching omission in a signer/verifier, with independently signed mutant bytes.
function dropLP(input, label, index) {
  const bytes = Buffer.from(input);
  let at = 0;
  const fields = [];
  while (at < bytes.length) {
    if (at + 2 > bytes.length) return input;
    const n = bytes.readUInt16BE(at);
    at += 2;
    if (at + n > bytes.length) return input;
    fields.push(bytes.subarray(at, at + n).toString());
    at += n;
  }
  return fields[0] === label ? new Uint8Array(lp(...fields.filter((_, i) => i !== index))) : input;
}
const omitted = (parts, index, seed) =>
  signBytes(encode(parts.filter((_, i) => i !== index)), seed);
function proxy(label, index) {
  return new Proxy(crypto.subtle, {
    get(target, key) {
      if (key === 'verify')
        return (algorithm, signer, signature, message) =>
          target.verify(algorithm, signer, signature, dropLP(message, label, index));
      return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
    },
  });
}

test('submission digest and parent omissions admit separately changed valid envelopes/refusals at the actual verifier boundary', async () => {
  const other = encrypted(
    { ...f.envelopes[1], seq: 2, nonce: 'ad'.repeat(12) },
    f.body,
    f.kg,
    f.keys.member.seed,
  );
  const original = f.submissions[0],
    changed = {
      ...original,
      envelope: hex(encode(envelopeParts(other))),
      signature: omitted(submissionParts(original), 3, f.keys.member.seed),
    };
  const wire = S.encodeSubmission(submission(changed));
  await assert.rejects(
    S.verifySubmission(wire, route, verifier, authority),
    /Submission signature/,
  );
  assert.equal(
    (
      await S.verifySubmission(
        wire,
        route,
        verifier,
        authority,
        proxy('done/envelope-submission/v1', 3),
      )
    ).envelope.length,
    u(changed.envelope).length,
  );
  const parent = { ...f.refusal, digest: 'de'.repeat(32) };
  parent.signature = signBytes(encode(refusalParts(parent)), f.keys.acceptance.seed);
  const successor = {
      ...f.submissions[1],
      parent,
      signature: omitted(submissionParts(f.submissions[1]), 4, f.keys.member.seed),
    },
    second = S.encodeSubmission(submission(successor));
  await assert.rejects(
    S.verifySubmission(second, route, verifier, authority),
    /Submission signature/,
  );
  assert.equal(
    (
      await S.verifySubmission(
        second,
        route,
        verifier,
        authority,
        proxy('done/envelope-submission/v1', 4),
      )
    ).parent.digest,
    parent.digest,
  );
});

test('head-final and v1 page-through omissions rescue a changed claim, without pretending finalization or entry validation occurs here', async () => {
  const head = {
      ...f.head,
      final: true,
      signature: omitted(headParts(f.head), 6, f.keys.acceptance.seed),
    },
    response = P.encodePositionResponse({ ...f.responses[1], head }),
    expected = { ...f.subject, parent: zero, previous: zero };
  assert.equal((await P.verifyPositionResponse(response, expected, authority)).kind, 'unknown');
  const result = await P.verifyPositionResponse(
    response,
    expected,
    authority,
    proxy('done/accept-head/v1', 6),
  );
  assert.equal(result.kind, 'accepted');
  assert.equal(result.head.final, true);
  const original = f.pages[0][1],
    values = pageValues(original, 1);
  values.splice(3, 1);
  const p = { ...original, through: 2, signature: signBytes(json(values), f.keys.acceptance.seed) },
    wire = D.encodeReadPage(page(p)),
    request = D.encodeReadRequest(f.requests[0]);
  await assert.rejects(D.verifyReadPage(wire, request, f.keys.acceptance.publicKey));
  const subtle = new Proxy(crypto.subtle, {
    get(target, key) {
      if (key === 'verify')
        return (algorithm, signer, signature, message) => {
          const value = JSON.parse(Buffer.from(message).toString());
          value.splice(3, 1);
          return target.verify(algorithm, signer, signature, new Uint8Array(json(value)));
        };
      return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
    },
  });
  assert.equal(
    (await D.verifyReadPage(wire, request, f.keys.acceptance.publicKey, subtle)).through,
    2,
  );
});

test('witness request-binding omission accepts a witness under a different held proposal scope', async (t) => {
  const witness = {
      ...f.witness,
      signature: omitted(witnessParts(f.scope, f.witness), 5, f.keys.acceptance.seed),
    },
    auth = { a: authority, scope: { ...f.scope, request: 'ef'.repeat(32) } };
  await assert.rejects(ledger.verifyLedgerWitness(witness, auth, 2, f.witness.hash));
  const original = crypto.subtle.verify.bind(crypto.subtle),
    mock = t.mock.method(crypto.subtle, 'verify', (a, k, s, m) =>
      original(a, k, s, dropLP(m, 'done/service-delivery-witness/v1', 5)),
    );
  try {
    await ledger.verifyLedgerWitness(witness, auth, 2, f.witness.hash);
  } finally {
    mock.mock.restore();
  }
});

test('controls retain their reviewed boundaries and evidence inventory', () => {
  const evidence = {
    controls: [
      'submission.envelope-hash',
      'submission.parent-id',
      'head.final',
      'read-page-v1.through',
      'witness.request',
    ],
    additionalControl: 'read-page-v2.through in test/accountTransportContract.test.ts',
    method:
      'Remove one field from bytes passed to actual verification; independent signatures over omitted messages; never replace verification with true. Lower-level proof only, not every owner predicate.',
    runtimeSourceUnchanged: true,
  };
  assert(
    readFileSync('test/accountTransportContract.test.ts', 'utf8').includes(
      'omitting the page extent',
    ),
  );
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, 'verification-controls.json'),
      JSON.stringify(evidence, null, 2) + '\n',
    );
  }
});
