import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOCK_SKEW_ALLOWANCE_MS } from '../../account-protocol/clockSkew.ts';
import { deliveryFixture } from './delivery-fixtures.mjs';
import { signed, message, hash } from './fixtures.mjs';
import {
  parseMembershipChain,
  membershipInvitationMessage,
  membershipDiscoveryRequestMessage,
  verifyMembershipBootstrapResponse,
  verifyMembershipDiscoveryResponse,
} from '../../account-protocol/membershipLocator.ts';
import { verifySignature } from '../../account-protocol/admission.ts';

async function fixture() {
  const x = await deliveryFixture('new'),
    f = x.f;
  const base = f.f.base;
  const proofs = {
    successor: f.f.successor,
    certification: f.certification,
    continuations: [x.admission, x.certification],
  };
  const seal = (label, body, key = x.keys.authority) => {
    const { signature: _, ...value } = body;
    return { ...value, signature: signed(key, message(label, value)) };
  };
  const invitation = seal(
    'done/membership-invitation/v2',
    {
      v: 2,
      workspaceId: x.p.workspaceId,
      lineageId: x.p.lineageId,
      credentialId: f.context.candidate.id,
      epoch: 3,
      head: f.certification.head,
      nonce: 'c1'.repeat(32),
    },
    f.keys.new,
  );
  const request = { v: 2, workspaceId: x.p.workspaceId, nonce: 'c2'.repeat(32), invitation };
  const bootstrap = (proofsValue = proofs) =>
    seal('done/membership-bootstrap/v2', {
      v: 2,
      kind: 'membership-bootstrap',
      requestHash: hash(JSON.stringify(request)),
      base,
      proofs: proofsValue,
    });
  const discover = (patch = {}, key = f.keys.new) =>
    seal(
      'done/membership-discovery-request/v2',
      {
        v: 2,
        kind: 'membership-discovery-request',
        pin: base.pin,
        workspaceId: x.p.workspaceId,
        lineageId: x.p.lineageId,
        credentialId: f.context.candidate.id,
        epoch: 3,
        head: f.certification.head,
        nonce: 'c3'.repeat(32),
        expiresAt: 61000,
        ...patch,
      },
      key,
    );
  const reply = (requestValue, proofsValue = proofs) =>
    seal('done/membership-discovery/v2', {
      v: 2,
      kind: 'membership-discovery',
      requestHash: hash(JSON.stringify(requestValue)),
      proofs: proofsValue,
    });
  return {
    x,
    f,
    base,
    proofs,
    seal,
    request,
    invitation,
    bootstrap,
    discover,
    reply,
  };
}

test('versioned bootstrap and discovery independently verify the complete current chain and captured request', async () => {
  const f = await fixture(),
    { signature, ...body } = f.invitation;
  assert.deepEqual(
    Buffer.from(await membershipInvitationMessage(f.invitation)),
    message('done/membership-invitation/v2', body),
  );
  const response = structuredClone(f.bootstrap());
  const pending = verifyMembershipBootstrapResponse(response, f.request, f.base.pin);
  response.proofs.continuations.splice(0);
  f.request.nonce = '00'.repeat(32);
  const verified = await pending;
  assert.equal(verified.history.current.tip, 5);
  assert.equal(verified.history.readers.length, 3);
  await verifySignature(
    f.f.context.candidate.sPub,
    signature,
    await membershipInvitationMessage(f.invitation),
  );
  const request = f.discover(),
    reply = f.reply(request);
  const { signature: _, ...requestBody } = request;
  assert.deepEqual(
    Buffer.from(await membershipDiscoveryRequestMessage(request)),
    message('done/membership-discovery-request/v2', requestBody),
  );
  assert.equal(
    (await verifyMembershipDiscoveryResponse(reply, request, f.base, 1000)).history.current.tip,
    5,
  );
});

test('nonce, pin, fork, epoch and reader eligibility cannot be replaced by a correctly signed locator', async () => {
  const f = await fixture();
  await assert.rejects(
    verifyMembershipBootstrapResponse(
      f.bootstrap(),
      { ...f.request, nonce: 'dd'.repeat(32) },
      f.base.pin,
    ),
  );
  await assert.rejects(
    verifyMembershipBootstrapResponse(f.bootstrap(), f.request, {
      ...f.base.pin,
      serviceId: 'dd'.repeat(16),
    }),
  );
  for (const patch of [
    { head: 'dd'.repeat(32) },
    { epoch: 4 },
    { workspaceId: 'dd'.repeat(16) },
    { lineageId: 'dd'.repeat(32) },
    { expiresAt: 1000 },
    { expiresAt: 61001 + CLOCK_SKEW_ALLOWANCE_MS },
    { credentialId: f.x.c.candidate.id, epoch: 4, head: f.x.p.head },
  ]) {
    const r = f.discover(patch, patch.credentialId ? f.x.keys.new : f.f.keys.new);
    await assert.rejects(verifyMembershipDiscoveryResponse(f.reply(r), r, f.base, 1000));
  }
  const wrongSigner = f.discover({}, f.x.keys.authority);
  await assert.rejects(
    verifyMembershipDiscoveryResponse(f.reply(wrongSigner), wrongSigner, f.base, 1000),
  );
  const current = f.discover(
    { credentialId: f.x.c.candidate.id, epoch: 5, head: f.x.certification.head },
    f.x.keys.new,
  );
  assert.equal(
    (await verifyMembershipDiscoveryResponse(f.reply(current), current, f.base, 1000)).history
      .current.tip,
    5,
  );
  await assert.rejects(
    verifyMembershipDiscoveryResponse(f.reply(f.discover()), current, f.base, 1000),
  );
});

