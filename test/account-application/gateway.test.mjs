import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { connect } from 'node:net';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startAccountGateway } from '../../scripts/lib/account-gateway.mjs';
import { previewConfig, accountServicePort } from '../../scripts/lib/account-config.mjs';
import { startDevelopmentAccountServer } from '../../account-service/development-server.ts';

const origin = 'https://fixture.ts.net:8443';
const policy = { origin, rpId: 'fixture.ts.net' };
const requestHeaders = {
  Host: new URL(origin).host,
  Origin: origin,
  'Content-Type': 'application/json',
};
async function listen(server) {
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  return server.address().port;
}
async function stop(server) {
  await new Promise((accept) => {
    server.close(accept);
    server.closeIdleConnections();
  });
}
function send(port, path, body = '{}', headers = {}, method = 'POST') {
  return new Promise((accept, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: { ...requestHeaders, ...headers },
      },
      (res) => {
        const parts = [];
        res.on('data', (part) => parts.push(part));
        res.on('error', reject);
        res.on('end', () =>
          accept({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts) }),
        );
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}
function buildFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'done-account-gateway-'));
  const packaged = join(directory, 'build');
  mkdirSync(packaged);
  for (const file of ['index.html', 'local.html', 'sw.js'])
    writeFileSync(join(packaged, file), 'immutable application');
  return { directory, packaged };
}

test('split ports keep the exact public origin and refuse a proxy loop', () => {
  const config = previewConfig({ ACCOUNT_SETUP_PORT: '53219', ACCOUNT_SETUP_ORIGIN: origin });
  assert.deepEqual(config.policy, policy);
  assert.equal(accountServicePort(config, { ACCOUNT_SERVICE_PORT: '53220' }), 53220);
  for (const port of ['53219', '0', '65536', 'NaN'])
    assert.throws(
      () => accountServicePort(config, { ACCOUNT_SERVICE_PORT: port }),
      /distinct loopback port/,
    );
});

test('gateway streams exact bytes and client authority inputs only to its fixed API upstream', async (t) => {
  const { directory, packaged } = buildFixture();
  const observed = [];
  const upstream = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    observed.push({
      path: req.url,
      method: req.method,
      headers: req.headers,
      body: Buffer.concat(chunks),
    });
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    res.end(Buffer.from([0, 255, 254, 1]));
  });
  const servicePort = await listen(upstream);
  const app = await startAccountGateway({ port: 0, origin, servicePort, packaged });
  t.after(async () => {
    await app.close();
    await stop(upstream);
    rmSync(directory, { recursive: true, force: true });
  });
  const bytes = randomBytes(10000);
  const reply = await send(app.port, '/account/delivery/submit', bytes, {
    'Content-Type': 'application/octet-stream',
    Authorization: 'Bearer exact-client-token',
    'X-Forwarded-Host': 'unrelated.invalid',
    Cookie: 'must-not-travel',
  });
  assert.equal(reply.status, 200);
  assert.equal(reply.headers['cache-control'], 'no-store');
  assert.equal(reply.headers['content-type'], 'application/octet-stream');
  assert.deepEqual(reply.body, Buffer.from([0, 255, 254, 1]));
  assert.equal(observed.length, 1);
  assert.deepEqual(observed[0].body, bytes);
  assert.equal(observed[0].path, '/account/delivery/submit');
  assert.equal(observed[0].method, 'POST');
  for (const key of ['host', 'origin', 'authorization', 'content-type'])
    assert.equal(
      observed[0].headers[key],
      {
        host: new URL(origin).host,
        origin,
        authorization: 'Bearer exact-client-token',
        'content-type': 'application/octet-stream',
      }[key],
    );
  assert.equal(observed[0].headers['x-forwarded-host'], undefined);
  assert.equal(observed[0].headers.cookie, undefined);
  assert.equal(
    (await send(app.port, '/__account-setup/access', '{}', { Host: 'unrelated.invalid' })).status,
    403,
  );
  assert.equal(
    (await send(app.port, '/accounts', '', {}, 'GET')).body.toString(),
    'immutable application',
  );
  for (const path of ['/.dev/operator.key', '/src/main.tsx', '/account-other/missing'])
    assert.equal((await send(app.port, path, '', {}, 'GET')).status, 404);
  assert.equal(observed.length, 1);
});

