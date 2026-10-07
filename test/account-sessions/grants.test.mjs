import test from 'node:test';
import assert from 'node:assert/strict';
import { sign, generateKeyPairSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fresh, registered } from '../account-core/fixtures.mjs';
import { GRANT_LIMITS } from '../../account-service/grants.ts';
import {
  GRANT_CHALLENGE_MS,
  GRANT_LIFETIME_MS,
  grantMessage,
} from '../../account-protocol/scopedGrant.ts';
import { fixture, message, denial } from './grant-fixtures.mjs';
import { ready as admittedWorkspace } from '../account-service-delivery/fixtures.mjs';
import { query as inboundQuery } from '../account-service-inbound/oracle.mjs';
import { query as oldQuery } from '../account-transport/oracle.mjs';
import { checkpointRequestMessage } from '../../account-protocol/contentCheckpoint.ts';
import {
  recipientCertificateMessage,
  contentDeliveryMessage,
  contentDeliveryHash,
  contentInstallationMessage,
  contentTransferMessage,
} from '../../account-protocol/contentDelivery.ts';

test('current certified member obtains a purpose-bound grant; ordinary appends do not invalidate it', async (t) => {
  const x = await fixture(t),
    b = await x.begin();
  assert.deepEqual(Buffer.from(grantMessage(b.challenge)), message(b.challenge));
  const g = await x.finish(b);
  assert.equal(g.stage, 'granted');
  assert.equal((await x.submit(g, x.make(1))).kind, 'decision');
  assert.equal((await x.submit(g, x.make(2))).kind, 'decision');
  assert.equal(x.f.rows('delivery_decisions').length, 2);
  assert.equal((await x.finish(b)).refusal, 'unknown-attempt');
});

test('account login, a public challenge and a different device key cannot substitute for possession', async (t) => {
  const x = await fixture(t),
    b = await x.begin();
  assert.equal(
    (await x.finish(b, generateKeyPairSync('ed25519').privateKey)).refusal,
    'invalid-proof',
  );
  await assert.rejects(
    x.submit({ grantToken: x.first.access.accessToken }),
    denial('grant-required'),
  );
  for (const edit of [
    { sessionId: fresh() },
    { accountId: fresh() },
    { head: 'aa'.repeat(32) },
    { pin: { ...b.challenge.pin, serviceId: 'bb'.repeat(16) } },
    { expiresAt: b.challenge.expiresAt + 1 },
    { scope: { ...x.scope, credentialId: 'cc'.repeat(16) } },
    { actions: ['read'] },
  ]) {
    const signature = sign(null, message({ ...b.challenge, ...edit }), x.s.privateKey).toString(
      'hex',
    );
    assert.equal(
      (
        await x.f.core.grants.finish(x.first.access.accessToken, {
          challengeId: b.challenge.challengeId,
          signature,
        })
      ).refusal,
      'invalid-proof',
    );
  }
  assert.equal((await x.finish(b)).stage, 'granted');
  assert.equal(x.f.rows('delivery_decisions').length, 0);
});

test('a different login for the same account cannot claim a challenge; another account cannot request it', async (t) => {
  const x = await fixture(t),
    b = await x.begin(),
    another = await x.login();
  assert.equal((await x.finish(b, x.s.privateKey, another.access)).refusal, 'insufficient-scope');
  const stranger = await registered(x.f);
  x.f.seedActive(stranger.result.accountId);
  const other = await x.login(stranger);
  assert.equal((await x.begin(x.scope, other.access)).refusal, 'wrong-account');
  assert.equal((await x.begin(x.scope, { accessToken: fresh() })).refusal, 'access-required');
});

