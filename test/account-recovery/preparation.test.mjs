import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, createHash, sign } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ready as admitted } from '../account-successor/service-fixtures.mjs';
import { authorityFixture } from '../account-authority/fixtures.mjs';
import { registered, finishRequest } from '../account-core/fixtures.mjs';
import { lp } from '../account-enrollment/fixtures.mjs';
import {
  verifyLostRecoveryPrepared,
  verifyLostRecoveryChallenge,
} from '../../account-protocol/lostDeviceRecovery.ts';
import { createRecoveryBootstrap } from '../../src/account/recoveryBootstrap.ts';
import { verifyRecoveryBootstrap } from '../../account-protocol/recoveryBootstrap.ts';
import { AccountCore } from '../../account-service/core.ts';
const fresh = () => randomBytes(32).toString('base64url');
const hash = (v) => createHash('sha256').update(v).digest();
const mutate = (x, fn) => {
  const db = new DatabaseSync(x.f.path);
  try {
    return fn(db);
  } finally {
    db.close();
  }
};
async function ready(t, options = {}) {
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
  const keys = generateKeyPairSync('ed25519'),
    wrapping = generateKeyPairSync('x25519');
  const pub = (key) => key.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
  const input = {
    retryKey: fresh(),
    candidate: {
      credentialId: randomBytes(16).toString('hex'),
      wPub: pub(wrapping.publicKey),
      sPub: pub(keys.publicKey),
    },
    clientNonce: randomBytes(32).toString('hex'),
  };
  const call = (operation, body) => authority.owner.lostDeviceRecovery(x.f.core, operation, body);
  const begun = await call('begin', input);
  assert.equal(begun.stage, 'challenge', JSON.stringify(begun));
  const nonce = hash(
    lp('done/lost-device-recovery-assertion/v1', JSON.stringify(begun.challenge.context)),
  ).toString('base64url');
  const proof = {
    retryKey: input.retryKey,
    attemptId: begun.challenge.context.attemptId,
    response: x.account.key.assert({ options: { challenge: nonce } }),
    possession: sign(
      null,
      lp('done/lost-device-recovery-possession/v1', JSON.stringify(begun.challenge.context)),
      keys.privateKey,
    ).toString('hex'),
  };
  return {
    ...x,
    input,
    proof,
    begun,
    call,
    keys,
    config,
    setTime: (value) => {
      now = value;
    },
  };
}
const unchanged = (x) =>
  ['accounts', 'promotions', 'delivery_decisions', 'publisher_decisions', 'network_sessions'].map(
    (table) => x.f.rows(table),
  );

test('fresh discoverable passkey + new-key possession yields a code-verifiable first-device recovery preparation, never membership or login', async (t) => {
  const x = await ready(t),
    before = unchanged(x);
  assert.equal('accountId' in x.begun.challenge.context, false);
  await verifyLostRecoveryChallenge(x.begun.challenge, x.input, x.authority.pin);
  const r = await x.call('finish', x.proof);
  assert.equal(r.stage, 'prepared', JSON.stringify(r));
  assert.equal(r.prepared.accountId, x.account.result.accountId);
  assert.equal(r.prepared.head.epoch, 1);
  const checked = await verifyLostRecoveryPrepared(r.prepared, x.input, x.authority.pin);
  const signer = await crypto.subtle.importKey(
    'pkcs8',
    x.keys.privateKey.export({ format: 'der', type: 'pkcs8' }),
    'Ed25519',
    false,
    ['sign'],
  );
  const bootstrap = await createRecoveryBootstrap(checked.context, x.recovery.code, signer);
  await verifyRecoveryBootstrap(bootstrap, checked.context);
  assert.deepEqual(unchanged(x), before);
  assert.equal(JSON.stringify(x.f.rows('lost_device_recovery')).includes(x.recovery.code), false);
});

