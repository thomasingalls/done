import test from 'node:test';
import assert from 'node:assert/strict';
import { ready, census, inspect, fresh, mutate } from './fixtures.mjs';
import { query, read, pageProof } from '../account-service-inbound/oracle.mjs';
import {
  verifyEnrollmentChallenge,
  verifyEnrollmentReceipt,
  enrollmentOptions,
} from '../../account-protocol/enrollment.ts';

for (const alg of [-8, -7])
  test(`fresh ${alg} account proof prepares exact keys once and survives restart`, async (t) => {
    const x = await ready(t, { alg }),
      entry = x.candidate(),
      before = census(x);
    const c = await x.enroll('begin', entry.input);
    assert.equal(c.stage, 'challenge', JSON.stringify(c));
    inspect(c, x, entry);
    await verifyEnrollmentChallenge(
      c.challenge,
      x.authority.pin,
      entry.input.candidate,
      Date.now(),
    );
    assert.equal((await enrollmentOptions(c.challenge.context)).userVerification, 'required');
    assert.deepEqual(await x.enroll('begin', entry.input), c);
    const proof = x.prove(entry, c),
      r = await x.enroll('finish', proof);
    assert.equal(r.stage, 'prepared', JSON.stringify(r));
    inspect(r, x, entry);
    await verifyEnrollmentReceipt(r.receipt, x.authority.pin, entry.input.candidate);
    assert.equal(census(x), before);
    x.f.restart();
    x.authority.restart();
    for (const [op, input] of [
      ['finish', proof],
      ['begin', entry.input],
      ['resume', { retryKey: entry.input.retryKey }],
    ])
      assert.deepEqual(await x.enroll(op, input), r);
    assert.equal(x.f.rows('enrollment_preparations').length, 1);
    const bad = x.prove(entry, c, { count: 7 });
    assert.equal((await x.enroll('finish', bad)).refusal, 'proof-conflict');
    const w = x.make(),
      accepted = await x.call(w);
    assert.equal(accepted.kind, 'decision');
    const q = query(x);
    pageProof(await read(x, q), q, x, [{ w, r: accepted }]);
    assert.equal((await x.enroll('resume', { retryKey: entry.input.retryKey })).stage, 'prepared');
    const foreign = query(x, 0, 1, { reader: entry.input.candidate.credentialId }, entry.key);
    assert.equal((await read(x, foreign)).kind, 'unknown');
    const writing = x.make(2, 'unadmitted', {
      credential: entry.input.candidate.credentialId,
      signer: entry.key,
    });
    assert.equal((await x.call(writing)).kind, 'unknown');
  });

test('fresh assertion and candidate possession are required; invalid proofs do not consume the request', async (t) => {
  const x = await ready(t),
    entry = x.candidate(),
    c = await x.enroll('begin', entry.input),
    before = census(x);
  const retained = x.f.rows('enrollment_preparations');
  for (const edits of [
    { client: { type: 'webauthn.create' } },
    { client: { challenge: 'old-account-proof' } },
    { client: { origin: 'https://other.invalid' } },
    { rpId: 'other.invalid' },
    { userHandle: fresh() },
    { flags: 1 },
    { flags: 4 },
  ])
    assert.equal((await x.enroll('finish', x.prove(entry, c, edits))).refusal, 'invalid-proof');
  const good = x.prove(entry, c);
  for (const changed of [
    { ...good, possession: '00'.repeat(64) },
    { ...good, response: x.account.key.assert(x.account.confirmation) },
    { ...good, response: { receiptId: fresh(), stage: 'account-proof' } },
    { ...good, response: { token: fresh() } },
  ])
    assert.equal((await x.enroll('finish', changed)).refusal, 'invalid-proof');
  assert.equal(
    (await x.enroll('finish', { ...good, attemptId: fresh() })).refusal,
    'unknown-attempt',
  );
  assert.equal(census(x), before);
  assert.deepEqual(x.f.rows('enrollment_preparations'), retained);
  assert.equal((await x.enroll('finish', good)).stage, 'prepared');
});