test('a pending participant obtains only its exact preparation scope; admission retires its old grant', async (t) => {
  const x = await fixture(t),
    p = await x.prepare();
  const scope = {
    kind: 'enrollment',
    workspaceId: x.workspace,
    credentialId: p.entry.input.candidate.credentialId,
    attemptId: p.result.receipt.context.attemptId,
  };
  assert.equal(
    (
      await x.begin({
        kind: 'workspace',
        workspaceId: x.workspace,
        credentialId: scope.credentialId,
      })
    ).refusal,
    'insufficient-scope',
  );
  assert.equal((await x.begin({ ...scope, attemptId: fresh() })).refusal, 'insufficient-scope');
  const g = await x.grant(scope, p.entry.key);
  await assert.rejects(x.submit(g), denial('insufficient-scope'));
  const admitted = await x.authority.owner.admitPrepared(
    x.f.core,
    p.input,
    x.f.core.grants.authorize(g.grantToken),
  );
  assert.equal(admitted.kind, 'device-admission-successor');
  await assert.rejects(
    x.authority.owner.admitPrepared(x.f.core, p.input, x.f.core.grants.authorize(g.grantToken)),
    denial('authority-changed'),
  );
  const renewed = await x.grant(scope, p.entry.key);
  assert.deepEqual(
    await x.authority.owner.admitPrepared(
      x.f.core,
      p.input,
      x.f.core.grants.authorize(renewed.grantToken),
    ),
    admitted,
  );
  assert.equal(
    (
      await x.begin({
        kind: 'workspace',
        workspaceId: x.workspace,
        credentialId: scope.credentialId,
      })
    ).refusal,
    'insufficient-scope',
  );
});

test('competing prepared attempt and another actor cannot borrow a participant grant', async (t) => {
  const x = await fixture(t),
    p = await x.prepare(),
    q = await x.prepare();
  const g = await x.grant(
    {
      kind: 'enrollment',
      workspaceId: x.workspace,
      credentialId: p.entry.input.candidate.credentialId,
      attemptId: p.input.attemptId,
    },
    p.entry.key,
  );
  await assert.rejects(
    x.authority.owner.admitPrepared(x.f.core, q.input, x.f.core.grants.authorize(g.grantToken)),
    denial('insufficient-scope'),
  );
  assert.equal(x.f.rows('workspace_successors').length, 0);
});

test('empty and populated ceremony reads check the exact participant grant', async (t) => {
  const x = await fixture(t, { ceremony: true });
  const scope = {
    kind: 'enrollment',
    workspaceId: x.workspace,
    credentialId: x.context.candidate.id,
    attemptId: x.prepared.input.attemptId,
  };
  const g = await x.grant(scope, x.keys.new);
  const call = (role, token, action = 'read', payload = null) =>
    x.authority.owner.relayCeremony(
      x.f.core,
      x.request(role, action, payload),
      x.f.core.grants.authorize(token),
    );
  await assert.rejects(call('new', fresh()), denial('grant-required'));
  assert.equal((await call('new', g.grantToken)).ok, true);
  await assert.rejects(call('existing', g.grantToken), denial('insufficient-scope'));
  const existing = await x.grant({ ...scope, credentialId: x.context.existing.id });
  assert.equal(
    (await call('existing', existing.grantToken, 'commit', x.commits.existing)).ok,
    true,
  );
  assert.equal((await call('new', g.grantToken)).ok, true);
  assert.equal(x.first.revoke().stage, 'revoked');
  await assert.rejects(call('new', g.grantToken), denial('sign-in-required'));
});

test('session revocation during asynchronous operation verification prevents acceptance', async (t) => {
  let retire;
  const x = await fixture(t, {
    hook: (point, op) => {
      if (op === 'decide-submission' && point === 'after-verify') retire?.();
    },
  });
  const g = await x.grant();
  retire = () => {
    assert.equal(x.first.revoke().stage, 'revoked');
  };
  await assert.rejects(x.submit(g), denial('sign-in-required'));
  assert.equal(x.f.rows('delivery_decisions').length, 0);
});

test('deadline crossing after a write but before COMMIT rolls back the domain write', async (t) => {
  let expire;
  const x = await fixture(t, {
    hook: (point, op) => {
      if (op === 'decide-submission' && point === 'before-commit') expire?.();
    },
  });
  const g = await x.grant();
  expire = () => x.setTime(g.expiresAt);
  await assert.rejects(x.submit(g), denial('grant-required'));
  assert.equal(x.f.rows('delivery_decisions').length, 0);
});

