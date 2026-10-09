import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { pack } from 'tar-stream';
import { DatabaseSync } from 'node:sqlite';
import { initializePublicState, openPublicState } from '../../account-service/public-state.ts';
import { restorePublicBackup } from '../../account-service/public-restore.ts';
import { SnapshotSource, fileDigest, BACKUP_FILES } from '../../account-service/backup/snapshot.ts';
import { encryptSnapshot } from '../../account-service/backup/archive.ts';
import { AccountCore } from '../../account-service/core.ts';
import { SessionCustody } from '../../account-service/session-custody.ts';
import { authenticator, finishRequest, fresh } from '../account-core/fixtures.mjs';

process.umask(0o077);
const revision = '12'.repeat(20);
const policy = { origin: 'https://done.example.com', rpId: 'done.example.com' };
const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
function query(path, sql) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return db
      .prepare(sql)
      .all()
      .map((r) => ({ ...r }));
  } finally {
    db.close();
  }
}
async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'done-restore-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const options = {
    directory: join(root, 'live'),
    policy,
    operatorKeyFile: join(root, 'operator.key'),
    pinFile: join(root, 'expected-pin.json'),
  };
  writeFileSync(options.operatorKeyFile, randomBytes(32), { mode: 0o600 });
  const pin = initializePublicState(options);
  writeFileSync(options.pinFile, JSON.stringify(pin));
  const owner = openPublicState(options);
  const path = join(options.directory, 'store/account.sqlite');
  const device = authenticator();
  const edits = { client: { origin: policy.origin }, rpId: policy.rpId };
  const retryKey = fresh();
  const start = owner.core.begin({ operation: 'register', retryKey });
  const confirm = await owner.core.finish(
    finishRequest(start, retryKey, device.register(start, edits)),
  );
  const account = await owner.core.finish(
    finishRequest(confirm, retryKey, device.assert(confirm, edits)),
  );
  assert.equal(account.stage, 'credential-confirmed', JSON.stringify(account));
  const db = new DatabaseSync(path);
  db.prepare("UPDATE accounts SET state='active' WHERE id=?").run(account.accountId);
  db.exec(
    "CREATE TABLE recovery_probe (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO recovery_probe VALUES (1,'retained');",
  );
  db.close();
  const sessionKey = fresh();
  const challenge = owner.core.sessions.begin({
    retryKey: sessionKey,
    accountId: account.accountId,
  });
  const proof = {
    retryKey: sessionKey,
    attemptId: challenge.attemptId,
    response: device.assert(challenge, edits),
  };
  const session = await owner.core.sessions.finish(proof);
  assert.equal(session.stage, 'issued', JSON.stringify(session));
  const snapshot = join(root, 'backup-source');
  mkdirSync(snapshot, { mode: 0o700 });
  const source = new SnapshotSource(join(options.directory, 'store'), pin);
  try {
    await source.capture(snapshot, revision);
  } finally {
    source.close();
    owner.close();
  }
  const identityFile = join(root, 'age.key');
  execFileSync('age-keygen', ['-o', identityFile], { stdio: 'ignore' });
  const recipient = execFileSync('age-keygen', ['-y', identityFile], { encoding: 'utf8' }).trim();
  const archive = join(root, 'selected.age');
  await encryptSnapshot(snapshot, archive, recipient, AbortSignal.timeout(10000));
  const restore = {
    ...options,
    directory: join(root, 'recovered'),
    archive,
    identityFile,
    archiveSha256: hash(archive),
    sourceRevision: revision,
  };
  return {
    root,
    options,
    pin,
    path,
    snapshot,
    restore,
    recipient,
    account,
    device,
    edits,
    proof,
    session,
  };
}

