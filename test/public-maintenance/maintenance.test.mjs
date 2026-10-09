import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { initializePublicState, openPublicState } from '../../account-service/public-state.ts';
import { publicMaintenance } from '../../account-service/public-maintenance.ts';
import { B2Store } from '../../account-service/backup/b2.ts';
import { backupNamespace } from '../../account-service/backup/config.ts';
import { SnapshotSource } from '../../account-service/backup/snapshot.ts';
import { encryptSnapshot } from '../../account-service/backup/archive.ts';
import { b2Fixture } from '../public-backup/b2-fixture.mjs';
import { authenticator, finishRequest, fresh } from '../account-core/fixtures.mjs';

process.umask(0o077);
const revision = '12'.repeat(20);
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'done-maintenance-'));
  const options = {
    directory: join(root, 'state'),
    operatorKeyFile: join(root, 'operator.key'),
    pinFile: join(root, 'pin'),
    policy: { origin: 'https://done.example.com', rpId: 'done.example.com' },
    id: randomBytes(16).toString('hex'),
    identityFile: join(root, 'identity'),
  };
  writeFileSync(options.operatorKeyFile, randomBytes(32));
  const pin = initializePublicState(options);
  writeFileSync(options.pinFile, JSON.stringify(pin));
  execFileSync('age-keygen', ['-o', options.identityFile], { stdio: 'ignore' });
  mkdirSync(join(root, 'work'));
  options.backup = {
    bucketId: 'fixtureBucket',
    prefix: 'done-backups/' + 'ab'.repeat(16) + '/',
    credentialsFile: join(root, 'credentials'),
    workDirectory: join(root, 'work'),
    sourceRevision: revision,
    recipient: execFileSync('age-keygen', ['-y', options.identityFile], {
      encoding: 'utf8',
    }).trim(),
  };
  writeFileSync(
    options.backup.credentialsFile,
    JSON.stringify({ keyId: 'fixtureKey', applicationKey: 'fixtureSecret00000000' }),
  );
  const { sourceRevision: _rev, ...c } = options.backup;
  writeFileSync(join(root, 'config'), JSON.stringify({ v: 1, ...c }));
  const remote = await b2Fixture(options.backup);
  t.after(async () => {
    await remote.close();
    rmSync(root, { recursive: true, force: true });
  });
  const env = {
    ...process.env,
    DONE_PUBLIC_ORIGIN: options.policy.origin,
    DONE_STATE_DIR: options.directory,
    DONE_OPERATOR_KEY_FILE: options.operatorKeyFile,
    DONE_SERVICE_PIN_FILE: options.pinFile,
    DONE_BACKUP_CONFIG_FILE: join(root, 'config'),
    DONE_SOURCE_REVISION: revision,
    DONE_MAINTENANCE_ID: options.id,
    DONE_MAINTENANCE_IDENTITY_FILE: options.identityFile,
    DONE_TEST_B2_ORIGIN: remote.origin,
  };
  return {
    root,
    options,
    pin,
    remote,
    env,
    path: join(options.directory, 'store/account.sqlite'),
    run: (cmd, hook, o = options) => publicMaintenance(cmd, o, hook, remote.fetcher),
  };
}
function cli(x, mode) {
  return execFileSync(process.execPath, ['scripts/public-account.mjs', mode], {
    env: x.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('offline preparation verifies encrypted off-host backup, fences startup, and resumes without resetting real sessions', async (t) => {
  const x = await fixture(t);
  const owner = openPublicState(x.options),
    device = authenticator(),
    retryKey = fresh();
  const edits = { client: { origin: x.options.policy.origin }, rpId: x.options.policy.rpId };
  const begin = owner.core.begin({ operation: 'register', retryKey });
  const confirm = await owner.core.finish(
    finishRequest(begin, retryKey, device.register(begin, edits)),
  );
  const account = await owner.core.finish(
    finishRequest(confirm, retryKey, device.assert(confirm, edits)),
  );
  const writer = new DatabaseSync(x.path);
  writer.prepare("UPDATE accounts SET state='active' WHERE id=?").run(account.accountId);
  writer.exec(
    "CREATE TABLE maintenance_probe(value TEXT); INSERT INTO maintenance_probe VALUES('writing');",
  );
  writer.close();
  const loginKey = fresh(),
    challenge = owner.core.sessions.begin({ retryKey: loginKey, accountId: account.accountId });
  const session = await owner.core.sessions.finish({
    retryKey: loginKey,
    attemptId: challenge.attemptId,
    response: device.assert(challenge, edits),
  });
  assert.equal(session.stage, 'issued');
  // Check ownership in a separate process: POSIX locks can be disturbed by same-process handles.
  assert.throws(() => cli(x, 'maintenance-prepare'), /in use/);
  assert(!existsSync(join(x.options.directory, 'maintenance')));
  owner.close();
  const before = hash(x.path),
    authority = hash(join(x.options.directory, 'store/authority.sqlite'));
  const ready = await x.run('prepare');
  assert.equal(ready.phase, 'ready');
  assert.equal(x.remote.files.size, 1);
  assert.equal(hash(x.path), before);
  assert.equal(hash(join(x.options.directory, 'store/authority.sqlite')), authority);
  assert.deepEqual(readdirSync(x.options.backup.workDirectory), []);
  assert.throws(() => openPublicState(x.options), /fenced/);
  assert.throws(() => initializePublicState(x.options), /Unclassified/);
  assert.deepEqual(await x.run('prepare'), ready, 'retry preserves the exact verified version');
  assert.equal(JSON.parse(cli(x, 'maintenance-status')).phase, 'ready');
  const done = JSON.parse(cli(x, 'maintenance-resume'));
  assert.equal(done.phase, 'resumed-unchanged');
  assert.deepEqual(await x.run('resume'), done, 'lost resume reply is idempotent');
  assert.equal(hash(x.path), before);
  const reopened = openPublicState(x.options);
  try {
    assert.equal(
      reopened.core.sessions.renew({
        sessionId: session.sessionId,
        renewalToken: session.renewalToken,
      }).ok,
      true,
    );
  } finally {
    reopened.close();
  }
  await assert.rejects(x.run('prepare'), /already completed/);
});

test('wrong recovery key, lost upload reply, corrupt readback, and changed bindings stay fenced and retry safely', async (t) => {
  const x = await fixture(t);
  const wrong = join(x.root, 'wrong');
  execFileSync('age-keygen', ['-o', wrong], { stdio: 'ignore' });
  await assert.rejects(x.run('prepare', undefined, { ...x.options, identityFile: wrong }));
  assert.equal((await x.run('status')).phase, 'uploading');
  assert.equal(x.remote.files.size, 0, 'no upload before decryption/cold-open verification');
  assert.throws(() => openPublicState(x.options), /fenced/);
  await assert.rejects(
    x.run('prepare', undefined, { ...x.options, id: 'ff'.repeat(16) }),
    /binding mismatch/,
  );
  x.remote.controls.loseUploadReply = true;
  await assert.rejects(x.run('prepare'));
  assert.equal(x.remote.files.size, 1);
  x.remote.controls.corruptDownload = true;
  await assert.rejects(x.run('prepare'), /readback mismatch/);
  assert.equal((await x.run('status')).phase, 'uploading');
  x.remote.controls.corruptDownload = false;
  assert.equal((await x.run('prepare')).phase, 'ready');
  assert.equal(x.remote.files.size, 1, 'lost reply recovers the existing version');
  await x.run('resume');
});

test('interruptions retain intent through resolution; SIGKILL after upload retains the fence and remote receipt is recovered', async (t) => {
  const x = await fixture(t);
  for (const point of ['fenced', 'encrypted', 'uploaded', 'ready', 'resolved', 'unfenced']) {
    const options = { ...x.options, id: randomBytes(16).toString('hex') };
    const run = (cmd, hook) => x.run(cmd, hook, options);
    if (['resolved', 'unfenced'].includes(point)) await run('prepare');
    await assert.rejects(
      run(['resolved', 'unfenced'].includes(point) ? 'resume' : 'prepare', (p) => {
        if (p === point) throw Error('interrupted');
      }),
      /interrupted/,
    );
    if (point !== 'unfenced') assert.throws(() => openPublicState(x.options), /fenced/);
    if (!['resolved', 'unfenced'].includes(point))
      assert.equal((await run('prepare')).phase, 'ready');
    assert.equal((await run('resume')).phase, 'resumed-unchanged');
  }
  const child = spawn(
    process.execPath,
    [
      '--import',
      resolve('test/public-backup/fixture-network.mjs'),
      '--input-type=module',
      '-e',
      `import { publicMaintenance } from './account-service/public-maintenance.ts';
     import { publicMaintenanceConfig } from './account-service/public-config.ts';
     await publicMaintenance('prepare', publicMaintenanceConfig(), (p) => { if(p === 'uploaded') process.kill(process.pid, 'SIGKILL'); });`,
    ],
    { env: x.env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stderr = '';
  child.stderr.on('data', (b) => {
    stderr += b;
  });
  const [code, signal] = await once(child, 'exit');
  assert.equal(signal, 'SIGKILL', `code=${code}: ${stderr}`);
  assert.throws(() => cli(x, 'api'), /fenced/);
  const count = x.remote.files.size;
  assert.equal((await x.run('prepare')).phase, 'ready');
  assert.equal(x.remote.files.size, count);
  await x.run('resume');
  assert.deepEqual(
    readdirSync(x.options.backup.workDirectory),
    [],
    'retry removes plaintext left by the killed job',
  );
});

test('changed live WAL, unclassified files, and unsupported schemas cannot be mistaken for unchanged maintenance', async (t) => {
  const x = await fixture(t);
  await x.run('prepare');
  const before = hash(x.path);
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { DatabaseSync } from 'node:sqlite'; const db = new DatabaseSync(process.argv[1]);
     db.exec('PRAGMA journal_mode=WAL; CREATE TABLE unexpected_write(x); INSERT INTO unexpected_write VALUES(1)');
     process.kill(process.pid, 'SIGKILL');`,
      x.path,
    ],
    { stdio: 'ignore' },
  );
  assert.equal((await once(child, 'exit'))[1], 'SIGKILL');
  assert.equal(hash(x.path), before, 'main DB alone would miss the changed WAL');
  await assert.rejects(x.run('resume'), /Source changed/);
  await assert.rejects(x.run('prepare'), /Source changed/);
  assert.throws(() => openPublicState(x.options), /fenced/);
  writeFileSync(join(x.options.directory, 'maintenance/unclassified'), 'preserve');
  await assert.rejects(x.run('status'), /Unclassified/);
  assert(existsSync(join(x.options.directory, 'maintenance/unclassified')));
  const other = await fixture(t);
  const db = new DatabaseSync(other.path);
  db.exec('PRAGMA user_version=27');
  db.close();
  const hash27 = hash(other.path);
  await assert.rejects(other.run('prepare'), /schema/);
  assert.equal(
    hash(other.path),
    hash27,
    'there is no implicit migration to/from an unknown schema',
  );
});

test('maintenance copies are excluded from routine retention, held through resolution, and expire only with a newer verified backup', async (t) => {
  const x = await fixture(t),
    r = await x.run('prepare');
  const b2 = new B2Store(
    x.options.backup,
    backupNamespace(x.options.backup, x.pin),
    x.remote.fetcher,
  );
  const signal = AbortSignal.timeout(10000);
  assert.deepEqual(await b2.list(signal), []);
  await assert.rejects(b2.delete(r.remote, signal), /Unscoped/);
  await assert.rejects(b2.deleteMaintenance(r.remote, 'ff'.repeat(16), signal), /Unscoped/);
  await assert.rejects(x.run('prune'), /protected/);
  const done = await x.run('resume');
  await assert.rejects(x.run('prune'), /not elapsed/);
  const now = Date.now;
  Date.now = () => done.deleteAfter + 1;
  try {
    await assert.rejects(x.run('prune'), /post-maintenance/);
    const snapshot = join(x.root, 'routine');
    mkdirSync(snapshot);
    const source = new SnapshotSource(join(x.options.directory, 'store'), x.pin);
    let captured;
    try {
      captured = await source.capture(snapshot, revision);
    } finally {
      source.close();
    }
    const path = join(x.root, 'routine.age');
    const digest = await encryptSnapshot(snapshot, path, x.options.backup.recipient, signal);
    const routine = await b2.upload(
      path,
      b2.prefix + captured.capturedAt + '-' + '22'.repeat(16) + '-' + digest.sha256 + '.tar.gz.age',
      digest,
      signal,
    );
    x.remote.controls.corruptDownload = true;
    await assert.rejects(x.run('prune'), /readback mismatch/);
    assert(x.remote.files.has(r.remote.fileId));
    x.remote.controls.corruptDownload = false;
    x.remote.controls.failDelete = true;
    await assert.rejects(x.run('prune'));
    assert.equal((await x.run('status')).phase, 'resumed-unchanged');
    x.remote.controls.failDelete = false;
    assert.equal((await x.run('prune')).phase, 'expired');
    assert(!x.remote.files.has(r.remote.fileId));
    assert(x.remote.files.has(routine.fileId));
    assert(
      !existsSync(join(x.options.directory, 'maintenance-history', x.options.id, 'backup.age')),
    );
    assert.equal((await x.run('prune')).phase, 'expired');
  } finally {
    Date.now = now;
  }
});

test('cancelled preparation resumes unchanged without B2, but never recreates a lost store from maintenance history', async (t) => {
  const x = await fixture(t);
  await assert.rejects(
    x.run('prepare', (point) => {
      if (point === 'fenced') throw Error('interrupted');
    }),
    /interrupted/,
  );
  assert.equal((await x.run('status')).phase, 'preparing');
  assert.equal(x.remote.files.size, 0);
  const plaintext = join(x.options.backup.workDirectory, 'run-' + '33'.repeat(16));
  mkdirSync(plaintext);
  writeFileSync(join(plaintext, 'partial.sqlite'), 'scratch');
  // Cancellation is a local source-equality check and does not depend on B2 or the age private key.
  const calls = x.remote.events.length;
  assert.equal(
    (await x.run('resume', undefined, { ...x.options, identityFile: undefined })).phase,
    'resumed-unchanged',
  );
  assert.equal(x.remote.events.length, calls);
  assert.deepEqual(readdirSync(x.options.backup.workDirectory), []);
  openPublicState(x.options).close();
  assert.deepEqual(initializePublicState(x.options), x.pin);
  rmSync(join(x.options.directory, 'store'), { recursive: true });
  assert.throws(() => initializePublicState(x.options), /Missing store after prior maintenance/);
  assert(!existsSync(join(x.options.directory, 'store')));
});
