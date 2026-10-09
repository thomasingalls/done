import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, transitionFixture } from './transition-fixtures.mjs';
import {
  verifyEarlyHistory,
  historyMembership,
  extendMembershipHistory,
  historyPublisher,
  historyReader,
  historyMinimumGeneration,
} from '../../account-protocol/admissionHistory.ts';
import {
  verifyMembershipChain,
  parseMembershipChain,
} from '../../account-protocol/membershipLocator.ts';
import { membershipState, verifyRecoverySuccessor } from '../../account-protocol/membership.ts';
import { verifyRecoveryIntent } from '../../account-protocol/recoveryTransition.ts';
import { membershipRotationFixture } from '../account-membership/rotation-fixtures.mjs';

for (const epoch of [1, 2, 3])
  test(`recovery at epoch ${epoch} excludes every old device and can admit another device`, async () => {
    const f = fixture();
    const prior =
      epoch === 3
        ? (
            await verifyMembershipChain(
              { successor: f.f.successor, certification: f.certification, continuations: [] },
              f.f.base,
            )
          ).history
        : await verifyEarlyHistory(f.f.base, epoch === 2 ? f.f.successor : null);
    const x = transitionFixture(historyMembership(prior), f);
    const proofs = {
      successor: epoch >= 2 ? f.f.successor : null,
      certification: epoch >= 3 ? f.certification : null,
      continuations: [x.proof],
    };
    const { history } = await verifyMembershipChain(proofs, f.f.base),
      p = membershipState(historyMembership(history));
    assert.equal(p.epoch, epoch + 1);
    assert.equal(p.generation, 2);
    assert.deepEqual(
      p.certificate.members.map((m) => m.id),
      [x.intent.bootstrap.newCredentialId],
    );
    assert.equal(historyReader(history, prior.credential, prior.signingKey), false);
    assert.equal(historyPublisher(history, prior.credential).finalization.epoch, epoch + 1);
    const recovered = historyPublisher(history, x.intent.bootstrap.newCredentialId);
    assert.equal(recovered.first.tip, epoch + 1);
    assert.equal(historyMinimumGeneration(recovered), 2);
    const admitted = await extendMembershipHistory(f.admit(p), history);
    assert.equal(membershipState(historyMembership(admitted)).roster.length, 2);
  });

test('recovery after rotation retains historical final cuts and establishes another key floor', async () => {
  const r = await membershipRotationFixture(),
    proofs = { ...r.proofs, continuations: [r.rotate()] };
  const { history: before } = await verifyMembershipChain(proofs, r.f.f.base);
  const x = transitionFixture(historyMembership(before), r.f);
  const history = await extendMembershipHistory(x.proof, before),
    p = membershipState(historyMembership(history));
  assert.equal(p.generation, 3);
  assert.equal(p.finalized.length, 2);
  assert.deepEqual(
    historyPublisher(history, r.target).finalization,
    historyPublisher(before, r.target).finalization,
  );
  const again = transitionFixture(historyMembership(history), r.f, '89'.repeat(16));
  const twice = await extendMembershipHistory(again.proof, history);
  assert.equal(membershipState(historyMembership(twice)).generation, 4);
  assert.equal(membershipState(historyMembership(twice)).finalized.length, 3);
});

test('valid service signatures cannot substitute the recovery signer or omit a finalized writer', async () => {
  const f = fixture(),
    prior = await verifyEarlyHistory(f.f.base),
    parent = historyMembership(prior),
    x = transitionFixture(parent, f);
  for (const mutate of [
    (e) => {
      e.intent.bootstrap.signature = '00'.repeat(64);
      e.intent = x.signIntent(e.intent);
    },
    (e) => {
      e.intent.checkpointDigest = 'ff'.repeat(32);
    },
    (e) => {
      e.intent.generation++;
      e.intent = x.signIntent(e.intent);
    },
    (e) => {
      e.parent = 'ff'.repeat(32);
    },
    (e) => {
      e.finalizations[0].signature = '00'.repeat(64);
    },
    (e) => {
      e.heads[0].position = 1;
      e.heads[0].link = 'ab'.repeat(32);
    },
    (e) => {
      e.recovery.bootstrapSigner = f.f.pin.authRoot;
    },
  ]) {
    const e = structuredClone(x.proof.epoch);
    mutate(e);
    await assert.rejects(verifyRecoverySuccessor(x.seal(e), parent));
  }
  await assert.rejects(
    verifyRecoverySuccessor(x.proof, { state: structuredClone(x.p) }),
    /Unverified/,
  );
  assert.throws(
    () => parseMembershipChain({ successor: null, certification: null, continuations: [] }),
    /anchor/,
  );
});

test('intent verification captures caller data before crypto and preserves exact retry identity', async () => {
  const f = fixture(),
    parent = historyMembership(await verifyEarlyHistory(f.f.base)),
    x = transitionFixture(parent, f);
  const input = structuredClone(x.intent),
    draft = structuredClone(f.f.base.request.recovery);
  const checking = verifyRecoveryIntent(input, parent, draft);
  input.head.head = 'ff'.repeat(32);
  input.checkpointDigest = 'ff'.repeat(32);
  draft.bootstrapSigner = 'ff'.repeat(32);
  assert.deepEqual(await checking, x.intent);
  assert.deepEqual(
    await verifyRecoverySuccessor(x.proof, parent),
    await verifyRecoverySuccessor(x.proof, parent),
  );
});
