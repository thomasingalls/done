import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { AccountCore } from '../../account-service/core.ts';
import {
  SESSION_ACCESS_MS,
  SESSION_LIFETIME_MS,
  SESSION_RETRY_MS,
} from '../../account-protocol/session.ts';
import { fixture, finishRequest } from '../account-core/fixtures.mjs';
import { ready, config, policy, fresh, registered, renewal, revocation } from './fixtures.mjs';

for (const alg of [-8, -7])
  test(`fresh ${alg} login remembers one exact outcome across restart; secrets stay sealed`, async (t) => {
    const x = await ready(t, { alg }),
      a = x.begin();
    assert.deepEqual(x.sessions.begin({ retryKey: a.retryKey, accountId: a.accountId }), a.view);
    const [r, duplicate] = await Promise.all([
      x.sessions.finish(a.proof),
      x.sessions.finish(a.proof),
    ]);
    assert.equal(r.stage, 'issued', JSON.stringify(r));
    assert.deepEqual(duplicate, r);
    assert.equal(r.accountId, a.accountId);
    assert.equal(r.expiresAt - r.issuedAt, SESSION_LIFETIME_MS);
    assert.equal(x.f.rows('network_sessions').length, 1);
    const access = x.sessions.renew(renewal(r));
    assert.equal(access.stage, 'access');
    assert.equal(access.expiresAt, r.issuedAt + SESSION_ACCESS_MS);
    const persisted = JSON.stringify([
      x.f.rows('network_sessions'),
      x.f.rows('session_attempts'),
      x.f.rows('session_custody'),
    ]);
    for (const secret of [r.renewalToken, r.revokeToken, a.retryKey, access.accessToken])
      assert(!persisted.includes(secret));
    x.f.restart();
    assert.deepEqual(await x.sessions.finish(a.proof), r);
    assert.equal(
      x.sessions.withAccess(access.accessToken, a.accountId, () => true).refusal,
      'access-required',
    );
    assert.equal(x.sessions.renew(renewal(r)).stage, 'access');
    assert.equal(
      x.sessions.begin({ retryKey: a.retryKey, accountId: a.accountId }).refusal,
      'retry-unavailable',
    );
    assert.equal(
      (
        await x.sessions.finish({
          ...a.proof,
          response: x.account.key.assert(a.view, { count: 4 }),
        })
      ).refusal,
      'proof-conflict',
    );
    assert.equal(x.sessions.acknowledge(renewal(r)).stage, 'acknowledged');
    assert.equal(x.sessions.acknowledge(renewal(r)).stage, 'acknowledged');
    assert.equal(x.f.rows('network_sessions')[0].result_seal, null);
    x.f.restart();
    assert.equal((await x.sessions.finish(a.proof)).refusal, 'retry-unavailable');
    assert.equal(x.sessions.renew(renewal(r)).stage, 'access');
  });

test('absolute session lifetime never slides; final access is capped and expiry is sticky', async (t) => {
  const x = await ready(t),
    a = x.begin(),
    r = await x.sessions.finish(a.proof);
  x.setTime(r.issuedAt + SESSION_RETRY_MS);
  assert.equal((await x.sessions.finish(a.proof)).refusal, 'retry-unavailable');
  const midway = x.sessions.renew(renewal(r));
  assert.equal(midway.stage, 'access');
  assert.equal(x.f.rows('network_sessions')[0].result_seal, null);
  x.setTime(r.expiresAt - 1);
  const last = x.sessions.renew(renewal(r));
  assert.equal(last.expiresAt, r.expiresAt);
  assert.equal(x.f.rows('network_sessions')[0].expires_at, r.expiresAt);
  x.setTime(r.expiresAt);
  assert.equal(x.sessions.renew(renewal(r)).refusal, 'sign-in-required');
  x.setTime(r.issuedAt);
  x.f.restart();
  assert.equal(x.sessions.renew(renewal(r)).refusal, 'sign-in-required');
  assert.equal((await x.sessions.finish(a.proof)).refusal, 'sign-in-required');
});

