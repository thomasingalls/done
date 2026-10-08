import { membershipRotationFixture } from './rotation-fixtures.mjs';
import { hash, message, signed } from './fixtures.mjs';
import { lp } from '../account-ceremony/oracle.mjs';
import {
  membershipState,
  verifyMembershipRotation,
  verifyMembershipAdmission,
} from '../../account-protocol/membership.ts';
export async function checkpointFixture(removeOriginal = false) {
  const x = await membershipRotationFixture(false, removeOriginal);
  const cutoff = x.p.heads.map((h) => ({
    ...h,
    position: h.credentialId === x.target ? 2 : 3,
    link: (h.credentialId === x.target ? '31' : '32').repeat(32),
  }));
  const rotation = x.rotate(
    x.request({ preparation: x.prep({ cutoff }), payload: { ...x.payload, cutoff } }),
  );
  const rotated = await verifyMembershipRotation(rotation, x.parent);
  const admission = x.f.admit(membershipState(rotated));
  const parent = await verifyMembershipAdmission(admission, rotated),
    p = membershipState(parent);
  const heads = [
    ...cutoff,
    {
      credentialId: admission.epoch.preparation.context.candidate.credentialId,
      position: 0,
      link: '00'.repeat(32),
    },
  ].sort((a, b) => a.credentialId.localeCompare(b.credentialId));
  const sign = (c, signer = removeOriginal ? x.f.keys.new : x.f.keys.existing) => {
    const { signature: _, ct: _ct, ...body } = c;
    return { ...c, signature: signed(signer, message('done/replacement-checkpoint/v1', body)) };
  };
  const checkpoint = sign({
    v: 1,
    kind: 'replacement-checkpoint',
    salt: '51'.repeat(16),
    nonce: '52'.repeat(12),
    ct: '53'.repeat(18),
    manifest: {
      workspaceId: p.workspaceId,
      lineageId: p.lineageId,
      epoch: p.epoch,
      epochHead: p.head,
      generation: p.generation,
      producer: p.certificate.members[0].id,
      candidate: admission.epoch.preparation.context.candidate.credentialId,
      preparationId: admission.epoch.preparation.context.attemptId,
      checkpointDigest: hash(Buffer.from('53'.repeat(18), 'hex')),
      sv: '00',
      ds: '00',
      headVectorDigest: hash(
        lp(
          'done/headvec/v1',
          ...heads.flatMap((h) => [h.credentialId, String(h.position), h.link]),
        ),
      ),
    },
    heads,
    signature: '00'.repeat(64),
  });
  return { x, parent, rotated, rotation, admission, checkpoint, sign };
}