test('restart retains exact challenge, nonce and prepared bytes; a different assertion cannot reuse the attempt', async (t) => {
  const x = await ready(t);
  x.f.restart();
  x.authority.restart();
  assert.deepEqual(await x.call('begin', x.input), x.begun);
  const r = await x.call('finish', x.proof);
  assert.equal(r.stage, 'prepared', JSON.stringify(r));
  x.f.restart();
  x.authority.restart();
  assert.deepEqual(await x.call('finish', x.proof), r);
  assert.deepEqual(await x.call('resume', { retryKey: x.input.retryKey }), r);
  assert.deepEqual(
    await x.call('begin', {
      ...x.input,
      candidate: { ...x.input.candidate, wPub: '11'.repeat(32) },
    }),
    { ok: false, refusal: 'request-conflict' },
  );
  assert.deepEqual(await x.call('finish', { ...x.proof, possession: '00'.repeat(64) }), {
    ok: false,
    refusal: 'proof-conflict',
  });
});

test('old login, enrollment/creation proofs and substituted candidate possession do not authorize recovery', async (t) => {
  const x = await ready(t),
    retryKey = fresh(),
    login = x.f.core.begin({ operation: 'authenticate', retryKey });
  const response = x.account.key.assert(login);
  assert.equal(
    (await x.f.core.finish(finishRequest(login, retryKey, response))).stage,
    'account-proof',
  );
  for (const changes of [
    { response },
    { response: x.recoveryInput.response },
    { possession: '00'.repeat(64) },
    {
      response: {
        ...x.proof.response,
        response: { ...x.proof.response.response, userHandle: fresh() },
      },
    },
  ])
    assert.deepEqual(await x.call('finish', { ...x.proof, ...changes }), {
      ok: false,
      refusal: 'invalid-proof',
    });
  assert.equal(x.f.rows('lost_device_recovery')[0].state, 'challenge');
});

test('discoverable assertion chooses its own account, never an attacker-supplied workspace; inactive account refuses', async (t) => {
  const x = await ready(t),
    other = await registered(x.f);
  const nonce = hash(
    lp('done/lost-device-recovery-assertion/v1', JSON.stringify(x.begun.challenge.context)),
  ).toString('base64url');
  assert.deepEqual(
    await x.call('finish', {
      ...x.proof,
      response: other.key.assert({ options: { challenge: nonce } }),
    }),
    { ok: false, refusal: 'unavailable' },
  );
  assert.deepEqual(await x.call('begin', { ...x.input, accountId: x.account.result.accountId }), {
    ok: false,
    refusal: 'malformed',
  });
});

for (const point of ['before-commit', 'after-commit'])
  test(`${point} interruption retries without fresh challenge or second preparation`, async (t) => {
    let crash = false;
    const x = await ready(t, {
      hook: (p, op) => {
        if (crash && p === point && op === 'lost-recovery-finish') {
          crash = false;
          throw Error('interrupted');
        }
      },
    });
    crash = true;
    assert.deepEqual(await x.call('finish', x.proof), {
      ok: false,
      refusal: 'storage-unavailable',
    });
    const retained = x.f.rows('lost_device_recovery')[0].result;
    assert.equal(retained !== null, point === 'after-commit');
    x.f.restart();
    x.authority.restart();
    const r = await x.call('finish', x.proof);
    assert.equal(r.stage, 'prepared', JSON.stringify(r));
    if (retained) assert.deepEqual(r.prepared, JSON.parse(retained));
    assert.equal(x.f.rows('lost_device_recovery').length, 1);
  });

test('credential change across verification invalidates finish; counter observations do not', async (t) => {
  let change;
  const x = await ready(t, {
    hook: (p, op) => {
      if (p === 'after-verify' && op === 'lost-recovery-finish') change?.();
    },
  });
  change = () =>
    mutate(x, (db) =>
      db.prepare("UPDATE credentials SET state='staged' WHERE id=?").run(x.account.key.id),
    );
  assert.deepEqual(await x.call('finish', x.proof), { ok: false, refusal: 'state-changed' });
  mutate(x, (db) =>
    db.prepare("UPDATE credentials SET state='confirmed' WHERE id=?").run(x.account.key.id),
  );
  change = () =>
    mutate(x, (db) =>
      db.prepare('UPDATE credentials SET counter=900 WHERE id=?').run(x.account.key.id),
    );
  assert.equal((await x.call('finish', x.proof)).stage, 'prepared');
  mutate(x, (db) =>
    db.prepare("UPDATE accounts SET state='pending' WHERE id=?").run(x.account.result.accountId),
  );
  assert.deepEqual(await x.call('resume', { retryKey: x.input.retryKey }), {
    ok: false,
    refusal: 'state-changed',
  });
});

