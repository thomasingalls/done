import test from 'node:test';
import assert from 'node:assert/strict';
import { sign, createHash } from 'node:crypto';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { AccountCore } from '../../account-service/core.ts';
import { fresh, lp, ready as enrollment } from '../account-enrollment/fixtures.mjs';
import { policy, authorityFixture } from '../account-authority/fixtures.mjs';
import { renewal, revocation } from './fixtures.mjs';
import { SESSION_RETRY_MS, SESSION_LIFETIME_MS } from '../../account-protocol/session.ts';
import { parseEnrollmentResult, enrollmentNonce } from '../../account-protocol/enrollment.ts';
import { setup } from './enrollment-fixtures.mjs';
const hash = (v) => createHash('sha256').update(v).digest();
for (const alg of [-8, -7])
  test(`one ${alg} assertion commits enrollment plus exactly one remembered login across retry/restart`, async (t) => {
    const x = await setup(t, { alg });
    assert.equal(x.context.login.purpose, 'enrollment-and-login-v1');
    assert.equal(
      await enrollmentNonce(x.context),
      x.proof.response.response.clientDataJSON &&
        JSON.parse(Buffer.from(x.proof.response.response.clientDataJSON, 'base64url')).challenge,
    );
    assert.deepEqual(await x.enroll('begin', x.entry.input), x.begun);
    const [a, b] = await Promise.all([x.finish(), x.finish()]);
    assert.equal(a.stage, 'prepared', JSON.stringify(a));
    assert.equal(a.login.stage, 'issued');
    assert.deepEqual(b, a);
    assert.deepEqual(parseEnrollmentResult(a), a);
    assert.equal(a.login.accountId, x.account.result.accountId);
    assert.equal(a.login.credentialId, x.account.key.id);
    assert.equal(a.login.expiresAt - a.login.issuedAt, SESSION_LIFETIME_MS);
    assert.equal(x.f.rows('network_sessions').length, 1);
    const raw = JSON.stringify(
      ['network_sessions', 'session_attempts', 'enrollment_preparations'].map((n) => x.f.rows(n)),
    );
    for (const secret of [
      a.login.renewalToken,
      a.login.revokeToken,
      x.entry.input.loginRetryKey,
      x.entry.input.retryKey,
    ])
      assert(!raw.includes(secret));
    x.f.restart();
    assert.deepEqual(await x.finish(), a);
    assert.equal(x.f.core.sessions.renew(renewal(a.login)).stage, 'access');
    for (const op of ['begin', 'resume']) {
      const r = await x.enroll(
        op,
        op === 'begin' ? x.entry.input : { retryKey: x.entry.input.retryKey },
      );
      assert.equal(r.stage, 'prepared');
      assert.equal(r.login, undefined);
    }
  });
