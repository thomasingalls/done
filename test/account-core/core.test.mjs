import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { AccountCore, CEREMONY_LIFETIME_MS } from '../../account-service/core.ts';
import { authenticator, fixture, fresh, finishRequest, policy, registered } from './fixtures.mjs';

for (const alg of [-8, -7]) {
  test(`registration, confirmation, pending refusal and discoverable sign-in (${alg})`, async (t) => {
    const f = fixture(t),
      item = await registered(f, alg);
    assert.equal(f.rows('accounts')[0].state, 'pending');
    assert.equal(f.rows('credentials')[0].state, 'confirmed');
    const retryKey = fresh(),
      login = f.core.begin({ operation: 'authenticate', retryKey });
    const proof = finishRequest(login, retryKey, item.key.assert(login));
    assert.deepEqual(await f.core.finish(proof), { ok: false, refusal: 'account-not-active' });
    f.seedActive(item.result.accountId); // Fixture-only; the service has no activation method.
    const result = await f.core.finish(proof);
    assert.equal(result.stage, 'account-proof');
    assert.equal(result.accountId, item.result.accountId);
    assert.equal(
      Object.keys(result).sort().join(','),
      'accountId,attemptId,credentialId,ok,receiptId,stage',
    );
    f.restart();
    assert.deepEqual(await f.core.finish(proof), result);
    assert.deepEqual(f.core.resume({ retryKey }), result);
    assert.deepEqual(f.core.cancel({ retryKey }), { ok: false, refusal: 'already-finished' });
  });

  test(`registration policy negatives and attested-key identity (${alg})`, async (t) => {
    const f = fixture(t),
      retryKey = fresh();
    const view = f.core.begin({ operation: 'register', retryKey }),
      key = authenticator(alg);
    const bad = [
      { client: { type: 'webauthn.get' } },
      { client: { challenge: fresh() } },
      { client: { origin: 'https://evil.invalid' } },
      { client: { crossOrigin: true } },
      { client: { crossOrigin: 'false' } },
      { client: { topOrigin: null } },
      { client: { topOrigin: 'http://localhost:4999' } },
      { rpId: 'wrong.invalid' },
      { flags: 0x41 },
      { flags: 0x44 },
      { attestedId: fresh() },
      { fmt: 'packed' },
      { cose: new Map([...key.cose].map(([k, v]) => [k, k === 3 ? -257 : v])) },
      { cose: new Map([...key.cose].map(([k, v]) => [k, k === -1 ? 4 : v])) },
    ];
    for (const edits of bad) {
      assert.deepEqual(
        await f.core.finish(finishRequest(view, retryKey, key.register(view, edits))),
        { ok: false, refusal: 'invalid-proof' },
        JSON.stringify(edits),
      );
      assert.equal(f.rows('credentials').length, 0);
    }
    const response = key.register(view);
    response.response.publicKey = fresh();
    const next = await f.core.finish(finishRequest(view, retryKey, response));
    assert.equal(next.operation, 'confirm-registration');
    assert.equal(
      f.rows('credentials')[0].spki,
      key.pair.publicKey.export({ type: 'spki', format: 'der' }).toString('hex'),
    );
    // A public key in a none attestation has not proved possession yet.
    assert.equal(f.rows('credentials')[0].state, 'staged');
  });

  test(`assertion policy, operation separation, substituted key and exact bytes (${alg})`, async (t) => {
    const f = fixture(t),
      item = await registered(f, alg);
    f.seedActive(item.result.accountId);
    const retryKey = fresh(),
      view = f.core.begin({ operation: 'authenticate', retryKey });
    const other = authenticator(alg);
    const bad = [
      { client: { type: 'webauthn.create' } },
      { client: { origin: 'https://evil.invalid' } },
      { client: { challenge: item.confirmation.options.challenge } },
      { client: { challenge: fresh() } },
      { client: { crossOrigin: true } },
      { client: { topOrigin: '' } },
      { flags: 1 },
      { flags: 4 },
      { rpId: 'other.invalid' },
      { userHandle: fresh() },
      { privateKey: other.pair.privateKey },
    ];
    for (const edits of bad)
      assert.deepEqual(
        await f.core.finish(finishRequest(view, retryKey, item.key.assert(view, edits))),
        { ok: false, refusal: 'invalid-proof' },
      );
    const substituted = item.key.assert(view, { privateKey: other.pair.privateKey });
    substituted.response.publicKey = Buffer.from(
      other.pair.publicKey.export({ type: 'spki', format: 'der' }),
    ).toString('base64url');
    assert.deepEqual(await f.core.finish(finishRequest(view, retryKey, substituted)), {
      ok: false,
      refusal: 'invalid-proof',
    });
    const response = item.key.assert(view, { count: 1 });
    const changed = structuredClone(response);
    const cd = JSON.parse(Buffer.from(changed.response.clientDataJSON, 'base64url'));
    changed.response.clientDataJSON = Buffer.from(JSON.stringify(cd)).toString('base64url');
    assert.deepEqual(await f.core.finish(finishRequest(view, retryKey, changed)), {
      ok: false,
      refusal: 'invalid-proof',
    });
    assert.equal(
      (await f.core.finish(finishRequest(view, retryKey, response))).stage,
      'account-proof',
    );
    const zeroKey = fresh(),
      zero = f.core.begin({ operation: 'authenticate', retryKey: zeroKey });
    assert.equal(
      (await f.core.finish(finishRequest(zero, zeroKey, item.key.assert(zero, { count: 0 }))))
        .stage,
      'account-proof',
    );
  });
}

