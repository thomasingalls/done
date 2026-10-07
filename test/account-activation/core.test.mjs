import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { DatabaseSync } from 'node:sqlite';
import { hash } from '../account-admission/core-fixtures.mjs';
import { activationOptions, parseActivationContext } from '../../account-protocol/activation.ts';
import { verifyReceipt, parseReceipt } from '../../account-protocol/admission.ts';
import { AccountCore } from '../../account-service/core.ts';
import { inspectChallenge, challengeBytes, prove, canonical } from './oracle.mjs';
import { evidence, ready, changedCompletion } from './fixtures.mjs';
const inventory = (x) =>
  canonical(['accounts', 'promotions', 'credentials'].map((t) => x.f.rows(t)));
for (const alg of [-8, -7])
  test(`fresh ${alg} assertion binds the exact completion; no-proof finish leaves every row unchanged`, async (t) => {
    const x = await ready(t, { alg }),
      before = inventory(x);
    assert.equal(x.account.key.alg, alg);
    assert.equal((await x.submit(x.input)).ok, false);
    assert.equal(inventory(x), before);
    const challenge = await x.challenge();
    inspectChallenge(challenge, x, x.offer, x.baseCompletion);
    assert.equal(
      (await activationOptions(challenge.context)).challenge,
      challengeBytes(challenge.context).toString('base64url'),
    );
    const p = prove(x, x.input, challenge, { count: 17 }),
      r = await x.submit(p);
    assert.equal(r.v, 2);
    assert.equal(r.activation.proofHash, hash(canonical(p.activation.response)));
    assert.deepEqual(r.activation.context, challenge.context);
    await verifyReceipt(r, x.request, x.authority.pin);
    assert.equal(x.f.rows('credentials')[0].counter, 17);
    const saved = inventory(x);
    x.f.restart();
    x.authority.restart();
    assert.deepEqual(await x.submit(p), r);
    assert.deepEqual(await x.challenge(), r);
    assert.deepEqual(await x.begin(), r);
    assert.equal(
      (await x.submit(prove(x, x.input, challenge, { count: 18 }))).refusal,
      'proof-conflict',
    );
    assert.equal(inventory(x), saved);
    evidence('activation-' + alg, {
      challenge,
      receipt: r,
      assertion: p.activation.response,
      assertionHash: r.activation.proofHash,
      counter: x.f.rows('credentials')[0].counter,
    });
  });