test('old online receipts, offline proofs, wrong accounts and missing retry possession cannot mint sessions', async (t) => {
  const x = await ready(t),
    a = x.begin(),
    other = await registered(x.f);
  x.f.seedActive(other.result.accountId);
  const oldKey = fresh(),
    old = x.f.core.begin({ operation: 'authenticate', retryKey: oldKey });
  const receipt = await x.f.core.finish(finishRequest(old, oldKey, x.account.key.assert(old)));
  assert.equal(receipt.stage, 'account-proof');
  const bodies = [
    receipt,
    x.account.key.assert(old),
    other.key.assert(a.view),
    x.account.key.assert({ options: { challenge: fresh() } }),
    x.account.key.assert(a.view, { client: { origin: 'https://wrong.invalid' } }),
    x.account.key.assert(a.view, { userHandle: other.result.accountId }),
    x.account.key.assert(a.view, { flags: 1 }),
  ];
  for (const response of bodies)
    assert.equal((await x.sessions.finish({ ...a.proof, response })).refusal, 'invalid-proof');
  assert.equal(
    (await x.sessions.finish({ ...a.proof, retryKey: fresh() })).refusal,
    'unknown-attempt',
  );
  assert.equal(
    (await x.sessions.finish({ ...a.proof, attemptId: fresh() })).refusal,
    'unknown-attempt',
  );
  assert.equal(
    x.sessions.begin({ accountId: other.result.accountId, retryKey: a.retryKey }).refusal,
    'request-conflict',
  );
  assert.equal(x.f.rows('network_sessions').length, 0);
  assert.equal((await x.sessions.finish(a.proof)).stage, 'issued');
});

for (const change of ['cancel', 'account', 'key', 'expiry', 'close'])
  test(`a ${change} during assertion verification prevents issuance`, async (t) => {
    let armed = false,
      x,
      a;
    x = await ready(t, {
      hook(point, op) {
        if (!armed || point !== 'after-verify' || op !== 'session-finish') return;
        armed = false;
        if (change === 'cancel')
          x.sessions.cancel({ retryKey: a.retryKey, attemptId: a.view.attemptId });
        if (change === 'expiry') x.setTime(a.view.expiresAt);
        if (change === 'close') x.sessions.close();
        if (change === 'account') x.mutate((db) => db.exec("UPDATE accounts SET state='pending'"));
        if (change === 'key') x.mutate((db) => db.exec("UPDATE credentials SET spki='changed'"));
      },
    });
    a = x.begin();
    armed = true;
    assert.equal((await x.sessions.finish(a.proof)).ok, false);
    assert.equal(x.f.rows('network_sessions').length, 0);
  });

test('caller mutation after finish starts cannot switch the account or reply', async (t) => {
  const x = await ready(t),
    a = x.begin(),
    request = structuredClone(a.proof);
  const pending = x.sessions.finish(request);
  request.response.id = fresh();
  request.retryKey = fresh();
  const r = await pending;
  assert.equal(r.stage, 'issued');
  assert.equal(r.accountId, a.accountId);
  assert.deepEqual(await x.sessions.finish(a.proof), r);
});

