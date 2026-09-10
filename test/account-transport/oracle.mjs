import assert from 'node:assert/strict';
import { randomBytes, sign, verify, createPublicKey, createHash } from 'node:crypto';
import { proof, link, ZERO } from '../account-service-delivery/fixtures.mjs';
const hash = (b) => createHash('sha256').update(b).digest('hex');
export function query(x, after = 0, limit = 8, changes = {}, key = x.s.privateKey) {
  const fields = {
    serviceId: x.authority.pin.serviceId,
    origin: x.authority.pin.origin,
    workspace: x.workspace,
    credential: x.credential,
    lineage: x.offer.epoch.lineageId,
    head: x.offer.head,
    epoch: 1,
    after,
    limit,
    nonce: randomBytes(32).toString('hex'),
    expires: Date.now() + 30000,
    ...changes,
  };
  const r = ['done/private-read/v1', 1, ...Object.values(fields)];
  return new Uint8Array(
    Buffer.from(
      JSON.stringify([...r, sign(null, Buffer.from(JSON.stringify(r)), key).toString('hex')]),
    ),
  );
}
export function envelope(w) {
  const b = Buffer.from(w.bytes);
  let at = 0;
  for (let i = 0; i < 3; i++) at += 2 + b.readUInt16BE(at);
  return b.subarray(at + 4, at + 4 + b.readUInt32BE(at));
}
export function pageProof(result, request, x, retained) {
  assert.equal(result.kind, 'decision');
  const bytes = Buffer.from(result.bytes),
    v = JSON.parse(bytes.toString()),
    q = JSON.parse(Buffer.from(request).toString());
  assert.equal(bytes.toString(), JSON.stringify(v));
  assert.equal(v.length, 7);
  assert.deepEqual(v.slice(0, 2), ['done/private-read-page/v1', 1]);
  assert.equal(v[2], hash(request));
  assert.equal(v[3], retained.length);
  assert.ok(v[5].length <= q[10]);
  assert.equal(v[4], q[9] + v[5].length);
  assert.ok(v[4] <= v[3]);
  assert.ok(v[4] === v[3] || v[5].length > 0);
  const key = createPublicKey({
    key: Buffer.from('302a300506032b6570032100' + x.offer.epoch.acceptancePublicKey, 'hex'),
    format: 'der',
    type: 'spki',
  });
  assert.ok(
    verify(null, Buffer.from(JSON.stringify(v.slice(0, 6))), key, Buffer.from(v[6], 'hex')),
  );
  let previous = ZERO;
  for (let i = 0; i < q[9]; i++) previous = link(retained[i].w.subject, previous);
  for (const [i, entry] of v[5].entries()) {
    const original = retained[q[9] + i];
    assert.deepEqual(Buffer.from(entry[0], 'hex'), envelope(original.w));
    assert.deepEqual(Buffer.from(entry[1], 'hex'), Buffer.from(original.r.bytes));
    proof(
      { kind: 'decision', bytes: Buffer.from(entry[1], 'hex') },
      x.offer.epoch.acceptancePublicKey,
      original.w.subject,
      previous,
    );
    previous = link(original.w.subject, previous);
  }
  return { next: v[4], through: v[3], count: v[5].length };
}