test('retry secret, operation binding, concurrent proof and conflicting replay', async (t) => {
  const f = fixture(t),
    retryKey = fresh();
  const view = f.core.begin({ operation: 'register', retryKey });
  assert.deepEqual(f.core.begin({ operation: 'register', retryKey }), view);
  assert.deepEqual(f.core.begin({ operation: 'authenticate', retryKey }), {
    ok: false,
    refusal: 'operation-mismatch',
  });
  assert.deepEqual(f.core.begin({ operation: 'slot-unlock', retryKey }), {
    ok: false,
    refusal: 'malformed',
  });
  assert.deepEqual(f.core.begin({ operation: 'register', retryKey, accountId: fresh() }), {
    ok: false,
    refusal: 'malformed',
  });
  const key = authenticator();
  const proof = finishRequest(view, retryKey, key.register(view));
  assert.deepEqual(await f.core.finish({ ...proof, retryKey: fresh() }), {
    ok: false,
    refusal: 'unknown-attempt',
  });
  assert.deepEqual(await f.core.finish({ ...proof, operation: 'authenticate' }), {
    ok: false,
    refusal: 'operation-mismatch',
  });
  const results = await Promise.all([f.core.finish(proof), f.core.finish(proof)]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(f.rows('credentials').length, 1);
  assert.deepEqual(
    await f.core.finish(finishRequest(view, retryKey, authenticator().register(view))),
    { ok: false, refusal: 'proof-conflict' },
  );
  const again = f.core.begin({ operation: 'register', retryKey: fresh() });
  const duplicateKeyProof = finishRequest(again, fresh(), key.register(again));
  // No endpoint accepts the browser's id as another attempt's retry capability.
  assert.equal((await f.core.finish(duplicateKeyProof)).ok, false);
});

test('global credential uniqueness, key possession and account identity', async (t) => {
  const f = fixture(t),
    key = authenticator();
  const r1 = fresh(),
    v1 = f.core.begin({ operation: 'register', retryKey: r1 });
  const next = await f.core.finish(finishRequest(v1, r1, key.register(v1)));
  const r2 = fresh(),
    v2 = f.core.begin({ operation: 'register', retryKey: r2 });
  assert.deepEqual(await f.core.finish(finishRequest(v2, r2, key.register(v2))), {
    ok: false,
    refusal: 'credential-in-use',
  });
  assert.deepEqual(await f.core.finish(finishRequest(next, r1, key.assert(next))), {
    ok: false,
    refusal: 'invalid-proof',
  });
  key.register(v1); // Restore fixture user handle; the private key remains unchanged.
  assert.equal(
    (await f.core.finish(finishRequest(next, r1, key.assert(next)))).stage,
    'credential-confirmed',
  );
});

test('expiry, cancellation and account change during verification recheck at commit', async (t) => {
  let now = 1000,
    action = () => {};
  const f = fixture(t, {
    now: () => now,
    hook(point) {
      if (point === 'after-verify') action();
    },
  });
  const retryKey = fresh(),
    view = f.core.begin({ operation: 'register', retryKey }),
    key = authenticator();
  action = () => {
    now += CEREMONY_LIFETIME_MS;
  };
  assert.deepEqual(await f.core.finish(finishRequest(view, retryKey, key.register(view))), {
    ok: false,
    refusal: 'expired',
  });
  assert.equal(f.rows('credentials').length, 0);
  const r2 = fresh(),
    v2 = f.core.begin({ operation: 'register', retryKey: r2 });
  action = () => {
    assert.equal(f.core.cancel({ retryKey: r2 }).stage, 'cancelled');
  };
  assert.deepEqual(await f.core.finish(finishRequest(v2, r2, key.register(v2))), {
    ok: false,
    refusal: 'cancelled',
  });
  action = () => {};
  const item = await registered(f);
  f.seedActive(item.result.accountId);
  const r3 = fresh(),
    v3 = f.core.begin({ operation: 'authenticate', retryKey: r3 });
  action = () => {
    const db = new DatabaseSync(f.path);
    db.prepare("UPDATE accounts SET state='pending' WHERE id=?").run(item.result.accountId);
    db.close();
  };
  assert.deepEqual(await f.core.finish(finishRequest(v3, r3, item.key.assert(v3))), {
    ok: false,
    refusal: 'account-not-active',
  });
});

test('abort and lost response around every mutating ceremony commit', async (t) => {
  let fault = null;
  const f = fixture(t, {
    hook(point, operation) {
      if (`${point}:${operation}` === fault) {
        fault = null;
        throw Error('injected');
      }
    },
  });
  const retryKey = fresh();
  fault = 'before-commit:begin';
  assert.equal(f.core.begin({ operation: 'register', retryKey }).refusal, 'storage-unavailable');
  assert.equal(f.rows('accounts').length, 0);
  const key = authenticator(),
    view = f.core.begin({ operation: 'register', retryKey });
  const proof = finishRequest(view, retryKey, key.register(view));
  fault = 'before-commit:register';
  assert.equal((await f.core.finish(proof)).refusal, 'storage-unavailable');
  assert.equal(f.rows('credentials').length, 0);
  f.restart();
  fault = 'after-commit:register';
  assert.equal((await f.core.finish(proof)).refusal, 'storage-unavailable');
  f.restart();
  const next = await f.core.finish(proof);
  assert.equal(next.operation, 'confirm-registration');
  assert.equal(f.rows('credentials').length, 1);
  const confirmation = finishRequest(next, retryKey, key.assert(next));
  fault = 'before-commit:confirm-registration';
  assert.equal((await f.core.finish(confirmation)).refusal, 'storage-unavailable');
  assert.equal(f.rows('credentials')[0].state, 'staged');
  fault = 'after-commit:confirm-registration';
  assert.equal((await f.core.finish(confirmation)).refusal, 'storage-unavailable');
  f.restart();
  assert.deepEqual(await f.core.finish(confirmation), f.core.resume({ retryKey }));
});

test('hostile wire input is refused and durable policy cannot be changed on restart', async (t) => {
  const f = fixture(t);
  for (const input of [
    null,
    [],
    {},
    { operation: 'register', retryKey: 'a' },
    { operation: 'register', retryKey: fresh() + '=' },
  ]) {
    assert.equal(f.core.begin(input).ok, false);
    assert.equal((await f.core.finish(input)).ok, false);
  }
  assert.throws(
    () => new AccountCore(f.path, { rpId: 'localhost', origin: 'http://localhost:9999' }),
    /policy changed/,
  );
  assert.throws(
    () => new AccountCore(f.path, { rpId: 'other.invalid', origin: policy.origin }),
    /policy requires/,
  );
  const db = new DatabaseSync(f.path);
  db.exec('PRAGMA user_version=999');
  db.close();
  assert.throws(() => new AccountCore(f.path, policy), /Unsupported account schema/);
});

test('caller mutation cannot change the verified/committed request, and retained-key races refuse', async (t) => {
  let action = () => {};
  const f = fixture(t, {
    hook(point) {
      if (point === 'after-verify') action();
    },
  });
  const retryKey = fresh(),
    view = f.core.begin({ operation: 'register', retryKey }),
    key = authenticator();
  const input = finishRequest(view, retryKey, key.register(view));
  const original = structuredClone(input);
  const promise = f.core.finish(input);
  input.operation = 'authenticate';
  input.response = null;
  const next = await promise;
  assert.equal(next.operation, 'confirm-registration');
  assert.deepEqual(await f.core.finish(original), next);
  const confirmation = await f.core.finish(finishRequest(next, retryKey, key.assert(next)));
  f.seedActive(confirmation.accountId);
  const r2 = fresh(),
    login = f.core.begin({ operation: 'authenticate', retryKey: r2 });
  action = () => {
    const db = new DatabaseSync(f.path);
    db.prepare('UPDATE credentials SET spki=? WHERE id=?').run('00', key.id);
    db.close();
  };
  assert.deepEqual(await f.core.finish(finishRequest(login, r2, key.assert(login))), {
    ok: false,
    refusal: 'invalid-proof',
  });
  assert.equal(
    f
      .rows('ceremonies')
      .filter((row) => row.operation === 'authenticate' && row.proof_hash !== null).length,
    0,
  );
});

test('a competing process completing confirmation between inspection and crypto returns the same receipt', async (t) => {
  let compete = () => {};
  const f = fixture(t, {
    hook(point, operation) {
      if (point === 'after-commit' && operation === 'inspect') compete();
    },
  });
  const retryKey = fresh(),
    view = f.core.begin({ operation: 'register', retryKey }),
    key = authenticator();
  const next = await f.core.finish(finishRequest(view, retryKey, key.register(view)));
  const proof = finishRequest(next, retryKey, key.assert(next));
  let winner;
  compete = () => {
    compete = () => {};
    const result = spawnSync(
      process.execPath,
      ['test/account-core/finish-once.mjs', f.path, JSON.stringify(proof)],
      { encoding: 'utf8', timeout: 5000 },
    );
    assert.equal(result.status, 0, result.stderr);
    winner = JSON.parse(result.stdout);
    assert.equal(winner.stage, 'credential-confirmed');
  };
  const result = await f.core.finish(proof);
  assert.deepEqual(result, winner);
});
