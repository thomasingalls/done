import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import * as Y from 'yjs';
import { lp, openCandidate } from '../account-genesis/oracle.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const signed = (pub, sig, bytes) =>
  assert.ok(
    verify(
      null,
      bytes,
      createPublicKey({
        key: Buffer.from('302a300506032b6570032100' + pub, 'hex'),
        format: 'der',
        type: 'spki',
      }),
      Buffer.from(sig, 'hex'),
    ),
  );
const unsigned = (value, field = 'signature') => {
  const body = { ...value };
  delete body[field];
  return body;
};
// Separate OpenSSL/LP oracle; coverage is derived from plaintext replay with no production admission helper.
export function inspectReceipt(receipt, request, item, expectedText) {
  const c = request.candidate,
    m = receipt.completion.manifest,
    a = receipt.completion.admission;
  assert.equal(receipt.offer.epoch.requestDigest, hash(JSON.stringify(request)));
  assert.equal(receipt.v, 2);
  const context = receipt.activation.context;
  assert.equal(context.accountId, c.accountId);
  assert.equal(context.requestDigest, hash(JSON.stringify(request)));
  assert.equal(context.offerHead, receipt.offer.head);
  assert.equal(context.completionDigest, hash(JSON.stringify(receipt.completion)));
  assert.equal(context.credentialId, item.key.id);
  assert.equal(context.pin.authRoot, item.draft.authRoot);
  const epochBytes = lp('done/first-epoch/v1', hash(JSON.stringify(receipt.offer.epoch)));
  assert.equal(receipt.offer.head, hash(epochBytes));
  signed(item.draft.authRoot, receipt.epochSignature, epochBytes);
  signed(
    item.draft.authRoot,
    receipt.offer.signature,
    lp('done/promotion-offer/v1', hash(JSON.stringify(unsigned(receipt.offer)))),
  );
  signed(
    item.draft.authRoot,
    receipt.signature,
    lp('done/promotion-receipt/v2', hash(JSON.stringify(unsigned(receipt)))),
  );
  signed(
    item.draft.bootstrapSigner,
    request.originSignature,
    lp('done/genesis-origin/v1', hash(JSON.stringify(unsigned(request, 'originSignature')))),
  );
  const member = request.certification.members[0];
  signed(
    member.sPub,
    request.certification.signature,
    Buffer.concat([
      lp('done/certified-set-approval/v1', member.id),
      lp(
        'done/certified-set/v1',
        '1',
        c.workspaceId,
        c.lineageId,
        '0',
        '1',
        hash(lp('done/certified-members/v1', member.id, member.wPub, member.sPub)),
        request.certification.recoveryStateDigest,
      ),
    ]),
  );
  const manifest = lp(
    'done/cp-manifest/v2',
    '2',
    c.workspaceId,
    '1',
    receipt.offer.head,
    '1',
    hash(Buffer.from(c.checkpoint.ct, 'hex')),
    hash(Buffer.from(m.sv, 'hex')),
    hash(Buffer.from(m.ds, 'hex')),
    hash(lp('done/headvec/v1')),
    c.signer,
  );
  signed(member.sPub, m.signature, manifest);
  assert.equal(a.manifestDigest, hash(manifest));
  assert.equal(a.selfAdmitted, 1);
  assert.equal(a.decisionParent, '00'.repeat(32));
  signed(
    member.sPub,
    a.signature,
    lp(
      'done/cp-admit/v2',
      '2',
      c.workspaceId,
      m.checkpointDigest,
      hash(manifest),
      hash(Buffer.from(m.sv, 'hex')),
      hash(Buffer.from(m.ds, 'hex')),
      m.headVectorDigest,
      'yjs-13.6.31-sv-ds-v1',
      c.signer,
      '1',
      '00'.repeat(32),
    ),
  );
  const update = openCandidate(c, item.draft, item.recoveryCode),
    doc = new Y.Doc({ gc: false });
  try {
    Y.applyUpdate(doc, update);
    assert.equal(doc.getText('master').toString(), expectedText);
    assert.equal(!!(doc.store.pendingStructs || doc.store.pendingDs), false);
    assert.equal(m.sv, Buffer.from(Y.encodeStateVector(doc)).toString('hex'));
    assert.equal(
      m.ds,
      Buffer.from(Y.encodeSnapshot(Y.createSnapshot(Y.snapshot(doc).ds, new Map()))).toString(
        'hex',
      ),
    );
    assert.equal(a.derivedSv, m.sv);
    assert.equal(a.derivedDs, m.ds);
  } finally {
    doc.destroy();
  }
  return update;
}
