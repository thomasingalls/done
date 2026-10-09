import test from 'node:test';
import assert from 'node:assert/strict';
import { membershipRotationFixture as ready } from './rotation-fixtures.mjs';
import { message } from './fixtures.mjs';
import {
  membershipState,
  verifyMembershipRotation,
  membershipRotationMessage,
} from '../../account-protocol/membership.ts';
import { verifyMembershipChain } from '../../account-protocol/membershipLocator.ts';
import {
  historyMembership,
  historyDevices,
  historyReader,
  historyPublisher,
  historyGeneration,
  historyEnvelopeRoute,
  createAdmissionPrefixVerifier,
  verifyHistoryDecision,
} from '../../account-protocol/admissionHistory.ts';
import { wire, link, ZERO, expected, accepted } from '../account-successor/history-oracle.mjs';

test('committed successor verifies client distribution, outcome, recovery and final head as one authority transition', async () => {
  for (const pending of [false, true]) {
    const x = await ready(pending),
      proof = x.rotate();
    assert.deepEqual(
      Buffer.from(await membershipRotationMessage(proof.epoch)),
      message('done/device-membership-rotation/v2', proof.epoch),
    );
    const membership = await verifyMembershipRotation(proof, x.parent),
      state = membershipState(membership);
    assert.equal(state.generation, 2);
    assert.equal(state.epoch, x.p.epoch + 1);
    assert.deepEqual(
      state.roster,
      x.p.roster.filter((m) => m.id !== x.target),
    );
    assert.deepEqual(
      state.certificate.members,
      x.p.certificate.members.filter((m) => m.id !== x.target),
    );
    assert.deepEqual(state.finalized, [proof.epoch.finalization]);
    assert.equal(state.preparations.length, 0);
    assert(Object.isFrozen(state.finalized[0]));
    const { history } = await verifyMembershipChain(
      { ...x.proofs, continuations: [...x.proofs.continuations, proof] },
      x.f.f.base,
    );
    assert.equal(historyGeneration(history), 2);
    assert.equal(
      historyReader(history, x.target, x.p.roster.find((m) => m.id === x.target).sPub),
      false,
    );
    if (pending) assert.throws(() => historyPublisher(history, x.target), /Uncertified/);
    assert.equal(historyDevices(history).length, pending ? 2 : 1);
    const mutable = structuredClone(proof),
      verifying = verifyMembershipRotation(mutable, x.parent);
    mutable.epoch.rotation.payload.wraps[0].ct = 'ef'.repeat(48);
    assert.deepEqual(membershipState(await verifying), state);
  }
});

test('authorization signature cannot replace the signed distribution, move the excluded cutoff, or omit finalization', async () => {
  const x = await ready(),
    proof = x.rotate();
  for (const mutate of [
    (e) => {
      e.generation++;
    },
    (e) => {
      e.epoch++;
    },
    (e) => {
      e.parent = 'ef'.repeat(32);
    },
    (e) => {
      e.acceptancePublicKey = 'ef'.repeat(32);
    },
    (e) => {
      e.rotation.payload.wraps[0].ct = 'ef'.repeat(48);
    },
    (e) => {
      e.outcome.committedId = 'ef'.repeat(32);
    },
    (e) => {
      e.finalization = null;
    },
    (e) => {
      e.finalization.final = false;
    },
    (e) => {
      e.finalization.signature = 'ef'.repeat(64);
    },
    (e) => {
      e.heads.pop();
    },
    (e) => {
      const h = e.heads.find((h) => h.credentialId === x.target);
      h.position++;
      h.link = 'ef'.repeat(32);
    },
    (e) => {
      e.recovery.rPub = 'ef'.repeat(32);
    },
  ]) {
    const e = structuredClone(proof.epoch);
    mutate(e);
    await assert.rejects(verifyMembershipRotation(x.seal(e), x.parent));
  }
  const advanced = structuredClone(proof.epoch);
  const survivor = advanced.heads.find((h) => h.credentialId !== x.target);
  survivor.position = 2;
  survivor.link = 'db'.repeat(32);
  assert.equal(
    membershipState(await verifyMembershipRotation(x.seal(advanced), x.parent)).heads[0].position,
    2,
  );
});

