// Run after test/public-backup/b2-fixture.mjs in one stdin ES module, in the pruned runtime image.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initializePublicState, openPublicState } from './account-service/public-state.ts';
process.umask(0o077);
const smokeRoot = mkdtempSync('/tmp/maintenance-smoke-');
let fixture;
try {
  const sourceRevision = process.env.DONE_SOURCE_REVISION;
  const options = {
    directory: join(smokeRoot, 'state'),
    operatorKeyFile: join(smokeRoot, 'key'),
    pinFile: join(smokeRoot, 'pin'),
    policy: { origin: 'https://done.example.com', rpId: 'done.example.com' },
  };
  writeFileSync(options.operatorKeyFile, randomBytes(32));
  const pin = initializePublicState(options);
  writeFileSync(options.pinFile, JSON.stringify(pin));
  const owner = openPublicState(options);
  owner.core.begin({ operation: 'register', retryKey: randomBytes(32).toString('base64url') });
  owner.close();
  const identity = join(smokeRoot, 'identity');
  execFileSync('age-keygen', ['-o', identity], { stdio: 'ignore' });
  mkdirSync(join(smokeRoot, 'work'));
  const config = {
    v: 1,
    bucketId: 'fixtureBucket',
    prefix: 'done-backups/' + 'ab'.repeat(16) + '/',
    credentialsFile: join(smokeRoot, 'credentials'),
    workDirectory: join(smokeRoot, 'work'),
    recipient: execFileSync('age-keygen', ['-y', identity], { encoding: 'utf8' }).trim(),
  };
  writeFileSync(
    config.credentialsFile,
    JSON.stringify({ keyId: 'fixtureKey', applicationKey: 'fixtureSecret00000000' }),
  );
  writeFileSync(join(smokeRoot, 'config'), JSON.stringify(config));
  fixture = await b2Fixture(config);
  const preload = join(smokeRoot, 'fixture.mjs');
  writeFileSync(
    preload,
    `const f = globalThis.fetch; globalThis.fetch = (input, options) => {
    const u = new URL(String(input)); if (u.protocol !== 'https:' || !/\\.(backblazeb2|backblaze)\\.com$/.test(u.hostname)) throw Error('Unexpected fixture request');
    return f(${JSON.stringify(fixture.origin)} + u.pathname + u.search, options); };`,
  );
  const env = {
    ...process.env,
    DONE_PUBLIC_ORIGIN: options.policy.origin,
    DONE_STATE_DIR: options.directory,
    DONE_OPERATOR_KEY_FILE: options.operatorKeyFile,
    DONE_SERVICE_PIN_FILE: options.pinFile,
    DONE_BACKUP_CONFIG_FILE: join(smokeRoot, 'config'),
    DONE_MAINTENANCE_ID: randomBytes(16).toString('hex'),
    DONE_MAINTENANCE_IDENTITY_FILE: identity,
  };
  const cli = async (mode) =>
    JSON.parse(
      (
        await promisify(execFile)(
          process.execPath,
          ['--import', preload, 'scripts/public-account.mjs', mode],
          { env, timeout: 20000 },
        )
      ).stdout,
    );
  const prepared = await cli('maintenance-prepare');
  assert.equal(prepared.phase, 'ready');
  assert.equal(fixture.files.size, 1);
  assert.throws(() => openPublicState(options), /fenced/);
  assert.deepEqual(await cli('maintenance-prepare'), prepared);
  assert.equal((await cli('maintenance-status')).phase, 'ready');
  const resumed = await cli('maintenance-resume');
  assert.equal(resumed.phase, 'resumed-unchanged');
  assert.deepEqual(await cli('maintenance-resume'), resumed);
  const reopened = openPublicState(options);
  assert.deepEqual(reopened.pin, pin);
  reopened.close();
  console.log(
    JSON.stringify({
      ok: true,
      sourceRevision,
      node: process.version,
      uid: process.getuid(),
      network: 'none; loopback B2 fixture only',
      checks: [
        'actual offline CLI and production dependencies',
        'saved-key decrypt/cold-open and exact-version upload/readback',
        'fenced public startup',
        'stable preparation and resume retries',
        'unchanged service identity reopens',
      ],
    }),
  );
} finally {
  await fixture?.close();
  rmSync(smokeRoot, { recursive: true, force: true });
}
