import { fixture, message, signed, hash } from './fixtures.mjs';
import { key } from '../account-first-authority/oracle.mjs';
import { commitment, derive } from '../account-ceremony/oracle.mjs';
import {
  verifyMembershipAnchor,
  verifyMembershipAdmission,
  membershipState,
} from '../../account-protocol/membership.ts';

export async function deliveryFixture(approving = 'existing', retained) {
  const f = retained?.f ?? fixture();
  const anchor =
    retained?.anchor ??
    (await verifyMembershipAnchor(f.f.base, f.f.successor, f.certification, f.anchor));
  const admission = retained?.admission ?? f.admit(membershipState(anchor));
  const parent = await verifyMembershipAdmission(admission, anchor),
    p = membershipState(parent);
  const candidate = admission.epoch.preparation.context.candidate;
  const c = {
    ...f.context,
    v: 2,
    epoch: p.epoch,
    head: p.head,
    certifiedSetDigest: p.certifiedSetDigest,
    existing: approving === 'existing' ? f.context.existing : f.context.candidate,
    candidate: { id: candidate.credentialId, wPub: candidate.wPub, sPub: candidate.sPub },
    attemptId: 'b1'.repeat(32),
  };
  const keys = {
    existing: f.keys[approving],
    new: key('27'.repeat(32)),
    authority: f.f.keys.authority,
  };
  const nonces = { existing: 'b2'.repeat(32), new: 'b3'.repeat(32) };
  const sign = (label, body, signer) => {
    const { signature: _, ...value } = body;
    return { ...value, signature: signed(signer, message(label, value)) };
  };
  const commits = Object.fromEntries(
    ['existing', 'new'].map((role) => [
      role,
      sign(
        'done/enrollment-ceremony-commitment/v2',
        {
          v: 2,
          kind: 'ceremony-commitment',
          context: c,
          role,
          commitment: commitment(role, nonces[role]),
        },
        keys[role],
      ),
    ]),
  );
  const contextHash = hash(message('done/enrollment-ceremony-context/v2', c));
  const reveals = Object.fromEntries(
    ['existing', 'new'].map((role) => [
      role,
      sign(
        'done/enrollment-ceremony-reveal/v2',
        {
          v: 2,
          kind: 'ceremony-reveal',
          contextHash,
          role,
          existingCommitHash: hash(JSON.stringify(commits.existing)),
          newCommitHash: hash(JSON.stringify(commits.new)),
          nonce: nonces[role],
        },
        keys[role],
      ),
    ]),
  );
  const opening = derive({
    workspaceId: p.workspaceId,
    epoch: p.epoch,
    head: p.head,
    existingCredentialId: c.existing.id,
    newCredentialId: c.candidate.id,
    wPub: c.candidate.wPub,
    sPub: c.candidate.sPub,
    recoveryStateDigest: c.recoveryStateDigest,
    nonceExisting: nonces.existing,
    nonceNew: nonces.new,
  });
  const preparationId = admission.epoch.preparation.context.attemptId;
  const decision = sign(
    'done/enrollment-ceremony-relay/v2',
    {
      v: 2,
      kind: 'ceremony-relay',
      workspaceId: p.workspaceId,
      head: p.head,
      preparationId,
      credentialId: c.existing.id,
      action: 'decide',
      payload: { contextHash, transcriptHash: opening.transcriptHash, outcome: 'approved' },
    },
    keys.existing,
  );
  const sealCertificate = (body, signer = keys.existing) =>
    sign('done/membership-recipient-certificate/v2', body, signer);
  const certificate = sealCertificate({
    v: 2,
    workspaceId: p.workspaceId,
    lineageId: p.lineageId,
    parent: p.head,
    epoch: p.epoch + 1,
    generation: p.generation,
    members: [...p.certificate.members, c.candidate].sort((a, b) => (a.id < b.id ? -1 : 1)),
    recoveryStateDigest: p.certificate.recoveryStateDigest,
    approver: c.existing.id,
  });
  const sealDelivery = (body, signer = keys.existing) =>
    sign('done/membership-key-delivery/v2', body, signer);
  const delivery = sealDelivery({
    v: 2,
    kind: 'membership-key-delivery',
    parent: p.head,
    preparationId,
    generation: p.generation,
    transcriptHash: opening.transcriptHash,
    existing: commits.existing,
    candidate: commits.new,
    existingReveal: reveals.existing,
    newReveal: reveals.new,
    decision,
    certificate,
    recovery: f.f.base.request.recovery,
    wrap: { enc: 'ab'.repeat(32), ct: 'cd'.repeat(48) },
  });
  const install = (d = delivery, signer = keys.new) =>
    sign(
      'done/membership-key-installed/v2',
      {
        v: 2,
        kind: 'membership-key-installed',
        deliveryHash: hash(JSON.stringify(d)),
        credentialId: c.candidate.id,
      },
      signer,
    );
  const epoch = {
    v: 2,
    kind: 'membership-certification-epoch',
    workspaceId: p.workspaceId,
    lineageId: p.lineageId,
    epoch: p.epoch + 1,
    parent: p.head,
    generation: p.generation,
    acceptancePublicKey: p.acceptancePublicKey,
    delivery,
    installation: install(),
    roster: p.roster.map((m) =>
      m.id === c.candidate.id
        ? { ...m, state: 'certified', capabilities: ['read', 'write', 'admit', 'manage'] }
        : m,
    ),
    heads: p.heads,
  };
  const certify = (epoch, signer = keys.authority) => ({
    v: 2,
    kind: 'membership-certification',
    epoch,
    head: hash(message('done/device-membership-certification/v2', epoch)),
    signature: signed(signer, message('done/device-membership-certification/v2', epoch)),
  });
  return {
    f,
    parent,
    admission,
    p,
    c,
    keys,
    opening,
    certificate,
    delivery,
    installation: epoch.installation,
    epoch,
    certification: certify(epoch),
    sealCertificate,
    sealDelivery,
    install,
    certify,
  };
}