test('real WebAuthn signatures with wrong purpose, origin, RP, user, presence, verification or credential refuse without consumption', async (t) => {
  const x = await ready(t),
    c = await x.challenge(),
    before = inventory(x);
  for (const edits of [
    { client: { type: 'webauthn.create' } },
    { client: { challenge: 'wrong' } },
    { client: { origin: 'https://other.invalid' } },
    { rpId: 'other.invalid' },
    { userHandle: 'other' },
    { flags: 1 },
    { flags: 4 },
    { privateKey: (await import('node:crypto')).generateKeyPairSync('ed25519').privateKey },
  ]) {
    assert.equal((await x.submit(prove(x, x.input, c, edits))).ok, false, JSON.stringify(edits));
    assert.equal(inventory(x), before);
  }
  const p = prove(x, x.input, c);
  p.activation.response.id = 'different';
  assert.equal((await x.submit(p)).ok, false);
  const huge = prove(x, x.input, c);
  huge.activation.response.extra = 'x'.repeat(131072);
  assert.equal((await x.submit(huge)).refusal, 'malformed');
  assert.equal(inventory(x), before);
  assert.equal((await x.submit(prove(x, x.input, c))).kind, 'promotion-receipt');
});
test('expiry, renewal and a separately valid completion cannot reuse or replace the fixed challenge target', async (t) => {
  let now = 1000;
  const x = await ready(t, { now: () => now }),
    c = await x.challenge(),
    p = prove(x, x.input, c);
  assert.deepEqual(await x.challenge(), c);
  const changed = { ...x.input, completion: changedCompletion(x) };
  assert.equal((await x.authority.owner.challengePromotion(x.f.core, changed)).ok, false);
  assert.equal((await x.submit({ ...p, completion: changed.completion })).ok, false);
  now = c.context.expiresAt;
  assert.equal((await x.submit(p)).refusal, 'expired');
  const next = await x.challenge();
  assert.notEqual(next.context.nonce, c.context.nonce);
  assert.equal(next.context.expiresAt, now + 600000);
  assert.equal((await x.submit(p)).ok, false);
  const good = prove(x, x.input, next),
    r = await x.submit(good);
  now += 600001;
  x.f.restart();
  assert.deepEqual(await x.submit(good), r);
  assert.deepEqual(await x.challenge(), r);
});
test('expiry advancing during verification is checked again inside the activation transaction', async (t) => {
  let now = 1000,
    armed = false;
  const x = await ready(t, {
      now: () => now,
      hook(point, op) {
        if (armed && point === 'after-verify' && op === 'admit-promotion') now += 600000;
      },
    }),
    c = await x.challenge();
  const before = inventory(x);
  armed = true;
  assert.equal((await x.submit(prove(x, x.input, c))).refusal, 'expired');
  assert.equal(inventory(x), before);
});
test('account/nonce swaps and completion changes cannot borrow another account assertion', async (t) => {
  const a = await ready(t),
    b = await ready(t),
    ca = await a.challenge(),
    cb = await b.challenge(),
    pa = prove(a, a.input, ca),
    pb = prove(b, b.input, cb);
  for (const p of [
    { ...pa, activation: pb.activation },
    { ...pa, activation: { ...pa.activation, nonce: cb.context.nonce } },
    { ...pa, retryKey: b.account.retryKey },
    { ...pa, requestDigest: b.input.requestDigest },
  ])
    assert.equal((await a.submit(p)).ok, false);
  assert.equal(a.f.rows('accounts')[0].state, 'pending');
  const r = await a.submit(pa);
  for (const field of [
    'accountId',
    'requestDigest',
    'offerHead',
    'completionDigest',
    'credentialId',
    'pin',
  ]) {
    const changed = structuredClone(r);
    changed.activation.context[field] = cb.context[field];
    await assert.rejects(verifyReceipt(changed, a.request, a.authority.pin));
  }
});
test('closed context rejects aliases, noncanonical passkeys, extra fields and noninteger expiry', async (t) => {
  const x = await ready(t),
    c = (await x.challenge()).context;
  for (const change of [
    { v: 2 },
    { credentialId: c.credentialId + '=' },
    { expiresAt: 1.5 },
    { expiresAt: -1 },
    { nonce: 'AA'.repeat(32) },
    { extra: true },
  ])
    assert.throws(() => parseActivationContext({ ...c, ...change }));
});
for (const side of ['before-commit', 'after-commit'])
  test(`${side} challenge failure has one cold-recoverable result`, async (t) => {
    let armed = false;
    const x = await ready(t, {
      hook(p, op) {
        if (armed && p === side && op === 'challenge-promotion') {
          armed = false;
          throw Error('injected');
        }
      },
    });
    armed = true;
    assert.equal((await x.challenge()).ok, false);
    const before = x.f.rows('promotions');
    x.f.restart();
    x.authority.restart();
    const c = await x.challenge();
    assert.equal(c.kind, 'promotion-activation-challenge');
    if (side === 'after-commit') assert.deepEqual(x.f.rows('promotions'), before);
    assert.equal((await x.submit(prove(x, x.input, c))).kind, 'promotion-receipt');
  });
