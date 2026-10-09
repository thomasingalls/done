import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializePublicState } from '../../account-service/public-state.ts';
import { startPublicAccountServer } from '../../account-service/public-server.ts';
import { startAccountGateway } from '../../scripts/lib/account-gateway.mjs';

const origin = 'https://done.example.com';
function send(port, path, body = '{}', headers = {}, method = 'POST') {
  return new Promise((accept, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          Host: 'done.example.com',
          Origin: origin,
          'Content-Type': 'application/json',
          ...headers,
        },
      },
      (response) => {
        const chunks = [];
        response.on('data', (part) => chunks.push(part));
        response.on('error', reject);
        response.on('end', () =>
          accept({
            status: response.statusCode,
            headers: response.headers,
            text: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

test('public app/API preserve exact origin, scoped authority and durable attempts across independent restarts', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'done-public-http-'));
  const options = {
    directory: join(root, 'state'),
    operatorKeyFile: join(root, 'key'),
    pinFile: join(root, 'pin'),
    policy: { origin, rpId: 'done.example.com' },
    port: 0,
  };
  writeFileSync(options.operatorKeyFile, randomBytes(32), { mode: 0o600 });
  const pin = initializePublicState(options);
  writeFileSync(options.pinFile, JSON.stringify(pin));
  const packaged = join(root, 'build');
  mkdirSync(packaged);
  for (const file of ['index.html', 'local.html', 'sw.js'])
    writeFileSync(join(packaged, file), 'packaged application');
  let api, app;
  t.after(async () => {
    await app?.close();
    await api?.close();
    rmSync(root, { recursive: true, force: true });
  });
  api = await startPublicAccountServer(options);
  const servicePort = api.port;
  app = await startAccountGateway({
    port: 0,
    servicePort,
    origin,
    packaged,
    address: '0.0.0.0',
    health: true,
  });
  const getConfig = () => send(app.port, '/__account-setup/config');
  const config = JSON.parse((await getConfig()).text);
  assert.deepEqual(config, { v: 2, pin, networkSessions: true, membershipContinuation: true });
  assert.equal('token' in config, false);
  for (const headers of [{ Host: 'other.example.com' }, { Origin: 'https://other.example.com' }])
    assert.equal((await send(app.port, '/__account-setup/config', '{}', headers)).status, 403);
  for (const path of ['/account/delivery/submit', '/__account-setup/access'])
    assert.notEqual((await send(app.port, path)).status, 200);
  assert.equal((await send(app.port, '/readyz', '', { Host: '127.0.0.1' }, 'GET')).status, 200);
  assert.equal((await send(api.port, '/readyz', '', {}, 'GET')).status, 200);
  const retryKey = randomBytes(32).toString('base64url');
  const begin = await send(
    app.port,
    '/__account-setup/begin',
    JSON.stringify({ operation: 'register', retryKey }),
  );
  assert.equal(begin.status, 200);
  await api.close();
  assert.equal((await getConfig()).status, 503);
  assert.equal((await send(app.port, '/', '', {}, 'GET')).text, 'packaged application');
  // The serving process can restart without any key/state options or an available API.
  await app.close();
  app = await startAccountGateway({
    port: 0,
    servicePort,
    origin,
    packaged,
    address: '0.0.0.0',
    health: true,
  });
  api = await startPublicAccountServer({ ...options, port: servicePort });
  assert.deepEqual(JSON.parse((await getConfig()).text), config);
  const resumed = await send(app.port, '/__account-setup/resume', JSON.stringify({ retryKey }));
  assert.equal(resumed.status, 200);
  assert.deepEqual(JSON.parse(resumed.text), JSON.parse(begin.text));
  await assert.rejects(startPublicAccountServer({ ...options, port: servicePort }), /in use/);
});
