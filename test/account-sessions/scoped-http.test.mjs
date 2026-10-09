import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { sign } from 'node:crypto';
import { createScopedAccountHandler } from '../../account-service/scoped-http.ts';
import { fixture, message } from './grant-fixtures.mjs';
import { query } from '../account-service-inbound/oracle.mjs';
import { fresh } from '../account-core/fixtures.mjs';

async function serve(t, x) {
  const handler = createScopedAccountHandler(x.f.core, x.authority.owner, x.authority.pin);
  const server = createServer((req, res) => void handler(req, res));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return (path, body, token = x.first.access.accessToken, headers = {}) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port: server.address().port,
          method: 'POST',
          path,
          headers: {
            Host: new URL(x.authority.pin.origin).host,
            Origin: x.authority.pin.origin,
            'Content-Type':
              body instanceof Uint8Array ? 'application/octet-stream' : 'application/json',
            Authorization: 'Bearer ' + token,
            ...headers,
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (v) => chunks.push(v));
          res.on('end', () => {
            const bytes = Buffer.concat(chunks);
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body:
                res.headers['content-type'] === 'application/octet-stream'
                  ? bytes
                  : JSON.parse(bytes.toString()),
            });
          });
        },
      );
      req.on('error', reject);
      req.end(body instanceof Uint8Array || typeof body === 'string' ? body : JSON.stringify(body));
    });
}
test('scoped HTTP handshake and authenticated read; no shared bearer, cookie or /access fallback', async (t) => {
  const x = await fixture(t),
    call = await serve(t, x),
    begin = '/account/grant/v1/begin',
    finish = '/account/grant/v1/finish';
  const b = await call(begin, x.scope);
  assert.equal(b.status, 200);
  assert.equal(b.headers['cache-control'], 'no-store');
  assert.equal(b.headers['set-cookie'], undefined);
  const proof = {
    challengeId: b.body.challenge.challengeId,
    signature: sign(null, message(b.body.challenge), x.s.privateKey).toString('hex'),
  };
  const g = await call(finish, proof);
  assert.equal(g.status, 200);
  const q = query(x),
    route = '/account/delivery/read-v2';
  assert.equal((await call(route, q, g.body.grantToken)).status, 200);
  for (const token of [fresh(), x.first.access.accessToken, x.first.session.renewalToken]) {
    const denied = await call(route, q, token);
    assert.equal(denied.status, 401);
    assert.equal(denied.body.kind, 'authorization-refused');
    assert.equal(denied.body.refusal, 'grant-required');
  }
  assert.equal(
    (await call(route, q, '', { Authorization: '', Cookie: 'session=' + g.body.grantToken }))
      .status,
    401,
  );
  for (const path of [
    '/__account-setup/access',
    '/__account-setup/begin',
    route + '?token=' + g.body.grantToken,
  ])
    assert.equal((await call(path, {}, fresh())).status, 404);
  x.first.revoke();
  const denied = await call(route, q, g.body.grantToken);
  assert.equal(denied.status, 401);
  assert.equal(denied.body.refusal, 'sign-in-required');
});
test('HTTP rejects wrong framing/bounds and separates authorization from domain refusals', async (t) => {
  const x = await fixture(t),
    call = await serve(t, x),
    path = '/account/grant/v1/begin';
  for (const headers of [
    { Host: 'other.invalid' },
    { Origin: '' },
    { Origin: 'https://other.invalid' },
    { 'Content-Encoding': 'gzip' },
    { 'Content-Type': 'text/plain' },
  ])
    assert.equal((await call(path, x.scope, x.first.access.accessToken, headers)).status, 403);
  assert.equal((await call(path, 'x'.repeat(4097))).status, 413);
  assert.equal((await call(path, '{')).status, 400);
  const denied = await call(path, x.scope, fresh());
  assert.equal(denied.body.kind, 'authorization-refused');
  assert.equal(denied.body.refusal, 'access-required');
  const g = await x.grant();
  const domain = await call('/account/delivery/read-v2', query(x, 10), g.grantToken);
  assert.equal(domain.status, 409);
  assert.equal(domain.body.kind, 'unknown');
  assert.equal(domain.body.refusal, undefined);
});