test('ordinary enrollment purpose, historical receipt, wrong login retry and ordinary session finish cannot issue combined login', async (t) => {
  const x = await setup(t);
  assert.equal(
    (await x.finish(x.prove('done/enrollment-preparation-assertion/v1'))).refusal,
    'invalid-proof',
  );
  assert.equal(
    (await x.finish({ ...x.proof, loginRetryKey: fresh() })).refusal,
    'request-conflict',
  );
  const { loginRetryKey: _key, ...plain } = x.proof;
  assert.equal((await x.finish(plain)).refusal, 'request-conflict');
  assert.equal(
    (
      await x.f.core.sessions.finish({
        retryKey: x.entry.input.loginRetryKey,
        attemptId: x.context.login.attemptId,
        response: x.proof.response,
      })
    ).refusal,
    'invalid-proof',
  );
  assert.equal(
    x.f.core.sessions.begin({
      retryKey: x.entry.input.loginRetryKey,
      accountId: x.context.accountId,
    }).refusal,
    'request-conflict',
  );
  assert.equal(x.f.rows('network_sessions').length, 0);
  const result = await x.finish();
  assert.equal(
    (await x.finish({ ...x.proof, response: result.receipt })).refusal,
    'proof-conflict',
  );
  assert.equal(
    (await x.finish({ ...x.proof, possession: 'aa'.repeat(64) })).refusal,
    'proof-conflict',
  );
});
test('an existing legacy preparation cannot be upgraded into a session using its old proof', async (t) => {
  const x = await setup(t),
    entry = x.candidate(),
    view = await x.enroll('begin', entry.input);
  const context = view.challenge.context;
  const legacy = {
    retryKey: entry.input.retryKey,
    attemptId: context.attemptId,
    response: x.account.key.assert({
      options: {
        challenge: hash(
          lp('done/enrollment-preparation-assertion/v1', JSON.stringify(context)),
        ).toString('base64url'),
      },
    }),
    possession: sign(
      null,
      lp('done/enrollment-preparation-possession/v1', JSON.stringify(context)),
      entry.key,
    ).toString('hex'),
  };
  assert.equal((await x.enroll('finish', legacy)).stage, 'prepared');
  assert.equal(
    (await x.enroll('finish', { ...legacy, loginRetryKey: fresh() })).refusal,
    'request-conflict',
  );
  assert.equal(x.f.rows('network_sessions').length, 0);
});
for (const fault of ['abort', 'cancel-after-verify', 'expire-before-commit', 'capacity'])
  test(`combined ${fault} cannot leave a receipt without its login`, async (t) => {
    let action, x;
    x = await setup(t, {
      hook: (at, op) => {
        if (op === 'enrollment-finish') action?.(at);
      },
    });
    if (fault === 'capacity') {
      const db = new DatabaseSync(x.f.path);
      db.prepare('UPDATE session_custody SET seal_counter=4294967295').run();
      db.close();
    }
    action = (at) => {
      if (fault === 'abort' && at === 'before-commit') throw Error('Injected abort');
      if (fault === 'cancel-after-verify' && at === 'after-verify')
        x.f.core.sessions.cancel({
          retryKey: x.entry.input.loginRetryKey,
          attemptId: x.context.login.attemptId,
        });
      if (fault === 'expire-before-commit' && at === 'before-commit')
        x.setTime(x.context.expiresAt);
    };
    const result = await x.finish();
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(x.f.rows('network_sessions').length, 0);
    assert.equal(x.f.rows('enrollment_preparations')[0].receipt, null);
    if (fault === 'abort') {
      assert.equal(x.f.rows('session_custody')[0].seal_counter, 1);
      action = undefined;
      assert.equal((await x.finish()).login.stage, 'issued');
      assert.equal(x.f.rows('session_custody')[0].seal_counter, 2);
    }
  });