test('API-only owner retains identity through independent restarts; gateway works while API is absent', async (t) => {
  const { directory, packaged } = buildFixture();
  const options = { directory: join(directory, 'state'), policy, port: 0 };
  let backend = await startDevelopmentAccountServer(options);
  const servicePort = backend.port;
  let app = await startAccountGateway({ port: 0, origin, servicePort, packaged });
  t.after(async () => {
    await app.close();
    await backend.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const config = JSON.parse((await send(app.port, '/__account-setup/access')).body);
  const key = readFileSync(join(options.directory, 'operator.key'));
  const auth = { Authorization: 'Bearer ' + config.token };
  const retryKey = randomBytes(32).toString('base64url');
  const pending = await send(
    app.port,
    '/__account-setup/begin',
    JSON.stringify({ operation: 'register', retryKey }),
    auth,
  );
  assert.equal(pending.status, 200);
  for (const headers of [{ Origin: 'https://unrelated.invalid' }, { Origin: '' }])
    assert.equal((await send(app.port, '/__account-setup/access', '{}', headers)).status, 403);
  assert.equal(
    (await send(app.port, '/__account-setup/resume', JSON.stringify({ retryKey }))).status,
    403,
  );
  assert.equal((await send(app.port, '/__account-setup/access', 'x'.repeat(65))).status, 413);
  assert.equal(
    (await send(app.port, '/account/authority/discover', 'x'.repeat(4097), auth)).status,
    413,
  );
  assert.equal((await send(servicePort, '/', '', {}, 'GET')).status, 404);
  await app.close();
  app = await startAccountGateway({ port: 0, origin, servicePort, packaged });
  assert.deepEqual(JSON.parse((await send(app.port, '/__account-setup/access')).body), config);
  await backend.close();
  const unavailable = await send(app.port, '/__account-setup/config');
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers['cache-control'], 'no-store');
  assert.equal((await send(app.port, '/', '', {}, 'GET')).status, 200);
  // Gateway startup also succeeds with no backend; it owns neither key nor directory lock.
  await app.close();
  app = await startAccountGateway({ port: 0, origin, servicePort, packaged });
  backend = await startDevelopmentAccountServer({ ...options, port: servicePort });
  const next = JSON.parse((await send(app.port, '/__account-setup/access')).body);
  assert.deepEqual(next.pin, config.pin);
  assert.notEqual(next.token, config.token);
  assert.deepEqual(readFileSync(join(options.directory, 'operator.key')), key);
  assert.equal(
    (await send(app.port, '/__account-setup/resume', JSON.stringify({ retryKey }), auth)).status,
    403,
  );
  const resumed = await send(app.port, '/__account-setup/resume', JSON.stringify({ retryKey }), {
    Authorization: 'Bearer ' + next.token,
  });
  assert.equal(resumed.status, 200);
  assert.deepEqual(resumed.body, pending.body);
});

test('gateway never retries a request whose reply is lost or truncated', async (t) => {
  const { directory, packaged } = buildFixture();
  let accepted = 0;
  const upstream = createServer(async (req, res) => {
    for await (const _ of req) {
      /* consume before simulating acceptance */
    }
    accepted++;
    if (req.url.endsWith('/truncated')) {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': 10 });
      res.write('x');
      setImmediate(() => res.destroy());
    } else res.destroy();
  });
  const servicePort = await listen(upstream);
  const app = await startAccountGateway({ port: 0, origin, servicePort, packaged });
  t.after(async () => {
    await app.close();
    await stop(upstream);
    rmSync(directory, { recursive: true, force: true });
  });
  assert.equal((await send(app.port, '/__account-setup/finish')).status, 503);
  assert.equal(accepted, 1);
  await assert.rejects(send(app.port, '/account/delivery/truncated'));
  assert.equal(accepted, 2);
});

test('gateway drains an active reply and closes connections that become idle during shutdown', async (t) => {
  const { directory, packaged } = buildFixture();
  let enter, release;
  const entered = new Promise((accept) => {
    enter = accept;
  });
  const barrier = new Promise((accept) => {
    release = accept;
  });
  const upstream = createServer(async (req, res) => {
    for await (const _ of req) {
      /* wait until the operation can run */
    }
    enter();
    await barrier;
    res.end('completed reply');
  });
  const servicePort = await listen(upstream);
  const app = await startAccountGateway({ port: 0, origin, servicePort, packaged });
  t.after(async () => {
    release();
    await app.close();
    await stop(upstream);
    rmSync(directory, { recursive: true, force: true });
  });
  const pending = send(app.port, '/__account-setup/finish', '{}', { Connection: 'keep-alive' });
  await entered;
  const closing = app.close();
  release();
  assert.equal((await pending).body.toString(), 'completed reply');
  let timer;
  try {
    await Promise.race([
      closing,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error('Completed response left a keep-alive connection holding shutdown')),
          1000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
});

test('gateway closes unrequested preconnections while draining an admitted reply exactly once', async (t) => {
  const { directory, packaged } = buildFixture();
  let enter, release;
  const entered = new Promise((resolve) => {
    enter = resolve;
  });
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  let accepted = 0;
  const upstream = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).toString(), 'accepted original');
    accepted++;
    enter();
    await barrier;
    res.end('completed admitted reply');
  });
  const servicePort = await listen(upstream);
  const app = await startAccountGateway({ port: 0, origin, servicePort, packaged });
  const idle = connect(app.port, '127.0.0.1');
  let pending, timer;
  t.after(async () => {
    clearTimeout(timer);
    release();
    idle.destroy();
    await pending?.catch(() => {});
    await app.close();
    await stop(upstream);
    rmSync(directory, { recursive: true, force: true });
  });
  await once(idle, 'connect');
  pending = send(app.port, '/__account-setup/finish', 'accepted original');
  await entered;
  const idleClosed = once(idle, 'close');
  let finished = false;
  const closing = app.close().then(() => {
    finished = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(finished, false, 'shutdown must wait for the admitted operation');
  release();
  assert.equal((await pending).body.toString(), 'completed admitted reply');
  assert.equal(accepted, 1);
  await Promise.race([
    Promise.all([closing, idleClosed]),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('Unrequested preconnection held shutdown open')), 1000);
    }),
  ]);
});

test('gateway closes incomplete HTTP headers without forwarding an unadmitted request', async (t) => {
  const { directory, packaged } = buildFixture();
  let accepted = 0;
  const upstream = createServer((req, res) => {
    accepted++;
    req.resume();
    res.end('control');
  });
  const servicePort = await listen(upstream);
  const app = await startAccountGateway({ port: 0, origin, servicePort, packaged });
  const partial = connect(app.port, '127.0.0.1');
  let timer;
  t.after(async () => {
    clearTimeout(timer);
    partial.destroy();
    await app.close();
    await stop(upstream);
    rmSync(directory, { recursive: true, force: true });
  });
  await once(partial, 'connect');
  partial.write(
    'POST /account/not-admitted HTTP/1.1\r\nHost: ' + new URL(origin).host + '\r\nX-Incomplete:',
  );
  assert.equal((await send(app.port, '/account/control')).body.toString(), 'control');
  const partialClosed = once(partial, 'close');
  await Promise.race([
    Promise.all([app.close(), partialClosed]),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('Incomplete headers held shutdown open')), 1000);
    }),
  ]);
  assert.equal(accepted, 1, 'only the complete control request can reach the API');
});