test('genuine snapshot restores in quarantine, preserves writing/identity, resets custody and refuses old logins', async (t) => {
  const x = await fixture(t);
  const before = hash(x.path);
  const original = query(join(x.snapshot, 'account.sqlite'), 'SELECT * FROM session_custody')[0];
  const result = await restorePublicBackup(x.restore);
  assert.equal(result.phase, 'quarantined');
  assert.equal(result.report.servingAllowed, false);
  assert.equal(result.report.historyContinuity, 'not-established');
  assert.deepEqual(result.report.invalidated, { sessions: 1, attempts: 1 });
  assert.equal(hash(x.path), before, 'live source is never modified');
  assert.equal(
    hash(join(x.restore.directory, 'snapshot/account.sqlite')),
    hash(join(x.snapshot, 'account.sqlite')),
  );
  const candidate = join(x.restore.directory, 'candidate/account.sqlite');
  assert.deepEqual(query(candidate, 'SELECT * FROM recovery_probe'), [
    { id: 1, value: 'retained' },
  ]);
  assert.deepEqual(
    query(candidate, 'SELECT * FROM credentials'),
    query(x.path, 'SELECT * FROM credentials'),
  );
  const current = query(candidate, 'SELECT * FROM session_custody')[0];
  assert.notEqual(current.salt, original.salt);
  assert.equal(current.seal_counter, 0);
  assert.equal(
    hash(join(x.restore.directory, 'candidate/authority.sqlite')),
    hash(join(x.snapshot, 'authority.sqlite')),
  );
  assert.throws(() => openPublicState(x.restore), /quarantined/);
  assert.throws(() => initializePublicState(x.restore), /Unclassified/);
  const key = readFileSync(x.options.operatorKeyFile);
  const oldCustody = new SessionCustody({ pin: x.pin, operatorKey: key }, original.salt);
  const newCustody = new SessionCustody({ pin: x.pin, operatorKey: key }, current.salt);
  try {
    const old = oldCustody.seal('old session', 'binding', 1);
    assert.throws(() => newCustody.open(old, 'binding'));
  } finally {
    oldCustody.close();
    newCustody.close();
  }
  // Test the isolated candidate's session owner directly; no public server can open this root.
  const core = new AccountCore(candidate, policy, {
    sessions: { pin: x.pin, operatorKey: key },
    membershipContinuation: true,
  });
  try {
    assert.equal(
      core.sessions.renew({ sessionId: x.session.sessionId, renewalToken: x.session.renewalToken })
        .refusal,
      'sign-in-required',
    );
    assert.equal((await core.sessions.finish(x.proof)).ok, false);
    const retryKey = fresh();
    const view = core.sessions.begin({ accountId: x.account.accountId, retryKey });
    assert.equal(
      (
        await core.sessions.finish({
          retryKey,
          attemptId: view.attemptId,
          response: x.device.assert(view, x.edits),
        })
      ).stage,
      'issued',
    );
  } finally {
    core.close();
    key.fill(0);
  }
  await assert.rejects(restorePublicBackup(x.restore), /candidate changed/);
});

test('lost completion replies preserve the same reset; interrupted unpublished work can be replayed safely', async (t) => {
  const x = await fixture(t);
  for (const point of [
    'after-extract',
    'before-reset-commit',
    'after-reset-commit',
    'before-publish',
    'after-publish',
  ]) {
    const options = { ...x.restore, directory: join(x.root, point) };
    await assert.rejects(
      restorePublicBackup(options, (p) => {
        if (p === point) throw Error('interrupted');
      }),
      /interrupted/,
    );
    assert.throws(() => openPublicState(options), /quarantined/);
    const first = await restorePublicBackup(options);
    const again = await restorePublicBackup(options);
    assert.deepEqual(again, first);
    await assert.rejects(
      restorePublicBackup({ ...options, archiveSha256: '00'.repeat(32) }),
      /binding changed/,
    );
  }
});