test('a live challenge expires, grants expire, and restart permits renewal but loses ephemeral grants', async (t) => {
  const x = await fixture(t),
    b = await x.begin();
  x.setTime(1000 + GRANT_CHALLENGE_MS);
  assert.equal((await x.finish(b)).refusal, 'unknown-attempt');
  const g = await x.grant();
  x.setTime(g.expiresAt);
  await assert.rejects(x.submit(g), denial('grant-required'));
  const access = x.first.renew();
  const another = await x.grant(x.scope, x.s.privateKey, access);
  const oldOwner = x.f.core.grants;
  x.f.restart();
  await assert.rejects(x.submit(another), denial('grant-required'));
  assert.equal(
    (await oldOwner.begin(access.accessToken, x.scope, {})).refusal,
    'storage-unavailable',
  );
  assert.equal(x.first.renew().stage, 'access');
});

test('account/credential retirement invalidates an existing grant', async (t) => {
  for (const [sql, reason] of [
    ["UPDATE credentials SET state='staged'", 'sign-in-required'],
    ["UPDATE accounts SET state='pending'", 'sign-in-required'],
  ]) {
    const x = await fixture(t),
      g = await x.grant();
    const db = new DatabaseSync(x.f.path);
    db.exec(sql);
    db.close();
    // Domain cannot return content on ineligible account state even before reaching a grant guard.
    const result = await x.submit(g);
    assert.equal(result.kind, 'unknown');
    assert.equal(x.f.rows('delivery_decisions').length, 0);
    const check = x.f.core.sessions.withAccess(
      x.first.access.accessToken,
      x.account.result.accountId,
      () => ({ ok: true }),
    );
    assert.equal(check.refusal, reason);
  }
});

test('a valid signed operation in another workspace cannot borrow the first workspace grant', async (t) => {
  const x = await fixture(t),
    g = await x.grant();
  const other = await admittedWorkspace(t, {
    fixture: x.f,
    authority: x.authority,
    scope: {
      workspaceId: 'fe'.repeat(16),
      lineageId: 'fd'.repeat(32),
      principalId: 'fb'.repeat(16),
    },
    signer: 'fc'.repeat(16),
  });
  const input = { workspaceId: other.workspace, bytes: other.make().bytes };
  await assert.rejects(
    x.authority.owner.decideSubmission(x.f.core, input, x.f.core.grants.authorize(g.grantToken)),
    denial('insufficient-scope'),
  );
  assert.equal(x.f.rows('delivery_decisions').length, 0);
  const login = await x.login(other.account);
  const own = await x.grant(
    { kind: 'workspace', workspaceId: other.workspace, credentialId: other.credential },
    other.s.privateKey,
    login.access,
  );
  assert.equal(
    (
      await x.authority.owner.decideSubmission(
        x.f.core,
        input,
        x.f.core.grants.authorize(own.grantToken),
      )
    ).kind,
    'decision',
  );
});

test('returned challenge objects cannot mutate retained service identity or challenge authority', async (t) => {
  const x = await fixture(t),
    b = await x.begin();
  b.challenge.pin.authRoot = 'ef'.repeat(32);
  b.challenge.actions.push('admit');
  assert.equal((await x.finish(b)).refusal, 'invalid-proof');
  assert.equal((await x.grant()).stage, 'granted');
});

test('authority change between challenge and proof forces a new device proof', async (t) => {
  const x = await fixture(t),
    b = await x.begin(),
    p = await x.prepare();
  await x.admit(p.input);
  assert.equal((await x.finish(b)).refusal, 'authority-changed');
  const g = await x.grant();
  assert.equal((await x.submit(g)).kind, 'decision');
});

