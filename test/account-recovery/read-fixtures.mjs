import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, createHash, sign } from 'node:crypto';
import { lp } from '../account-enrollment/fixtures.mjs';
import { verifyLostRecoveryPrepared } from '../../account-protocol/lostDeviceRecovery.ts';
import { createRecoveryBootstrap } from '../../src/account/recoveryBootstrap.ts';
const fresh = () => randomBytes(32).toString('base64url');
const hash = (v) => createHash('sha256').update(v).digest();
export async function recoveryReader(x) {
  const keys = generateKeyPairSync('ed25519'),
    wrapping = generateKeyPairSync('x25519');
  const pub = (key) => key.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
  const input = {
    retryKey: fresh(),
    candidate: {
      credentialId: randomBytes(16).toString('hex'),
      wPub: pub(wrapping.publicKey),
      sPub: pub(keys.publicKey),
    },
    clientNonce: randomBytes(32).toString('hex'),
  };
  const call = (op, body) => x.authority.owner.lostDeviceRecovery(x.f.core, op, body);
  const begun = await call('begin', input);
  assert.equal(begun.stage, 'challenge', JSON.stringify(begun));
  const context = begun.challenge.context;
  const proof = {
    retryKey: input.retryKey,
    attemptId: context.attemptId,
    response: x.account.key.assert({
      options: {
        challenge: hash(
          lp('done/lost-device-recovery-assertion/v1', JSON.stringify(context)),
        ).toString('base64url'),
      },
    }),
    possession: sign(
      null,
      lp('done/lost-device-recovery-possession/v1', JSON.stringify(context)),
      keys.privateKey,
    ).toString('hex'),
  };
  const result = await call('finish', proof);
  assert.equal(result.stage, 'prepared', JSON.stringify(result));
  const verified = await verifyLostRecoveryPrepared(result.prepared, input, x.authority.pin);
  const signer = await crypto.subtle.importKey(
    'pkcs8',
    keys.privateKey.export({ format: 'der', type: 'pkcs8' }),
    'Ed25519',
    false,
    ['sign'],
  );
  const bootstrap = await createRecoveryBootstrap(verified.context, x.recovery.code, signer);
  const request = (changes = {}) => {
    const body = {
      retryKey: input.retryKey,
      attemptId: context.attemptId,
      bootstrap,
      publisher: x.credential,
      after: 0,
      limit: 16,
      nonce: randomBytes(32).toString('hex'),
      ...changes,
    };
    // Independent framing: protocol JSON body digest, then selected LP domain.
    const signature = sign(
      null,
      lp('done/lost-device-recovery-read/v1', hash(JSON.stringify(body)).toString('hex')),
      keys.privateKey,
    ).toString('hex');
    return { ...body, signature };
  };
  return {
    input,
    proof,
    context,
    verified,
    bootstrap,
    signer,
    nodeSigner: keys.privateKey,
    request,
    read: (r) => x.authority.owner.readRecovery(x.f.core, r),
    cancel: () => call('cancel', { retryKey: input.retryKey }),
  };
}
