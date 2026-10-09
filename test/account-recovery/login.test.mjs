import { client } from './source-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, createHash, sign } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ready as admitted } from '../account-successor/service-fixtures.mjs';
import { authorityFixture, policy } from '../account-authority/fixtures.mjs';
import { AccountCore } from '../../account-service/core.ts';
import {
  verifyLostRecoveryChallenge,
  verifyLostRecoveryPrepared,
} from '../../account-protocol/lostDeviceRecovery.ts';
import { verifyBindingProof } from '../../account-protocol/slot.ts';
import { SESSION_LIFETIME_MS } from '../../account-protocol/session.ts';
import { lp } from '../account-enrollment/fixtures.mjs';
const fresh = () => randomBytes(32).toString('base64url');
const hash = (v) => createHash('sha256').update(v).digest();
async function setup(t, options = {}) {
  const authority = authorityFixture(t);
  let now = 1000;
  const config = {
    authority,
    sessions: { pin: authority.pin, operatorKey: authority.key },
    membershipContinuation: true,
    now: () => now,
    ...options,
  };
  const x = await admitted(t, config);
  const signing = generateKeyPairSync('ed25519'),
    wrapping = generateKeyPairSync('x25519');
  const pub = (k) => k.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
  const input = {
    retryKey: fresh(),
    candidate: {
      credentialId: randomBytes(16).toString('hex'),
      wPub: pub(wrapping.publicKey),
      sPub: pub(signing.publicKey),
    },
    clientNonce: randomBytes(32).toString('hex'),
    login: true,
  };
  const call = (op, body) => authority.owner.lostDeviceRecovery(x.f.core, op, body);
  const begun = await call('begin', input);
  assert.equal(begun.stage, 'challenge', JSON.stringify(begun));
  const context = begun.challenge.context;
  const prove = (domain = 'done/recovery-and-session-assertion/v1', edits = {}) => ({
    retryKey: input.retryKey,
    attemptId: context.attemptId,
    response: x.account.key.assert(
      { options: { challenge: hash(lp(domain, JSON.stringify(context))).toString('base64url') } },
      edits,
    ),
    possession: sign(
      null,
      lp('done/lost-device-recovery-possession/v1', JSON.stringify(context)),
      signing.privateKey,
    ).toString('hex'),
  });
  const proof = prove();
  return {
    ...x,
    config,
    input,
    context,
    begun,
    call,
    proof,
    prove,
    finish: () => call('finish', proof),
    setTime: (v) => {
      now = v;
    },
  };
}
const mutate = (x, work) => {
  const db = new DatabaseSync(x.f.path);
  try {
    return work(db);
  } finally {
    db.close();
  }
};
const renewal = (s) => ({ sessionId: s.sessionId, renewalToken: s.renewalToken });
for (const alg of [-8, -7])
  test(`combined recovery ${alg}: one fresh assertion retains exact login and verified offline binding through restart`, async (t) => {
    const x = await setup(t, { alg });
    assert.equal(x.context.login.purpose, 'recovery-and-login-v1');
    await verifyLostRecoveryChallenge(x.begun.challenge, x.input, x.authority.pin);
    await assert.rejects(
      verifyLostRecoveryChallenge(
        x.begun.challenge,
        (({ login: _, ...plain }) => plain)(x.input),
        x.authority.pin,
      ),
      /purpose/,
    );
    const [r, duplicate] = await Promise.all([x.finish(), x.finish()]);
    assert.equal(r.stage, 'prepared', JSON.stringify(r));
    assert.deepEqual(duplicate, r);
    assert.equal(r.login.stage, 'issued');
    assert.equal(r.login.expiresAt - r.login.issuedAt, SESSION_LIFETIME_MS);
    const p = await verifyLostRecoveryPrepared(r.prepared, x.input, x.authority.pin);
    const binding = await verifyBindingProof(
      p.prepared.binding,
      p.prepared.base.request,
      p.prepared.base.receipt,
      x.authority.pin,
    );
    assert.equal(binding.stored.binding.credId, x.account.key.id);
    assert.equal(
      binding.stored.binding.publicKey,
      x.account.key.pair.publicKey.export({ format: 'der', type: 'spki' }).toString('hex'),
    );
    assert.equal(x.f.rows('network_sessions').length, 1);
    const raw = JSON.stringify(
      ['lost_device_recovery', 'session_attempts', 'network_sessions'].map((n) => x.f.rows(n)),
    );
    for (const secret of [x.input.retryKey, r.login.renewalToken, r.login.revokeToken])
      assert(!raw.includes(secret));
    x.f.restart();
    x.authority.restart();
    assert.deepEqual(await x.finish(), r);
    assert.equal(x.f.core.sessions.renew(renewal(r.login)).stage, 'access');
    for (const op of ['begin', 'resume']) {
      const view = await x.call(op, op === 'begin' ? x.input : { retryKey: x.input.retryKey });
      assert.equal(view.stage, 'prepared');
      assert.equal(view.login, undefined);
    }
    assert.deepEqual(x.f.core.sessions.acknowledge(renewal(r.login)), {
      ok: true,
      stage: 'acknowledged',
    });
    const acknowledged = await x.finish();
    assert.equal(acknowledged.stage, 'prepared');
    assert.equal(acknowledged.login.refusal, 'retry-unavailable');
    assert.equal(x.f.core.sessions.renew(renewal(r.login)).stage, 'access');
  });
