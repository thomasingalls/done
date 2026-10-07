import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AccountCore } from '../../account-service/core.ts';
import { PrivateAuthority } from '../../account-service/authority.ts';
import {
  accountSchema,
  lockPreviewState,
  previewConfig,
  upgradePreviewState,
} from '../../scripts/account-setup-state.mjs';

async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'done-preview-upgrade-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const listener = createServer();
  await new Promise((accept) => listener.listen(0, '127.0.0.1', accept));
  const port = listener.address().port;
  await new Promise((accept) => listener.close(accept));
  const config = previewConfig({ ACCOUNT_SETUP_STATE: directory, ACCOUNT_SETUP_PORT: port });
  const key = randomBytes(32);
  const pin = PrivateAuthority.initialize(join(directory, 'authority.sqlite'), config.policy, key);
  writeFileSync(join(directory, 'operator.key'), key, { mode: 0o600 });
  writeFileSync(join(directory, 'pin.json'), JSON.stringify(pin), { mode: 0o600 });
  const path = join(directory, 'account.sqlite');
  const core = new AccountCore(path, config.policy);
  const retryKey = randomBytes(32).toString('base64url');
  const pending = core.begin({ operation: 'register', retryKey });
  core.close();
  return { config, directory, path, retryKey, pending, target: accountSchema(path) };
}

function asSchemaFour(path) {
  const db = new DatabaseSync(path);
  const version = db.prepare('PRAGMA user_version').get().user_version;
  assert.ok(
    version === 5 || version === 7 || version === 8 || version === 9 || version === 10,
    'Update the fixture for a new backend schema',
  );
  if (version >= 10) db.exec('DROP TABLE content_checkpoints');
  if (version >= 9) db.exec('DROP TABLE content_transfers');
  if (version >= 8) db.exec('DROP TABLE content_ceremonies');
  if (version >= 7)
    db.exec(
      'DROP TABLE workspace_successors; ALTER TABLE promotions DROP COLUMN successor_head; DROP TABLE enrollment_preparations;',
    );
  db.exec('ALTER TABLE promotions DROP COLUMN activation; PRAGMA user_version=4;');
  return db;
}

test('offline additive upgrade keeps pending identity and backs up committed WAL plus authority', async (t) => {
  const f = await fixture(t);
  const wal = asSchemaFour(f.path); // Leave committed pages in WAL throughout the snapshot.
  t.after(() => wal.close());
  const result = await upgradePreviewState(f.config);
  assert.equal(result.from, 4);
  assert.equal(result.to, f.target);
  assert.equal(accountSchema(f.path), f.target);
  assert.equal(accountSchema(join(result.backup, 'account.sqlite')), 4);
  const current = new AccountCore(f.path, f.config.policy);
  assert.deepEqual(current.resume({ retryKey: f.retryKey }), f.pending);
  current.close();
  const old = new DatabaseSync(join(result.backup, 'account.sqlite'), { readOnly: true });
  assert.equal(old.prepare('SELECT id FROM accounts').get().id, f.pending.options.user.id);
  old.close();
  assert.equal(statSync(result.backup).mode & 0o777, 0o700);
  for (const file of [
    'account.sqlite',
    'authority.sqlite',
    'operator.key',
    'pin.json',
    'manifest.json',
  ])
    assert.equal(statSync(join(result.backup, file)).mode & 0o777, 0o600);
  for (const file of ['operator.key', 'pin.json'])
    assert.deepEqual(
      readFileSync(join(result.backup, file)),
      readFileSync(join(f.directory, file)),
    );
  const pin = JSON.parse(readFileSync(join(result.backup, 'pin.json')));
  PrivateAuthority.open(
    join(result.backup, 'authority.sqlite'),
    pin,
    readFileSync(join(result.backup, 'operator.key')),
  ).close();
  assert.equal(existsSync(join(f.directory, 'maintenance.lock')), false);
  assert.deepEqual(await upgradePreviewState(f.config), {
    from: f.target,
    to: f.target,
    backup: null,
  });
});

test('current state is a validated no-op without a backup', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await upgradePreviewState(f.config), {
    from: f.target,
    to: f.target,
    backup: null,
  });
  assert.equal(existsSync(join(f.directory, 'backups')), false);
});

test('a live state owner or pre-lock preview port prevents an upgrade', async (t) => {
  const f = await fixture(t);
  const release = lockPreviewState(f.directory);
  assert.throws(() => lockPreviewState(f.directory), /state is in use/);
  await assert.rejects(upgradePreviewState(f.config), /state is in use/);
  release();
  const server = createServer();
  await new Promise((accept) => server.listen(f.config.port, '127.0.0.1', accept));
  try {
    await assert.rejects(upgradePreviewState(f.config), /Stop the preview on port/);
  } finally {
    await new Promise((accept) => server.close(accept));
  }
  assert.equal(existsSync(join(f.directory, 'maintenance.lock')), false);
  assert.equal(accountSchema(f.path), f.target);
  assert.equal(existsSync(join(f.directory, 'backups')), false);
});

test('missing state, a different origin, invalid authority, and a newer schema fail without replacement', async (t) => {
  const f = await fixture(t);
  const keyPath = join(f.directory, 'operator.key');
  const key = readFileSync(keyPath);
  rmSync(keyPath);
  await assert.rejects(upgradePreviewState(f.config), /Missing preview state: operator.key/);
  assert.equal(existsSync(keyPath), false);
  writeFileSync(keyPath, randomBytes(32));
  await assert.rejects(upgradePreviewState(f.config));
  writeFileSync(keyPath, key);
  await assert.rejects(
    upgradePreviewState({
      ...f.config,
      policy: { ...f.config.policy, origin: 'http://localhost:4999' },
    }),
    /Reuse the original port/,
  );
  const db = new DatabaseSync(f.path);
  db.exec('PRAGMA user_version=99');
  db.close();
  await assert.rejects(upgradePreviewState(f.config), /Unsupported preview upgrade from schema 99/);
  assert.equal(accountSchema(f.path), 99);
  assert.deepEqual(readFileSync(keyPath), key);
  assert.equal(existsSync(join(f.directory, 'backups')), false);
});

test('a failed core migration rolls back and retains the complete pre-upgrade snapshot', async (t) => {
  const f = await fixture(t);
  const db = new DatabaseSync(f.path);
  db.exec('PRAGMA user_version=4'); // Intentionally retain activation: ALTER must fail transactionally.
  db.close();
  await assert.rejects(upgradePreviewState(f.config), /Pre-upgrade state is saved at/);
  assert.equal(accountSchema(f.path), 4);
  const check = new DatabaseSync(f.path, { readOnly: true });
  assert.equal(check.prepare('SELECT count(*) AS n FROM accounts').get().n, 1);
  check.close();
  assert.equal(existsSync(join(f.directory, 'maintenance.lock')), false);
});
