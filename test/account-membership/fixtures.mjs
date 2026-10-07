// Small signed fixture for the existing 1–3 anchor and its first continuation.
// New admission bytes are framed independently of the runtime parser/verifier.
import { exchangeFixture, message, signed, hash } from '../account-ceremony/exchange-oracle.mjs';
import { lp } from '../account-ceremony/oracle.mjs';
import { key, publicHex } from '../account-first-authority/oracle.mjs';
export { message, signed, hash };
export function fixture() {
  const x = exchangeFixture(),
    { f, context: c } = x;
  const sign = (label, body, signer = f.keys.authority) => ({
    ...body,
    signature: signed(signer, message(label, body)),
  });
  const members = [c.existing, c.candidate].sort((a, b) => (a.id < b.id ? -1 : 1));
  const membersDigest = hash(
    lp('done/certified-members/v1', ...members.flatMap((m) => [m.id, m.wPub, m.sPub])),
  );
  const certificate = {
    members,
    recoveryStateDigest: c.recoveryStateDigest,
    approver: c.existing.id,
    signature: signed(
      x.keys.existing,
      Buffer.concat([
        lp('done/certified-set-approval/v1', c.existing.id),
        lp(
          'done/certified-set/v1',
          '1',
          c.workspaceId,
          c.lineageId,
          '2',
          '3',
          membersDigest,
          c.recoveryStateDigest,
        ),
      ]),
    ),
  };
  const decision = sign(
    'done/enrollment-ceremony-relay/v1',
    {
      v: 1,
      kind: 'ceremony-relay',
      workspaceId: c.workspaceId,
      credentialId: c.existing.id,
      action: 'decide',
      payload: {
        contextHash: x.contextHash(c),
        transcriptHash: x.result.transcriptHash,
        outcome: 'approved',
      },
    },
    x.keys.existing,
  );
  const delivery = sign(
    'done/content-key-delivery/v1',
    {
      v: 1,
      kind: 'content-key-delivery',
      parent: f.successor.head,
      generation: 1,
      transcriptHash: x.result.transcriptHash,
      existing: x.commits.existing,
      candidate: x.commits.new,
      existingReveal: x.reveals.existing,
      newReveal: x.reveals.new,
      decision,
      certificate,
      recovery: f.base.request.recovery,
      wrap: { enc: 'ab'.repeat(32), ct: 'cd'.repeat(48) },
    },
    x.keys.existing,
  );
  const installation = sign(
    'done/content-key-installed/v1',
    {
      v: 1,
      kind: 'content-key-installed',
      deliveryHash: hash(JSON.stringify(delivery)),
      credentialId: c.candidate.id,
    },
    x.keys.new,
  );
  const epoch = {
    v: 1,
    kind: 'device-certification-epoch',
    epoch: 3,
    parent: f.successor.head,
    delivery,
    installation,
    roster: f.epoch.roster.map((m) => ({
      ...m,
      state: 'certified',
      capabilities: ['read', 'write', 'admit', 'manage'],
    })),
    heads: f.epoch.heads,
  };
  const certification = {
    v: 1,
    kind: 'device-certification-successor',
    epoch,
    head: hash(message('done/device-certification-epoch/v1', epoch)),
    signature: signed(f.keys.authority, message('done/device-certification-epoch/v1', epoch)),
  };
  const seal = (e) => ({
    v: 2,
    kind: 'membership-admission',
    epoch: e,
    head: hash(message('done/device-membership-admission/v2', e)),
    signature: signed(f.keys.authority, message('done/device-membership-admission/v2', e)),
  });
  const prepare = (parent, id = '99'.repeat(16)) => {
    const signing = key('27'.repeat(32));
    const context = {
      v: 2,
      pin: f.pin,
      accountId: f.epoch.accountId,
      attemptId: Buffer.alloc(32, 93).toString('base64url'),
      candidate: {
        v: 1,
        workspaceId: c.workspaceId,
        lineageId: c.lineageId,
        head: parent.head,
        credentialId: id,
        sPub: publicHex(signing),
        wPub: 'a4'.repeat(32),
      },
      epoch: parent.epoch,
      certifiedSetDigest: parent.certifiedSetDigest,
      recoveryStateDigest: c.recoveryStateDigest,
      passkeyId: f.receipt.activation.context.credentialId,
      nonce: 'a5'.repeat(32),
      expiresAt: 601000,
    };
    const body = {
      v: 2,
      kind: 'enrollment-preparation-receipt',
      context,
      receiptId: Buffer.alloc(32, 94).toString('base64url'),
      preparedAt: 2000,
      expiresAt: 602000,
      assertionHash: 'a6'.repeat(32),
      possessionHash: 'a7'.repeat(32),
    };
    return {
      ...body,
      signature: signed(
        f.keys.authority,
        lp('done/enrollment-preparation-receipt/v2', JSON.stringify(body)),
      ),
    };
  };
  const admit = (parent, id) => {
    const preparation = prepare(parent, id),
      candidate = preparation.context.candidate;
    return seal({
      v: 2,
      kind: 'membership-admission-epoch',
      workspaceId: parent.workspaceId,
      lineageId: parent.lineageId,
      epoch: parent.epoch + 1,
      parent: parent.head,
      generation: parent.generation,
      acceptancePublicKey: parent.acceptancePublicKey,
      preparation,
      certifiedSetDigest: parent.certifiedSetDigest,
      roster: [
        ...parent.roster,
        {
          id: candidate.credentialId,
          wPub: candidate.wPub,
          sPub: candidate.sPub,
          principalId: parent.principalId,
          state: 'pending',
          capabilities: [],
        },
      ].sort((a, b) => (a.id < b.id ? -1 : 1)),
      heads: [
        ...parent.heads,
        { credentialId: candidate.credentialId, position: 0, link: '00'.repeat(32) },
      ].sort((a, b) => (a.credentialId < b.credentialId ? -1 : 1)),
    });
  };
  return {
    ...x,
    certification,
    certificate,
    prepare,
    admit,
    seal,
    anchor: { epoch: 3, head: certification.head },
  };
}
