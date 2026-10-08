import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, message, signed, hash } from './fixtures.mjs';
import { lp } from '../account-ceremony/oracle.mjs';
import { key } from '../account-first-authority/oracle.mjs';
import {
  verifyMembershipAnchor,
  verifyMembershipAdmission,
  membershipState,
} from '../../account-protocol/membership.ts';
import {
  removalPreparationRequestMessage,
  removalPreparationMessage,
  verifyRemovalPreparation,
  verifyRemovalPreparationRequest,
  rotationPayloadMessage,
  rotationIntentMessage,
  verifyRotationRequest,
  resolveRotationOutcome,
  rotationOutcomeMessage,
  verifyRemovalFinalization,
  removalFinalizationMessage,
  parseRotationRequest,
} from '../../account-protocol/rotation.ts';

// Independent LP/signature oracle, including the selected row-15 grammar and exact HPKE bytes.
async function ready(pending = false) {
  const f = fixture();
  let parent = await verifyMembershipAnchor(f.f.base, f.f.successor, f.certification, f.anchor);
  let target = f.context.candidate.id;
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
      actorId: f.context.existing.id,
      targetId: target,
      nonce: 'ef'.repeat(32),
    },
    f.keys.existing,
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
  const request = (changes = {}, signer = f.keys.existing) => {
    const r = {
      v: 1,
      kind: 'rotation-request',
      preparation,
      actorId: f.context.existing.id,
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

test('other-device removal binds the exact parent, recipients, recovery wrap and selected transition grammar', async () => {
  for (const pending of [false, true]) {
    const f = await ready(pending),
      r = f.request();
    const strip = ({ signature: _, ...body }) => body;
    assert.deepEqual(
      Buffer.from(await removalPreparationRequestMessage(f.preparationRequest)),
      message('done/removal-preparation-request/v1', strip(f.preparationRequest)),
    );
    assert.deepEqual(
      Buffer.from(await removalPreparationMessage(f.preparation)),
      message('done/removal-preparation/v1', strip(f.preparation)),
    );
    assert.deepEqual(Buffer.from(rotationPayloadMessage(r.payload)), f.payloadBytes(r.payload));
    assert.deepEqual(Buffer.from(await rotationIntentMessage(r)), f.intentBytes(r));
    const verified = await verifyRotationRequest(r, f.parent, f.recovery);
    assert.equal(verified.id, hash(f.intentBytes(r)));
    assert(Object.isFrozen(verified.request.payload.wraps));
    assert.equal(
      verified.request.payload.wraps.some((w) => w.credentialId === f.target),
      false,
    );
    const o = f.outcome(r);
    assert.deepEqual(Buffer.from(rotationOutcomeMessage(o)), f.outcomeBytes(o));
    assert.equal((await resolveRotationOutcome(o, verified)).kind, 'committed');
    const h = f.final(r);
    assert.deepEqual(
      Buffer.from(removalFinalizationMessage(h)),
      lp(
        'done/accept-head/v1',
        h.workspace,
        h.credential,
        String(h.position),
        h.link,
        String(h.epoch),
        'true',
      ),
    );
    assert.deepEqual(await verifyRemovalFinalization(h, verified, o), h);
    await assert.rejects(resolveRotationOutcome(o, { ...verified }), /Unverified/);
    await assert.rejects(verifyRotationRequest(r, { ...f.parent }, f.recovery), /Unverified/);
  }
});

test('even service-signed preparation cannot authorize self-removal, an unknown target or an unapproved actor', async () => {
  const f = await ready(true);
  for (const changes of [
    { targetId: f.preparationRequest.actorId },
    { targetId: 'ff'.repeat(16) },
    { actorId: f.target },
    { actorId: f.f.context.candidate.id },
    { epoch: f.p.epoch + 1 },
    { parent: 'ff'.repeat(32) },
    { workspaceId: 'ff'.repeat(16) },
    { lineageId: 'ff'.repeat(32) },
  ]) {
    const { signature: _, ...body } = f.preparationRequest;
    const r = f.sign(
      'done/removal-preparation-request/v1',
      { ...body, ...changes },
      f.f.keys.existing,
    );
    await assert.rejects(verifyRemovalPreparationRequest(r, f.parent));
    await assert.rejects(
      verifyRotationRequest(
        f.request({ preparation: f.prep({ request: r }) }),
        f.parent,
        f.recovery,
      ),
    );
  }
  for (const cutoff of [
    f.p.heads.slice(1),
    [...f.p.heads].reverse(),
    f.p.heads.map((h) =>
      h.credentialId === f.target ? { ...h, position: 1, link: 'ff'.repeat(32) } : h,
    ),
  ])
    await assert.rejects(verifyRemovalPreparation(f.prep({ cutoff }), f.parent));
});

test('no recipient injection, omitted wrap, recovery substitution, generation skip or ciphertext substitution', async () => {
  const f = await ready(true);
  const mutated = [
    (p) => {
      p.wraps.pop();
    },
    (p) => {
      p.wraps[0].credentialId = f.target;
      p.wraps.sort((a, b) => a.credentialId.localeCompare(b.credentialId));
    },
    (p) => {
      p.excluded = [f.f.context.candidate.id];
    },
    (p) => {
      p.cutoff[0].position = 1;
      p.cutoff[0].link = 'fa'.repeat(32);
    },
  ];
  for (const mutate of mutated) {
    const payload = structuredClone(f.payload);
    mutate(payload);
    await assert.rejects(verifyRotationRequest(f.request({ payload }), f.parent, f.recovery));
  }
  await assert.rejects(verifyRotationRequest(f.request({ target: 3 }), f.parent, f.recovery));
  await assert.rejects(
    verifyRotationRequest(
      f.request({ actorId: f.target }, key('27'.repeat(32))),
      f.parent,
      f.recovery,
    ),
  );
  await assert.rejects(
    verifyRotationRequest(f.request(), f.parent, { ...f.recovery, rPub: 'ee'.repeat(32) }),
  );
  for (const field of ['enc', 'ct']) {
    for (const where of ['device', 'recovery']) {
      const r = structuredClone(f.request());
      (where === 'device' ? r.payload.wraps[0] : r.payload.recoveryWrap)[field] = 'ee'.repeat(
        field === 'enc' ? 32 : 48,
      );
      await assert.rejects(verifyRotationRequest(r, f.parent, f.recovery));
    }
  }
  const r = structuredClone(f.request()),
    recovery = structuredClone(f.recovery);
  const inFlight = verifyRotationRequest(r, f.parent, recovery);
  r.payload.wraps[0].ct = 'ef'.repeat(48);
  recovery.rPub = 'ef'.repeat(32);
  assert.deepEqual((await inFlight).request, f.request());
  assert.throws(
    () => parseRotationRequest({ ...f.request(), padding: 'x'.repeat(65536) }),
    /Oversized/,
  );
});

test('lost or forged outcomes remain pending; only authenticated competing intent can supersede', async () => {
  const f = await ready(),
    r = f.request(),
    verified = await verifyRotationRequest(r, f.parent, f.recovery);
  for (const input of [
    null,
    { ok: false, refusal: 'stale' },
    f.outcome(r, {}, key('f1'.repeat(32))),
    f.outcome(r, { kind: 'retire' }),
    f.outcome(r, { target: 3 }),
    f.outcome(r, { epoch: f.p.epoch }),
    f.outcome(r, { workspaceId: 'ee'.repeat(16) }),
    f.outcome(r, { lineageId: 'ee'.repeat(32) }),
    f.outcome(r, { epoch: f.p.epoch + 2 }),
    { ...f.outcome(r), committedId: 'dd'.repeat(32) },
  ])
    assert.equal((await resolveRotationOutcome(input, verified)).kind, 'pending');
  assert.equal(
    (await resolveRotationOutcome(f.outcome(r, { committedId: 'dc'.repeat(32) }), verified)).kind,
    'superseded',
  );
  // Cold replay of the same retained bytes resolves to the same outcome and request identity.
  const cold = await verifyRotationRequest(JSON.parse(JSON.stringify(r)), f.parent, f.recovery);
  assert.equal(cold.id, verified.id);
  assert.deepEqual(
    await resolveRotationOutcome(f.outcome(r), cold),
    await resolveRotationOutcome(f.outcome(r), verified),
  );
});

test('finalization binds the removed stream and exact link, including a zero-write device', async () => {
  const f = await ready();
  for (const position of [0, 8]) {
    const cutoff = f.preparation.cutoff.map((h) =>
      h.credentialId === f.target
        ? {
            ...h,
            position,
            link: position ? 'bc'.repeat(32) : '00'.repeat(32),
          }
        : h,
    );
    const r = f.request({ preparation: f.prep({ cutoff }), payload: { ...f.payload, cutoff } });
    const verified = await verifyRotationRequest(r, f.parent, f.recovery),
      o = f.outcome(r);
    await verifyRemovalFinalization(f.final(r), verified, o);
    for (const changes of [
      { final: false },
      { credential: f.preparationRequest.actorId },
      { position: position + 1 },
      { link: 'ee'.repeat(32) },
      { epoch: f.p.epoch },
      { workspace: 'ee'.repeat(16) },
    ])
      await assert.rejects(verifyRemovalFinalization(f.final(r, changes), verified, o));
    await assert.rejects(
      verifyRemovalFinalization(f.final(r, {}, key('f1'.repeat(32))), verified, o),
    );
    await assert.rejects(
      verifyRemovalFinalization(
        f.final(r),
        verified,
        f.outcome(r, { committedId: 'ee'.repeat(32) }),
      ),
    );
  }
});
