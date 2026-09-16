import test from 'node:test';
import assert from 'node:assert/strict';
import { ready, mutate } from '../account-successor/service-fixtures.mjs';
import { message, signed, hash } from './exchange-oracle.mjs';
import { commitment, derive } from './oracle.mjs';
async function setup(t, options = {}) {
  const x = await ready(t, options),
    p = await x.prepare(),
    s = await x.admit(p.input),
    e = s.epoch,
    c = e.preparation.context.candidate;
  const context = {
    v: 1,
    pin: x.authority.pin,
    accountId: e.accountId,
    principalId: e.principalId,
    workspaceId: e.workspaceId,
    lineageId: e.lineageId,
    epoch: 2,
    head: s.head,
    certifiedSetDigest: e.certified.digest,
    recoveryStateDigest: e.certified.value.recoveryStateDigest,
    existing: e.certified.value.members[0],
    candidate: { id: c.credentialId, wPub: c.wPub, sPub: c.sPub },
    attemptId: 'a1'.repeat(32),
    createdAt: 1000,
    expiresAt: 601000,
  };
  const keys = { existing: x.s.privateKey, new: p.entry.key },
    nonces = { existing: 'a2'.repeat(32), new: 'a3'.repeat(32) };
  const sign = (label, body, role) => ({
    ...body,
    signature: signed(keys[role], message(label, body)),
  });
  const commits = Object.fromEntries(
    ['existing', 'new'].map((role) => [
      role,
      sign(
        'done/enrollment-ceremony-commitment/v1',
        {
          v: 1,
          kind: 'ceremony-commitment',
          context,
          role,
          commitment: commitment(role, nonces[role]),
        },
        role,
      ),
    ]),
  );
  const contextHash = hash(message('done/enrollment-ceremony-context/v1', context));
  const reveals = Object.fromEntries(
    ['existing', 'new'].map((role) => [
      role,
      sign(
        'done/enrollment-ceremony-reveal/v1',
        {
          v: 1,
          kind: 'ceremony-reveal',
          contextHash,
          role,
          existingCommitHash: hash(JSON.stringify(commits.existing)),
          newCommitHash: hash(JSON.stringify(commits.new)),
          nonce: nonces[role],
        },
        role,
      ),
    ]),
  );
  const request = (role, action, payload = null) =>
    sign(
      'done/enrollment-ceremony-relay/v1',
      {
        v: 1,
        kind: 'ceremony-relay',
        workspaceId: x.workspace,
        credentialId: role === 'existing' ? context.existing.id : context.candidate.id,
        action,
        payload,
      },
      role,
    );
  const call = (r) => x.authority.owner.relayCeremony(x.f.core, r);
  const open = derive({
    workspaceId: x.workspace,
    epoch: 2,
    head: s.head,
    existingCredentialId: context.existing.id,
    newCredentialId: context.candidate.id,
    wPub: c.wPub,
    sPub: c.sPub,
    recoveryStateDigest: context.recoveryStateDigest,
    nonceExisting: nonces.existing,
    nonceNew: nonces.new,
  });
  return { ...x, request, call, commits, reveals, contextHash, open };
}
test('development relay saves the signed pair before a reveal, survives lost acknowledgement, and never resets the decision', async (t) => {
  let lose = false;
  const x = await setup(t, {
    now: () => 1000,
    hook(at, op) {
      if (lose && op === 'content-ceremony' && at === 'after-commit') {
        lose = false;
        throw Error('lost response');
      }
    },
  });
  assert.equal((await x.call(x.request('new', 'commit', x.commits.new))).ok, false);
  assert.equal((await x.call(x.request('existing', 'commit', x.commits.existing))).ok, true);
  assert.equal(
    (await x.call(x.request('existing', 'reveal', x.reveals.existing))).refusal,
    'commitments-required',
  );
  await x.call(x.request('new', 'commit', x.commits.new));
  await x.call(x.request('existing', 'reveal', x.reveals.existing));
  await x.call(x.request('new', 'reveal', x.reveals.new));
  const request = x.request('existing', 'decide', {
    contextHash: x.contextHash,
    transcriptHash: x.open.transcriptHash,
    outcome: 'approved',
  });
  lose = true;
  assert.equal((await x.call(request)).ok, false);
  x.f.restart();
  assert.equal((await x.call(request)).stage, 'approved');
  assert.equal(
    (await x.call(x.request('existing', 'decide', { ...request.payload, outcome: 'mismatch' }))).ok,
    false,
  );
  assert.equal(x.f.rows('content_ceremonies').length, 1);
  assert.equal((await x.call(x.request('new', 'read'))).decision.signature, request.signature);
});
test('device proofs, final authority comparison and expiry guard the real service transaction', async (t) => {
  let action,
    now = 1000;
  const x = await setup(t, {
    now: () => now,
    hook(at, op) {
      if (op === 'content-ceremony') action?.(at);
    },
  });
  const good = x.request('existing', 'commit', x.commits.existing);
  assert.equal((await x.call({ ...good, signature: '00'.repeat(64) })).ok, false);
  action = (at) => {
    if (at === 'after-verify') mutate(x, (db) => db.exec("UPDATE accounts SET state='pending'"));
  };
  assert.equal((await x.call(good)).ok, false);
  assert.equal(x.f.rows('content_ceremonies').length, 0);
  mutate(x, (db) => db.exec("UPDATE accounts SET state='active'"));
  action = (at) => {
    if (at === 'before-commit') now = 601000;
  };
  assert.equal((await x.call(good)).ok, false);
  assert.equal(x.f.rows('content_ceremonies').length, 0);
  action = null;
  now = 1000;
  assert.equal((await x.call(good)).ok, true);
  now = 601000;
  assert.equal((await x.call(x.request('new', 'read'))).stage, 'expired');
  assert.equal((await x.call(x.request('new', 'commit', x.commits.new))).ok, false);
});
test('reservation is atomic on abort and concurrent distinct attempts cannot overwrite the winner', async (t) => {
  let abort = true;
  const x = await setup(t, {
    now: () => 1000,
    hook(at, op) {
      if (abort && op === 'content-ceremony' && at === 'before-commit') throw Error('abort');
    },
  });
  const a = x.request('existing', 'commit', x.commits.existing);
  assert.equal((await x.call(a)).ok, false);
  assert.equal(x.f.rows('content_ceremonies').length, 0);
  abort = false;
  const body = {
    ...x.commits.existing,
    context: { ...x.commits.existing.context, attemptId: 'bb'.repeat(32) },
  };
  delete body.signature;
  const alternate = {
    ...body,
    signature: signed(x.s.privateKey, message('done/enrollment-ceremony-commitment/v1', body)),
  };
  const result = await Promise.all([x.call(a), x.call(x.request('existing', 'commit', alternate))]);
  assert.equal(result.filter((r) => r.ok).length, 1);
  assert.equal(x.f.rows('content_ceremonies').length, 1);
});

