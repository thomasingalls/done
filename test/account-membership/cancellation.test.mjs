import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, signed, message, hash } from './fixtures.mjs';
import { key } from '../account-first-authority/oracle.mjs';
import {
  membershipState,
  verifyMembershipAnchor,
  verifyMembershipAdmission,
  parseMembershipCancellationRequest,
  membershipCancellationRequestMessage,
  membershipCancellationMessage,
  verifyMembershipCancellationRequest,
  verifyMembershipCancellation,
} from '../../account-protocol/membership.ts';
import {
  verifyMembershipChain,
  parseMembershipChain,
} from '../../account-protocol/membershipLocator.ts';
import {
  historyMembership,
  historyPublisher,
  historyReader,
  historyDevices,
  historyAuthority,
  extendMembershipHistory,
} from '../../account-protocol/admissionHistory.ts';

async function ready() {
  const f = fixture();
  const anchor = await verifyMembershipAnchor(f.f.base, f.f.successor, f.certification, f.anchor);
  const admission = f.admit(membershipState(anchor));
  const parent = await verifyMembershipAdmission(admission, anchor),
    p = membershipState(parent);
  const candidate = admission.epoch.preparation.context.candidate.credentialId;
  const actors = [
    { id: f.context.existing.id, key: f.keys.existing },
    { id: f.context.candidate.id, key: f.keys.new },
    { id: candidate, key: key('27'.repeat(32)) },
  ];
  const request = (actor = actors[0], changes = {}) => {
    const body = {
      v: 2,
      kind: 'membership-cancellation-request',
      workspaceId: p.workspaceId,
      lineageId: p.lineageId,
      parent: p.head,
      epoch: p.epoch,
      preparationId: admission.epoch.preparation.context.attemptId,
      candidateId: candidate,
      actorId: actor.id,
      nonce: 'c1'.repeat(32),
      ...changes,
    };
    return {
      ...body,
      signature: signed(actor.key, message('done/membership-cancellation-request/v2', body)),
    };
  };
  const seal = (epoch) => {
    const bytes = message('done/device-membership-cancellation/v2', epoch);
    return {
      v: 2,
      kind: 'membership-cancellation',
      epoch,
      head: hash(bytes),
      signature: signed(f.f.keys.authority, bytes),
    };
  };
  const cancellation = (r = request()) =>
    seal({
      v: 2,
      kind: 'membership-cancellation-epoch',
      workspaceId: p.workspaceId,
      lineageId: p.lineageId,
      epoch: p.epoch + 1,
      parent: p.head,
      generation: p.generation,
      acceptancePublicKey: p.acceptancePublicKey,
      certifiedSetDigest: p.certifiedSetDigest,
      cancellation: r,
      roster: p.roster.filter((m) => m.id !== candidate),
      heads: p.heads.filter((s) => s.credentialId !== candidate),
    });
  const proofs = {
    successor: f.f.successor,
    certification: f.certification,
    continuations: [admission],
  };
  return { f, parent, p, candidate, actors, request, seal, cancellation, proofs };
}

test('pending withdrawal requires the exact signed actor/attempt and preserves all content recipients', async () => {
  const f = await ready();
  for (const actor of f.actors) {
    const request = f.request(actor),
      proof = f.cancellation(request);
    const { signature: _, ...body } = request;
    assert.deepEqual(
      Buffer.from(await membershipCancellationRequestMessage(request)),
      message('done/membership-cancellation-request/v2', body),
    );
    assert.deepEqual(
      Buffer.from(await membershipCancellationMessage(proof.epoch)),
      message('done/device-membership-cancellation/v2', proof.epoch),
    );
    assert.deepEqual(await verifyMembershipCancellationRequest(request, f.parent), request);
    const state = membershipState(await verifyMembershipCancellation(proof, f.parent));
    assert.equal(state.epoch, 5);
    assert.equal(state.generation, f.p.generation);
    assert.deepEqual(state.certificate, f.p.certificate);
    assert.equal(state.certifiedSetDigest, f.p.certifiedSetDigest);
    assert.equal(state.roster.length, 2);
    assert.deepEqual(state.preparations, []);
    assert(Object.isFrozen(state.roster));
    await assert.rejects(verifyMembershipCancellation(proof, { ...f.parent }), /Unverified/);
  }
});