test('grants cannot use another database or escape its domain transaction', async (t) => {
  const x = await fixture(t),
    g = await x.grant(),
    guard = x.f.core.grants.authorize(g.grantToken);
  const db = new DatabaseSync(x.f.path);
  t.after(() => db.close());
  assert.throws(() => guard(db, { ...x.scope, action: 'submit' }), denial('storage-unavailable'));
  db.exec('BEGIN');
  assert.throws(() => guard(db, { ...x.scope, action: 'submit' }), denial('storage-unavailable'));
  assert.equal(db.isTransaction, true);
  db.exec('ROLLBACK');
});

test('per-session challenge and grant storage is bounded; expiry recovers capacity', async (t) => {
  const x = await fixture(t);
  for (let i = 0; i < GRANT_LIMITS.perSession; i++)
    assert.equal((await x.begin()).stage, 'challenge');
  assert.equal((await x.begin()).refusal, 'capacity');
  x.setTime(1000 + GRANT_CHALLENGE_MS);
  for (let i = 0; i < GRANT_LIMITS.perSession; i++) await x.grant();
  const pending = await x.begin();
  assert.equal((await x.finish(pending)).refusal, 'capacity');
  x.setTime(1000 + GRANT_CHALLENGE_MS + GRANT_LIFETIME_MS);
  assert.equal((await x.grant(x.scope, x.s.privateKey, x.first.renew())).stage, 'granted');
});

test('both read versions withhold content after revocation during verification', async (t) => {
  for (const [operation, query, method] of [
    ['read-accepted', oldQuery, 'readAccepted'],
    ['read-inbound', inboundQuery, 'readInbound'],
  ]) {
    let retire;
    const x = await fixture(t, {
      hook: (point, op) => {
        if (op === operation && point === 'after-verify') retire?.();
      },
    });
    const g = await x.grant();
    await x.submit(g);
    retire = () => {
      x.first.revoke();
    };
    await assert.rejects(
      x.authority.owner[method](x.f.core, query(x), x.f.core.grants.authorize(g.grantToken)),
      denial('sign-in-required'),
    );
    assert.equal(x.f.rows('delivery_decisions').length, 1);
  }
});

