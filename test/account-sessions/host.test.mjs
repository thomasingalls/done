import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDevelopmentAccountService } from '../../account-service/development-runtime.ts';
import { accountSchema, upgradePreviewState } from '../../scripts/account-setup-state.mjs';
const fresh = () => randomBytes(32).toString('base64url');
async function fixture(t, networkSessions = true) {
  const directory = mkdtempSync(join(tmpdir(), 'done-session-host-'));
  let service;
  const server = createServer((req, res) => void service.handle(req, res, () => res.end('app')));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port,
    origin = `http://localhost:${port}`;
  const config = { directory, port, policy: { origin, rpId: 'localhost' }, networkSessions };
  service = openDevelopmentAccountService(config);
  t.after(async () => {
    await service.close();
    await new Promise((r) => {
      server.close(r);
      server.closeIdleConnections();
    });
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    config,
    directory,
    server,
    get service() {
      return service;
    },
    reopen() {
      service = openDevelopmentAccountService(config);
    },
    post: (route, body = {}, headers = {}) =>
      fetch(origin + route, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
  };
}
test('session host preserves capability-protected bootstrap through restart without exposing shared access', async (t) => {
  const f = await fixture(t),
    retryKey = fresh();
  assert.equal(accountSchema(join(f.directory, 'account.sqlite')), 14);
  assert.equal('token' in f.service.clientConfig, false);
  assert.deepEqual(await (await f.post('/__account-setup/config')).json(), {
    v: 2,
    ...f.service.clientConfig,
  });
  const pending = await (
    await f.post('/__account-setup/begin', { operation: 'register', retryKey })
  ).json();
  assert.equal(pending.stage, 'ceremony');
  const pin = f.service.clientConfig.pin;
  await f.service.close();
  f.reopen();
  assert.deepEqual(f.service.clientConfig.pin, pin);
  assert.deepEqual(await (await f.post('/__account-setup/resume', { retryKey })).json(), pending);
  for (const route of ['/__account-setup/access', '/__account-setup/unknown', '/account/unknown']) {
    const r = await f.post(route);
    assert.equal(r.status, 404);
    await r.text();
  }
  for (const route of [
    '/account/authority/discover',
    '/__account-setup/authority/discover',
    '/__account-setup/enrollment/admit',
    '/__account-setup/ceremony/exchange',
    '/__account-setup/content/checkpoint',
  ]) {
    const r = await f.post(route, {}, { Authorization: 'Bearer ' + fresh() });
    assert.notEqual(r.status, 200, route);
    await r.text();
    const missing = await f.post(route);
    assert.equal(missing.status, 401, route);
    assert.equal((await missing.json()).kind, 'authorization-refused', route);
  }
});
test('public bootstrap rejects wrong origin, oversized bodies, aliases and invalid attempt capabilities', async (t) => {
  const f = await fixture(t);
  for (const [route, body, headers, status] of [
    ['/__account-setup/config', {}, { Origin: 'https://other.invalid' }, 403],
    ['/__account-setup/config', 'x'.repeat(65), {}, 413],
    ['/__account-setup/begin', '{', {}, 400],
    ['/__account-setup/config?token=x', {}, {}, 404],
    ['/__account-setup/resume', { retryKey: fresh() }, {}, 409],
    ['/__account-setup/ceremony/bootstrap', {}, {}, 400],
  ]) {
    const r = await f.post(route, body, headers);
    assert.equal(r.status, status, route);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    await r.text();
  }
});
test('retained schema 11 requires offline opt-in; upgrade preserves pending account, pin and backup', async (t) => {
  const f = await fixture(t, false),
    retryKey = fresh();
  const pending = await (
    await f.post(
      '/__account-setup/begin',
      { operation: 'register', retryKey },
      { Authorization: 'Bearer ' + f.service.clientConfig.token },
    )
  ).json();
  const key = readFileSync(join(f.directory, 'operator.key')),
    pin = f.service.clientConfig.pin;
  await f.service.close();
  assert.throws(
    () => openDevelopmentAccountService({ ...f.config, networkSessions: true }),
    /explicit offline upgrade/,
  );
  assert.equal(accountSchema(join(f.directory, 'account.sqlite')), 11);
  await assert.rejects(
    upgradePreviewState({ ...f.config, networkSessions: true }),
    /Stop the preview/,
  );
  await new Promise((r) => {
    f.server.close(r);
    f.server.closeIdleConnections();
  });
  const upgraded = await upgradePreviewState({ ...f.config, networkSessions: true });
  assert.equal(upgraded.from, 11);
  assert.equal(upgraded.to, 14);
  assert.equal(accountSchema(join(upgraded.backup, 'account.sqlite')), 11);
  assert.deepEqual(readFileSync(join(f.directory, 'operator.key')), key);
  assert.deepEqual(JSON.parse(readFileSync(join(f.directory, 'pin.json'))), pin);
  f.config.networkSessions = true;
  f.reopen();
  await new Promise((r) => f.server.listen(f.config.port, '127.0.0.1', r));
  assert.deepEqual(await (await f.post('/__account-setup/resume', { retryKey })).json(), pending);
  await f.service.close();
  assert.throws(
    () => openDevelopmentAccountService({ ...f.config, networkSessions: false }),
    /Unsupported account schema|explicit offline upgrade/,
  );
});
