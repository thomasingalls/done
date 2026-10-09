import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, message } from './fixtures.mjs';
import {
  verifyMembershipAnchor,
  verifyMembershipAdmission,
  membershipState,
  membershipAdmissionMessage,
  parseMembershipAdmission,
} from '../../account-protocol/membership.ts';
async function ready() {
  const f = fixture();
  const parent = await verifyMembershipAnchor(f.f.base, f.f.successor, f.certification, f.anchor);
  return { ...f, parent };
}
test('versioned admission preserves both approved recipients and their original certificate through repeated pending admissions', async () => {
  const f = await ready(),
    prior = membershipState(f.parent),
    proof = f.admit(prior);
  assert.deepEqual(
    Buffer.from(await membershipAdmissionMessage(proof.epoch)),
    message('done/device-membership-admission/v2', proof.epoch),
  );
  const next = await verifyMembershipAdmission(proof, f.parent),
    state = membershipState(next);
  assert.equal(state.epoch, 4);
  assert.deepEqual(state.certificate, f.certificate);
  assert.equal(state.roster.filter((m) => m.state === 'certified').length, 2);
  assert.deepEqual(state.roster.find((m) => m.id === '99'.repeat(16)).capabilities, []);
  assert(Object.isFrozen(state.roster[0]));
  assert(Object.isFrozen(state.certificate.members));
  const later = await verifyMembershipAdmission(f.admit(state, 'aa'.repeat(16)), next);
  assert.equal(membershipState(later).epoch, 5);
  assert.equal(membershipState(later).roster.filter((m) => m.state === 'pending').length, 2);
  assert.deepEqual(membershipState(later).certificate, prior.certificate);
  await assert.rejects(verifyMembershipAdmission(proof, next), /continuity/);
  await assert.rejects(verifyMembershipAdmission(proof, { ...f.parent }), /Unverified/);
  assert.throws(() => parseMembershipAdmission({ ...proof, v: 1 }));
});
test('service signatures cannot substitute recipients, grant pending rights, skip a parent or omit accepted boundaries', async () => {
  const f = await ready(),
    proof = f.admit(membershipState(f.parent));
  const changes = [
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
      e.certifiedSetDigest = 'ef'.repeat(32);
    },
    (e) => {
      e.roster[0].sPub = 'ef'.repeat(32);
    },
    (e) => {
      const m = e.roster.find((m) => m.state === 'pending');
      m.state = 'certified';
      m.capabilities = ['read', 'write', 'admit', 'manage'];
    },
    (e) => {
      e.heads.pop();
    },
    (e) => {
      const s = e.heads.find((h) => h.credentialId === '99'.repeat(16));
      s.position = 1;
      s.link = 'ef'.repeat(32);
    },
  ];
  for (const change of changes) {
    const epoch = structuredClone(proof.epoch);
    change(epoch);
    await assert.rejects(verifyMembershipAdmission(f.seal(epoch), f.parent));
  }
  const mutable = structuredClone(proof);
  const inFlight = verifyMembershipAdmission(mutable, f.parent);
  mutable.epoch.roster[0].sPub = 'ef'.repeat(32);
  assert.equal(
    membershipState(await inFlight).roster[0].sPub,
    membershipState(f.parent).roster[0].sPub,
  );
  await assert.rejects(
    verifyMembershipAnchor(f.f.base, f.f.successor, f.certification, {
      epoch: 3,
      head: 'ef'.repeat(32),
    }),
    /anchor/,
  );
});
