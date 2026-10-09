import test from 'node:test';
import assert from 'node:assert/strict';
import { message, hash } from './fixtures.mjs';
import { rotationFixture as ready } from './rotation-fixtures.mjs';
import { lp } from '../account-ceremony/oracle.mjs';
import { key } from '../account-first-authority/oracle.mjs';
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
