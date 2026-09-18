import { ready } from '../account-successor/service-fixtures.mjs';
import { message, signed, hash } from './exchange-oracle.mjs';
import { commitment, derive } from './oracle.mjs';
export async function setup(t, options = {}) {
  const x = await ready(t, options),
    p = await x.prepare();
  if (options.beforeAdmit) await options.beforeAdmit(x);
  const s = await x.admit(p.input),
    e = s.epoch,
    c = e.preparation.context.candidate;
  const context = {
    v: 1,
    pin: x.authority.pin,
    accountId: e.accountId,
    principalId: e.principalId,
    workspaceId: e.workspaceId,
    lineageId: e.lineageId,
    epoch: 2,
    head: s.head,
    certifiedSetDigest: e.certified.digest,
    recoveryStateDigest: e.certified.value.recoveryStateDigest,
    existing: e.certified.value.members[0],
    candidate: { id: c.credentialId, wPub: c.wPub, sPub: c.sPub },
    attemptId: 'a1'.repeat(32),
    createdAt: 1000,
    expiresAt: 601000,
  };
  const keys = { existing: x.s.privateKey, new: p.entry.key },
    nonces = { existing: 'a2'.repeat(32), new: 'a3'.repeat(32) };
  const sign = (label, body, role) => ({
    ...body,
    signature: signed(keys[role], message(label, body)),
  });
  const commits = Object.fromEntries(
    ['existing', 'new'].map((role) => [
      role,
      sign(
        'done/enrollment-ceremony-commitment/v1',
        {
          v: 1,
          kind: 'ceremony-commitment',
          context,
          role,
          commitment: commitment(role, nonces[role]),
        },
        role,
      ),
    ]),
  );
  const contextHash = hash(message('done/enrollment-ceremony-context/v1', context));
  const reveals = Object.fromEntries(
    ['existing', 'new'].map((role) => [
      role,
      sign(
        'done/enrollment-ceremony-reveal/v1',
        {
          v: 1,
          kind: 'ceremony-reveal',
          contextHash,
          role,
          existingCommitHash: hash(JSON.stringify(commits.existing)),
          newCommitHash: hash(JSON.stringify(commits.new)),
          nonce: nonces[role],
        },
        role,
      ),
    ]),
  );
  const request = (role, action, payload = null) =>
    sign(
      'done/enrollment-ceremony-relay/v1',
      {
        v: 1,
        kind: 'ceremony-relay',
        workspaceId: x.workspace,
        credentialId: role === 'existing' ? context.existing.id : context.candidate.id,
        action,
        payload,
      },
      role,
    );
  const call = (r) => x.authority.owner.relayCeremony(x.f.core, r);
  const open = derive({
    workspaceId: x.workspace,
    epoch: 2,
    head: s.head,
    existingCredentialId: context.existing.id,
    newCredentialId: context.candidate.id,
    wPub: c.wPub,
    sPub: c.sPub,
    recoveryStateDigest: context.recoveryStateDigest,
    nonceExisting: nonces.existing,
    nonceNew: nonces.new,
  });
  return {
    ...x,
    deliveryCall: x.call,
    request,
    call,
    commits,
    reveals,
    contextHash,
    open,
    successor: s,
    prepared: p,
    keys,
    context,
  };
}