test('narrow recovery purpose, substituted candidate, ordinary login endpoint and altered binding cannot acquire combined authority', async (t) => {
  const x = await setup(t);
  assert.equal(
    (await x.call('finish', x.prove('done/lost-device-recovery-assertion/v1'))).refusal,
    'invalid-proof',
  );
  assert.equal(
    (await x.call('finish', { ...x.proof, possession: '00'.repeat(64) })).refusal,
    'invalid-proof',
  );
  assert.equal(
    (
      await x.f.core.sessions.finish({
        retryKey: x.input.retryKey,
        attemptId: x.context.login.attemptId,
        response: x.proof.response,
      })
    ).refusal,
    'invalid-proof',
  );
  assert.equal(
    x.f.core.sessions.begin({ retryKey: x.input.retryKey, accountId: x.account.result.accountId })
      .refusal,
    'request-conflict',
  );
  assert.equal(x.f.rows('network_sessions').length, 0);
  const r = await x.finish();
  assert.equal(
    (await x.call('finish', { ...x.proof, response: r.prepared })).refusal,
    'proof-conflict',
  );
  const bad = structuredClone(r.prepared);
  bad.binding.stored.binding.publicKey = '302a300506032b6570032100' + '11'.repeat(32);
  await assert.rejects(verifyLostRecoveryPrepared(bad, x.input, x.authority.pin));
  assert.equal(x.f.rows('network_sessions').length, 1);
});
for (const point of ['before-commit', 'after-commit'])
  test(`recovery/login ${point} failure retains one outcome and burns every encryption reservation`, async (t) => {
    let crash = false;
    const x = await setup(t, {
      hook: (p, op) => {
        if (crash && p === point && op === 'lost-recovery-finish') {
          crash = false;
          throw Error('interrupt');
        }
      },
    });
    const before = x.f.rows('session_custody')[0].seal_counter;
    crash = true;
    assert.equal((await x.finish()).refusal, 'storage-unavailable');
    assert.equal(
      x.f.rows('lost_device_recovery')[0].state,
      point === 'before-commit' ? 'challenge' : 'prepared',
    );
    assert.equal(x.f.rows('network_sessions').length, point === 'before-commit' ? 0 : 1);
    assert.equal(x.f.rows('session_custody')[0].seal_counter, before + 1);
    x.f.restart();
    x.authority.restart();
    const r = await x.finish();
    assert.equal(r.login.stage, 'issued', JSON.stringify(r));
    assert.equal(x.f.rows('network_sessions').length, 1);
    assert.equal(
      x.f.rows('session_custody')[0].seal_counter,
      before + (point === 'before-commit' ? 2 : 1),
    );
  });
