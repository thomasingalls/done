import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { ready as enrollmentReady, mutate } from '../account-enrollment/fixtures.mjs';
import { link, headMessage, ZERO, proof } from '../account-service-delivery/fixtures.mjs';
import { envelope } from '../account-transport/oracle.mjs';
import { query, read, hash, json } from '../account-service-inbound/oracle.mjs';
export { mutate, query, read, link, ZERO };
export async function ready(t, options = {}) {
  const x = await enrollmentReady(t, options);
  const prepare = async () => {
    const entry = x.candidate(),
      challenge = await x.enroll('begin', entry.input);
    assert.equal(challenge.stage, 'challenge', JSON.stringify(challenge));
    const proof = x.prove(entry, challenge),
      result = await x.enroll('finish', proof);
    assert.equal(result.stage, 'prepared', JSON.stringify(result));
    return {
      entry,
      proof,
      result,
      input: {
        retryKey: entry.input.retryKey,
        attemptId: result.receipt.context.attemptId,
        receiptId: result.receipt.receiptId,
      },
    };
  };
  return { ...x, prepare, admit: (input) => x.authority.owner.admitPrepared(x.f.core, input) };
}
const publicKey = (hex) =>
  createPublicKey({
    key: Buffer.from('302a300506032b6570032100' + hex, 'hex'),
    format: 'der',
    type: 'spki',
  });
export function decision(x, result, wire, previous = ZERO, epoch = 1) {
  assert.equal(result.kind, 'decision', JSON.stringify(result));
  const v = JSON.parse(Buffer.from(result.bytes).toString());
  if (v[2] === 'refused')
    return proof(result, x.offer.epoch.acceptancePublicKey, wire.subject, previous, wire.parent);
  assert.deepEqual(v.slice(0, 3), ['done/position-response/v1', 1, 'accepted']);
  const h = {
    workspace: v[3],
    credential: v[4],
    position: v[5],
    link: v[6],
    epoch: v[7],
    final: v[8],
    signature: v[11],
  };
  assert.deepEqual(v.slice(3, 11), [
    wire.subject.workspace,
    wire.subject.credential,
    wire.subject.position,
    link(wire.subject, previous),
    epoch,
    false,
    wire.subject.epoch,
    wire.subject.digest,
  ]);
  assert(
    verify(
      null,
      headMessage(h),
      publicKey(x.offer.epoch.acceptancePublicKey),
      Buffer.from(h.signature, 'hex'),
    ),
  );
  return { kind: 'accepted', head: h };
}
export function page(x, result, request, retained) {
  assert.equal(result.kind, 'decision', JSON.stringify(result));
  const v = JSON.parse(Buffer.from(result.bytes).toString()),
    q = JSON.parse(Buffer.from(request).toString());
  assert.deepEqual(v.slice(0, 3), ['done/private-read-page/v2', 2, hash(request)]);
  assert.equal(v[3], retained.length);
  assert.equal(v[4], q[10] + v[5].length);
  assert(v[5].length <= q[11]);
  assert(
    verify(
      null,
      json(v.slice(0, 6)),
      publicKey(x.offer.epoch.acceptancePublicKey),
      Buffer.from(v[6], 'hex'),
    ),
  );
  let previous = ZERO;
  for (let i = 0; i < q[10]; i++) previous = link(retained[i].w.subject, previous);
  for (const [i, entry] of v[5].entries()) {
    const r = retained[q[10] + i];
    assert.deepEqual(Buffer.from(entry[0], 'hex'), envelope(r.w));
    assert.deepEqual(Buffer.from(entry[1], 'hex'), Buffer.from(r.r.bytes));
    decision(x, r.r, r.w, previous, r.epoch);
    previous = link(r.w.subject, previous);
  }
  return v;
}
export const state = (x) =>
  JSON.stringify(
    ['promotions', 'workspace_successors', 'enrollment_preparations', 'delivery_decisions'].map(
      (t) => [t, x.f.rows(t)],
    ),
  );