test('completed recovery refuses newer WAL content and survives a wrong-key inspection retry', async (t) => {
  const x = await fixture(t);
  const report = await restorePublicBackup(x.restore);
  const wrong = join(x.root, 'wrong-inspection-key');
  writeFileSync(wrong, randomBytes(32));
  await assert.rejects(restorePublicBackup({ ...x.restore, operatorKeyFile: wrong }));
  assert.deepEqual(await restorePublicBackup(x.restore), report);
  const candidate = join(x.restore.directory, 'candidate/account.sqlite');
  const before = hash(candidate);
  const writer = new DatabaseSync(candidate);
  try {
    writer.exec(
      "PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; UPDATE recovery_probe SET value='later'",
    );
    assert.equal(hash(candidate), before, 'a main-file-only digest would miss this commit');
    await assert.rejects(restorePublicBackup(x.restore), /uncheckpointed WAL/);
  } finally {
    writer.close();
  }
  await assert.rejects(restorePublicBackup(x.restore), /candidate changed/);
});

test('restore refuses a live destination, wrong pin/key/digest, tampered ciphertext and malformed snapshots', async (t) => {
  const x = await fixture(t);
  await assert.rejects(
    restorePublicBackup({ ...x.restore, directory: x.options.directory }),
    /isolated destination/,
  );
  const owner = openPublicState(x.options);
  try {
    await assert.rejects(
      restorePublicBackup({ ...x.restore, directory: x.options.directory }),
      /in use/,
    );
  } finally {
    owner.close();
  }
  const altered = join(x.root, 'tampered.age');
  const bytes = readFileSync(x.restore.archive);
  bytes[bytes.length - 1] ^= 1;
  writeFileSync(altered, bytes);
  await assert.rejects(
    restorePublicBackup({ ...x.restore, archive: altered, archiveSha256: hash(altered) }),
  );
  assert.equal(existsSync(join(x.restore.directory, 'candidate/account.sqlite')), false);
  await assert.rejects(
    restorePublicBackup({
      ...x.restore,
      directory: join(x.root, 'bad-digest'),
      archiveSha256: '00'.repeat(32),
    }),
    /digest mismatch/,
  );
  const wrongPin = join(x.root, 'wrong-pin');
  writeFileSync(wrongPin, JSON.stringify({ ...x.pin, serviceId: '00'.repeat(16) }));
  await assert.rejects(
    restorePublicBackup({ ...x.restore, directory: join(x.root, 'bad-pin'), pinFile: wrongPin }),
    /pin mismatch/,
  );
  const wrongKey = join(x.root, 'wrong-key');
  writeFileSync(wrongKey, randomBytes(32));
  await assert.rejects(
    restorePublicBackup({
      ...x.restore,
      directory: join(x.root, 'bad-key'),
      operatorKeyFile: wrongKey,
    }),
  );

  for (const fault of ['hash', 'schema', 'foreign-key']) {
    const snapshotDb = join(x.snapshot, 'account.sqlite');
    const db = new DatabaseSync(snapshotDb);
    if (fault === 'hash') db.exec("UPDATE recovery_probe SET value='changed'");
    if (fault === 'schema') db.exec('PRAGMA user_version=25');
    if (fault === 'foreign-key')
      db.exec(
        "PRAGMA foreign_keys=OFF; PRAGMA user_version=26; UPDATE credentials SET account_id='missing'",
      );
    db.close();
    if (fault !== 'hash') {
      const meta = JSON.parse(readFileSync(join(x.snapshot, 'backup.json')));
      meta.files['account.sqlite'] = await fileDigest(snapshotDb);
      writeFileSync(join(x.snapshot, 'backup.json'), JSON.stringify(meta));
    }
    const archive = join(x.root, fault + '.age');
    await encryptSnapshot(x.snapshot, archive, x.recipient, AbortSignal.timeout(10000));
    await assert.rejects(
      restorePublicBackup({
        ...x.restore,
        directory: join(x.root, fault),
        archive,
        archiveSha256: hash(archive),
      }),
      fault === 'hash' ? /file digest/ : fault === 'schema' ? /schema/ : /foreign key/,
    );
  }
});