test('service-signed omission or replacement of device approval cannot authenticate a membership chain', async () => {
  const f = await fixture(),
    request = f.discover();
  for (const edit of [
    (p) => p.continuations.shift(),
    (p) => p.continuations.reverse(),
    (p) => {
      p.continuations[1].epoch.installation.signature = '00'.repeat(64);
    },
    (p) => {
      p.certification.epoch.delivery.certificate.signature = '00'.repeat(64);
    },
  ]) {
    const bad = structuredClone(f.proofs);
    edit(bad);
    await assert.rejects(
      verifyMembershipDiscoveryResponse(f.reply(request, bad), request, f.base, 1000),
    );
  }
  // A reply behind the caller's saved authority is also invalid, despite a fresh service signature.
  const current = f.discover({ epoch: 5, head: f.x.certification.head });
  await assert.rejects(
    verifyMembershipDiscoveryResponse(
      f.reply(current, { ...f.proofs, continuations: [] }),
      current,
      f.base,
      1000,
    ),
  );
  assert.throws(() =>
    parseMembershipChain({
      ...f.proofs,
      continuations: Array(129).fill(f.proofs.continuations[0]),
    }),
  );
  assert.throws(() => parseMembershipChain({ ...f.proofs, extra: true }));
});

test('budgeted discovery preserves every proof, captures inputs before yielding, and permits other tasks', async () => {
  const f = await fixture(),
    request = f.discover(),
    reply = f.reply(request);
  const expected = await verifyMembershipDiscoveryResponse(reply, request, f.base, 1000);
  const originalHead = expected.history.current.head;
  let checks = 0,
    yielded = false;
  const base = structuredClone(f.base);
  const actual = await verifyMembershipDiscoveryResponse(reply, request, base, 1000, () => {
    checks++;
    if (yielded) return;
    yielded = true;
    return new Promise((resolve) =>
      setTimeout(() => {
        reply.proofs.continuations.splice(0);
        request.nonce = '00'.repeat(32);
        base.pin.authRoot = '00'.repeat(32);
        resolve();
      }, 0),
    );
  });
  assert(yielded);
  assert(checks > 100, 'nested verification must reach the owning budget');
  assert.equal(actual.history.current.head, originalHead);
  assert.deepEqual(actual.history, expected.history);
});

test('cancellation at a nested proof checkpoint rejects the whole discovery and a fresh retry verifies again', async () => {
  const f = await fixture(),
    request = f.discover(),
    reply = f.reply(request);
  let checks = 0;
  await assert.rejects(
    verifyMembershipDiscoveryResponse(reply, request, f.base, 1000, () => {
      if (++checks === 25) return Promise.reject(Error('owner closed'));
    }),
    /owner closed/,
  );
  assert.equal(checks, 25);
  assert.equal(
    (await verifyMembershipDiscoveryResponse(reply, request, f.base, 1000, () => undefined)).history
      .current.tip,
    5,
  );
});

test('yielding still refuses bad reply binding, nested signatures and expired requests', async () => {
  const f = await fixture(),
    request = f.discover(),
    reply = f.reply(request),
    checkpoint = () => Promise.resolve();
  await assert.rejects(
    verifyMembershipDiscoveryResponse(
      { ...reply, signature: '00'.repeat(64) },
      request,
      f.base,
      1000,
      checkpoint,
    ),
  );
  await assert.rejects(
    verifyMembershipDiscoveryResponse(
      { ...reply, requestHash: '00'.repeat(32) },
      request,
      f.base,
      1000,
      checkpoint,
    ),
    /request changed/,
  );
  const bad = structuredClone(f.proofs);
  bad.certification.signature = '00'.repeat(64);
  await assert.rejects(
    verifyMembershipDiscoveryResponse(f.reply(request, bad), request, f.base, 1000, checkpoint),
  );
  await assert.rejects(
    verifyMembershipDiscoveryResponse(reply, request, f.base, request.expiresAt, checkpoint),
    /lifetime/,
  );
});
