import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDevelopmentAccountService } from '../../account-service/development-runtime.ts';
import { AccountCore } from '../../account-service/core.ts';
import { verifyPinnedAuthority } from '../../account-protocol/authority.ts';
import { startAccountApplication } from '../../scripts/lib/account-application.mjs';
import { previewConfig, lockPreviewState } from '../../scripts/account-setup-state.mjs';
import { READ_REQUEST_LIMIT } from '../../account-protocol/deliveryTransport.ts';

const fresh = () => randomBytes(32).toString('base64url');
async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'done-account-runtime-'));
  let service;
  const server = createServer(
    (req, res) => void service.handle(req, res, () => res.end('static fallback')),
  );
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  const config = previewConfig({
    ACCOUNT_SETUP_STATE: directory,
    ACCOUNT_SETUP_PORT: server.address().port,
  });
  t.after(async () => {
    try {
      await service?.close();
    } finally {
      await new Promise((accept) => {
        server.close(accept);
        server.closeIdleConnections();
      });
      rmSync(directory, { recursive: true, force: true });
    }
  });
  service = openDevelopmentAccountService(config);
  const post = (route, body, headers = {}, signal) =>
    fetch(config.policy.origin + route, {
      method: 'POST',
      headers: {
        Origin: config.policy.origin,
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + service.clientConfig.token,
        ...headers,
      },
      body: typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  return {
    directory,
    config,
    server,
    post,
    get service() {
      return service;
    },
    reopen() {
      service = openDevelopmentAccountService(config);
      return service;
    },
  };
}

test(
  'exclusive runtime restart keeps authority and pending identity while renewing adapter access',
  { timeout: 15000 },
  async (t) => {
    const exits = process.listenerCount('exit'),
      signals = process.listenerCount('SIGTERM');
    const f = await fixture(t);
    assert.equal(process.listenerCount('exit'), exits);
    assert.equal(process.listenerCount('SIGTERM'), signals);
    assert.throws(() => openDevelopmentAccountService(f.config), /state is in use/);
    assert.throws(() => lockPreviewState(f.directory), /state is in use/);
    const config = f.service.clientConfig;
    const key = readFileSync(join(f.directory, 'operator.key'));
    const retryKey = fresh();
    const result = await f.post('/__account-setup/begin', { operation: 'register', retryKey });
    assert.equal(result.status, 200);
    const pending = await result.json();
    const close = f.service.close();
    assert.equal(close, f.service.close());
    await close;
    assert.equal(existsSync(join(f.directory, 'maintenance.lock')), false);
    f.reopen();
    assert.deepEqual(f.service.clientConfig.pin, config.pin);
    assert.deepEqual(readFileSync(join(f.directory, 'operator.key')), key);
    assert.notEqual(f.service.clientConfig.token, config.token);
    const stale = await f.post(
      '/__account-setup/resume',
      { retryKey },
      { Authorization: 'Bearer ' + config.token },
    );
    assert.equal(stale.status, 403);
    await stale.text();
    assert.deepEqual(await (await f.post('/__account-setup/resume', { retryKey })).json(), pending);
    const nonce = '01'.repeat(32);
    const proof = await (await f.post('/__account-setup/authority/prove', { nonce })).json();
    assert.deepEqual(await verifyPinnedAuthority(config.pin, nonce, proof), config.pin);
  },
);

test(
  'HTTP extraction preserves origin, method, token, framing and bounded ingress',
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t);
    const publicConfig = await f.post('/__account-setup/config', {}, { Authorization: '' });
    assert.equal(publicConfig.status, 200);
    assert.equal(publicConfig.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await publicConfig.json(), { v: 1, pin: f.service.clientConfig.pin });
    const access = await f.post('/__account-setup/access', {}, { Authorization: '' });
    assert.equal((await access.json()).token, f.service.clientConfig.token);
    // fetch owns Host; use the native HTTP client to put an incorrect value on the wire.
    const wrongHost = await new Promise((accept, reject) => {
      const req = request(
        f.config.policy.origin + '/__account-setup/access',
        {
          method: 'POST',
          headers: {
            Host: 'other.invalid',
            Origin: f.config.policy.origin,
            'Content-Type': 'application/json',
          },
        },
        (res) => {
          res.on('error', reject);
          res.on('end', () => accept(res.statusCode));
          res.resume();
        },
      );
      req.on('error', reject);
      req.end('{}');
    });
    assert.equal(wrongHost, 403);
    for (const headers of [{ Origin: 'https://other.invalid' }, { 'Content-Type': 'text/plain' }]) {
      const reply = await f.post('/__account-setup/access', {}, headers);
      assert.equal(reply.status, 403, JSON.stringify(headers));
      await reply.text();
    }
    const get = await fetch(f.config.policy.origin + '/__account-setup/access');
    assert.equal(get.status, 403);
    await get.text();
    const denied = await f.post(
      '/__account-setup/begin',
      {},
      { Authorization: 'Bearer ' + fresh() },
    );
    assert.equal(denied.status, 403);
    await denied.text();
    for (const [route, body, headers] of [
      ['/__account-setup/access', 'x'.repeat(65), {}],
      ['/__account-setup/begin', 'x'.repeat(131073), {}],
      ['/account/authority/discover', 'x'.repeat(4097), {}],
      [
        '/account/delivery/read-v2',
        new Uint8Array(READ_REQUEST_LIMIT + 1),
        { 'Content-Type': 'application/octet-stream' },
      ],
    ]) {
      const reply = await f.post(route, body, headers);
      assert.equal(reply.status, 413, route);
      await reply.text();
    }
    for (const route of ['/__account-setup/authority/discover', '/account/authority/discover']) {
      const reply = await f.post(route, {});
      assert.equal(reply.status, 409);
      await reply.text();
    }
    const malformed = await f.post('/__account-setup/begin', '{');
    assert.equal(malformed.status, 400);
    await malformed.text();
    const unknown = await f.post('/__account-setup/missing', {});
    assert.equal(unknown.status, 404);
    await unknown.text();
    assert.equal(
      await (await fetch(f.config.policy.origin + '/accounts')).text(),
      'static fallback',
    );
  },
);

