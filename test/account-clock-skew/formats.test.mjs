import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { lp } from '../account-enrollment/fixtures.mjs';
import { fixture as successorFixture } from '../account-successor/oracle.mjs';
import { deliveryFixture } from '../account-membership/delivery-fixtures.mjs';
import { membershipRotationFixture } from '../account-membership/rotation-fixtures.mjs';
import { signed, message } from '../account-membership/fixtures.mjs';
import { verifyEnrollmentChallenge } from '../../account-protocol/enrollment.ts';
import { verifyDiscoveryRequest } from '../../account-protocol/successor.ts';
import { verifyHistoryExchange } from '../../account-protocol/historyExchange.ts';
import {
  verifyMembershipChain,
  verifyMembershipDiscoveryRequest,
} from '../../account-protocol/membershipLocator.ts';
import { verifyMembershipCheckpointRequest } from '../../account-protocol/membershipCheckpoint.ts';
import { verifyRemovalDiscoveryRequest } from '../../account-protocol/removalDiscovery.ts';
import { verifyMembershipCertification } from '../../account-protocol/membership.ts';

const NOW = 1_000_000;
const lifetimes = {
  enrollment: 600_000,
  history: 60_000,
  locator: 60_000,
  checkpoint: 60_000,
  successor: 60_000,
  removal: 60_000,
};
// Independent contract values and Node framing/signatures; no live service or clock mock.
const publicHex = (key) =>
  key.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
const seal = (label, body, key, corrupt) => ({
  ...body,
  signature: corrupt ? '00'.repeat(64) : signed(key, message(label, body)),
});
let members, removal, enrollment, successor;
async function memberFixture() {
  members ??= (async () => {
    const x = await deliveryFixture('new');
    const base = x.f.f.base;
    const proofs = {
      successor: x.f.f.successor,
      certification: x.f.certification,
      continuations: [x.admission, x.certification],
    };
    const { history } = await verifyMembershipChain(proofs, base);
    const authority = await verifyMembershipCertification(x.certification, x.parent);
    return { x, base, history, authority };
  })();
  return members;
}
async function probe(protocol, expiresAt, corrupt = false) {
  if (protocol === 'enrollment') {
    enrollment ??= { root: generateKeyPairSync('ed25519'), device: generateKeyPairSync('ed25519') };
    const { root, device } = enrollment;
    const context = {
      v: 1,
      pin: {
        v: 1,
        serviceId: '11'.repeat(16),
        origin: 'http://localhost:4999',
        rpId: 'localhost',
        authRoot: publicHex(root.publicKey),
      },
      accountId: Buffer.alloc(32, 1).toString('base64url'),
      attemptId: Buffer.alloc(32, 2).toString('base64url'),
      candidate: {
        v: 1,
        workspaceId: '22'.repeat(16),
        lineageId: '33'.repeat(32),
        head: '44'.repeat(32),
        credentialId: '55'.repeat(16),
        sPub: publicHex(device.publicKey),
        wPub: '66'.repeat(32),
      },
      epoch: 1,
      certifiedSetDigest: '77'.repeat(32),
      recoveryStateDigest: '88'.repeat(32),
      passkeyId: 'AQ',
      nonce: '99'.repeat(32),
      expiresAt,
    };
    const challenge = {
      v: 1,
      kind: 'enrollment-preparation-challenge',
      context,
      signature: corrupt
        ? '00'.repeat(64)
        : sign(
            null,
            lp('done/enrollment-preparation-challenge/v1', JSON.stringify(context)),
            root.privateKey,
          ).toString('hex'),
    };
    return verifyEnrollmentChallenge(challenge, context.pin, context.candidate, NOW);
  }
  if (protocol === 'successor') {
    successor ??= successorFixture();
    const { signature: _, ...body } = successor.discover();
    body.expiresAt = expiresAt;
    return verifyDiscoveryRequest(
      seal('done/authority-discovery-request/v1', body, successor.keys.device, corrupt),
      successor.base,
      successor.successor,
      NOW,
    );
  }
  if (protocol === 'removal') {
    removal ??= membershipRotationFixture();
    const x = await removal;
    const body = {
      v: 1,
      kind: 'removal-discovery-request',
      pin: x.f.f.base.pin,
      workspaceId: x.p.workspaceId,
      lineageId: x.p.lineageId,
      credentialId: x.target,
      nonce: '76'.repeat(32),
      expiresAt,
    };
    return verifyRemovalDiscoveryRequest(
      seal('done/removal-discovery-request/v1', body, x.f.keys.new, corrupt),
      body.pin,
      x.f.f.base,
      { ...x.proofs, continuations: [...x.proofs.continuations, x.rotate()] },
      NOW,
    );
  }
  const { x, base, history, authority } = await memberFixture();
  const shared = {
    workspaceId: x.p.workspaceId,
    lineageId: x.p.lineageId,
    credentialId: x.c.candidate.id,
    epoch: history.current.tip,
    head: history.current.head,
    nonce: 'c3'.repeat(32),
    expiresAt,
  };
  if (protocol === 'history') {
    const body = {
      v: 1,
      kind: 'history-checkpoint-request',
      workspaceId: shared.workspaceId,
      lineageId: shared.lineageId,
      epoch: shared.epoch,
      head: shared.head,
      credentialId: shared.credentialId,
      nonce: shared.nonce,
      expiresAt,
      action: 'read',
      payload: 'catalog',
    };
    return verifyHistoryExchange(
      seal('done/history-checkpoint-request/v1', body, x.keys.new, corrupt),
      authority,
      NOW,
    );
  }
  const body = {
    v: 2,
    kind: protocol === 'locator' ? 'membership-discovery-request' : 'membership-checkpoint-read',
    pin: base.pin,
    ...shared,
  };
  if (protocol === 'locator')
    return verifyMembershipDiscoveryRequest(
      seal('done/membership-discovery-request/v2', body, x.keys.new, corrupt),
      base.pin,
      history,
      NOW,
    );
  assert.equal(protocol, 'checkpoint');
  return verifyMembershipCheckpointRequest(
    seal('done/membership-checkpoint-read/v2', body, x.keys.new, corrupt),
    base.pin,
    history,
    NOW,
  );
}
async function boundary(protocol, offset, accepts) {
  const request = probe(protocol, NOW + lifetimes[protocol] + offset);
  if (accepts) await assert.doesNotReject(request);
  else await assert.rejects(request, /expired|lifetime/i);
}