test('cancellation revokes issued recovery login and expiry never mints a replacement', async (t) => {
  const x = await setup(t),
    r = await x.finish();
  assert.equal((await x.call('cancel', { retryKey: x.input.retryKey })).stage, 'cancelled');
  assert.equal(x.f.core.sessions.renew(renewal(r.login)).refusal, 'sign-in-required');
  assert.equal((await x.finish()).refusal, 'cancelled');
  const y = await setup(t);
  y.setTime(y.context.expiresAt);
  assert.equal((await y.finish()).refusal, 'expired');
  assert.equal(y.f.rows('network_sessions').length, 0);
});
test('expiry at the final recovery/login boundary rolls back both records', async (t) => {
  let armed = false,
    x;
  x = await setup(t, {
    hook: (point, op) => {
      if (armed && point === 'before-commit' && op === 'lost-recovery-finish') {
        armed = false;
        x.setTime(x.context.expiresAt);
      }
    },
  });
  armed = true;
  assert.equal((await x.finish()).ok, false);
  assert.equal(x.f.rows('lost_device_recovery')[0].state, 'challenge');
  assert.equal(x.f.rows('network_sessions').length, 0);
});
for (const fault of ['account', 'credential'])
  test(`recovery/login refuses ${fault} changes after async verification`, async (t) => {
    let armed = false,
      x;
    x = await setup(t, {
      hook: (point, op) => {
        if (armed && point === 'after-verify' && op === 'lost-recovery-finish') {
          armed = false;
          mutate(x, (db) =>
            db.exec(
              fault === 'account'
                ? "UPDATE accounts SET state='pending'"
                : "UPDATE credentials SET state='staged'",
            ),
          );
        }
      },
    });
    armed = true;
    assert.equal((await x.finish()).ok, false);
    assert.equal(x.f.rows('lost_device_recovery')[0].state, 'challenge');
    assert.equal(x.f.rows('network_sessions').length, 0);
  });
test('schema 23 upgrade is explicit and preserves an issued login and its sealed retry', async (t) => {
  const x = await setup(t),
    r = await x.finish();
  // Strip the new-only recovery attempt to emulate the real 23 predecessor; retain an ordinary login.
  const retryKey = fresh(),
    begun = x.f.core.sessions.begin({ retryKey, accountId: x.account.result.accountId });
  const proof = { retryKey, attemptId: begun.attemptId, response: x.account.key.assert(begun) };
  const login = await x.f.core.sessions.finish(proof);
  assert.equal(login.stage, 'issued');
  mutate(x, (db) => {
    db.prepare('DELETE FROM network_sessions WHERE id=?').run(r.login.sessionId);
    db.prepare('DELETE FROM session_attempts WHERE id=?').run(x.context.login.attemptId);
    db.exec(
      'DROP TABLE history_checkpoint_records; DROP TABLE history_checkpoint_discards; DROP TABLE history_checkpoint_catalog; PRAGMA user_version=23',
    );
  });
  assert.throws(() => new AccountCore(x.f.path, policy, x.config), /offline upgrade/);
  const upgraded = new AccountCore(x.f.path, policy, { ...x.config, upgradeFromV23: true });
  try {
    assert.deepEqual(await upgraded.sessions.finish(proof), login);
    assert.equal(upgraded.sessions.renew(renewal(login)).stage, 'access');
  } finally {
    upgraded.close();
  }
  mutate(x, (db) => {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 25);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  });
});

for (const alg of [-8, -7])
  test(`recovery assertion ${alg} is independently checked locally against the signed binding and held nonce`, async (t) => {
    const x = await setup(t, { alg }),
      r = await x.finish(),
      binding = r.prepared.binding;
    const bytes = (s) => new Uint8Array(Buffer.from(s, 'base64url'));
    const a = x.proof.response.response;
    const attempt = {
      binding: binding.stored.binding,
      bindingSignature: new Uint8Array(Buffer.from(binding.stored.bindingSignature, 'hex')),
      authorizationKey: new Uint8Array(Buffer.from(x.authority.pin.authRoot, 'hex')),
      origin: x.authority.pin.origin,
      pin: x.authority.pin,
      nonce: x.input.clientNonce,
      context: x.context,
      assertion: {
        credentialId: x.proof.response.id,
        authenticatorData: bytes(a.authenticatorData),
        clientDataJSON: bytes(a.clientDataJSON),
        signature: bytes(a.signature),
      },
    };
    assert.equal((await client.verifyRecoverySlotUnlock(attempt)).opened, true);
    for (const edit of [
      (a) => {
        a.nonce = '00'.repeat(32);
      },
      (a) => {
        delete a.context.login;
      },
      (a) => {
        a.assertion.signature[0] ^= 1;
      },
      (a) => {
        a.bindingSignature[0] ^= 1;
      },
      (a) => {
        a.assertion.credentialId = fresh();
      },
      (a) => {
        a.origin = 'https://elsewhere.invalid';
      },
    ]) {
      const bad = structuredClone(attempt);
      edit(bad);
      assert.equal((await client.verifyRecoverySlotUnlock(bad)).opened, false);
    }
    const captured = structuredClone(attempt),
      pending = client.verifyRecoverySlotUnlock(captured);
    captured.nonce = '00'.repeat(32);
    captured.assertion.signature.fill(0);
    assert.equal((await pending).opened, true);
  });
