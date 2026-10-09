import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryFixture } from './delivery-fixtures.mjs';
import {
  membershipState,
  verifyMembershipCertification,
  verifyMembershipAnchor,
} from '../../account-protocol/membership.ts';
import {
  verifyCertificationHistory,
  extendMembershipHistory,
  historyPublisher,
  historyReader,
  historyDevices,
  historyAuthority,
  historyEnvelopeRoute,
  verifyHistoryDecision,
  createAdmissionPrefixVerifier,
} from '../../account-protocol/admissionHistory.ts';
import { wire, expected, accepted, link, ZERO } from '../account-successor/history-oracle.mjs';
async function ready() {
  const f = await deliveryFixture('new');
  const anchor = await verifyCertificationHistory(
    f.f.certification,
    f.f.f.successor,
    f.f.f.base,
    f.f.anchor,
  );
  const parent = await verifyMembershipAnchor(
    f.f.f.base,
    f.f.f.successor,
    f.f.certification,
    f.f.anchor,
  );
  const admission = f.f.admit(membershipState(parent));
  const admitted = await extendMembershipHistory(admission, anchor);
  const certified = await extendMembershipHistory(f.certification, admitted);
  return { f, anchor, admitted, certified };
}
const route = (h, epoch = h.current.tip) => ({
  v: 2,
  workspace_id: h.current.workspace,
  credential_id: h.credential,
  epoch,
  gen: 1,
});

test('continuation history records reader eligibility and each publisher starting epoch without retroactive rights', async () => {
  const { f, anchor, admitted, certified } = await ready();
  const first = f.f.context.existing,
    second = f.f.context.candidate,
    third = f.c.candidate;
  assert.equal(
    historyReader(
      certified,
      second.id,
      second.sPub,
      historyAuthority(certified, certified.authorities[1]),
    ),
    false,
  );
  assert.equal(historyReader(certified, second.id, second.sPub, anchor.current), true);
  assert.equal(historyReader(certified, third.id, third.sPub, admitted.current), false);
  assert.equal(historyReader(certified, third.id, third.sPub), true);
  assert.equal(historyReader(certified, third.id, first.sPub), false);
  assert.equal(historyDevices(admitted).filter((m) => m.state === 'pending').length, 1);
  assert.throws(() => historyPublisher(admitted, third.id), /Uncertified/);
  assert.equal(historyDevices(certified).filter((m) => m.state === 'certified').length, 3);
  for (const [m, epochs] of [
    [first, [1, 2, 3, 4, 5]],
    [second, [3, 4, 5]],
    [third, [5]],
  ]) {
    const h = historyPublisher(certified, m.id);
    assert.deepEqual(
      h.authorities.map((a) => a.tip),
      epochs,
    );
    assert.equal(h.first.tip, epochs[0]);
    assert.deepEqual(historyDevices(h), historyDevices(certified));
    if (epochs[0] > 1) assert.throws(() => historyEnvelopeRoute(h, route(h), epochs[0] - 1));
  }
  const projected = await extendMembershipHistory(
    f.certification,
    historyPublisher(admitted, second.id),
  );
  assert.equal(projected.credential, second.id);
  assert.deepEqual(
    projected.authorities.map((a) => a.tip),
    [3, 4, 5],
  );
  await assert.rejects(extendMembershipHistory(f.certification, certified), /continuity/);
  await assert.rejects(extendMembershipHistory(f.certification, { ...admitted }), /Unverified/);
  const mutated = structuredClone(f.certification),
    pending = extendMembershipHistory(mutated, admitted);
  mutated.epoch.delivery.certificate.members[0].sPub = 'ef'.repeat(32);
  assert.deepEqual(historyDevices(await pending), historyDevices(certified));
});

test('later publisher prefixes use actual issuance epochs and keep all prior accepted boundaries', async () => {
  const { f, certified } = await ready();
  const state = membershipState(await verifyMembershipCertification(f.certification, f.parent));
  const participants = [
    { id: f.f.context.existing.id, key: f.f.keys.existing, epoch: 1 },
    { id: f.f.context.candidate.id, key: f.f.keys.new, epoch: 3 },
    { id: f.c.candidate.id, key: f.keys.new, epoch: 5 },
  ];
  const payloads = participants.map((m) => {
    const source = { ...f.f.f, keys: { ...f.f.f.keys, device: m.key } };
    return {
      m,
      source,
      w: wire(source, 1, m.epoch, 'queued before later admission', { credential: m.id }),
    };
  });
  const epoch = structuredClone(f.f.admit(state, 'aa'.repeat(16)).epoch);
  for (const { m, w } of payloads) {
    const h = epoch.heads.find((h) => h.credentialId === m.id);
    h.position = 1;
    h.link = link(w.subject, ZERO);
  }
  const later = await extendMembershipHistory(f.f.seal(epoch), certified);
  for (const { m, source, w } of payloads) {
    const h = historyPublisher(later, m.id),
      prefix = createAdmissionPrefixVerifier(h);
    await prefix.append(w.bytes);
    assert.deepEqual(prefix.finish(), h.boundary);
    assert.equal(
      (await verifyHistoryDecision(accepted(source, w, 5), expected(w), h.current, h)).kind,
      'accepted',
    );
    assert.equal(
      (await verifyHistoryDecision(accepted(source, w, 6), expected(w), h.current, h)).kind,
      'unknown',
    );
    const post = wire(source, 2, m.epoch, 'still queued', { credential: m.id }),
      previous = link(w.subject, ZERO);
    assert.equal(
      (
        await verifyHistoryDecision(
          accepted(source, post, 6, previous),
          expected(post, previous),
          h.current,
          h,
        )
      ).kind,
      'accepted',
    );
    assert.equal(
      (
        await verifyHistoryDecision(
          accepted(source, post, 5, previous),
          expected(post, previous),
          h.current,
          h,
        )
      ).kind,
      'unknown',
    );
    if (m.epoch > 1) {
      const premature = wire(source, 1, m.epoch - 1, 'before this publisher was certified', {
        credential: m.id,
      });
      assert.equal(
        (
          await verifyHistoryDecision(
            accepted(source, premature, 5),
            expected(premature),
            h.current,
            h,
          )
        ).kind,
        'unknown',
      );
    }
    const future = wire(source, 1, 6, 'after the old boundary', { credential: m.id });
    await assert.rejects(
      createAdmissionPrefixVerifier(h).append(future.bytes),
      /authority boundary/,
    );
  }
  assert.equal(historyDevices(later).filter((m) => m.state === 'pending').length, 1);
});
