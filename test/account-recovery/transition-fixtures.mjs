import { fixture, message, signed, hash } from '../account-membership/fixtures.mjs';
import { key, publicHex } from '../account-first-authority/oracle.mjs';
import { lp } from '../account-ceremony/oracle.mjs';
import { membershipState } from '../../account-protocol/membership.ts';
export { fixture };
export function transitionFixture(parent, f = fixture(), candidateId = '88'.repeat(16)) {
  const p = membershipState(parent),
    keys = f.f.keys,
    candidate = key('81'.repeat(32));
  const head = {
    v: 1,
    workspaceId: p.workspaceId,
    epoch: p.epoch,
    head: p.head,
    clientNonce: '83'.repeat(32),
    issuedAt: 1000,
  };
  head.signature = signed(
    keys.authority,
    lp(
      'done/head-assert/v1',
      head.workspaceId,
      String(head.epoch),
      head.head,
      head.clientNonce,
      String(head.issuedAt),
    ),
  );
  const bootstrap = {
    v: 1,
    kind: 'recovery-bootstrap',
    workspaceId: p.workspaceId,
    lineageId: p.lineageId,
    observedEpoch: p.epoch,
    observedHeadDigest: p.head,
    clientNonce: head.clientNonce,
    priorRecoveryStateDigest: p.certificate.recoveryStateDigest,
    recoveredRoot: p.pin.authRoot,
    newCredentialId: candidateId,
    newWPub: '84'.repeat(32),
    newSPub: publicHex(candidate),
    newRecoveryStateDigest: p.certificate.recoveryStateDigest,
    conflictParent: p.head,
  };
  const bytes = lp(
    'done/recovery-bootstrap/v1',
    '1',
    bootstrap.workspaceId,
    bootstrap.lineageId,
    String(bootstrap.observedEpoch),
    bootstrap.observedHeadDigest,
    bootstrap.clientNonce,
    bootstrap.priorRecoveryStateDigest,
    bootstrap.recoveredRoot,
    bootstrap.newCredentialId,
    bootstrap.newWPub,
    bootstrap.newSPub,
    bootstrap.newRecoveryStateDigest,
    bootstrap.conflictParent,
  );
  bootstrap.signature = signed(keys.bootstrap, bytes);
  bootstrap.countersignature = signed(candidate, bytes);
  const heads = [
    ...p.heads.filter((h) => p.certificate.members.some((m) => m.id === h.credentialId)),
    ...p.finalized.map((h) => ({ credentialId: h.credential, position: h.position, link: h.link })),
  ].sort((a, b) => a.credentialId.localeCompare(b.credentialId));
  const signIntent = (body) => {
    const { signature: _, ...unsigned } = body;
    return {
      ...unsigned,
      signature: signed(candidate, message('done/recovery-transition-intent/v1', unsigned)),
    };
  };
  const intent = signIntent({
    v: 1,
    kind: 'recovery-transition-intent',
    attemptId: Buffer.alloc(32, 82).toString('base64url'),
    head,
    bootstrap,
    generation: p.generation + 1,
    heads,
    checkpointDigest: '85'.repeat(32),
    deviceWrap: { enc: '86'.repeat(32), ct: '87'.repeat(48) },
    recoveryWrap: { enc: '88'.repeat(32), ct: '89'.repeat(48) },
  });
  const finalize = (h) => ({
    workspace: p.workspaceId,
    credential: h.credentialId,
    position: h.position,
    link: h.link,
    epoch: p.epoch + 1,
    final: true,
    signature: signed(
      keys.acceptance,
      lp(
        'done/accept-head/v1',
        p.workspaceId,
        h.credentialId,
        String(h.position),
        h.link,
        String(p.epoch + 1),
        'true',
      ),
    ),
  });
  const seal = (epoch) => ({
    v: 1,
    kind: 'recovery-successor',
    epoch,
    head: hash(message('done/recovery-successor/v1', epoch)),
    signature: signed(keys.authority, message('done/recovery-successor/v1', epoch)),
  });
  const proof = seal({
    v: 1,
    kind: 'recovery-epoch',
    workspaceId: p.workspaceId,
    lineageId: p.lineageId,
    epoch: p.epoch + 1,
    parent: p.head,
    generation: p.generation + 1,
    acceptancePublicKey: p.acceptancePublicKey,
    intent,
    recovery: f.f.base.request.recovery,
    heads: [
      ...heads,
      ...p.roster
        .filter((m) => m.state === 'pending')
        .map((m) => ({ credentialId: m.id, position: 0, link: '00'.repeat(32) })),
      { credentialId: candidateId, position: 0, link: '00'.repeat(32) },
    ].sort((a, b) => a.credentialId.localeCompare(b.credentialId)),
    finalizations: heads
      .filter((h) => p.certificate.members.some((m) => m.id === h.credentialId))
      .map(finalize),
  });
  return { p, f, keys, candidate, intent, proof, signIntent, seal, finalize };
}