test('account retirement during combined verification grants neither preparation nor login', async (t) => {
  let armed = false,
    x;
  x = await setup(t, {
    hook: (point, op) => {
      if (!armed || point !== 'after-verify' || op !== 'enrollment-finish') return;
      const db = new DatabaseSync(x.f.path);
      db.exec("UPDATE accounts SET state='pending'");
      db.close();
    },
  });
  armed = true;
  const result = await x.finish();
  assert.equal(result.stage, 'stale');
  assert.equal(result.receipt, null);
  assert.equal(x.f.rows('network_sessions').length, 0);
  assert.equal(x.f.rows('enrollment_preparations')[0].receipt, null);
});
test('acknowledged or expired issuance is never reminted; the immutable receipt remains recoverable', async (t) => {
  for (const mode of ['acknowledge', 'expiry', 'revoke', 'cancel']) {
    const x = await setup(t),
      r = await x.finish();
    if (mode === 'acknowledge') x.f.core.sessions.acknowledge(renewal(r.login));
    if (mode === 'expiry') x.setTime(r.login.issuedAt + SESSION_RETRY_MS);
    if (mode === 'revoke') x.f.core.sessions.revoke(revocation(r.login));
    if (mode === 'cancel') await x.enroll('cancel', { retryKey: x.entry.input.retryKey });
    x.f.restart();
    const repeat = await x.finish();
    assert.deepEqual(repeat.receipt, r.receipt);
    assert.equal(repeat.login.ok, false);
    assert.equal(x.f.rows('network_sessions').length, 1);
    assert.equal(x.f.rows('network_sessions')[0].result_seal, null);
  }
});
test('schema 13 requires explicit joint-issuance upgrade; existing session attempts survive', async (t) => {
  const authority = authorityFixture(t),
    config = { pin: authority.pin, operatorKey: authority.key };
  const x = await enrollment(t, { authority, sessions: config, now: () => 1000 });
  const entry = x.candidate(),
    view = await x.enroll('begin', entry.input),
    proof = x.prove(entry, view);
  const retryKey = fresh(),
    login = x.f.core.sessions.begin({ retryKey, accountId: x.account.result.accountId });
  const loginProof = {
    retryKey,
    attemptId: login.attemptId,
    response: x.account.key.assert(login),
  };
  // These are both ordinary attempts: remove only the empty new table and defaulted column.
  const db = new DatabaseSync(x.f.path);
  db.exec(
    'DROP TABLE enrollment_session_links; ALTER TABLE session_attempts DROP COLUMN purpose; PRAGMA user_version=13',
  );
  db.close();
  assert.throws(
    () => new AccountCore(x.f.path, policy, { sessions: config }),
    /explicit offline upgrade/,
  );
  const upgraded = new AccountCore(x.f.path, policy, { sessions: config, upgradeFromV13: true });
  upgraded.close();
  x.f.restart();
  assert.deepEqual(await x.enroll('begin', entry.input), view);
  assert.equal((await x.f.core.sessions.finish(loginProof)).stage, 'issued');
  const prepared = await x.enroll('finish', proof);
  assert.equal(prepared.stage, 'prepared');
  assert.equal(prepared.login, undefined);
});
test('a missing enrollment link cannot convert the combined assertion into an ordinary login', async (t) => {
  const x = await setup(t),
    db = new DatabaseSync(x.f.path);
  db.exec('DELETE FROM enrollment_session_links');
  db.close();
  assert.equal((await x.finish()).ok, false);
  assert.equal(
    (
      await x.f.core.sessions.finish({
        retryKey: x.entry.input.loginRetryKey,
        attemptId: x.context.login.attemptId,
        response: x.proof.response,
      })
    ).refusal,
    'invalid-proof',
  );
  assert.equal(x.f.rows('network_sessions').length, 0);
  assert.equal(x.f.rows('enrollment_preparations')[0].receipt, null);
});
test('combined begin refuses a reused login capability or an unconfigured owner without retaining a partial attempt', async (t) => {
  const x = await setup(t),
    entry = x.candidate();
  const count = x.f.rows('enrollment_preparations').length;
  entry.input.loginRetryKey = x.entry.input.loginRetryKey;
  assert.equal((await x.enroll('begin', entry.input)).refusal, 'login-unavailable');
  assert.equal(x.f.rows('enrollment_preparations').length, count);
  assert.equal(x.f.rows('session_attempts').length, 1);
  const y = await enrollment(t),
    other = y.candidate();
  other.input.loginRetryKey = fresh();
  assert.equal((await y.enroll('begin', other.input)).refusal, 'login-unavailable');
  assert.equal(y.f.rows('enrollment_preparations').length, 0);
});
for (const point of ['before-commit', 'after-commit'])
  test(
    `combined SIGKILL ${point} preserves atomicity and burns the reserved nonce`,
    { timeout: 15000 },
    async (t) => {
      const x = await setup(t),
        child = fork(new URL('./enrollment-worker.mjs', import.meta.url), [], {
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        });
      t.after(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      });
      const ready = once(child, 'message', { signal: AbortSignal.timeout(5000) });
      child.send({
        path: x.f.path,
        authorityPath: x.authority.path,
        pin: x.authority.pin,
        key: x.authority.key.toString('hex'),
        point,
      });
      assert.equal((await ready)[0].ready, true);
      const exit = once(child, 'exit', { signal: AbortSignal.timeout(5000) });
      child.send({ proof: x.proof });
      assert.equal((await exit)[1], 'SIGKILL');
      x.f.restart();
      assert.equal(x.f.rows('network_sessions').length, point === 'after-commit' ? 1 : 0);
      assert.equal(!!x.f.rows('enrollment_preparations')[0].receipt, point === 'after-commit');
      assert.equal(x.f.rows('session_custody')[0].seal_counter, 1);
      const r = await x.finish();
      assert.equal(r.login.stage, 'issued');
      assert.equal(x.f.rows('session_custody')[0].seal_counter, point === 'after-commit' ? 1 : 2);
      x.f.restart();
      assert.deepEqual(await x.finish(), r);
    },
  );