test('certification needs a fresh workspace grant; inbound scope follows the reader, not the publisher', async (t) => {
  const x = await fixture(t, { ceremony: true });
  const scope = (role) => ({
    kind: 'enrollment',
    workspaceId: x.workspace,
    credentialId: x.context[role === 'existing' ? 'existing' : 'candidate'].id,
    attemptId: x.prepared.input.attemptId,
  });
  const grants = {
    existing: await x.grant(scope('existing')),
    new: await x.grant(scope('new'), x.keys.new),
  };
  const relay = (role, action, payload) =>
    x.authority.owner.relayCeremony(
      x.f.core,
      x.request(role, action, payload),
      x.f.core.grants.authorize(grants[role].grantToken),
    );
  for (const role of ['existing', 'new'])
    assert.equal((await relay(role, 'commit', x.commits[role])).ok, true);
  for (const role of ['existing', 'new'])
    assert.equal((await relay(role, 'reveal', x.reveals[role])).ok, true);
  const decision = x.request('existing', 'decide', {
    contextHash: x.contextHash,
    transcriptHash: x.open.transcriptHash,
    outcome: 'approved',
  });
  assert.equal(
    (
      await x.authority.owner.relayCeremony(
        x.f.core,
        decision,
        x.f.core.grants.authorize(grants.existing.grantToken),
      )
    ).ok,
    true,
  );
  const signed = (key, bytes) => sign(null, bytes, key).toString('hex');
  const certificate = {
    members: [x.context.existing, x.context.candidate].sort((a, b) => (a.id < b.id ? -1 : 1)),
    recoveryStateDigest: x.context.recoveryStateDigest,
    approver: x.context.existing.id,
    signature: '00'.repeat(64),
  };
  certificate.signature = signed(
    x.keys.existing,
    await recipientCertificateMessage(certificate, x.workspace, x.context.lineageId),
  );
  const delivery = {
    v: 1,
    kind: 'content-key-delivery',
    parent: x.successor.head,
    generation: 1,
    transcriptHash: x.open.transcriptHash,
    existing: x.commits.existing,
    candidate: x.commits.new,
    existingReveal: x.reveals.existing,
    newReveal: x.reveals.new,
    decision,
    certificate,
    recovery: JSON.parse(x.f.rows('promotions')[0].request).recovery,
    wrap: { enc: 'ab'.repeat(32), ct: 'cd'.repeat(48) },
    signature: '00'.repeat(64),
  };
  delivery.signature = signed(x.keys.existing, await contentDeliveryMessage(delivery));
  const transfer = async (role, action, payload, g = grants[role]) => {
    const request = {
      v: 1,
      workspaceId: x.workspace,
      credentialId: scope(role).credentialId,
      parent: x.successor.head,
      action,
      payload,
      signature: '00'.repeat(64),
    };
    request.signature = signed(x.keys[role], await contentTransferMessage(request));
    return x.authority.owner.transferContent(
      x.f.core,
      request,
      x.f.core.grants.authorize(g.grantToken),
    );
  };
  await assert.rejects(
    transfer('existing', 'deliver', delivery, grants.new),
    denial('insufficient-scope'),
  );
  assert.equal(x.f.rows('content_transfers').length, 0);
  assert.equal((await transfer('existing', 'deliver', delivery)).ok, true);
  // A delivery changes retained authority evidence; reacquire against the new verified snapshot.
  grants.new = await x.grant(scope('new'), x.keys.new);
  const installation = {
    v: 1,
    kind: 'content-key-installed',
    deliveryHash: await contentDeliveryHash(delivery),
    credentialId: x.context.candidate.id,
    signature: '00'.repeat(64),
  };
  installation.signature = signed(x.keys.new, await contentInstallationMessage(installation));
  const { certification } = await transfer('new', 'install', installation);
  assert.equal(certification.kind, 'device-certification-successor');
  const newcomerScope = {
    kind: 'workspace',
    workspaceId: x.workspace,
    credentialId: x.context.candidate.id,
  };
  const oldDevice = await x.grant(),
    newDevice = await x.grant(newcomerScope, x.keys.new);
  const q = inboundQuery(
    x,
    0,
    1,
    { reader: x.context.candidate.id, publisher: x.credential, head: certification.head, epoch: 3 },
    x.keys.new,
  );
  const read = (g) =>
    x.authority.owner.readInbound(x.f.core, q, x.f.core.grants.authorize(g.grantToken));
  await assert.rejects(read(grants.new), denial('insufficient-scope'));
  await assert.rejects(read(oldDevice), denial('insufficient-scope'));
  assert.equal((await read(newDevice)).kind, 'decision');
  const r = {
    workspaceId: x.workspace,
    credentialId: x.context.candidate.id,
    head: certification.head,
    nonce: 'dd'.repeat(32),
    action: 'read',
    payload: null,
    signature: '00'.repeat(64),
  };
  r.signature = signed(x.keys.new, await checkpointRequestMessage(r));
  await assert.rejects(
    x.authority.owner.exchangeCheckpoint(
      x.f.core,
      r,
      x.f.core.grants.authorize(oldDevice.grantToken),
    ),
    denial('insufficient-scope'),
  );
  assert.equal(
    (
      await x.authority.owner.exchangeCheckpoint(
        x.f.core,
        r,
        x.f.core.grants.authorize(newDevice.grantToken),
      )
    ).ok,
    true,
  );
});

test('grant lifetime is capped by the parent login absolute expiry', async (t) => {
  const x = await fixture(t);
  x.setTime(x.first.session.expiresAt - 1000);
  const access = x.first.renew(),
    g = await x.grant(x.scope, x.s.privateKey, access);
  assert.equal(g.expiresAt, x.first.session.expiresAt);
  x.setTime(g.expiresAt);
  await assert.rejects(x.submit(g), denial('grant-required'));
  assert.equal(x.first.renew().refusal, 'sign-in-required');
});