test('schema 4 upgrade preserves pending work; v1 receipts and absent consumed records are retained but refused', async (t) => {
  const x = await ready(t),
    db = new DatabaseSync(x.f.path),
    before = x.f.rows('promotions').map(({ activation: _activation, ...r }) => r);
  db.exec(
    'DROP TABLE publisher_decisions; DROP TABLE publisher_witnesses; DROP TABLE content_checkpoints; DROP TABLE content_transfers; DROP TABLE content_ceremonies; DROP TABLE enrollment_preparations; DROP TABLE workspace_successors; ALTER TABLE promotions DROP COLUMN successor_head; ALTER TABLE promotions DROP COLUMN activation; PRAGMA user_version=4;',
  );
  db.close();
  assert.throws(
    () => new AccountCore(x.f.path, { rpId: x.authority.pin.rpId, origin: x.authority.pin.origin }),
    /offline upgrade/,
  );
  const upgraded = new AccountCore(
    x.f.path,
    { rpId: x.authority.pin.rpId, origin: x.authority.pin.origin },
    { upgradeFromV4: true },
  );
  upgraded.close();
  x.f.restart();
  assert.deepEqual(
    x.f.rows('promotions').map(({ activation: _activation, ...r }) => r),
    before,
  );
  const r = await x.finish(x.offer);
  assert.equal(r.v, 2);
  assert.throws(() => parseReceipt({ ...r, v: 1 }));
  const old = { ...r, v: 1 };
  delete old.activation;
  for (const fault of ['missing-record', 'old-receipt']) {
    const d = new DatabaseSync(x.f.path);
    if (fault === 'missing-record') d.exec('UPDATE promotions SET activation=NULL');
    else d.prepare('UPDATE promotions SET result=?').run(JSON.stringify(old));
    d.close();
    const saved = inventory(x);
    x.f.restart();
    assert.equal((await x.begin()).ok, false);
    assert.equal(inventory(x), saved);
  }
});
test(
  '120 shrinking-enabled histories match an independent expiry/consumption/abandonment state machine',
  { timeout: 60000 },
  async (t) => {
    const histories = [],
      values = {};
    const remember = (v) => {
      const key = hash(JSON.stringify(v));
      if (values[key]) assert.deepEqual(values[key], v);
      else values[key] = structuredClone(v);
      return key;
    };
    const result = await fc.check(
      fc.asyncProperty(
        fc.array(
          fc.constantFrom('challenge', 'advance', 'finish', 'old', 'changed', 'restart', 'abandon'),
          { minLength: 3, maxLength: 24 },
        ),
        async (commands) => {
          let now = 1000;
          const x = await ready(t, { now: () => now });
          let state = 'pending',
            current,
            previous,
            receipt;
          const issued = [];
          const observe = () => {
            const row = x.f.rows('promotions')[0],
              activation = JSON.parse(row.activation);
            return {
              inventory: hash(inventory(x)),
              accountState: x.f.rows('accounts')[0].state,
              challengeNonce: activation?.challenge.context.nonce ?? null,
              proofHash: activation?.proofHash ?? null,
              receipt: row.result ? remember(JSON.parse(row.result)) : null,
            };
          };
          const history = { commands, initial: observe(), observations: [], completed: false };
          histories.push(history);
          for (const cmd of commands) {
            const observation = { cmd, nowBefore: now, before: observe(), result: null };
            history.observations.push(observation);
            if (cmd === 'advance') now += 600000;
            if (cmd === 'restart') {
              x.f.restart();
              x.authority.restart();
            }
            if (cmd === 'challenge') {
              const c = await x.challenge();
              observation.result = remember(c);
              if (state === 'cancelled') assert.equal(c.ok, false);
              else if (state === 'active') assert.deepEqual(c, receipt);
              else {
                inspectChallenge(c, x, x.offer, x.baseCompletion);
                if (current && now < current.context.expiresAt) assert.deepEqual(c, current);
                else {
                  if (current) assert.notEqual(c.context.nonce, current.context.nonce);
                  previous = current;
                  issued.push(c);
                  current = c;
                }
              }
            }
            if ((cmd === 'finish' || cmd === 'old') && current) {
              const chosen = cmd === 'old' ? (previous ?? current) : current;
              const proof = prove(x, x.input, chosen);
              const r = await x.submit(proof);
              observation.chosenNonce = chosen.context.nonce;
              observation.proofHash = hash(canonical(proof.activation.response));
              observation.result = remember(r);
              const valid =
                state !== 'cancelled' &&
                chosen.context.nonce === current.context.nonce &&
                (state === 'active' || now < chosen.context.expiresAt);
              if (valid) {
                assert.equal(r.kind, 'promotion-receipt');
                if (receipt) assert.deepEqual(r, receipt);
                receipt = r;
                state = 'active';
              } else assert.equal(r.ok, false);
            }
            if (cmd === 'changed' && current) {
              const changed = await x.submit({
                ...prove(x, x.input, current),
                completion: changedCompletion(x),
              });
              observation.result = remember(changed);
              assert.equal(changed.ok, false);
            }
            if (cmd === 'abandon') {
              const r = x.f.core.abandonPreparation({
                retryKey: x.account.retryKey,
                accountId: x.account.result.accountId,
              });
              observation.result = remember(r);
              if (state === 'active') assert.equal(r.ok, false);
              else {
                assert.equal(r.ok, true);
                state = 'cancelled';
              }
            }
            assert.equal(x.f.rows('accounts')[0].state, state === 'active' ? 'active' : 'pending');
            const retained = JSON.parse(x.f.rows('promotions')[0].activation);
            assert.equal(!!retained?.proofHash, state === 'active');
            if (receipt) assert.deepEqual(JSON.parse(x.f.rows('promotions')[0].result), receipt);
            observation.nowAfter = now;
            observation.after = observe();
          }
          Object.assign(history, { state, issued: issued.length, completed: true });
          evidence('generated-activation', { seed: 9110401, status: 'running', histories, values });
        },
      ),
      { seed: 9110401, numRuns: 120 },
    );
    evidence('generated-activation', {
      seed: 9110401,
      numRuns: result.numRuns,
      numShrinks: result.numShrinks,
      failed: result.failed,
      counterexample: result.counterexample,
      counterexamplePath: result.counterexamplePath,
      histories,
      values,
      status: result.failed ? 'failed' : 'passed',
    });
    assert.equal(result.failed, false, String(result.errorInstance));
  },
);