async function encryptedTar(entries, recipient) {
  const tar = pack();
  const chunks = [];
  const collected = (async () => {
    for await (const chunk of tar) chunks.push(chunk);
  })();
  for (const [header, body] of entries) tar.entry(header, body);
  tar.finalize();
  await collected;
  return execFileSync('age', ['--encrypt', '--recipient', recipient], {
    input: gzipSync(Buffer.concat(chunks)),
    maxBuffer: 4 * 1024 ** 2,
  });
}
test('archive allowlist rejects traversal, links, duplicate/missing files, oversized metadata and non-files', async (t) => {
  const x = await fixture(t);
  const valid = BACKUP_FILES.map((name) => [
    { name, type: 'file' },
    readFileSync(join(x.snapshot, name)),
  ]);
  const cases = [
    [[{ name: '../escape', type: 'file' }, Buffer.from('no')]],
    [[{ name: 'account.sqlite', type: 'symlink', linkname: '/tmp/elsewhere' }, Buffer.alloc(0)]],
    [[{ name: 'account.sqlite', type: 'link', linkname: 'authority.sqlite' }, Buffer.alloc(0)]],
    [valid[0], valid[0]],
    valid.slice(1),
    [[{ name: 'backup.json', type: 'file' }, Buffer.alloc(8193)]],
    [[{ name: 'account.sqlite', type: 'directory' }, Buffer.alloc(0)]],
  ];
  for (let i = 0; i < cases.length; i++) {
    const archive = join(x.root, `invalid-${i}.age`);
    writeFileSync(archive, await encryptedTar(cases[i], x.recipient));
    const options = {
      ...x.restore,
      directory: join(x.root, `invalid-${i}`),
      archive,
      archiveSha256: hash(archive),
    };
    await assert.rejects(restorePublicBackup(options), /entry|Incomplete/);
    assert.throws(() => openPublicState(options), /quarantined/);
  }
  assert(!existsSync(join(x.root, 'escape')));
});

test('process death after custody commit releases ownership; CLI retry completes quarantine without a listener', async (t) => {
  const x = await fixture(t);
  const module = pathToFileURL(resolve('account-service/public-restore.ts')).href;
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {restorePublicBackup} from ${JSON.stringify(module)};
await restorePublicBackup(JSON.parse(process.env.RESTORE_FIXTURE), p => { if(p === 'after-reset-commit') process.kill(process.pid,'SIGKILL'); });`,
    ],
    {
      env: { ...process.env, RESTORE_FIXTURE: JSON.stringify(x.restore) },
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  const [code, signal] = await once(child, 'exit');
  assert.equal(code, null);
  assert.equal(signal, 'SIGKILL');
  const env = {
    ...process.env,
    DONE_PUBLIC_ORIGIN: policy.origin,
    DONE_STATE_DIR: x.restore.directory,
    DONE_OPERATOR_KEY_FILE: x.restore.operatorKeyFile,
    DONE_SERVICE_PIN_FILE: x.restore.pinFile,
    DONE_RESTORE_ARCHIVE: x.restore.archive,
    DONE_RESTORE_SHA256: x.restore.archiveSha256,
    DONE_RESTORE_IDENTITY_FILE: x.restore.identityFile,
    DONE_SOURCE_REVISION: revision,
  };
  const run = () =>
    JSON.parse(
      execFileSync(process.execPath, ['scripts/public-account.mjs', 'restore'], {
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  const first = run();
  assert.equal(first.phase, 'quarantined');
  assert.deepEqual(run(), first);
  assert(!readdirSync(x.restore.directory).includes('store'));
  assert.throws(
    () =>
      execFileSync(process.execPath, ['scripts/public-account.mjs', 'api'], { env, stdio: 'pipe' }),
    /quarantined/,
  );
});