test(
  'closing drains an awaited operation after client disconnect and refuses new work',
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t),
      retryKey = fresh();
    const pending = await (
      await f.post('/__account-setup/begin', { operation: 'register', retryKey })
    ).json();
    let enter, release, completed;
    const entered = new Promise((r) => {
        enter = r;
      }),
      barrier = new Promise((r) => {
        release = r;
      });
    // Hold a real service dispatch after its body is read. Its final DB read must
    // still work even after the transport disappears and close has been requested.
    t.mock.method(AccountCore.prototype, 'finish', async function (input) {
      enter();
      await barrier;
      completed = this.resume(input);
      return completed;
    });
    const controller = new AbortController();
    const request = f
      .post('/__account-setup/finish', { retryKey }, {}, controller.signal)
      .catch(() => null);
    try {
      await entered;
      controller.abort();
      await request;
      let closed = false;
      const closing = f.service.close().then(() => {
        closed = true;
      });
      await new Promise((r) => setImmediate(r));
      assert.equal(closed, false);
      assert.throws(() => f.reopen(), /state is in use/);
      const refused = await f.post('/__account-setup/resume', { retryKey });
      assert.equal(refused.status, 503);
      await refused.text();
      release();
      await closing;
      assert.deepEqual(completed, pending);
      assert.equal(existsSync(join(f.directory, 'maintenance.lock')), false);
      f.reopen();
      assert.deepEqual(
        await (await f.post('/__account-setup/resume', { retryKey })).json(),
        pending,
      );
    } finally {
      release();
    }
  },
);

test(
  'failed authority or schema opening releases the directory without replacing retained state',
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t);
    await f.service.close();
    const pinPath = join(f.directory, 'pin.json'),
      pin = readFileSync(pinPath),
      key = readFileSync(join(f.directory, 'operator.key'));
    writeFileSync(pinPath, '{');
    assert.throws(() => f.reopen());
    assert.equal(existsSync(join(f.directory, 'maintenance.lock')), false);
    writeFileSync(pinPath, pin);
    const path = join(f.directory, 'account.sqlite'),
      db = new DatabaseSync(path);
    const schema = db.prepare('PRAGMA user_version').get().user_version;
    db.exec('PRAGMA user_version=99');
    db.close();
    assert.throws(() => f.reopen(), /explicit offline upgrade/);
    assert.equal(existsSync(join(f.directory, 'maintenance.lock')), false);
    assert.deepEqual(readFileSync(pinPath), pin);
    assert.deepEqual(readFileSync(join(f.directory, 'operator.key')), key);
    const restored = new DatabaseSync(path);
    restored.exec('PRAGMA user_version=' + schema);
    restored.close();
    f.reopen();
  },
);

test(
  'host startup failures release service ownership so the same retained directory can reopen',
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t);
    await f.service.close();
    await assert.rejects(
      startAccountApplication({ config: f.config, packaged: join(f.directory, 'missing') }),
      /ENOENT/,
    );
    assert.equal(existsSync(join(f.directory, 'maintenance.lock')), false);
    const build = join(f.directory, 'build');
    mkdirSync(build);
    for (const name of ['index.html', 'local.html', 'sw.js'])
      writeFileSync(join(build, name), 'fixture');
    // The fixture's listener still owns this port, so bind must fail after service opening.
    await assert.rejects(startAccountApplication({ config: f.config, packaged: build }), {
      code: 'EADDRINUSE',
    });
    assert.equal(existsSync(join(f.directory, 'maintenance.lock')), false);
    f.reopen();
    assert.equal((await f.post('/__account-setup/config', {})).status, 200);
  },
);
