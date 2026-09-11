/** Independent Node framing and verification: no production v2 encoder is used. */
import assert from 'node:assert/strict';
import { randomBytes, sign, verify, createPublicKey, createHash } from 'node:crypto';
import { envelope } from '../account-transport/oracle.mjs';
import { proof, link, ZERO } from '../account-service-delivery/fixtures.mjs';
export const hash = (b) => createHash('sha256').update(b).digest('hex');
export const json = (v) => new Uint8Array(Buffer.from(JSON.stringify(v)));
export function query(x, after = 0, limit = 1, changes = {}, key = x.s.privateKey) {
  const fields = {
    serviceId: x.authority.pin.serviceId,
    origin: x.authority.pin.origin,
    workspace: x.workspace,
    reader: x.credential,
    publisher: x.credential,
    lineage: x.offer.epoch.lineageId,
    head: x.offer.head,
    epoch: 1,
    after,
    limit,
    nonce: randomBytes(32).toString('hex'),
    expires: Date.now() + 60000,
    ...changes,
  };
  const unsigned = ['done/private-read/v2', 2, ...Object.values(fields)];
  return json([...unsigned, sign(null, json(unsigned), key).toString('hex')]);
}
export const read = (x, q) => x.authority.owner.readInbound(x.f.core, q);
export function pageProof(result, request, x, retained) {
  assert.equal(result.kind, 'decision', JSON.stringify(result));
  const bytes = Buffer.from(result.bytes),
    v = JSON.parse(bytes.toString()),
    q = JSON.parse(Buffer.from(request).toString());
  assert.equal(bytes.toString(), JSON.stringify(v));
  assert.equal(v.length, 7);
  assert.deepEqual(v.slice(0, 2), ['done/private-read-page/v2', 2]);
  assert.equal(v[2], hash(request));
  assert.equal(v[3], retained.length);
  assert.ok(v[5].length <= q[11]);
  assert.equal(v[4], q[10] + v[5].length);
  assert.ok(v[4] <= v[3]);
  assert.ok(v[4] === v[3] || v[5].length > 0);
  const key = createPublicKey({
    key: Buffer.from('302a300506032b6570032100' + x.offer.epoch.acceptancePublicKey, 'hex'),
    format: 'der',
    type: 'spki',
  });
  assert.ok(verify(null, json(v.slice(0, 6)), key, Buffer.from(v[6], 'hex')));
  let previous = ZERO;
  for (let i = 0; i < q[10]; i++) previous = link(retained[i].w.subject, previous);
  for (const [i, entry] of v[5].entries()) {
    const original = retained[q[10] + i];
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