test('another confirmed account in the same database cannot authorize the selected workspace', async (t) => {
  const x = await ready(t),
    { registered } = await import('../account-core/fixtures.mjs');
  const other = await registered(x.f);
  x.f.seedActive(other.result.accountId);
  const entry = x.candidate(),
    c = await x.enroll('begin', entry.input),
    p = x.prove(entry, c);
  const { nonce } = await import('./fixtures.mjs');
  p.response = other.key.assert({ options: { challenge: nonce(c.challenge.context) } });
  assert.equal((await x.enroll('finish', p)).refusal, 'invalid-proof');
  assert.equal(x.f.rows('enrollment_preparations')[0].stage, 'challenge');
});

test('request identities are immutable and capability-scoped; unauthenticated IDs reserve nothing', async (t) => {
  const x = await ready(t),
    e = x.candidate(),
    c = await x.enroll('begin', e.input);
  for (const key of ['head', 'lineageId', 'workspaceId', 'credentialId', 'sPub', 'wPub']) {
    const candidate = {
      ...e.input.candidate,
      [key]: 'ee'.repeat(e.input.candidate[key].length / 2),
    };
    assert.equal((await x.enroll('begin', { ...e.input, candidate })).refusal, 'request-conflict');
  }
  for (const op of ['resume', 'cancel'])
    assert.equal(
      (await x.enroll(op, { retryKey: c.challenge.context.attemptId })).refusal,
      'unknown-attempt',
    );
  const duplicate = { ...e, input: { ...e.input, retryKey: fresh() } };
  const second = await x.enroll('begin', duplicate.input);
  assert.equal(second.stage, 'challenge');
  assert.equal((await x.enroll('finish', x.prove(duplicate, second))).stage, 'prepared');
  assert.equal((await x.enroll('finish', x.prove(e, c))).refusal, 'candidate-in-use');
  await x.enroll('cancel', { retryKey: duplicate.input.retryKey });
  assert.equal(
    (await x.enroll('begin', { ...e.input, retryKey: fresh() })).refusal,
    'candidate-in-use',
  );
  assert.equal(
    (
      await x.enroll('begin', {
        ...x.candidate().input,
        candidate: { ...e.input.candidate, credentialId: x.credential },
      })
    ).refusal,
    'candidate-in-use',
  );
});

test('expiry and cancellation retain historical evidence without reviving eligibility', async (t) => {
  let now = 1000;
  const x = await ready(t, { now: () => now }),
    e = x.candidate(),
    c = await x.enroll('begin', e.input),
    p = x.prove(e, c);
  now = c.challenge.context.expiresAt;
  assert.equal((await x.enroll('finish', p)).stage, 'expired');
  now = 1000;
  assert.equal((await x.enroll('resume', { retryKey: e.input.retryKey })).stage, 'expired');
  const next = x.candidate(),
    challenge = await x.enroll('begin', next.input),
    proof = x.prove(next, challenge),
    r = await x.enroll('finish', proof);
  now = r.receipt.expiresAt;
  const expired = await x.enroll('finish', proof);
  assert.equal(expired.stage, 'expired');
  assert.deepEqual(expired.receipt, r.receipt);
  const third = x.candidate(),
    cc = await x.enroll('begin', third.input),
    pp = x.prove(third, cc);
  const cancelled = await x.enroll('cancel', { retryKey: third.input.retryKey });
  assert.equal(cancelled.stage, 'cancelled');
  assert.equal((await x.enroll('finish', pp)).stage, 'cancelled');
  const fourth = x.candidate(),
    c4 = await x.enroll('begin', fourth.input),
    p4 = x.prove(fourth, c4),
    r4 = await x.enroll('finish', p4);
  await x.enroll('cancel', { retryKey: fourth.input.retryKey });
  x.f.restart();
  const cold = await x.enroll('finish', p4);
  assert.equal(cold.stage, 'cancelled');
  assert.deepEqual(cold.receipt, r4.receipt);
});

