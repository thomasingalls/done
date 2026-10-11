import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { fixture } from './grant-fixtures.mjs';
import { AccountNotifications, NOTIFICATION_PATH } from '../../account-service/notifications.ts';
import { createSessionAccountHandler } from '../../account-service/session-host.ts';
import { startAccountGateway } from '../../scripts/lib/account-gateway.mjs';
import { encodeSubmit } from '../../account-protocol/deliveryTransport.ts';
import { query } from '../account-service-inbound/oracle.mjs';
const tick = () => new Promise((r) => setImmediate(r));
async function host(t, options = {}) {
  const x = await fixture(t, { clock: options.clock ?? (() => Date.now()) });
  const broker = new AccountNotifications(x.f.core.grants, x.authority.pin);
  const handler = createSessionAccountHandler(x.f.core, x.authority.owner, x.authority.pin, broker);
  const server = createServer((req, res) => void handler(req, res, () => res.writeHead(404).end()));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  let port = server.address().port;
  let app, directory;
  if (options.gateway) {
    directory = mkdtempSync(join(tmpdir(), 'done-notification-gateway-'));
    for (const name of ['index.html', 'local.html', 'sw.js'])
      writeFileSync(join(directory, name), 'fixture');
    app = await startAccountGateway({
      port: 0,
      origin: x.authority.pin.origin,
      servicePort: port,
      packaged: directory,
    });
    port = app.port;
  }
  t.after(async () => {
    broker.close();
    await app?.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    if (directory) rmSync(directory, { recursive: true, force: true });
  });
  const headers = {
    Host: new URL(x.authority.pin.origin).host,
    Origin: x.authority.pin.origin,
    'Content-Type': 'application/json',
  };
  const open = (path, body, token, extra = {}) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          path,
          method: 'POST',
          headers: { ...headers, Authorization: 'Bearer ' + token, ...extra },
        },
        (res) => resolve({ req, res }),
      );
      req.on('error', reject);
      req.end(body instanceof Uint8Array || typeof body === 'string' ? body : JSON.stringify(body));
    });
  const call = async (path, body, token, extra) => {
    const { res } = await open(path, body, token, extra),
      chunks = [];
    for await (const chunk of res) chunks.push(chunk);
    return { status: res.statusCode, bytes: Buffer.concat(chunks) };
  };
  const stream = async (grant, scope = x.scope) => {
    const { req, res } = await open(NOTIFICATION_PATH, scope, grant.grantToken);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'text/event-stream');
    assert.equal(res.headers['cache-control'], 'no-store');
    const frames = [],
      waiting = [];
    let buffer = '',
      ended = false;
    const finish = () => {
      ended = true;
      for (const w of waiting.splice(0)) w(null);
    };
    const closed = new Promise((r) => res.once('close', r));
    res.on('error', () => {});
    res.once('close', finish);
    res.on('data', (b) => {
      buffer += b.toString();
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const waiter = waiting.shift();
        if (waiter) waiter(frame);
        else frames.push(frame);
      }
    });
    return {
      req,
      res,
      closed,
      frames,
      next: () =>
        frames.length
          ? Promise.resolve(frames.shift())
          : ended
            ? Promise.resolve(null)
            : new Promise((r) => waiting.push(r)),
      close: () => {
        req.destroy();
        res.destroy();
      },
    };
  };
  return { ...x, broker, call, stream, headers, app };
}
test('packaged gateway delivers ready, suppresses content echo, retains control hints; durable catch-up repairs a deliberately missed notification', async (t) => {
  const x = await host(t, { gateway: true }),
    g = await x.grant(),
    s = await x.stream(g);
  assert.equal(await s.next(), 'event: ready\ndata: {}');
  const a = x.make();
  const submitted = await x.call(
    '/account/delivery/submit',
    encodeSubmit(x.workspace, a.bytes),
    g.grantToken,
    { 'Content-Type': 'application/octet-stream' },
  );
  assert.equal(submitted.status, 200);
  await tick();
  assert.equal(s.frames.length, 0, 'own submit must not hint its writer');
  x.broker.committed(x.scope);
  assert.equal(await s.next(), 'event: hint\ndata: {}');
  const read = await x.call('/account/delivery/read-v2', query(x), g.grantToken, {
    'Content-Type': 'application/octet-stream',
  });
  assert.equal(read.status, 200);
  await tick();
  assert.equal(s.frames.length, 0, 'reads must not generate hints');
  s.close();
  await s.closed;
  // Existing accepted state is still available even if a device never received the earlier hint.
  const replacement = await x.stream(g);
  assert.equal(await replacement.next(), 'event: ready\ndata: {}');
  const catchup = await x.call('/account/delivery/read-v2', query(x), g.grantToken, {
    'Content-Type': 'application/octet-stream',
  });
  assert.equal(catchup.status, 200);
  assert.ok(catchup.bytes.length > 0);
  await x.app.close();
  await replacement.closed;
});
test('streams are exact-scope authorized; fake access, another reader, query credentials and wrong origin refuse', async (t) => {
  const x = await host(t),
    g = await x.grant();
  for (const [scope, token, headers, path] of [
    [x.scope, x.first.access.accessToken, {}, NOTIFICATION_PATH],
    [{ ...x.scope, credentialId: '00'.repeat(16) }, g.grantToken, {}, NOTIFICATION_PATH],
    [{ ...x.scope, workspaceId: '00'.repeat(16) }, g.grantToken, {}, NOTIFICATION_PATH],
    [x.scope, g.grantToken, { Origin: 'https://other.invalid' }, NOTIFICATION_PATH],
    [x.scope, '', {}, NOTIFICATION_PATH + '?token=' + g.grantToken],
  ])
    assert.notEqual((await x.call(path, scope, token, headers)).status, 200);
  const s = await x.stream(g);
  await s.next();
  x.broker.committed({ ...x.scope, workspaceId: '00'.repeat(16) });
  await tick();
  assert.equal(s.frames.length, 0);
  // Another publisher in this workspace still wakes us on content commits.
  x.broker.committed({ ...x.scope, credentialId: '11'.repeat(16) }, false, true);
  assert.equal(await s.next(), 'event: hint\ndata: {}');
  for (let i = 0; i < 100; i++) x.broker.committed(x.scope);
  assert.equal(await s.next(), 'event: hint\ndata: {}');
  await tick();
  assert.equal(s.frames.length, 0, 'coalesce synchronous hints');
});
test('revocation closes only that parent and stream limits do not evict another session', async (t) => {
  const x = await host(t),
    g = await x.grant();
  const peers = [];
  for (let i = 0; i < 4; i++) {
    const s = await x.stream(g);
    await s.next();
    peers.push(s);
  }
  assert.equal((await x.call(NOTIFICATION_PATH, x.scope, g.grantToken)).status, 429);
  const other = await x.login(),
    h = await x.grant(x.scope, x.s.privateKey, other.access),
    s = await x.stream(h);
  await s.next();
  const revoked = await x.call(
    '/account/session/v1/revoke',
    { sessionId: x.first.session.sessionId, revokeToken: x.first.session.revokeToken },
    '',
  );
  assert.equal(revoked.status, 200);
  await Promise.all(peers.map((p) => p.closed));
  x.broker.committed(x.scope);
  assert.equal(await s.next(), 'event: hint\ndata: {}');
  x.broker.close();
  await s.closed;
});
test('access deadline caps a grant and expiry prevents further stream output', async (t) => {
  let now = Date.now();
  const x = await host(t, { clock: () => now });
  now = x.first.access.expiresAt - 1000;
  const g = await x.grant();
  assert.equal(g.expiresAt, x.first.access.expiresAt);
  const s = await x.stream(g);
  await s.next();
  now = g.expiresAt;
  x.broker.reconcile();
  await s.closed;
  assert.equal(await s.next(), null);
});
test('a backpressured stream is dropped without retaining a queued output or timer', async (t) => {
  const x = await fixture(t, { clock: () => Date.now() }),
    g = await x.grant();
  const broker = new AccountNotifications(x.f.core.grants, x.authority.pin);
  t.after(() => broker.close());
  const response = new EventEmitter();
  let destroyed = false,
    writes = 0;
  Object.assign(response, {
    setHeader() {},
    writeHead() {
      return this;
    },
    writableLength: 0,
    write() {
      writes++;
      return false;
    },
    destroy() {
      destroyed = true;
      this.emit('close');
    },
  });
  const req = {
    url: NOTIFICATION_PATH,
    method: 'POST',
    headers: {
      Host: '',
      host: new URL(x.authority.pin.origin).host,
      origin: x.authority.pin.origin,
      'content-type': 'application/json',
      authorization: 'Bearer ' + g.grantToken,
    },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(x.scope));
    },
  };
  await broker.handle(req, response);
  assert.equal(destroyed, true);
  assert.equal(writes, 1);
  broker.committed(x.scope);
  await tick();
  assert.equal(writes, 1);
});