test('revoke-only credentials cannot renew; revocation is idempotent, isolated, and survives restart', async (t) => {
  const x = await ready(t),
    a = x.begin(),
    r = await x.sessions.finish(a.proof);
  const other = await registered(x.f);
  x.f.seedActive(other.result.accountId);
  const b = x.begin(other),
    s = await x.sessions.finish(b.proof),
    second = x.sessions.renew(renewal(s));
  const access = x.sessions.renew(renewal(r));
  assert.equal(
    x.sessions.renew({ sessionId: r.sessionId, renewalToken: r.revokeToken }).refusal,
    'sign-in-required',
  );
  assert.equal(
    x.sessions.revoke({ sessionId: r.sessionId, revokeToken: r.renewalToken }).refusal,
    'invalid-proof',
  );
  assert.equal(
    x.sessions.withAccess(access.accessToken, s.accountId, () =>
      assert.fail('wrong account callback'),
    ).refusal,
    'wrong-account',
  );
  const observe = () =>
    x.sessions.withAccess(access.accessToken, r.accountId, (identity) => identity.accountId);
  assert.equal(observe(), r.accountId);
  // Represents asynchronous domain verification: the actual commit rechecks access after revocation.
  const inFlight = Promise.resolve().then(observe);
  assert.equal(x.sessions.revoke(revocation(r)).stage, 'revoked');
  assert.equal((await inFlight).ok, false);
  assert.equal(x.sessions.revoke(revocation(r)).stage, 'revoked');
  assert.equal(
    x.sessions.withAccess(second.accessToken, s.accountId, (identity) => identity.accountId),
    s.accountId,
  );
  assert.equal(x.sessions.renew(renewal(r)).refusal, 'sign-in-required');
  x.f.restart();
  assert.equal((await x.sessions.finish(a.proof)).refusal, 'sign-in-required');
  assert.equal(x.sessions.revoke(revocation(r)).stage, 'revoked');
  assert.equal(x.sessions.renew(renewal(s)).stage, 'access');
  assert.equal(
    x.f.rows('credentials').every((c) => c.state === 'confirmed'),
    true,
  );
  assert.equal(
    x.f.rows('accounts').every((c) => c.state === 'active'),
    true,
  );
});

test('revocation from another service owner is checked even when access is still in memory', async (t) => {
  const x = await ready(t),
    a = x.begin(),
    r = await x.sessions.finish(a.proof),
    access = x.sessions.renew(renewal(r));
  const other = new AccountCore(x.f.path, policy, { sessions: x.config, now: () => 1000 });
  try {
    assert.equal(other.sessions.revoke(revocation(r)).stage, 'revoked');
  } finally {
    other.close();
  }
  assert.equal(
    x.sessions.withAccess(access.accessToken, r.accountId, () => assert.fail('revoked callback'))
      .refusal,
    'sign-in-required',
  );
});

test('cancelling before or after issuance retires the same attempt and cannot revive it', async (t) => {
  const x = await ready(t),
    a = x.begin();
  const cancel = { retryKey: a.retryKey, attemptId: a.view.attemptId };
  assert.equal(x.sessions.cancel(cancel).stage, 'cancelled');
  assert.equal((await x.sessions.finish(a.proof)).refusal, 'cancelled');
  const b = x.begin(),
    r = await x.sessions.finish(b.proof);
  assert.equal(
    x.sessions.cancel({ retryKey: b.retryKey, attemptId: b.view.attemptId }).stage,
    'cancelled',
  );
  x.f.restart();
  assert.equal((await x.sessions.finish(b.proof)).refusal, 'cancelled');
  assert.equal(x.sessions.renew(renewal(r)).refusal, 'sign-in-required');
});

test('tampered issuance seal is refused without replacing credentials; changed key/pin cannot open', async (t) => {
  const x = await ready(t),
    a = x.begin(),
    r = await x.sessions.finish(a.proof),
    saved = x.f.rows('network_sessions')[0];
  x.mutate((db) =>
    db
      .prepare('UPDATE network_sessions SET result_seal=?')
      .run(saved.result_seal.replace(/bytes":"./, 'bytes":"!')),
  );
  assert.equal((await x.sessions.finish(a.proof)).refusal, 'storage-unavailable');
  assert.equal(x.f.rows('network_sessions')[0].renewal_hash, saved.renewal_hash);
  assert.equal(x.sessions.renew(renewal(r)).stage, 'access');
  for (const sessions of [
    { ...x.config, operatorKey: new Uint8Array(32) },
    { ...x.config, pin: { ...x.config.pin, serviceId: 'ef'.repeat(16) } },
  ])
    assert.throws(() => new AccountCore(x.f.path, policy, { sessions }), /changed/);
});