test('cancel and expiry during verification cannot leak a preparation', async (t) => {
  let advance;
  const x = await ready(t, {
    hook: (p, op) => {
      if (p === 'after-verify' && op === 'lost-recovery-finish') advance?.();
    },
  });
  advance = () => x.setTime(x.begun.challenge.context.expiresAt);
  assert.deepEqual(await x.call('finish', x.proof), { ok: false, refusal: 'expired' });
  assert.equal(x.f.rows('lost_device_recovery')[0].result, null);
  x.setTime(1000);
  advance = undefined;
  await x.call('cancel', { retryKey: x.input.retryKey });
  x.f.restart();
  assert.deepEqual(await x.call('finish', x.proof), { ok: false, refusal: 'cancelled' });
});

test('the offline schema upgrade is explicit and preserves existing rows', async (t) => {
  const x = await ready(t),
    before = unchanged(x);
  mutate(x, (db) =>
    db.exec(
      'DROP TABLE history_checkpoint_records; DROP TABLE history_checkpoint_catalog; DROP TABLE recovery_successors; DROP TABLE lost_device_recovery; PRAGMA user_version=21',
    ),
  );
  assert.throws(
    () =>
      new AccountCore(
        x.f.path,
        { origin: x.authority.pin.origin, rpId: x.authority.pin.rpId },
        x.config,
      ),
    /offline upgrade/,
  );
  const upgraded = new AccountCore(
    x.f.path,
    { origin: x.authority.pin.origin, rpId: x.authority.pin.rpId },
    {
      ...x.config,
      upgradeFromV21: true,
    },
  );
  upgraded.close();
  x.f.restart();
  assert.deepEqual(unchanged(x), before);
  assert.equal(
    mutate(x, (db) => db.prepare('PRAGMA user_version').get().user_version),
    25,
  );
});

test('a competing admission invalidates prepared recovery; a fresh attempt includes the pending second-device history', async (t) => {
  const x = await ready(t);
  const initial = await x.call('finish', x.proof);
  assert.equal(initial.stage, 'prepared');
  const admission = await x.prepare();
  const admitted = await x.admit(admission.input);
  assert.equal(admitted.kind, 'device-admission-successor', JSON.stringify(admitted));
  assert.deepEqual(await x.call('resume', { retryKey: x.input.retryKey }), {
    ok: false,
    refusal: 'state-changed',
  });
  const next = { ...x.input, retryKey: fresh(), clientNonce: randomBytes(32).toString('hex') };
  const challenge = await x.call('begin', next);
  const context = challenge.challenge.context;
  const result = await x.call('finish', {
    retryKey: next.retryKey,
    attemptId: context.attemptId,
    response: x.account.key.assert({
      options: {
        challenge: hash(
          lp('done/lost-device-recovery-assertion/v1', JSON.stringify(context)),
        ).toString('base64url'),
      },
    }),
    possession: sign(
      null,
      lp('done/lost-device-recovery-possession/v1', JSON.stringify(context)),
      x.keys.privateKey,
    ).toString('hex'),
  });
  assert.equal(result.stage, 'prepared', JSON.stringify(result));
  const verified = await verifyLostRecoveryPrepared(result.prepared, next, x.authority.pin);
  assert.equal(verified.history.current.tip, 2);
  assert.equal(verified.context.conflictParent, admitted.head);
  const tampered = structuredClone(result.prepared);
  tampered.proofs = null;
  await assert.rejects(verifyLostRecoveryPrepared(tampered, next, x.authority.pin));
});
