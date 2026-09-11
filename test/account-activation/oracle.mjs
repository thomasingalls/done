import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { lp, hash } from '../account-admission/core-fixtures.mjs';
export const challengeBytes = (context) =>
  Buffer.from(hash(lp('done/promotion-activation/v1', hash(JSON.stringify(context)))), 'hex');
export function inspectChallenge(challenge, x, offer, completion) {
  const c = challenge.context;
  assert.deepEqual(Object.keys(c), [
    'v',
    'pin',
    'accountId',
    'requestDigest',
    'offerHead',
    'completionDigest',
    'credentialId',
    'nonce',
    'expiresAt',
  ]);
  assert.equal(c.v, 1);
  assert.deepEqual(c.pin, x.authority.pin);
  assert.equal(c.accountId, x.account.result.accountId);
  assert.equal(c.requestDigest, hash(JSON.stringify(x.request)));
  assert.equal(c.offerHead, offer.head);
  assert.equal(c.completionDigest, hash(JSON.stringify(completion)));
  assert.equal(c.credentialId, x.account.key.id);
  assert.match(c.nonce, /^[0-9a-f]{64}$/);
  assert.ok(
    verify(
      null,
      lp('done/promotion-activation-challenge/v1', hash(JSON.stringify(c))),
      createPublicKey({
        key: Buffer.from('302a300506032b6570032100' + c.pin.authRoot, 'hex'),
        format: 'der',
        type: 'spki',
      }),
      Buffer.from(challenge.signature, 'hex'),
    ),
  );
}
export const inputFor = (x, offer, completion) => ({
  retryKey: x.account.retryKey,
  requestDigest: offer.epoch.requestDigest,
  completion,
});
export const prove = (x, input, challenge, edits) => ({
  ...input,
  activation: {
    nonce: challenge.context.nonce,
    response: x.account.key.assert(
      { options: { challenge: challengeBytes(challenge.context).toString('base64url') } },
      edits,
    ),
  },
});
export const canonical = (v) => JSON.stringify(sort(v));
const sort = (v) =>
  Array.isArray(v)
    ? v.map(sort)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sort(v[k])]),
        )
      : v;