test('enrollment: service one second ahead is accepted', () => boundary('enrollment', 1000, true));
test('enrollment: exact two-minute allowance is accepted', () =>
  boundary('enrollment', 120000, true));
test('enrollment: one millisecond beyond allowance is refused', () =>
  boundary('enrollment', 120001, false));
test('enrollment: expiry at now is still refused', () =>
  boundary('enrollment', -lifetimes.enrollment, false));
test('enrollment: invalid signature inside allowance is refused', async () => {
  await assert.rejects(probe('enrollment', NOW + lifetimes.enrollment + 1000, true), /signature/i);
});

test('history: service one second ahead is accepted', () => boundary('history', 1000, true));
test('history: exact two-minute allowance is accepted', () => boundary('history', 120000, true));
test('history: one millisecond beyond allowance is refused', () =>
  boundary('history', 120001, false));
test('history: expiry at now is still refused', () =>
  boundary('history', -lifetimes.history, false));
test('history: invalid signature inside allowance is refused', async () => {
  await assert.rejects(probe('history', NOW + lifetimes.history + 1000, true), /signature/i);
});

test('locator: service one second ahead is accepted', () => boundary('locator', 1000, true));
test('locator: exact two-minute allowance is accepted', () => boundary('locator', 120000, true));
test('locator: one millisecond beyond allowance is refused', () =>
  boundary('locator', 120001, false));
test('locator: expiry at now is still refused', () =>
  boundary('locator', -lifetimes.locator, false));
test('locator: invalid signature inside allowance is refused', async () => {
  await assert.rejects(probe('locator', NOW + lifetimes.locator + 1000, true), /signature/i);
});

test('checkpoint: service one second ahead is accepted', () => boundary('checkpoint', 1000, true));
test('checkpoint: exact two-minute allowance is accepted', () =>
  boundary('checkpoint', 120000, true));
test('checkpoint: one millisecond beyond allowance is refused', () =>
  boundary('checkpoint', 120001, false));
test('checkpoint: expiry at now is still refused', () =>
  boundary('checkpoint', -lifetimes.checkpoint, false));
test('checkpoint: invalid signature inside allowance is refused', async () => {
  await assert.rejects(probe('checkpoint', NOW + lifetimes.checkpoint + 1000, true), /signature/i);
});

test('successor: service one second ahead is accepted', () => boundary('successor', 1000, true));
test('successor: exact two-minute allowance is accepted', () =>
  boundary('successor', 120000, true));
test('successor: one millisecond beyond allowance is refused', () =>
  boundary('successor', 120001, false));
test('successor: expiry at now is still refused', () =>
  boundary('successor', -lifetimes.successor, false));
test('successor: invalid signature inside allowance is refused', async () => {
  await assert.rejects(probe('successor', NOW + lifetimes.successor + 1000, true), /signature/i);
});

test('removal: service one second ahead is accepted', () => boundary('removal', 1000, true));
test('removal: exact two-minute allowance is accepted', () => boundary('removal', 120000, true));
test('removal: one millisecond beyond allowance is refused', () =>
  boundary('removal', 120001, false));
test('removal: expiry at now is still refused', () =>
  boundary('removal', -lifetimes.removal, false));
test('removal: invalid signature inside allowance is refused', async () => {
  await assert.rejects(probe('removal', NOW + lifetimes.removal + 1000, true), /signature/i);
});
