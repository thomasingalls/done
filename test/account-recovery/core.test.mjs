import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { AccountCore, CEREMONY_LIFETIME_MS } from '../../account-service/core.ts';
import { confirmRecovery, generateRecovery } from '../../src/account/recovery.ts';
import { scope, prepared, fixture, registered, fresh } from './fixtures.mjs';
import { policy, finishRequest, authenticator } from '../account-core/fixtures.mjs';

for (const alg of [-8, -7])
  test(`both proofs finalize one exact recovery preparation (${alg})`, async (t) => {
    const { f, account, input, view, proof, generated } = await prepared(t, {}, alg);
    assert.deepEqual(await f.core.beginRecovery(input), view);
    const results = await Promise.all(
      Array.from({ length: 4 }, () => f.core.finishRecovery(proof)),
    );
    assert.equal(results[0].stage, 'recovery-confirmed');
    results.forEach((value) => assert.deepEqual(value, results[0]));
    f.restart();
    assert.deepEqual(f.core.resumeRecovery({ retryKey: account.retryKey }), results[0]);
    assert.deepEqual(await f.core.finishRecovery(proof), results[0]);
    assert.equal(
      (await f.core.finishRecovery({ ...proof, recoveryProof: '00'.repeat(64) })).refusal,
      'proof-conflict',
    );
    assert.equal(
      (
        await f.core.beginRecovery({
          ...input,
          draft: { ...generated.draft, principalId: 'different' },
        })
      ).refusal,
      'recovery-conflict',
    );
    assert.equal(f.rows('accounts')[0].state, 'pending');
    const login = f.core.begin({ operation: 'authenticate', retryKey: fresh() });
    const retryKey = fresh(),
      signin = f.core.begin({ operation: 'authenticate', retryKey });
    assert.equal(login.stage, 'ceremony');
    assert.equal(
      (await f.core.finish(finishRequest(signin, retryKey, account.key.assert(signin)))).refusal,
      'account-not-active',
    );
    assert(!JSON.stringify(f.rows('recovery')).includes(generated.code));
  });

test('wrong code, binding and substituted private keys cannot confirm', async (t) => {
  const { f, generated, view, proof, account } = await prepared(t);
  await assert.rejects(
    confirmRecovery(generated.draft, 'Z'.repeat(25), view.options.challenge, view.draftDigest),
  );
  const attacker = await generateRecovery(scope);
  for (const recoveryProof of [
    '00'.repeat(64),
    await confirmRecovery(
      attacker.draft,
      attacker.code,
      view.options.challenge,
      await (await import('../../account-protocol/recovery.ts')).draftDigest(attacker.draft),
    ),
  ]) {
    assert.equal(
      (await f.core.finishRecovery({ ...proof, recoveryProof })).refusal,
      'invalid-proof',
    );
  }
  const foreign = authenticator();
  assert.equal(
    (
      await f.core.finishRecovery({
        ...proof,
        response: account.key.assert(view, { privateKey: foreign.pair.privateKey }),
      })
    ).refusal,
    'invalid-proof',
  );
  assert.equal(
    (await f.core.finishRecovery({ ...proof, response: account.key.assert(account.confirmation) }))
      .refusal,
    'invalid-proof',
  );
  assert.equal(f.rows('recovery')[0].state, 'open');
  assert.equal((await f.core.finishRecovery(proof)).stage, 'recovery-confirmed');
});

test('unconfirmed registration, another attempt, malformed draft and extra authority fields refuse', async (t) => {
  const f = fixture(t),
    retryKey = fresh();
  f.core.begin({ operation: 'register', retryKey });
  const { draft } = await generateRecovery(scope);
  assert.equal((await f.core.beginRecovery({ retryKey, draft })).refusal, 'account-not-pending');
  const a = await registered(f),
    b = await registered(f);
  const view = await f.core.beginRecovery({ retryKey: a.retryKey, draft });
  assert.equal(
    (
      await f.core.finishRecovery({
        retryKey: b.retryKey,
        recoveryId: view.recoveryId,
        response: {},
        recoveryProof: '00'.repeat(64),
      })
    ).refusal,
    'unknown-attempt',
  );
  for (const bad of [
    { ...draft, rootCommitment: '00'.repeat(32) },
    { ...draft, envelope: { ...draft.envelope, ct: 'ab'.repeat(48) } },
    { ...draft, accountId: b.result.accountId },
  ]) {
    assert.equal(
      (await f.core.beginRecovery({ retryKey: b.retryKey, draft: bad })).refusal,
      'malformed',
    );
  }
});

for (const change of ['cancel', 'expiry', 'activation', 'key'])
  test(`finalization rechecks ${change} after verification`, async (t) => {
    let armed = false,
      now = 1000,
      f,
      retryKey;
    const item = await prepared(t, {
      now: () => now,
      hook(point, operation) {
        if (!armed || point !== 'after-verify' || operation !== 'finalize-recovery') return;
        if (change === 'cancel') f.core.cancelRecovery({ retryKey });
        else if (change === 'expiry') now += CEREMONY_LIFETIME_MS;
        else {
          const db = new DatabaseSync(f.path);
          if (change === 'activation') db.exec("UPDATE accounts SET state='active'");
          else db.exec("UPDATE credentials SET spki='changed'");
          db.close();
        }
      },
    });
    f = item.f;
    retryKey = item.account.retryKey;
    armed = true;
    const result = await f.core.finishRecovery(item.proof);
    assert.equal(result.ok, false);
    assert.equal(f.rows('recovery')[0].result, null);
  });

for (const point of ['before-commit', 'after-commit'])
  test(`finalization ${point} write failure has one retry outcome`, async (t) => {
    let armed = false;
    const { f, proof } = await prepared(t, {
      hook(at, kind) {
        if (armed && at === point && kind === 'finalize-recovery') throw Error('disk failure');
      },
    });
    armed = true;
    assert.equal((await f.core.finishRecovery(proof)).refusal, 'storage-unavailable');
    assert.equal(f.rows('recovery')[0].state, point === 'before-commit' ? 'open' : 'done');
    armed = false;
    f.restart();
    const result = await f.core.finishRecovery(proof);
    assert.equal(result.stage, 'recovery-confirmed');
    assert.deepEqual(await f.core.finishRecovery(proof), result);
  });

test('schema v1 requires an explicit offline additive upgrade and preserves pending registration', async (t) => {
  const f = fixture(t),
    account = await registered(f);
  const db = new DatabaseSync(f.path);
  db.exec(
    'DROP TABLE delivery_decisions; DROP TABLE promotions; DROP TABLE recovery; PRAGMA user_version=1;',
  );
  db.close();
  assert.throws(() => new AccountCore(f.path, policy), /explicit offline upgrade/);
  const upgraded = new AccountCore(f.path, policy, { upgradeFromV1: true });
  assert.deepEqual(upgraded.resume({ retryKey: account.retryKey }), account.result);
  upgraded.close();
  f.restart();
  assert.equal(f.rows('recovery').length, 0);
});
