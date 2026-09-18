import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './development-fixtures.mjs';
import { signed } from './exchange-oracle.mjs';
import { decision, mutate } from '../account-successor/service-fixtures.mjs';
import {
  recipientCertificateMessage,
  contentDeliveryMessage,
  contentDeliveryHash,
  contentInstallationMessage,
  contentTransferMessage,
  verifyContentDelivery,
  verifyCertificationSuccessor,
} from '../../account-protocol/contentDelivery.ts';
async function approved(t, options = {}) {
  const x = await setup(t, { now: () => 1000, ...options });
  for (const role of ['existing', 'new'])
    assert.equal((await x.call(x.request(role, 'commit', x.commits[role]))).ok, true);
  for (const role of ['existing', 'new'])
    assert.equal((await x.call(x.request(role, 'reveal', x.reveals[role]))).ok, true);
  const approval = x.request('existing', 'decide', {
    contextHash: x.contextHash,
    transcriptHash: x.open.transcriptHash,
    outcome: 'approved',
  });
  const cert = {
    members: [x.context.existing, x.context.candidate].sort((a, b) => (a.id < b.id ? -1 : 1)),
    recoveryStateDigest: x.context.recoveryStateDigest,
    approver: x.context.existing.id,
    signature: '00'.repeat(64),
  };
  cert.signature = signed(
    x.keys.existing,
    await recipientCertificateMessage(cert, x.workspace, x.context.lineageId),
  );
  const d = {
    v: 1,
    kind: 'content-key-delivery',
    parent: x.successor.head,
    generation: 1,
    transcriptHash: x.open.transcriptHash,
    existing: x.commits.existing,
    candidate: x.commits.new,
    existingReveal: x.reveals.existing,
    newReveal: x.reveals.new,
    decision: approval,
    certificate: cert,
    recovery:
      x.requestBase?.recovery ??
      x.f.rows('promotions').map((r) => JSON.parse(r.request))[0].recovery,
    wrap: { enc: 'ab'.repeat(32), ct: 'cd'.repeat(48) },
    signature: '00'.repeat(64),
  };
  const signDelivery = async (d) => ({
    ...d,
    signature: signed(x.keys.existing, await contentDeliveryMessage(d)),
  });
  const delivery = await signDelivery(d);
  const transfer = async (role, action, payload = null) => {
    const r = {
      v: 1,
      workspaceId: x.workspace,
      credentialId: role === 'existing' ? x.context.existing.id : x.context.candidate.id,
      parent: x.successor.head,
      action,
      payload,
      signature: '00'.repeat(64),
    };
    r.signature = signed(x.keys[role], await contentTransferMessage(r));
    return x.authority.owner.transferContent(x.f.core, r);
  };
  const installation = {
    v: 1,
    kind: 'content-key-installed',
    deliveryHash: await contentDeliveryHash(delivery),
    credentialId: x.context.candidate.id,
    signature: '00'.repeat(64),
  };
  installation.signature = signed(x.keys.new, await contentInstallationMessage(installation));
  return {
    ...x,
    approval,
    delivery,
    installation,
    transfer,
    signDelivery,
    base: {
      pin: x.authority.pin,
      request: JSON.parse(x.f.rows('promotions')[0].request),
      receipt: x.receipt,
    },
  };
}
test('approval is required; exact delivery survives lost replies, cannot be replaced, and does not yet certify', async (t) => {
  let lose = false;
  const x = await approved(t, {
    hook(at, op) {
      if (lose && op === 'content-transfer' && at === 'after-commit') {
        lose = false;
        throw Error('lost reply');
      }
    },
  });
  assert.equal((await x.transfer('existing', 'deliver', x.delivery)).refusal, 'approval-required');
  await x.call(x.approval);
  assert.equal((await x.transfer('new', 'deliver', x.delivery)).ok, false);
  lose = true;
  assert.equal((await x.transfer('existing', 'deliver', x.delivery)).ok, false);
  x.f.restart();
  const r = await x.transfer('existing', 'deliver', x.delivery);
  assert.deepEqual(r.delivery, x.delivery);
  assert.equal(r.certification, null);
  assert.equal(x.f.rows('promotions')[0].successor_head, x.successor.head);
  const changed = await x.signDelivery({
    ...x.delivery,
    wrap: { ...x.delivery.wrap, enc: 'aa'.repeat(32) },
  });
  assert.equal((await x.transfer('existing', 'deliver', changed)).refusal, 'delivery-conflict');
  assert.deepEqual((await x.transfer('new', 'read')).delivery, x.delivery);
});
test('installation and certification are atomic, restartable after a lost reply, and preserve all three issuance epochs', async (t) => {
  let fault = null,
    pre,
    preReply;
  const x = await approved(t, {
    beforeAdmit: async (x) => {
      pre = x.make(1, 'epoch one');
      preReply = await x.call(pre);
    },
    hook(at, op) {
      if (op === 'content-transfer' && at === fault) throw Error('interrupted');
    },
  });
  let previous = decision(x, preReply, pre).head.link;
  const mid = x.make(2, 'epoch two', { epoch: 2 }),
    midReply = await x.deliveryCall(mid);
  previous = decision(x, midReply, mid, previous, 2).head.link;
  const queued = x.make(3, 'queued at two', { epoch: 2 });
  await x.call(x.approval);
  await x.transfer('existing', 'deliver', x.delivery);
  assert.equal((await x.transfer('existing', 'install', x.installation)).ok, false);
  assert.equal(
    (await x.transfer('new', 'install', { ...x.installation, signature: '00'.repeat(64) })).ok,
    false,
  );
  fault = 'before-commit';
  assert.equal((await x.transfer('new', 'install', x.installation)).ok, false);
  assert.equal(x.f.rows('content_transfers')[0].artifact, null);
  assert.equal(x.f.rows('promotions')[0].successor_head, x.successor.head);
  fault = 'after-commit';
  assert.equal((await x.transfer('new', 'install', x.installation)).ok, false);
  x.f.restart();
  x.authority.restart();
  fault = null;
  const complete = await x.transfer('new', 'install', x.installation);
  assert.equal(complete.ok, true, JSON.stringify(complete));
  const c = await verifyCertificationSuccessor(
    complete.certification,
    x.base,
    x.successor,
    x.delivery,
  );
  assert.equal(c.epoch.epoch, 3);
  assert.equal(x.f.rows('promotions')[0].successor_head, c.head);
  assert.deepEqual(await x.deliveryCall(pre), preReply);
  assert.deepEqual(await x.deliveryCall(mid), midReply);
  previous = decision(x, await x.deliveryCall(queued), queued, previous, 3).head.link;
  const current = x.make(4, 'epoch three', { epoch: 3 });
  decision(x, await x.deliveryCall(current), current, previous, 3);
  x.f.restart();
  assert.deepEqual((await x.transfer('existing', 'deliver', x.delivery)).certification, c);
  assert.equal(x.f.rows('content_transfers').length, 1);
});
test('recipient keys, transcript, recovery state and approver are authenticated before delivery', async (t) => {
  const x = await approved(t);
  await x.call(x.approval);
  for (const change of [
    (d) => (d.transcriptHash = 'ff'.repeat(32)),
    (d) => (d.recovery.rPub = 'ff'.repeat(32)),
    (d) => (d.certificate.approver = x.context.candidate.id),
    (d) => (d.certificate.members[0].sPub = 'ff'.repeat(32)),
    (d) => (d.decision.payload.outcome = 'mismatch'),
    (d) => (d.parent = 'ff'.repeat(32)),
  ]) {
    const d = structuredClone(x.delivery);
    change(d);
    const resigned = await x.signDelivery(d);
    await assert.rejects(verifyContentDelivery(resigned, x.base, x.successor));
    assert.equal((await x.transfer('existing', 'deliver', resigned)).ok, false);
  }
  assert.equal(x.f.rows('content_transfers').length, 0);
});
test('a competing authority change during verification cannot commit installation', async (t) => {
  let race = false;
  const x = await approved(t, {
    hook(at, op) {
      if (race && op === 'content-transfer' && at === 'after-verify')
        mutate(x, (db) => db.exec("UPDATE accounts SET state='pending'"));
    },
  });
  await x.call(x.approval);
  await x.transfer('existing', 'deliver', x.delivery);
  race = true;
  assert.equal((await x.transfer('new', 'install', x.installation)).ok, false);
  assert.equal(x.f.rows('content_transfers')[0].artifact, null);
});
test('schema eight opens only through the explicit offline upgrade, preserving retained attempts', async (t) => {
  const x = await approved(t);
  await x.call(x.approval);
  const before = x.f.rows('content_ceremonies');
  mutate(x, (db) => db.exec('DROP TABLE content_transfers; PRAGMA user_version=8;'));
  const { AccountCore } = await import('../../account-service/core.ts');
  const policy = { origin: x.authority.pin.origin, rpId: x.authority.pin.rpId };
  assert.throws(() => new AccountCore(x.f.path, policy), /explicit offline upgrade/);
  const core = new AccountCore(x.f.path, policy, { upgradeFromV8: true });
  core.close();
  x.f.restart();
  assert.deepEqual(x.f.rows('content_ceremonies'), before);
  assert.deepEqual(x.f.rows('content_transfers'), []);
});
