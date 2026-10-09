import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryFixture } from './delivery-fixtures.mjs';
import { message, hash } from './fixtures.mjs';
import {
  membershipState,
  membershipCertificationMessage,
  verifyMembershipCertification,
  verifyMembershipAdmission,
} from '../../account-protocol/membership.ts';
import {
  membershipCertificateMessage,
  membershipDeliveryMessage,
  membershipDeliveryHash,
  membershipInstallationMessage,
  verifyMembershipDelivery,
  verifyMembershipInstallation,
  parseMembershipCertificate,
} from '../../account-protocol/membershipDelivery.ts';
const unsigned = ({ signature: _, ...body }) => body;
for (const approver of ['existing', 'new'])
  test(`additional-device delivery and installed certification verify independent signatures from ${approver}`, async () => {
    const f = await deliveryFixture(approver);
    for (const [api, label, input] of [
      [membershipCertificateMessage, 'done/membership-recipient-certificate/v2', f.certificate],
      [membershipDeliveryMessage, 'done/membership-key-delivery/v2', f.delivery],
      [membershipInstallationMessage, 'done/membership-key-installed/v2', f.installation],
    ])
      assert.deepEqual(Buffer.from(await api(input)), message(label, unsigned(input)));
    assert.equal(await membershipDeliveryHash(f.delivery), hash(JSON.stringify(f.delivery)));
    const result = await verifyMembershipDelivery(f.delivery, f.parent);
    assert.deepEqual(result.opening, f.opening);
    assert.deepEqual(result.delivery, f.delivery);
    assert.equal(f.p.roster.filter((m) => m.state === 'certified').length, 2);
    assert.deepEqual(
      await verifyMembershipInstallation(f.installation, f.delivery),
      f.installation,
    );
    assert.deepEqual(
      Buffer.from(await membershipCertificationMessage(f.epoch)),
      message('done/device-membership-certification/v2', f.epoch),
    );
    const installed = await verifyMembershipCertification(f.certification, f.parent),
      state = membershipState(installed);
    assert.equal(state.epoch, 5);
    assert.equal(state.roster.filter((m) => m.state === 'certified').length, 3);
    assert.deepEqual(state.certificate, f.certificate);
    assert.deepEqual(state.preparations, []);
    assert(Object.isFrozen(state.certificate.members));
    assert.equal(state.generation, 1);
    const next = await verifyMembershipAdmission(f.f.admit(state, 'aa'.repeat(16)), installed);
    assert.equal(membershipState(next).roster.filter((m) => m.state === 'certified').length, 3);
    assert.deepEqual(membershipState(next).certificate, f.certificate);
    await assert.rejects(verifyMembershipDelivery(f.delivery, { ...f.parent }), /Unverified/);
    await assert.rejects(verifyMembershipCertification(f.certification, installed), /continuity/);
  });

test('approver-signed delivery must preserve every existing recipient, recovery, generation and exact comparison', async () => {
  const f = await deliveryFixture();
  for (const change of [
    (d) => {
      d.certificate.members.pop();
    },
    (d) => {
      d.certificate.members[0].wPub = 'ef'.repeat(32);
    },
    (d) => {
      d.certificate.members[0].sPub = 'ef'.repeat(32);
    },
    (d) => {
      d.certificate.approver = f.c.candidate.id;
    },
    (d) => {
      d.certificate.parent = 'ef'.repeat(32);
    },
    (d) => {
      d.certificate.epoch++;
    },
    (d) => {
      d.certificate.generation++;
    },
    (d) => {
      d.certificate.recoveryStateDigest = 'ef'.repeat(32);
    },
    (d) => {
      d.preparationId = Buffer.alloc(32, 81).toString('base64url');
    },
    (d) => {
      d.transcriptHash = 'ef'.repeat(32);
    },
    (d) => {
      d.generation++;
    },
    (d) => {
      d.wrap.ct = 'ef'.repeat(48);
    },
  ]) {
    const d = structuredClone(f.delivery);
    change(d);
    // A changed wrap is detected by the enclosing signer; it cannot be inspected by the service.
    const changedWrap = d.wrap.ct !== f.delivery.wrap.ct;
    if (!changedWrap) {
      d.certificate = f.sealCertificate(d.certificate);
      Object.assign(d, f.sealDelivery(d));
    }
    await assert.rejects(verifyMembershipDelivery(d, f.parent));
  }
  const duplicated = {
    ...f.certificate,
    members: [...f.certificate.members, f.certificate.members.at(-1)],
  };
  assert.throws(() => parseMembershipCertificate(duplicated), /Duplicate/);
  await assert.rejects(
    verifyMembershipDelivery(f.sealDelivery(f.delivery, f.keys.authority), f.parent),
  );
  await assert.rejects(
    verifyMembershipDelivery(
      f.sealDelivery({
        ...f.delivery,
        certificate: f.sealCertificate(f.certificate, f.keys.authority),
      }),
      f.parent,
    ),
  );
});

test('certification cannot authorize an uninstalled device or change prior keys, rights, parent or accepted coverage', async () => {
  const f = await deliveryFixture('new');
  const badInstall = f.install(f.delivery, f.keys.authority);
  await assert.rejects(
    verifyMembershipCertification(f.certify({ ...f.epoch, installation: badInstall }), f.parent),
  );
  await assert.rejects(
    verifyMembershipInstallation(
      f.install({ ...f.delivery, wrap: { ...f.delivery.wrap, ct: 'ff'.repeat(48) } }),
      f.delivery,
    ),
    /target/,
  );
  for (const change of [
    (e) => {
      e.parent = 'ef'.repeat(32);
    },
    (e) => {
      e.epoch++;
    },
    (e) => {
      e.generation++;
    },
    (e) => {
      e.acceptancePublicKey = 'ef'.repeat(32);
    },
    (e) => {
      e.roster[0].sPub = 'ef'.repeat(32);
    },
    (e) => {
      e.roster.find((m) => m.id === f.c.candidate.id).capabilities = [];
    },
    (e) => {
      e.heads.pop();
    },
    (e) => {
      const h = e.heads.find((h) => h.credentialId === f.c.candidate.id);
      h.position = 1;
      h.link = 'ef'.repeat(32);
    },
  ]) {
    const e = structuredClone(f.epoch);
    change(e);
    await assert.rejects(verifyMembershipCertification(f.certify(e), f.parent));
  }
  const mutable = structuredClone(f.certification),
    inFlight = verifyMembershipCertification(mutable, f.parent);
  mutable.epoch.delivery.certificate.members[0].sPub = 'ef'.repeat(32);
  assert.deepEqual(membershipState(await inFlight).certificate, f.certificate);
});
