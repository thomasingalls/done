import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hkdfSync,
  createDecipheriv,
  createCipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  verify,
} from 'node:crypto';
import {
  generateRecovery,
  confirmRecovery,
  normalizeRecoveryCode,
} from '../../src/account/recovery.ts';
import { draftDigest } from '../../account-protocol/recovery.ts';
import { scope, fresh } from './fixtures.mjs';
const lp = (...values) =>
  Buffer.concat(
    values.map((value) => {
      const bytes = Buffer.from(value),
        size = Buffer.alloc(2);
      size.writeUInt16BE(bytes.length);
      return Buffer.concat([size, bytes]);
    }),
  );
const key = (draft, code) =>
  Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(code.replaceAll('-', '')),
      Buffer.from(draft.envelope.salt, 'hex'),
      lp('done/recovery/v1', draft.principalId),
      32,
    ),
  );
export function decrypt(draft, code) {
  const ct = Buffer.from(draft.envelope.ct, 'hex'),
    cipher = createDecipheriv(
      'aes-256-gcm',
      key(draft, code),
      Buffer.from(draft.envelope.nonce, 'hex'),
    );
  cipher.setAAD(lp('done/recovery/v1', draft.principalId, '1', draft.rPub));
  cipher.setAuthTag(ct.subarray(-16));
  return Buffer.concat([cipher.update(ct.subarray(0, -16)), cipher.final()]);
}
export function reseal(draft, code, payload) {
  const cipher = createCipheriv(
    'aes-256-gcm',
    key(draft, code),
    Buffer.from(draft.envelope.nonce, 'hex'),
  );
  cipher.setAAD(lp('done/recovery/v1', draft.principalId, '1', draft.rPub));
  return {
    ...draft,
    envelope: {
      ...draft.envelope,
      ct: Buffer.concat([cipher.update(payload), cipher.final(), cipher.getAuthTag()]).toString(
        'hex',
      ),
    },
  };
}
const publicRaw = (raw, kind) =>
  createPublicKey(
    createPrivateKey({
      key: Buffer.concat([
        Buffer.from(
          kind === 'x' ? '302e020100300506032b656e04220420' : '302e020100300506032b657004220420',
          'hex',
        ),
        raw,
      ]),
      format: 'der',
      type: 'pkcs8',
    }),
  )
    .export({ format: 'der', type: 'spki' })
    .subarray(-32);

test('independent Node crypto opens the complete three-part payload and verifies confirmation bytes', async () => {
  const { draft, code } = await generateRecovery(scope),
    payload = decrypt(draft, code);
  assert.equal(payload.length, 96);
  assert.equal(publicRaw(payload.subarray(0, 32), 'x').toString('hex'), draft.rPub);
  const commitment = createHash('sha256')
    .update(lp('done/pkg-root/v1', scope.workspaceId, scope.lineageId, scope.authRoot))
    .digest('hex');
  assert.equal(payload.subarray(32, 64).toString('hex'), commitment);
  assert.equal(publicRaw(payload.subarray(64), 'e').toString('hex'), draft.bootstrapSigner);
  const challenge = fresh(),
    digest = await draftDigest(draft);
  const proof = await confirmRecovery(
    draft,
    code.toLowerCase().replaceAll('-', ' '),
    challenge,
    digest,
  );
  const pub = createPublicKey({
    key: Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      Buffer.from(draft.bootstrapSigner, 'hex'),
    ]),
    format: 'der',
    type: 'spki',
  });
  assert(
    verify(
      null,
      lp('done/account-recovery-confirm/v1', challenge, digest),
      pub,
      Buffer.from(proof, 'hex'),
    ),
  );
});

test('sealed root, X25519 private/public and bootstrap private/public checks are independently necessary', async () => {
  const { draft, code } = await generateRecovery(scope),
    payload = decrypt(draft, code);
  for (const offset of [0, 32, 64]) {
    const damaged = Buffer.from(payload);
    damaged[offset] ^= 1;
    // X25519 clamps the low three bits; change a non-clamped bit.
    if (offset === 0) {
      damaged[0] = payload[0];
      damaged[1] ^= 1;
    }
    const other = reseal(draft, code, damaged);
    await assert.rejects(confirmRecovery(other, code, fresh(), await draftDigest(other)));
  }
  const rebound = { ...draft, authRoot: 'cd'.repeat(32) };
  rebound.rootCommitment = createHash('sha256')
    .update(lp('done/pkg-root/v1', scope.workspaceId, scope.lineageId, rebound.authRoot))
    .digest('hex');
  await assert.rejects(
    confirmRecovery(rebound, code, fresh(), await draftDigest(rebound)),
    /Sealed root mismatch/,
  );
});

test('normalization preserves the selected full-width alphabet and rejects non-codes', () => {
  assert.equal(normalizeRecoveryCode('oI-l' + 'A'.repeat(22)), '011' + 'A'.repeat(22));
  for (const bad of [
    'A'.repeat(24),
    'A'.repeat(26),
    'U'.repeat(25),
    '😀'.repeat(25),
    'a'.repeat(257),
  ])
    assert.throws(() => normalizeRecoveryCode(bad));
});