test('issuance abort burns its reserved nonce; after-commit loss returns the exact durable result', async (t) => {
  let fault = '',
    x;
  x = await ready(t, {
    hook(point, op) {
      if (op === 'session-finish' && point === fault) {
        fault = '';
        throw Error('cut');
      }
    },
  });
  const a = x.begin();
  fault = 'before-commit';
  assert.equal((await x.sessions.finish(a.proof)).refusal, 'storage-unavailable');
  assert.equal(x.f.rows('network_sessions').length, 0);
  assert.equal(x.f.rows('session_custody')[0].seal_counter, 1);
  x.f.restart();
  fault = 'after-commit';
  assert.equal((await x.sessions.finish(a.proof)).refusal, 'storage-unavailable');
  const sealed = JSON.parse(x.f.rows('network_sessions')[0].result_seal);
  assert.equal(sealed.counter, 2);
  const r = await x.sessions.finish(a.proof);
  x.f.restart();
  assert.deepEqual(await x.sessions.finish(a.proof), r);
  assert.equal(x.f.rows('session_custody')[0].seal_counter, 2);
});

test('session schema is opt-in, upgrade is explicit and old adapters refuse the upgraded database', async (t) => {
  const f = fixture(t),
    sessions = config();
  assert.throws(() => f.core.sessions, /not configured/);
  assert.throws(() => new AccountCore(f.path, policy, { sessions }), /explicit offline upgrade/);
  let db = new DatabaseSync(f.path);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 11);
  db.close();
  const upgraded = new AccountCore(f.path, policy, { sessions, upgradeFromV11: true });
  upgraded.close();
  db = new DatabaseSync(f.path);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 14);
  db.close();
  assert.throws(() => new AccountCore(f.path, policy), /Unsupported account schema/);
  const reopened = new AccountCore(f.path, policy, { sessions });
  reopened.close();
});

test('schema 12 requires explicit combined-challenge upgrade and keeps the original login attempt', async (t) => {
  const x = await ready(t),
    a = x.begin();
  x.mutate((db) =>
    db.exec(
      'DROP TABLE enrollment_session_links; ALTER TABLE session_attempts DROP COLUMN purpose; ALTER TABLE session_attempts DROP COLUMN unlock_context; PRAGMA user_version=12;',
    ),
  );
  assert.throws(
    () => new AccountCore(x.f.path, policy, { sessions: x.config }),
    /explicit offline upgrade/,
  );
  const upgraded = new AccountCore(x.f.path, policy, {
    sessions: x.config,
    upgradeFromV12: true,
    now: () => 1000,
  });
  try {
    assert.deepEqual(
      upgraded.sessions.begin({ accountId: a.accountId, retryKey: a.retryKey }),
      a.view,
    );
    assert.equal((await upgraded.sessions.finish(a.proof)).stage, 'issued');
  } finally {
    upgraded.close();
  }
  x.f.restart();
});

test('counter exhaustion cannot write a session seal', async (t) => {
  const x = await ready(t),
    a = x.begin(),
    r = await x.sessions.finish(a.proof);
  assert.equal(x.sessions.renew(renewal(r)).stage, 'access');
  x.mutate((db) => db.exec('UPDATE session_custody SET seal_counter=4294967295'));
  const b = x.begin();
  assert.equal((await x.sessions.finish(b.proof)).refusal, 'capacity');
  assert.equal(x.f.rows('network_sessions').length, 1);
});

