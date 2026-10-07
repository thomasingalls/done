import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { createSessionHandler } from '../../account-service/session-http.ts';
import { SESSION_REQUEST_LIMIT } from '../../account-protocol/session.ts';
import { ready, policy, renewal, revocation, fresh } from './fixtures.mjs';

async function serve(t, x) {
  const handler = createSessionHandler(x.sessions, policy);
  const server = createServer((req, res) => void handler(req, res));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const call = (path, body, headers = {}, method = 'POST') =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port: server.address().port,
          path,
          method,
          headers: {
            Host: new URL(policy.origin).host,
            Origin: policy.origin,
            'Content-Type': 'application/json',
            ...headers,
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString();
            resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(text) });
          });
        },
      );
      req.on('error', reject);
      req.end(typeof body === 'string' ? body : JSON.stringify(body));
    });
  return { call, server };
}

test(
  'separate HTTP surface supports challenge, exact lost-reply retry, renewal and revocation',
  { timeout: 10000 },
  async (t) => {
    const x = await ready(t),
      { call } = await serve(t, x),
      prefix = '/account/session/v1/';
    const retryKey = fresh(),
      accountId = x.account.result.accountId;
    const c = await call(prefix + 'begin', { retryKey, accountId });
    assert.equal(c.status, 200);
    assert.equal(c.headers['cache-control'], 'no-store');
    assert.equal(c.headers['set-cookie'], undefined);
    const proof = { retryKey, attemptId: c.body.attemptId, response: x.account.key.assert(c.body) };
    const issued = await call(prefix + 'finish', proof);
    assert.equal(issued.body.stage, 'issued');
    assert.deepEqual((await call(prefix + 'finish', proof)).body, issued.body);
    assert.equal((await call(prefix + 'renew', renewal(issued.body))).body.stage, 'access');
    assert.equal(
      (await call(prefix + 'acknowledge', renewal(issued.body))).body.stage,
      'acknowledged',
    );
    assert.equal((await call(prefix + 'finish', proof)).status, 409);
    assert.equal((await call(prefix + 'revoke', revocation(issued.body))).body.stage, 'revoked');
    const denied = await call(prefix + 'renew', renewal(issued.body));
    assert.equal(denied.status, 401);
    assert.equal(denied.body.refusal, 'sign-in-required');
  },
);

test(
  'origin/framing/bounds are enforced; the private bearer cannot bypass the session surface',
  { timeout: 10000 },
  async (t) => {
    const x = await ready(t),
      { call } = await serve(t, x),
      path = '/account/session/v1/begin';
    const body = { accountId: x.account.result.accountId, retryKey: fresh() };
    for (const headers of [
      { Host: 'other.invalid' },
      { Origin: 'https://other.invalid' },
      { Origin: '' },
      { 'Content-Type': 'text/plain' },
      { 'Content-Encoding': 'gzip' },
    ])
      assert.equal((await call(path, body, headers)).status, 403);
    assert.equal((await call(path, body, {}, 'PUT')).status, 403);
    assert.equal((await call(path, '{')).status, 400);
    assert.equal((await call(path, 'x'.repeat(SESSION_REQUEST_LIMIT + 1))).status, 413);
    for (const route of [
      '/__account-setup/access',
      '/__account-setup/finish',
      '/account/delivery/submit',
      path + '?token=anything',
      '/account/session/v1/toString',
    ])
      assert.equal((await call(route, body, { Authorization: 'Bearer ' + fresh() })).status, 404);
    assert.equal(
      (
        await call(
          '/account/session/v1/renew',
          { sessionId: fresh(), renewalToken: fresh() },
          { Authorization: 'Bearer ' + fresh() },
        )
      ).status,
      401,
    );
    assert.equal(x.f.rows('network_sessions').length, 0);
    assert.equal(x.f.rows('session_attempts').length, 0);
  },
);