for (const change of ['account', 'key', 'head', 'recovery', 'expiry'])
  test(`${change} changing after verification cannot commit preparation`, async (t) => {
    let armed = false,
      now = 1000,
      x;
    x = await ready(t, {
      now: () => now,
      hook(point, op) {
        if (!armed || point !== 'after-verify' || op !== 'enrollment-finish') return;
        armed = false;
        if (change === 'expiry') {
          now += 600000;
          return;
        }
        mutate(x, (db) => {
          if (change === 'account') db.exec("UPDATE accounts SET state='pending'");
          if (change === 'key') db.exec("UPDATE credentials SET spki='changed'");
          if (change === 'head') db.exec("UPDATE promotions SET offer='{}'");
          if (change === 'recovery') db.exec("UPDATE recovery SET draft='{}'");
        });
      },
    });
    const e = x.candidate(),
      c = await x.enroll('begin', e.input);
    armed = true;
    const r = await x.enroll('finish', x.prove(e, c));
    assert.equal(r.stage, change === 'expiry' ? 'expired' : 'stale', JSON.stringify(r));
    assert.equal(r.receipt, null);
    assert.equal(x.f.rows('enrollment_preparations')[0].proof_hash, null);
  });

test('competing exact completions on separate SQLite connections return one receipt', async (t) => {
  const x = await ready(t),
    e = x.candidate(),
    c = await x.enroll('begin', e.input),
    p = x.prove(e, c);
  const { AccountCore } = await import('../../account-service/core.ts');
  const other = new AccountCore(x.f.path, {
    origin: x.authority.pin.origin,
    rpId: x.authority.pin.rpId,
  });
  t.after(() => other.close());
  const r = await Promise.all([
    x.enroll('finish', p),
    x.authority.owner.enrollment(other, 'finish', p),
  ]);
  assert.equal(r[0].stage, 'prepared');
  assert.deepEqual(r[0], r[1]);
});

for (const point of ['before-commit', 'after-commit'])
  for (const operation of ['begin', 'finish', 'cancel'])
    test(`${point} ${operation} failure cold-recovers one outcome`, async (t) => {
      let armed = false;
      const x = await ready(t, {
          hook(at, op) {
            if (armed && at === point && op === `enrollment-${operation}`) {
              armed = false;
              throw Error('synthetic commit fault');
            }
          },
        }),
        e = x.candidate();
      const c = operation === 'begin' ? null : await x.enroll('begin', e.input);
      const p =
        operation === 'begin'
          ? e.input
          : operation === 'finish'
            ? x.prove(e, c)
            : { retryKey: e.input.retryKey };
      armed = true;
      assert.equal((await x.enroll(operation, p)).refusal, 'storage-unavailable');
      x.f.restart();
      const r = await x.enroll(operation, p);
      assert.equal(
        r.stage,
        { begin: 'challenge', finish: 'prepared', cancel: 'cancelled' }[operation],
      );
      assert.equal(x.f.rows('enrollment_preparations').length, 1);
    });

test('finite retained capacity and request bounds refuse without changing rows', async (t) => {
  const x = await ready(t),
    e = x.candidate();
  for (const candidate of [
    { ...e.input.candidate, extra: 1 },
    { ...e.input.candidate, sPub: 'ab'.repeat(200000) },
    { ...e.input.candidate, head: 'AA'.repeat(32) },
  ])
    assert.equal((await x.enroll('begin', { ...e.input, candidate })).refusal, 'malformed');
  assert.equal(x.f.rows('enrollment_preparations').length, 0);
  const c = await x.enroll('begin', e.input);
  assert.equal(
    (await x.enroll('finish', { ...x.prove(e, c), response: { long: 'x'.repeat(131072) } }))
      .refusal,
    'malformed',
  );
  mutate(x, (db) => {
    const r = x.f.rows('enrollment_preparations')[0];
    for (let i = 1; i < 64; i++)
      db.prepare('INSERT INTO enrollment_preparations VALUES (?,?,?,?,?,?,?,?,?,?)').run(
        fresh(),
        fresh(),
        r.workspace_id,
        r.credential_id,
        r.candidate,
        r.authority_hash,
        r.challenge,
        'cancelled',
        null,
        null,
      );
  });
  assert.equal((await x.enroll('begin', x.candidate().input)).refusal, 'capacity');
  assert.equal(x.f.rows('enrollment_preparations').length, 64);
});

