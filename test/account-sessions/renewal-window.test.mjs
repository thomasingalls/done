import test from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_ACCESS_MS } from '../../account-protocol/session.ts';
import { SESSION_LIMITS } from '../../account-service/sessions.ts';
import { ready, fresh, registered, renewal, revocation } from './fixtures.mjs';

const limit = SESSION_LIMITS.accessPerSession;
const issue = (x, who) => x.sessions.finish(x.begin(who).proof);
function renew(x, session) {
  const result = x.sessions.renew(renewal(session));
  assert.equal(result.stage, 'access', JSON.stringify(result));
  return result;
}
function usable(x, access, expected = true) {
  let called = false;
  const result = x.sessions.withAccess(access.accessToken, access.accountId, () => {
    called = true;
    return { ok: true };
  });
  assert.equal(called, expected);
  if (expected) assert.deepEqual(result, { ok: true });
  else assert.equal(result.refusal, 'access-required');
}

test('rapid renewal retains only the newest eight tokens, even at the same clock value', async (t) => {
  const x = await ready(t),
    session = await issue(x);
  const before = x.f.rows('network_sessions'),
    tokens = [];
  for (let n = 0; n < 32; n++) {
    const access = renew(x, session);
    assert.equal(access.expiresAt, session.issuedAt + SESSION_ACCESS_MS);
    tokens.push(access);
    // Using a token does not promote its issuance order or renew its lifetime.
    for (let i = 0; i < tokens.length; i++) usable(x, tokens[i], i >= tokens.length - limit);
    usable(x, tokens[Math.max(0, tokens.length - limit)]);
  }
  assert.equal(new Set(tokens.map((a) => a.accessToken)).size, tokens.length);
  assert.deepEqual(x.f.rows('network_sessions'), before);
  const disk = JSON.stringify([before, x.f.rows('session_attempts'), x.f.rows('session_custody')]);
  for (const token of tokens) assert(!disk.includes(token.accessToken));
  x.setTime(tokens.at(-1).expiresAt);
  for (const token of tokens) usable(x, token, false);
  usable(x, renew(x, session));
  assert.equal(x.f.rows('network_sessions')[0].expires_at, session.expiresAt);
});

test('invalid renewals cannot retire live tokens or use a revoke-only credential', async (t) => {
  const x = await ready(t),
    session = await issue(x);
  const tokens = Array.from({ length: limit }, () => renew(x, session));
  for (const request of [
    { sessionId: session.sessionId, renewalToken: fresh() },
    { sessionId: session.sessionId, renewalToken: session.revokeToken },
    { sessionId: fresh(), renewalToken: session.renewalToken },
  ])
    assert.equal(x.sessions.renew(request).refusal, 'sign-in-required');
  for (const token of tokens) usable(x, token);
});

for (const point of ['before-commit', 'after-commit'])
  test(`${point} renewal failure leaves the live window intact; retry replaces only its oldest`, async (t) => {
    let armed = false;
    const x = await ready(t, {
        hook(at, op) {
          if (armed && at === point && op === 'session-renew') {
            armed = false;
            throw Error('injected renewal failure');
          }
        },
      }),
      session = await issue(x);
    const tokens = Array.from({ length: limit }, () => renew(x, session));
    const before = x.f.rows('network_sessions');
    armed = true;
    assert.equal(x.sessions.renew(renewal(session)).refusal, 'storage-unavailable');
    assert.deepEqual(x.f.rows('network_sessions'), before);
    for (const token of tokens) usable(x, token);
    usable(x, renew(x, session));
    usable(x, tokens[0], false);
    for (const token of tokens.slice(1)) usable(x, token);
  });

test('lost successful renewal replies do not exhaust capacity or evict another login', async (t) => {
  const x = await ready(t),
    session = await issue(x);
  const sameAccount = await issue(x),
    sameAccess = renew(x, sameAccount);
  const other = await registered(x.f);
  x.f.seedActive(other.result.accountId);
  const otherAccount = await issue(x, other),
    otherAccess = renew(x, otherAccount);
  const first = renew(x, session);
  // The service installed these tokens, but the caller never received them.
  for (let n = 0; n < 2 * limit; n++) renew(x, session);
  const recovered = renew(x, session);
  usable(x, recovered);
  usable(x, first, false);
  usable(x, sameAccess);
  usable(x, otherAccess);
  assert.equal(x.f.rows('network_sessions').length, 3);
  assert.equal(x.sessions.revoke(revocation(session)).stage, 'revoked');
  usable(x, recovered, false);
  assert.equal(x.sessions.renew(renewal(session)).refusal, 'sign-in-required');
  usable(x, sameAccess);
  usable(x, otherAccess);
});

for (const change of ['account', 'credential', 'key', 'expiry'])
  test(`a full renewal window still checks current ${change} authority`, async (t) => {
    const x = await ready(t),
      session = await issue(x);
    const tokens = Array.from({ length: limit }, () => renew(x, session));
    if (change === 'account') x.mutate((db) => db.exec("UPDATE accounts SET state='pending'"));
    if (change === 'credential') x.mutate((db) => db.exec("UPDATE credentials SET state='staged'"));
    if (change === 'key') x.mutate((db) => db.exec("UPDATE credentials SET spki='changed'"));
    if (change === 'expiry') x.setTime(session.expiresAt);
    assert.equal(x.sessions.renew(renewal(session)).refusal, 'sign-in-required');
    for (const token of tokens) usable(x, token, false);
    assert.equal(x.f.rows('network_sessions')[0].expires_at, session.expiresAt);
  });
