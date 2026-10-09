import { fixture, message, signed, hash } from './fixtures.mjs';
import { lp } from '../account-ceremony/oracle.mjs';
import {
  verifyMembershipAnchor,
  verifyMembershipAdmission,
  membershipState,
} from '../../account-protocol/membership.ts';
// Independent LP/signature oracle, including the selected row-15 grammar and exact HPKE bytes.
export async function rotationFixture(pending = false, removeOriginal = false, options = {}) {
  const f = fixture(options);
  let parent = await verifyMembershipAnchor(f.f.base, f.f.successor, f.certification, f.anchor);
  const actor = removeOriginal ? f.context.candidate : f.context.existing;
  const actorKey = removeOriginal ? f.keys.new : f.keys.existing;
  let target = removeOriginal ? f.context.existing.id : f.context.candidate.id;
  if (pending) {
    const a = f.admit(membershipState(parent));
    parent = await verifyMembershipAdmission(a, parent);
    target = a.epoch.preparation.context.candidate.credentialId;
  }
  const p = membershipState(parent),
    recovery = f.f.base.request.recovery;
  const sign = (label, body, signer = f.f.keys.authority) => ({
    ...body,
    signature: signed(signer, message(label, body)),
  });
  const preparationRequest = sign(
    'done/removal-preparation-request/v1',
    {
      v: 1,
      kind: 'removal-preparation-request',
      workspaceId: p.workspaceId,
      lineageId: p.lineageId,
      parent: p.head,
      epoch: p.epoch,
      actorId: actor.id,
      targetId: target,
      nonce: 'ef'.repeat(32),
    },
    actorKey,
  );
  const prep = (changes = {}) =>
    sign('done/removal-preparation/v1', {
      v: 1,
      kind: 'removal-preparation',
      request: preparationRequest,
      cutoff: structuredClone(p.heads),
      ...changes,
    });
  const preparation = prep();
  const payload = {
    cutoff: preparation.cutoff,
    excluded: [target],
    recoveryWrap: { enc: 'b1'.repeat(32), ct: 'b2'.repeat(48) },
    wraps: p.certificate.members
      .filter((m) => m.id !== target)
      .map((m, i) => ({
        credentialId: m.id,
        enc: (31 + i).toString(16).repeat(32),
        ct: (51 + i).toString(16).repeat(48),
      })),
  };
  const payloadBytes = (p) =>
    lp(
      'done/transition-payload/v1',
      'cutoff',
      p.cutoff.map((h) => `${h.credentialId}:${h.position}:${h.link}`).join('|'),
      'excluded',
      p.excluded.join('|'),
      'recovery-wrap',
      p.recoveryWrap.enc + p.recoveryWrap.ct,
      'wraps',
      p.wraps.map((w) => `${w.credentialId}:${w.enc}${w.ct}`).join('|'),
    );
  const intentBytes = (r) =>
    lp(
      'done/transition/v1',
      '1',
      'rotate',
      r.preparation.request.workspaceId,
      r.preparation.request.lineageId,
      String(r.preparation.request.epoch),
      String(r.target),
      hash(payloadBytes(r.payload)),
    );
  const request = (changes = {}, signer = actorKey) => {
    const r = {
      v: 1,
      kind: 'rotation-request',
      preparation,
      actorId: actor.id,
      target: p.generation + 1,
      payload,
      ...changes,
    };
    return { ...r, signature: signed(signer, intentBytes(r)) };
  };
  const outcomeBytes = (o) =>
    lp(
      'done/transition-out/v1',
      '1',
      o.kind,
      o.workspaceId,
      o.lineageId,
      String(o.target),
      String(o.epoch),
      o.committedId,
    );
  const outcome = (r = request(), changes = {}, signer = f.f.keys.authority) => {
    const o = {
      v: 1,
      kind: 'rotate',
      workspaceId: p.workspaceId,
      lineageId: p.lineageId,
      target: r.target,
      epoch: p.epoch + 1,
      committedId: hash(intentBytes(r)),
      ...changes,
    };
    return { ...o, signature: signed(signer, outcomeBytes(o)) };
  };
  const final = (r = request(), changes = {}, signer = f.f.keys.acceptance) => {
    const cut = r.payload.cutoff.find((h) => h.credentialId === target);
    const h = {
      workspace: p.workspaceId,
      credential: target,
      position: cut.position,
      link: cut.link,
      epoch: p.epoch + 1,
      final: true,
      ...changes,
    };
    return {
      ...h,
      signature: signed(
        signer,
        lp(
          'done/accept-head/v1',
          h.workspace,
          h.credential,
          String(h.position),
          h.link,
          String(h.epoch),
          String(h.final),
        ),
      ),
    };
  };
  return {
    f,
    p,
    parent,
    target,
    recovery,
    preparationRequest,
    preparation,
    payload,
    prep,
    request,
    payloadBytes,
    intentBytes,
    outcomeBytes,
    outcome,
    final,
    sign,
  };
}

export async function membershipRotationFixture(
  pending = false,
  removeOriginal = false,
  options = {},
) {
  const x = await rotationFixture(pending, removeOriginal, options),
    f = x.f;
  const proofs = {
    successor: f.f.successor,
    certification: f.certification,
    continuations: pending
      ? [
          f.admit(
            membershipState(
              await verifyMembershipAnchor(f.f.base, f.f.successor, f.certification, f.anchor),
            ),
          ),
        ]
      : [],
  };
  const seal = (epoch) => ({
    v: 2,
    kind: 'membership-rotation',
    epoch,
    head: hash(message('done/device-membership-rotation/v2', epoch)),
    signature: signed(f.f.keys.authority, message('done/device-membership-rotation/v2', epoch)),
  });
  const rotate = (request = x.request(), heads = request.payload.cutoff) =>
    seal({
      v: 2,
      kind: 'membership-rotation-epoch',
      workspaceId: x.p.workspaceId,
      lineageId: x.p.lineageId,
      epoch: x.p.epoch + 1,
      parent: x.p.head,
      generation: x.p.generation + 1,
      acceptancePublicKey: x.p.acceptancePublicKey,
      rotation: request,
      outcome: x.outcome(request),
      recovery: x.recovery,
      heads: structuredClone(heads),
      finalization: x.final(request),
    });
  return { ...x, proofs, seal, rotate };
}
