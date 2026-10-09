/** Exchange oracle: independent ordered JSON/LP and Node signatures, with the prior authority fixture. */
import {
  fixture as admissionFixture,
  message,
  signed,
  hash,
  unsigned,
} from '../account-successor/oracle.mjs';
import { commitment, derive } from './oracle.mjs';
export { message, signed, hash, unsigned };
export function exchangeFixture(options = {}) {
  const f = admissionFixture(0, '00'.repeat(32), options),
    e = f.epoch,
    admitted = e.preparation.context.candidate;
  const context = {
    v: 1,
    pin: f.pin,
    accountId: e.accountId,
    principalId: e.principalId,
    workspaceId: e.workspaceId,
    lineageId: e.lineageId,
    epoch: 2,
    head: f.successor.head,
    certifiedSetDigest: e.certified.digest,
    recoveryStateDigest: e.certified.value.recoveryStateDigest,
    existing: e.certified.value.members[0],
    candidate: { id: admitted.credentialId, wPub: admitted.wPub, sPub: admitted.sPub },
    attemptId: 'a1'.repeat(32),
    createdAt: 700000,
    expiresAt: 1300000,
  };
  // The old preparation expired at 602000. Admission, not its old deadline, is the authority here.
  const now = 700001,
    held = { epoch: 2, head: context.head };
  const keys = { existing: f.keys.device, new: f.nextKey };
  const nonces = { existing: 'a2'.repeat(32), new: 'a3'.repeat(32) };
  const local = (role) => ({
    role,
    ...(role === 'existing' ? context.existing : context.candidate),
  });
  const signCommit = (body, key = keys[body.role]) => ({
    ...body,
    signature: signed(key, message('done/enrollment-ceremony-commitment/v1', body)),
  });
  const commit = (role, c = context, nonce = nonces[role]) =>
    signCommit({
      v: 1,
      kind: 'ceremony-commitment',
      context: c,
      role,
      commitment: commitment(role, nonce),
    });
  const commits = { existing: commit('existing'), new: commit('new') };
  const contextHash = (c) => hash(message('done/enrollment-ceremony-context/v1', c));
  const signReveal = (body, key = keys[body.role]) => ({
    ...body,
    signature: signed(key, message('done/enrollment-ceremony-reveal/v1', body)),
  });
  const reveal = (role, pair = commits, c = context, nonce = nonces[role]) =>
    signReveal({
      v: 1,
      kind: 'ceremony-reveal',
      contextHash: contextHash(c),
      role,
      existingCommitHash: hash(JSON.stringify(pair.existing)),
      newCommitHash: hash(JSON.stringify(pair.new)),
      nonce,
    });
  const reveals = { existing: reveal('existing'), new: reveal('new') };
  const transcript = {
    workspaceId: context.workspaceId,
    epoch: context.epoch,
    head: context.head,
    existingCredentialId: context.existing.id,
    newCredentialId: context.candidate.id,
    wPub: context.candidate.wPub,
    sPub: context.candidate.sPub,
    recoveryStateDigest: context.recoveryStateDigest,
    nonceExisting: nonces.existing,
    nonceNew: nonces.new,
  };
  return {
    f,
    context,
    now,
    held,
    keys,
    nonces,
    local,
    commit,
    commits,
    reveal,
    reveals,
    signCommit,
    signReveal,
    contextHash,
    transcript,
    result: derive(transcript),
  };
}
