import test from 'node:test';
import assert from 'node:assert/strict';
import { ready, fresh } from './fixtures.mjs';
import { freshEnrollmentChallenge } from '../../src/account/enrollmentChallenge.ts';

test('an unused expired challenge renews once and a lost reply resumes its saved retry identity', async (t) => {
  let now = 1000;
  const x = await ready(t, { now: () => now });
  const entry = x.candidate();
  const old = await x.enroll('begin', entry.input);
  now = old.challenge.context.expiresAt;
  let savedRetry = entry.input.retryKey;
  let renewals = 0;
  let loseReply = true;
  const run = () =>
    freshEnrollmentChallenge({
      pin: x.authority.pin,
      candidate: entry.input.candidate,
      retryKey: savedRetry,
      now: () => now,
      renew: async () => {
        renewals++;
        savedRetry = fresh();
        return savedRetry;
      },
      begin: async (retryKey) => {
        assert.equal(retryKey, savedRetry, 'renewal must be saved before issuing its request');
        const result = await x.enroll('begin', { ...entry.input, retryKey });
        if (retryKey !== entry.input.retryKey && loseReply) {
          loseReply = false;
          throw Error('Lost begin reply');
        }
        return result;
      },
    });
  await assert.rejects(run(), /Lost begin reply/);
  const heldRetry = savedRetry;
  x.f.restart();
  const challenge = await run();
  assert.equal(renewals, 1);
  assert.equal(savedRetry, heldRetry);
  assert.notEqual(challenge.context.attemptId, old.challenge.context.attemptId);
  assert.deepEqual(challenge.context.candidate, entry.input.candidate);
  assert.deepEqual(
    x.f
      .rows('enrollment_preparations')
      .map((r) => r.stage)
      .sort(),
    ['challenge', 'expired'],
  );
  const next = { ...entry, input: { ...entry.input, retryKey: savedRetry } };
  const result = await x.enroll('finish', x.prove(next, { challenge }));
  assert.equal(result.stage, 'prepared');
});

test('failed renewal persistence makes no new request; tampered expiry cannot renew', async (t) => {
  let now = 1000;
  const x = await ready(t, { now: () => now });
  const entry = x.candidate();
  const old = await x.enroll('begin', entry.input);
  now = old.challenge.context.expiresAt;
  let requests = 0;
  const options = {
    pin: x.authority.pin,
    candidate: entry.input.candidate,
    retryKey: entry.input.retryKey,
    now: () => now,
    begin: async () => {
      requests++;
      return old;
    },
    renew: async () => {
      throw Error('Local save aborted');
    },
  };
  await assert.rejects(freshEnrollmentChallenge(options), /Local save aborted/);
  assert.equal(requests, 1);
  const changed = structuredClone(old);
  changed.challenge.context.expiresAt--;
  await assert.rejects(
    freshEnrollmentChallenge({
      ...options,
      begin: async () => changed,
      renew: async () => assert.fail('Unauthenticated expiry must not renew'),
    }),
    /Invalid enrollment signature/,
  );
  assert.equal(x.f.rows('enrollment_preparations').length, 1);
});

test('a saved receipt or an unsigned expired status cannot reset enrollment eligibility', async (t) => {
  let now = 1000;
  const x = await ready(t, { now: () => now });
  const entry = x.candidate();
  const begun = await x.enroll('begin', entry.input);
  const options = {
    pin: x.authority.pin,
    candidate: entry.input.candidate,
    retryKey: entry.input.retryKey,
    now: () => now,
    begin: async () => ({ ...begun, stage: 'expired' }),
    renew: async () => assert.fail('No renewal is authorized'),
  };
  await assert.rejects(freshEnrollmentChallenge(options), /service reports/);
  const prepared = await x.enroll('finish', x.prove(entry, begun));
  now = prepared.receipt.expiresAt;
  await assert.rejects(
    freshEnrollmentChallenge({
      ...options,
      begin: () => x.enroll('begin', entry.input),
    }),
    /already advanced or stopped/,
  );
  assert.equal(x.f.rows('enrollment_preparations').length, 1);
  assert.ok(x.f.rows('enrollment_preparations')[0].proof_hash);
});
