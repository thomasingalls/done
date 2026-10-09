import assert from 'node:assert/strict';
import { randomBytes, sign, createPublicKey, verify } from 'node:crypto';
import { message, hash } from './oracle.mjs';
export { ready, state, mutate } from './service-fixtures.mjs';
export function discoveryQuery(x, changes = {}, key = x.s.privateKey) {
  const body = {
    v: 1,
    kind: 'authority-discovery-request',
    pin: x.authority.pin,
    workspaceId: x.workspace,
    lineageId: x.offer.epoch.lineageId,
    credentialId: x.credential,
    epoch: 1,
    head: x.offer.head,
    nonce: randomBytes(32).toString('hex'),
    expiresAt: Date.now() + 30000,
    ...changes,
  };
  return {
    ...body,
    signature: sign(null, message('done/authority-discovery-request/v1', body), key).toString(
      'hex',
    ),
  };
}
export const discover = (x, request) => x.authority.owner.discoverAuthority(x.f.core, request);
export function discoveryProof(x, response, request, expected) {
  assert.equal(response.kind, 'authority-discovery-response', JSON.stringify(response));
  const body = {
    v: 1,
    kind: 'authority-discovery-response',
    requestHash: hash(JSON.stringify(request)),
    successor: expected,
  };
  assert.deepEqual(Object.keys(response), [...Object.keys(body), 'signature']);
  const { signature, ...actual } = response;
  assert.deepEqual(actual, body);
  const pub = createPublicKey({
    key: Buffer.from('302a300506032b6570032100' + x.authority.pin.authRoot, 'hex'),
    format: 'der',
    type: 'spki',
  });
  assert(
    verify(
      null,
      message('done/authority-discovery-response/v1', body),
      pub,
      Buffer.from(signature, 'hex'),
    ),
  );
}