test('the guarded operation and its writes are one transaction; async callbacks are refused', async (t) => {
  const x = await ready(t),
    a = x.begin(),
    r = await x.sessions.finish(a.proof),
    access = x.sessions.renew(renewal(r));
  x.mutate((db) => db.exec('CREATE TABLE guarded_work (value TEXT)'));
  const write = (identity, db) => {
    db.prepare('INSERT INTO guarded_work VALUES (?)').run(identity.sessionId);
    return { ok: true };
  };
  assert.deepEqual(x.sessions.withAccess(access.accessToken, r.accountId, write), { ok: true });
  const aborted = x.sessions.withAccess(access.accessToken, r.accountId, (identity, db) => {
    write(identity, db);
    throw Error('abort');
  });
  assert.equal(aborted.refusal, 'storage-unavailable');
  assert.equal(
    x.sessions.withAccess(access.accessToken, r.accountId, async () => true).refusal,
    'storage-unavailable',
  );
  x.sessions.revoke(revocation(r));
  assert.equal(x.sessions.withAccess(access.accessToken, r.accountId, write).ok, false);
  assert.equal(x.f.rows('guarded_work').length, 1);
});

test('idle maintenance retires retry ciphertext and expired rows without reviving an old proof', async (t) => {
  const x = await ready(t),
    a = x.begin(),
    r = await x.sessions.finish(a.proof);
  x.setTime(r.issuedAt + SESSION_RETRY_MS);
  assert.deepEqual(x.sessions.sweep(), { ok: true });
  assert.equal(x.f.rows('network_sessions')[0].result_seal, null);
  assert.equal((await x.sessions.finish(a.proof)).refusal, 'retry-unavailable');
  x.setTime(r.expiresAt + SESSION_RETRY_MS);
  x.sessions.sweep();
  assert.equal(x.f.rows('network_sessions').length, 0);
  assert.equal(x.f.rows('session_attempts').length, 0);
  assert.equal(x.sessions.revoke(revocation(r)).stage, 'revoked');
  const next = x.sessions.begin({ accountId: a.accountId, retryKey: a.retryKey });
  assert.notEqual(next.options.challenge, a.view.options.challenge);
  assert.equal(
    (await x.sessions.finish({ ...a.proof, attemptId: next.attemptId })).refusal,
    'invalid-proof',
  );
});

test('missing retained custody fails closed; nested work cannot roll back an outer transaction', async (t) => {
  const x = await ready(t),
    a = x.begin(),
    r = await x.sessions.finish(a.proof),
    access = x.sessions.renew(renewal(r));
  x.mutate((db) => db.exec('CREATE TABLE nested_work (value INTEGER)'));
  assert.deepEqual(
    x.sessions.withAccess(access.accessToken, r.accountId, (_identity, db) => {
      db.exec('INSERT INTO nested_work VALUES (1)');
      assert.equal(x.sessions.revoke(revocation(r)).refusal, 'storage-unavailable');
      assert.equal(db.isTransaction, true);
      db.exec('INSERT INTO nested_work VALUES (2)');
      return { ok: true };
    }),
    { ok: true },
  );
  assert.equal(x.f.rows('nested_work').length, 2);
  assert.equal(x.sessions.renew(renewal(r)).stage, 'access');
  x.mutate((db) => db.exec('DELETE FROM session_custody'));
  assert.throws(
    () => new AccountCore(x.f.path, policy, { sessions: x.config }),
    /Missing retained session custody/,
  );
});

test('lost revocation reply is retryable after restart and cannot restore access', async (t) => {
  let armed = false;
  const x = await ready(t, {
    hook(point, op) {
      if (armed && point === 'after-commit' && op === 'session-revoke') {
        armed = false;
        throw Error('lost response');
      }
    },
  });
  const a = x.begin(),
    r = await x.sessions.finish(a.proof);
  armed = true;
  assert.equal(x.sessions.revoke(revocation(r)).refusal, 'storage-unavailable');
  x.f.restart();
  assert.equal(x.sessions.revoke(revocation(r)).stage, 'revoked');
  assert.equal(x.sessions.renew(renewal(r)).refusal, 'sign-in-required');
  assert.equal((await x.sessions.finish(a.proof)).refusal, 'sign-in-required');
});