test('removed publisher accepted history survives, but later writes and current read rights do not', async () => {
  const x = await ready(),
    signing = x.f.keys.new;
  const source = { ...x.f.f, keys: { ...x.f.f.keys, device: signing } };
  const w = wire(source, 1, 3, 'accepted before removal', { credential: x.target });
  const cutoff = x.preparation.cutoff.map((h) =>
    h.credentialId === x.target ? { ...h, position: 1, link: link(w.subject, ZERO) } : h,
  );
  const request = x.request({ preparation: x.prep({ cutoff }), payload: { ...x.payload, cutoff } });
  const proof = x.rotate(request),
    proofs = { ...x.proofs, continuations: [proof] };
  const { history } = await verifyMembershipChain(proofs, x.f.f.base);
  const removed = historyPublisher(history, x.target),
    before = removed.authorities[0];
  assert.equal(historyReader(removed, x.target, removed.signingKey, before), true);
  assert.equal(historyReader(removed, x.target, removed.signingKey), false);
  assert.equal(removed.finalization.epoch, 4);
  const replay = createAdmissionPrefixVerifier(removed);
  await replay.append(w.bytes);
  assert.deepEqual(replay.finish(), { position: 1, link: link(w.subject, ZERO) });
  assert.equal(
    (await verifyHistoryDecision(accepted(source, w, 3), expected(w), removed.current, removed))
      .kind,
    'accepted',
  );
  const withheld = wire(source, 2, 3, 'withheld until after removal', { credential: x.target });
  assert.equal(
    (
      await verifyHistoryDecision(
        accepted(source, withheld, 4, removed.boundary.link),
        expected(withheld, removed.boundary.link),
        removed.current,
        removed,
      )
    ).kind,
    'unknown',
  );
  const route = {
    v: 2,
    workspace_id: removed.current.workspace,
    credential_id: x.target,
    epoch: 4,
    gen: 2,
  };
  assert.equal(historyEnvelopeRoute(removed, route, 3).gen, 1);
  assert.throws(() => historyEnvelopeRoute(removed, route, 4), /outside/);
  assert.throws(() => historyEnvelopeRoute(removed, { ...route, gen: 1 }, 3), /outside/);
  // Later admission preserves a retired stream for replay and never restores its reader authority.
  const next = x.f.admit(membershipState(historyMembership(history)), 'aa'.repeat(16));
  const later = (
    await verifyMembershipChain({ ...proofs, continuations: [proof, next] }, x.f.f.base)
  ).history;
  assert.equal(historyGeneration(later), 2);
  assert.equal(historyReader(later, x.target, removed.signingKey), false);
  assert.deepEqual(historyPublisher(later, x.target).finalization, removed.finalization);
  const retiredAgain = x.f.admit(membershipState(historyMembership(history)), x.target);
  await assert.rejects(
    verifyMembershipChain({ ...proofs, continuations: [proof, retiredAgain] }, x.f.f.base),
    /continuity/,
  );
});

test('a joined owner can remove the original publisher without inheriting its finalization', async () => {
  const x = await ready(false, true),
    proof = x.rotate();
  const { history } = await verifyMembershipChain(
    { ...x.proofs, continuations: [proof] },
    x.f.f.base,
  );
  const removed = historyPublisher(history, x.target);
  const remaining = historyPublisher(history, x.f.context.candidate.id);
  assert(removed.finalization);
  assert.equal(remaining.finalization, undefined);
  assert.equal(historyReader(remaining, remaining.credential, remaining.signingKey), true);
  assert.equal(historyReader(removed, removed.credential, removed.signingKey), false);
  assert.equal(
    historyEnvelopeRoute(
      remaining,
      {
        v: 2,
        workspace_id: remaining.current.workspace,
        credential_id: remaining.credential,
        epoch: 4,
        gen: 2,
      },
      4,
    ).gen,
    2,
  );
  const later = x.f.admit(membershipState(historyMembership(history)), 'ab'.repeat(16));
  const next = (
    await verifyMembershipChain({ ...x.proofs, continuations: [proof, later] }, x.f.f.base)
  ).history;
  assert.equal(historyPublisher(next, remaining.credential).finalization, undefined);
  assert.deepEqual(historyPublisher(next, x.target).finalization, removed.finalization);
});
