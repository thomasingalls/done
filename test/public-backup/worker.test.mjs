import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { initializePublicState, openPublicState } from '../../account-service/public-state.ts';
import { b2Fixture } from './b2-fixture.mjs';

process.umask(0o077);
function post(port, path, body) {
  return new Promise((accept, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          Host: 'done.example.com',
          Origin: 'https://done.example.com',
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (p) => chunks.push(p));
        res.on('error', reject);
        res.on('end', () =>
          accept({ status: res.statusCode, json: async () => JSON.parse(Buffer.concat(chunks)) }),
        );
      },
    );
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}
test('API-owned worker backs up through process restart, reaps its temporary state and releases ownership after shutdown', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'done-backup-worker-'));
  const options = {
    directory: join(root, 'state'),
    operatorKeyFile: join(root, 'key'),
    pinFile: join(root, 'pin'),
    policy: { origin: 'https://done.example.com', rpId: 'done.example.com' },
  };
  writeFileSync(options.operatorKeyFile, randomBytes(32));
  const pin = initializePublicState(options);
  writeFileSync(options.pinFile, JSON.stringify(pin));
  const identity = join(root, 'identity');
  execFileSync('age-keygen', ['-o', identity], { stdio: 'ignore' });
  const work = join(root, 'work');
  mkdirSync(work);
  const orphan = join(work, 'run-' + 'ab'.repeat(16));
  mkdirSync(orphan);
  writeFileSync(join(orphan, 'partial'), 'fixture');
  const config = {
    v: 1,
    bucketId: 'fixtureBucket',
    prefix: 'done-backups/' + 'ab'.repeat(16) + '/',
    workDirectory: work,
    credentialsFile: join(root, 'credentials'),
    recipient: execFileSync('age-keygen', ['-y', identity], { encoding: 'utf8' }).trim(),
  };
  writeFileSync(
    config.credentialsFile,
    JSON.stringify({ keyId: 'fixtureKey', applicationKey: 'fixtureSecret00000000' }),
  );
  const configPath = join(root, 'backup-config');
  writeFileSync(configPath, JSON.stringify(config));
  const fixture = await b2Fixture(config);
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  let child, exit;
  const start = () => {
    child = spawn(
      process.execPath,
      [
        '--import',
        resolve('test/public-backup/fixture-network.mjs'),
        'scripts/public-account.mjs',
        'api',
      ],
      {
        env: {
          ...process.env,
          DONE_STATE_DIR: options.directory,
          DONE_PUBLIC_ORIGIN: options.policy.origin,
          DONE_OPERATOR_KEY_FILE: options.operatorKeyFile,
          DONE_SERVICE_PIN_FILE: options.pinFile,
          DONE_API_PORT: String(port),
          DONE_BACKUP_CONFIG_FILE: configPath,
          DONE_SOURCE_REVISION: '12'.repeat(20),
          DONE_TEST_B2_ORIGIN: fixture.origin,
        },
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    );
    child.stderr.resume();
    exit = once(child, 'exit');
  };
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await exit;
    }
    await fixture.close();
    rmSync(root, { recursive: true, force: true });
  });
  async function healthy() {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      assert(child.exitCode === null && child.signalCode === null, 'API exited unexpectedly');
      try {
        const r = await fetch('http://127.0.0.1:' + port + '/backupz');
        const value = await r.json();
        if (r.status === 200) return value;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw Error('Backup health did not become ready');
  }
  start();
  assert.equal((await healthy()).backups, 1);
  assert(!existsSync(orphan));
  assert.throws(() => openPublicState(options), /in use/);
  const firstCount = fixture.files.size;
  const retryKey = randomBytes(32).toString('base64url');
  const begin = await post(port, '/__account-setup/begin', { operation: 'register', retryKey });
  assert.equal(begin.status, 200);
  const expected = await begin.json();
  child.kill('SIGKILL');
  await exit;
  start();
  await healthy();
  assert(
    fixture.files.size > firstCount,
    'restart takes a fresh snapshot, regardless of the old connection-local data_version',
  );
  const resume = await post(port, '/__account-setup/resume', { retryKey });
  assert.deepEqual(await resume.json(), expected);
  const bytes = [...fixture.files.values()].at(-1).bytes;
  const encrypted = join(root, 'remote.age');
  writeFileSync(encrypted, bytes);
  const archive = execFileSync('age', ['-d', '-i', identity, encrypted], {
    maxBuffer: 16 * 1024 ** 2,
  });
  const manifest = JSON.parse(
    execFileSync('tar', ['-xzOf', '-', 'backup.json'], { input: archive, encoding: 'utf8' }),
  );
  assert.deepEqual(manifest.pin, pin);
  const restored = join(root, 'snapshot.sqlite');
  writeFileSync(
    restored,
    execFileSync('tar', ['-xzOf', '-', 'account.sqlite'], {
      input: archive,
      maxBuffer: 16 * 1024 ** 2,
    }),
  );
  const db = new DatabaseSync(restored, { readOnly: true });
  try {
    assert.equal(
      db.prepare('SELECT count(*) AS n FROM attempts').get().n,
      1,
      'the restart backup contains the accepted registration',
    );
  } finally {
    db.close();
  }
  child.kill('SIGTERM');
  assert.deepEqual(await exit, [0, null]);
  const reopened = openPublicState(options);
  reopened.close();
  assert.deepEqual(JSON.parse(readFileSync(options.pinFile)), pin);
});
