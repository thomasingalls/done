import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { fixture, registered } from '../account-core/fixtures.mjs';
import { authorityFixture } from '../account-authority/fixtures.mjs';
import { generateRecovery, confirmRecovery, withRecoveryKeys } from '../../src/account/recovery.ts';
import { parseGenesis } from '../../account-protocol/genesis.ts';
import { parseAdmissionRequest, completionBodies } from '../../account-protocol/admission.ts';
import { lp } from '../account-genesis/oracle.mjs';
export { lp };
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const signing = (key, message) => sign(null, message, key).toString('hex');
export const candidateMessage = (c) => {
  const { signature: _s, ...body } = c;
  return lp('done/promotion-genesis-candidate/v1', hash(JSON.stringify(body)));
};
export const certMessage = (r) => {
  const m = r.certification.members[0],
    c = r.candidate;
  return Buffer.concat([
    lp('done/certified-set-approval/v1', m.id),
    lp(
      'done/certified-set/v1',
      '1',
      c.workspaceId,
      c.lineageId,
      '0',
      '1',
      hash(lp('done/certified-members/v1', m.id, m.wPub, m.sPub)),
      r.certification.recoveryStateDigest,
    ),
  ]);
};
export const manifestBytes = (m) =>
  lp(
    'done/cp-manifest/v2',
    '2',
    m.workspaceId,
    '1',
    m.epochHead,
    '1',
    m.checkpointDigest,
    hash(Buffer.from(m.sv, 'hex')),
    hash(Buffer.from(m.ds, 'hex')),
    m.headVectorDigest,
    m.producer,
  );
export const semanticBytes = (a) =>
  lp(
    'done/cp-admit/v2',
    '2',
    a.workspaceId,
    a.checkpointDigest,
    a.manifestDigest,
    hash(Buffer.from(a.derivedSv, 'hex')),
    hash(Buffer.from(a.derivedDs, 'hex')),
    a.headBaselineDigest,
    a.derivation,
    a.admittingCredential,
    String(a.selfAdmitted),
    a.decisionParent,
  );
/** Synthetic content-blind-service fixture; native tests own actual Yjs semantic replay. */
export async function prepared(t, options = {}) {
  const f = options.fixture ?? fixture(t, options),
    authority = options.authority ?? authorityFixture(t),
    account = await registered(f);
  const scope = {
    principalId: '11'.repeat(16),
    workspaceId: '22'.repeat(16),
    lineageId: '33'.repeat(32),
    authRoot: authority.pin.authRoot,
  };
  const recovery = await generateRecovery(scope),
    view = await f.core.beginRecovery({ retryKey: account.retryKey, draft: recovery.draft });
  const confirmation = await f.core.finishRecovery({
    retryKey: account.retryKey,
    recoveryId: view.recoveryId,
    recoveryProof: await confirmRecovery(
      recovery.draft,
      recovery.code,
      view.options.challenge,
      view.draftDigest,
    ),
    response: account.key.assert(view),
  });
  const s = generateKeyPairSync('ed25519'),
    w = generateKeyPairSync('x25519'),
    pub = (key) => key.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
  const candidate = parseGenesis({
    v: 1,
    kind: 'promotion-genesis-candidate',
    preparation: '44'.repeat(32),
    accountId: account.result.accountId,
    ...scope,
    generation: 1,
    proposedEpoch: 1,
    signer: '55'.repeat(16),
    actors: [{ id: scope.principalId, kind: 'human', credential: '55'.repeat(16) }],
    coverage: { derivation: 'yjs-13.6.31-snapshot-v1', snapshot: '0000', heads: [] },
    checkpoint: { v: 1, salt: '66'.repeat(16), nonce: '77'.repeat(12), ct: '88'.repeat(18) },
    wraps: [
      {
        recipient: 'device',
        id: '99'.repeat(16),
        publicKey: pub(w.publicKey),
        enc: 'aa'.repeat(32),
        ct: 'bb'.repeat(48),
      },
      {
        recipient: 'recovery',
        id: confirmation.recoveryId,
        publicKey: recovery.draft.rPub,
        enc: 'cc'.repeat(32),
        ct: 'dd'.repeat(48),
      },
    ],
    signature: '00'.repeat(64),
  });
  candidate.signature = signing(s.privateKey, candidateMessage(candidate));
  const request = parseAdmissionRequest({
    v: 1,
    candidate,
    recovery: recovery.draft,
    originSignature: '00'.repeat(64),
    certification: {
      members: [{ id: candidate.signer, wPub: pub(w.publicKey), sPub: pub(s.publicKey) }],
      recoveryStateDigest: confirmation.recoveryStateDigest,
      approver: candidate.signer,
      signature: '00'.repeat(64),
    },
  });
  request.certification.signature = signing(s.privateKey, certMessage(request));
  request.originSignature = await withRecoveryKeys(
    recovery.draft,
    recovery.code,
    crypto.subtle,
    async (_r, key) => {
      const { originSignature: _sig, ...body } = request;
      return Buffer.from(
        await crypto.subtle.sign(
          'Ed25519',
          key,
          lp('done/genesis-origin/v1', hash(JSON.stringify(body))),
        ),
      ).toString('hex');
    },
  );
  const begin = () =>
    authority.owner.beginPromotion(f.core, { retryKey: account.retryKey, request });
  const completion = async (offer) => {
    const c = await completionBodies(request, offer, { sv: '00', ds: '0000' });
    c.manifest.signature = signing(s.privateKey, manifestBytes(c.manifest));
    c.admission.signature = signing(s.privateKey, semanticBytes(c.admission));
    return c;
  };
  const finish = async (offer) =>
    authority.owner.finishPromotion(f.core, {
      retryKey: account.retryKey,
      requestDigest: offer.epoch.requestDigest,
      completion: await completion(offer),
    });
  return { f, authority, account, request, recovery, s, begin, completion, finish };
}
