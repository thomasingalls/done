import test from 'node:test';
import assert from 'node:assert/strict';
import { ready, mutate } from '../account-successor/service-fixtures.mjs';
import { message, signed } from './exchange-oracle.mjs';
import { setup } from './development-fixtures.mjs';
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
  db.exec(
    'DROP TABLE publisher_decisions; DROP TABLE publisher_witnesses; DROP TABLE content_checkpoints; DROP TABLE content_transfers; DROP TABLE content_ceremonies; PRAGMA user_version=7;',
  );
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

test('bootstrap retries stay bounded and cannot return authority invalidated during signing', async (t) => {
  const x = await ready(t);
  const body = {
    v: 1,
    workspaceId: x.workspace,
    credentialId: x.credential,
    nonce: 'c2'.repeat(32),
  };
  const input = {
    workspaceId: x.workspace,
    nonce: 'c1'.repeat(32),
    invitation: {
      ...body,
      signature: signed(x.s.privateKey, message('done/enrollment-ceremony-invitation/v1', body)),
    },
  };
  let signedCount = 0;
  const read = (afterSign) =>
    x.authority.owner.ceremonyBootstrap(
      {
        ceremonyBootstrap(input, issuer) {
          return x.f.core.ceremonyBootstrap(input, {
            ...issuer,
            async bootstrap(body) {
              const signature = await issuer.bootstrap(body);
              signedCount++;
              afterSign();
              return signature;
            },
          });
        },
      },
      input,
    );
  // Semantically valid but different retained bytes force every final comparison to fail.
  assert.deepEqual(
    await read(() =>
      mutate(x, (db) => {
        db.exec("UPDATE recovery SET draft=draft || ' '");
      }),
    ),
    { ok: false, refusal: 'state-changed' },
  );
  assert.equal(signedCount, 4);
  signedCount = 0;
  assert.deepEqual(
    await read(() =>
      mutate(x, (db) => {
        db.exec("UPDATE accounts SET state='pending'");
      }),
    ),
    { ok: false, refusal: 'unavailable' },
  );
  assert.equal(signedCount, 1);
});
