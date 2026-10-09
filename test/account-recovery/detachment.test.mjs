import test from 'node:test';
import assert from 'node:assert/strict';
import { sign, randomBytes, createHash } from 'node:crypto';
import { client, sourceFixture } from './source-fixtures.mjs';
import { lp } from '../account-enrollment/fixtures.mjs';
import { message as grantMessage, denial } from '../account-sessions/grant-fixtures.mjs';
import { verifyRemovalDiscoveryResponse } from '../../account-protocol/removalDiscovery.ts';
const fresh = () => randomBytes(32).toString('base64url');
test('a recovered first-device account gives its old device only its terminal proof, not current authority', async (t) => {
  const x = await sourceFixture(t);
  const prepared = await client.prepareRecoveryCommit(x.input);
  t.after(() => prepared.key.fill(0));
  const result = await x.authority.owner.commitRecovery(x.f.core, prepared.request);
  assert.equal(result.stage, 'committed');
  const retryKey = fresh();
  const view = x.f.core.sessions.begin({ accountId: x.account.result.accountId, retryKey });
  const session = await x.f.core.sessions.finish({
    retryKey,
    attemptId: view.attemptId,
    response: x.account.key.assert(view),
  });
  assert.equal(session.stage, 'issued');
  const access = x.f.core.sessions.renew({
    sessionId: session.sessionId,
    renewalToken: session.renewalToken,
  });
  assert.equal(access.stage, 'access');
  const begin = (kind) =>
    x.authority.owner.beginGrant(x.f.core, access.accessToken, {
      kind,
      workspaceId: x.workspace,
      credentialId: x.credential,
    });
  assert.equal((await begin('workspace')).refusal, 'insufficient-scope');
  const challenge = await begin('removal');
  assert.equal(challenge.stage, 'challenge', JSON.stringify(challenge));
  const grant = await x.f.core.grants.finish(access.accessToken, {
    challengeId: challenge.challenge.challengeId,
    signature: sign(null, grantMessage(challenge.challenge), x.s.privateKey).toString('hex'),
  });
  assert.equal(grant.stage, 'granted');
  const body = {
    v: 1,
    kind: 'removal-discovery-request',
    pin: x.authority.pin,
    workspaceId: x.workspace,
    lineageId: x.offer.epoch.lineageId,
    credentialId: x.credential,
    nonce: '76'.repeat(32),
    expiresAt: 30000,
  };
  const request = {
    ...body,
    signature: sign(
      null,
      lp(
        'done/removal-discovery-request/v1',
        createHash('sha256').update(JSON.stringify(body)).digest('hex'),
      ),
      x.s.privateKey,
    ).toString('hex'),
  };
  const authorization = x.f.core.grants.authorize(grant.grantToken);
  const proof = await x.authority.owner.discoverRemoval(x.f.core, request, authorization);
  const verified = await verifyRemovalDiscoveryResponse(
    proof,
    request,
    x.reader.verified.prepared.base,
    1000,
  );
  assert.equal(verified.proofs.continuations.at(-1).head, result.successor.head);
  assert.equal(verified.proofs.continuations.length, 1);
  await assert.rejects(
    x.authority.owner.decideSubmission(
      x.f.core,
      { workspaceId: x.workspace, bytes: x.make(1).bytes },
      authorization,
    ),
    denial('insufficient-scope'),
  );
  const changed = { ...request, credentialId: x.reader.input.candidate.credentialId };
  await assert.rejects(
    verifyRemovalDiscoveryResponse(proof, changed, x.reader.verified.prepared.base, 1000),
  );
  assert.equal(
    (await x.authority.owner.discoverRemoval(x.f.core, { ...request, signature: '00'.repeat(64) }))
      .ok,
    false,
  );
});