test('schema five requires an explicit additive upgrade and cold-opens as eight', async (t) => {
  const x = await ready(t);
  mutate(x, (db) =>
    db.exec(
      'DROP TABLE content_ceremonies; DROP TABLE workspace_successors; ALTER TABLE promotions DROP COLUMN successor_head; DROP TABLE enrollment_preparations; PRAGMA user_version=5;',
    ),
  );
  const { AccountCore } = await import('../../account-service/core.ts'),
    policy = { origin: x.authority.pin.origin, rpId: x.authority.pin.rpId };
  assert.throws(() => new AccountCore(x.f.path, policy), /Unsupported account schema/);
  const upgraded = new AccountCore(x.f.path, policy, { upgradeFromV5: true });
  upgraded.close();
  x.f.restart();
  assert.equal((await x.enroll('begin', x.candidate().input)).stage, 'challenge');
});

test('ordinary delivery and counter observations while a challenge is pending do not stale it', async (t) => {
  const x = await ready(t),
    e = x.candidate(),
    c = await x.enroll('begin', e.input);
  const w = x.make(),
    r = await x.call(w);
  assert.equal(r.kind, 'decision');
  mutate(x, (db) => db.exec('UPDATE credentials SET counter=123'));
  const input = x.prove(e, c),
    pending = x.enroll('finish', input);
  input.response.response.signature = 'altered-after-call';
  input.possession = '00'.repeat(64);
  const prepared = await pending;
  assert.equal(prepared.stage, 'prepared');
  const q = query(x);
  pageProof(await read(x, q), q, x, [{ w, r }]);
});

test('retained evidence tampering cannot return a prepared view', async (t) => {
  const x = await ready(t),
    e = x.candidate(),
    c = await x.enroll('begin', e.input);
  const r = await x.enroll('finish', x.prove(e, c));
  mutate(x, (db) => {
    const receipt = { ...r.receipt, assertionHash: '00'.repeat(32) };
    db.prepare('UPDATE enrollment_preparations SET receipt=?').run(JSON.stringify(receipt));
  });
  assert.equal((await x.enroll('resume', { retryKey: e.input.retryKey })).refusal, 'unavailable');
});

test('global retained-row capacity refuses even when the target workspace has room', async (t) => {
  const x = await ready(t),
    e = x.candidate();
  await x.enroll('begin', e.input);
  const row = x.f.rows('enrollment_preparations')[0];
  mutate(x, (db) => {
    db.exec('BEGIN IMMEDIATE');
    const insert = db.prepare('INSERT INTO enrollment_preparations VALUES (?,?,?,?,?,?,?,?,?,?)');
    for (let i = 1; i < 4096; i++)
      insert.run(
        fresh(),
        fresh(),
        'other-fixture-workspace',
        row.credential_id,
        row.candidate,
        row.authority_hash,
        row.challenge,
        'cancelled',
        null,
        null,
      );
    db.exec('COMMIT');
  });
  assert.equal((await x.enroll('begin', x.candidate().input)).refusal, 'capacity');
  assert.equal(x.f.rows('enrollment_preparations').length, 4096);
});

test('a prepared marker without its committed receipt fails closed', async (t) => {
  const x = await ready(t),
    e = x.candidate();
  await x.enroll('begin', e.input);
  mutate(x, (db) => db.exec("UPDATE enrollment_preparations SET stage='prepared'"));
  assert.equal((await x.enroll('resume', { retryKey: e.input.retryKey })).refusal, 'unavailable');
});