test('service signature cannot cancel a certified member, substitute the requester or change coverage', async () => {
  const f = await ready(),
    proof = f.cancellation();
  for (const changes of [
    { parent: 'ef'.repeat(32) },
    { epoch: 5 },
    { workspaceId: 'ee'.repeat(16) },
    { lineageId: 'ef'.repeat(32) },
    { preparationId: Buffer.alloc(32, 42).toString('base64url') },
    { candidateId: f.actors[0].id },
    { actorId: f.actors[1].id },
    { actorId: 'ef'.repeat(16) },
  ])
    await assert.rejects(
      verifyMembershipCancellation(f.cancellation(f.request(f.actors[0], changes)), f.parent),
    );
  const mutations = [
    (e) => e.generation++,
    (e) => e.epoch++,
    (e) => {
      e.parent = 'ef'.repeat(32);
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
      e.roster.push(f.p.roster.find((m) => m.id === f.candidate));
      e.roster.sort((a, b) => a.id.localeCompare(b.id));
    },
    (e) => e.heads.pop(),
    (e) => {
      e.heads[0].link = 'ef'.repeat(32);
    },
    (e) => {
      e.cancellation.signature = 'ef'.repeat(64);
    },
  ];
  for (const change of mutations) {
    const e = structuredClone(proof.epoch);
    change(e);
    await assert.rejects(verifyMembershipCancellation(f.seal(e), f.parent));
  }
  const withOtherPending = await verifyMembershipAdmission(
    f.f.admit(f.p, 'aa'.repeat(16)),
    f.parent,
  );
  const other = membershipState(withOtherPending);
  const stranger = f.request(f.actors[2], {
    actorId: 'aa'.repeat(16),
    epoch: other.epoch,
    parent: other.head,
  });
  await assert.rejects(
    verifyMembershipCancellationRequest(stranger, withOtherPending),
    /authority/,
  );
  assert.throws(() => parseMembershipCancellationRequest({ ...f.request(), v: 1 }));
  assert.throws(() =>
    parseMembershipCancellationRequest({ ...f.request(), padding: 'x'.repeat(4096) }),
  );
  const mutable = structuredClone(proof),
    inFlight = verifyMembershipCancellation(mutable, f.parent);
  mutable.epoch.roster[0].sPub = 'ef'.repeat(32);
  assert.deepEqual(membershipState(await inFlight).roster, proof.epoch.roster);
});

test('cancellation extends both publisher histories without granting candidate rights and permits a fresh subsequent admission', async () => {
  const f = await ready(),
    proof = f.cancellation(),
    input = { ...f.proofs, continuations: [...f.proofs.continuations, proof] };
  const { history } = await verifyMembershipChain(input, f.f.f.base);
  assert.equal(history.current.tip, 5);
  assert.equal(historyDevices(history).length, 2);
  const signing = f.p.roster.find((m) => m.id === f.candidate).sPub;
  assert.equal(historyReader(history, f.candidate, signing), false);
  assert.throws(() => historyPublisher(history, f.candidate), /Uncertified/);
  const before = (await verifyMembershipChain(f.proofs, f.f.f.base)).history;
  for (const [actor, epochs] of [
    [f.actors[0], [1, 2, 3, 4, 5]],
    [f.actors[1], [3, 4, 5]],
  ]) {
    const h = historyPublisher(history, actor.id);
    assert.deepEqual(
      h.authorities.map((a) => a.tip),
      epochs,
    );
    assert.equal(historyAuthority(h, before.current).head, before.current.head);
    assert.equal(
      (await extendMembershipHistory(proof, historyPublisher(before, actor.id))).credential,
      actor.id,
    );
  }
  const later = f.f.admit(membershipState(historyMembership(history)), 'aa'.repeat(16));
  const next = (
    await verifyMembershipChain(
      { ...input, continuations: [...input.continuations, later] },
      f.f.f.base,
    )
  ).history;
  assert.equal(next.current.tip, 6);
  assert.equal(historyDevices(next).find((m) => m.id === 'aa'.repeat(16)).state, 'pending');
  assert.equal(
    historyDevices(next).some((m) => m.id === f.candidate),
    false,
  );
  await assert.rejects(
    verifyMembershipChain({ ...input, continuations: [...input.continuations, proof] }, f.f.f.base),
    /continuity/,
  );
  const malformed = structuredClone(input);
  malformed.continuations[1].kind = 'membership-removal';
  assert.throws(() => parseMembershipChain(malformed));
});