test('schema seven requires explicit upgrade; the new table does not replace account state', async (t) => {
  const x = await ready(t);
  const before = x.f.rows('accounts');
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(x.f.path);
  db.exec('DROP TABLE content_ceremonies; PRAGMA user_version=7;');
  db.close();
  const { AccountCore } = await import('../../account-service/core.ts');
  const policy = { origin: x.authority.pin.origin, rpId: x.authority.pin.rpId };
  assert.throws(() => new AccountCore(x.f.path, policy), /explicit offline upgrade/);
  const next = new AccountCore(x.f.path, policy, { upgradeFromV7: true });
  next.close();
  x.f.restart();
  assert.deepEqual(x.f.rows('accounts'), before);
  assert.deepEqual(x.f.rows('content_ceremonies'), []);
});

test('historical bootstrap needs an existing-device invitation and binds the fresh request nonce', async (t) => {
  const x = await ready(t),
    nonce = 'c1'.repeat(32);
  const body = {
    v: 1,
    workspaceId: x.workspace,
    credentialId: x.credential,
    nonce: 'c2'.repeat(32),
  };
  const invitation = {
    ...body,
    signature: signed(x.s.privateKey, message('done/enrollment-ceremony-invitation/v1', body)),
  };
  await assert.rejects(
    x.authority.owner.ceremonyBootstrap(x.f.core, { workspaceId: x.workspace, nonce }),
  );
  await assert.rejects(
    x.authority.owner.ceremonyBootstrap(x.f.core, {
      workspaceId: x.workspace,
      nonce,
      invitation: { ...invitation, signature: '00'.repeat(64) },
    }),
  );
  const result = await x.authority.owner.ceremonyBootstrap(x.f.core, {
    workspaceId: x.workspace,
    nonce,
    invitation,
  });
  assert.equal(result.nonce, nonce);
  assert.equal(result.base.request.candidate.workspaceId, x.workspace);
  const { verifySignature } = await import('../../account-protocol/admission.ts');
  const { signature, ...unsigned } = result;
  await verifySignature(
    x.authority.pin.authRoot,
    signature,
    new Uint8Array(message('done/enrollment-ceremony-bootstrap/v1', unsigned)),
  );
});