test('concurrent challenges converge; competing valid proofs consume exactly one activation', async (t) => {
  const x = await ready(t);
  const challenges = await Promise.all([x.challenge(), x.challenge()]);
  assert.deepEqual(challenges[0], challenges[1]);
  const a = prove(x, x.input, challenges[0], { count: 31 });
  const b = prove(x, x.input, challenges[0], { count: 32 });
  const results = await Promise.all([x.submit(a), x.submit(b)]);
  const winner = results.findIndex((r) => r.kind === 'promotion-receipt');
  assert.ok(winner >= 0);
  assert.equal(results[1 - winner].refusal, 'proof-conflict');
  const receipt = results[winner];
  assert.deepEqual(JSON.parse(x.f.rows('promotions')[0].result), receipt);
  assert.equal(x.f.rows('credentials')[0].counter, winner === 0 ? 31 : 32);
  assert.equal(x.f.rows('promotions').length, 1);
  assert.deepEqual(await x.challenge(), receipt);
});

for (const changed of [false, true])
  test(`challenge losing a race to ${changed ? 'different' : 'same'} completion returns only its exact outcome`, async (t) => {
    const x = await ready(t);
    let committed;
    const intercepted = {
      challengePromotion(input, issuer) {
        return x.f.core.challengePromotion(input, {
          ...issuer,
          challenge: async (context) => {
            const challenge = await issuer.challenge(context);
            const competing = {
              ...x.input,
              completion: changed ? changedCompletion(x) : x.baseCompletion,
            };
            const winner = await x.authority.owner.challengePromotion(x.f.core, competing);
            committed = await x.submit(prove(x, competing, winner));
            assert.equal(committed.kind, 'promotion-receipt');
            return challenge;
          },
        });
      },
    };
    const outcome = await x.authority.owner.challengePromotion(intercepted, x.input);
    if (changed) assert.equal(outcome.refusal, 'proof-conflict');
    else assert.deepEqual(outcome, committed);
    assert.deepEqual(JSON.parse(x.f.rows('promotions')[0].result), committed);
  });
