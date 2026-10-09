import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { initializePublicState, openPublicState } from '../../account-service/public-state.ts';
import { SnapshotSource, BACKUP_FILES } from '../../account-service/backup/snapshot.ts';
import { encryptSnapshot } from '../../account-service/backup/archive.ts';
import { retentionDeletes } from '../../account-service/backup/retention.ts';

process.umask(0o077);
const revision = '12'.repeat(20);
test('a pinned WAL snapshot includes committed data and excludes a concurrent later transaction', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'done-backup-'));
  const options = {
    directory: join(root, 'state'),
    operatorKeyFile: join(root, 'key'),
    pinFile: join(root, 'pin'),
    policy: { origin: 'https://done.example.com', rpId: 'done.example.com' },
  };
  writeFileSync(options.operatorKeyFile, randomBytes(32), { mode: 0o600 });
  const pin = initializePublicState(options);
  writeFileSync(options.pinFile, JSON.stringify(pin));
  const owner = openPublicState(options);
  const writer = new DatabaseSync(join(options.directory, 'store/account.sqlite'));
  writer.exec(
    'PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE backup_probe (n INTEGER); INSERT INTO backup_probe VALUES (1);',
  );
  const source = new SnapshotSource(join(options.directory, 'store'), pin);
  t.after(() => {
    source.close();
    writer.close();
    owner.close();
    rmSync(root, { recursive: true, force: true });
  });
  const destination = join(root, 'snapshot');
  mkdirSync(destination, { mode: 0o700 });
  const captured = await source.capture(destination, revision, () =>
    writer.exec('INSERT INTO backup_probe VALUES (2);'),
  );
  const db = new DatabaseSync(join(destination, 'account.sqlite'), { readOnly: true });
  try {
    assert.deepEqual(
      db
        .prepare('SELECT n FROM backup_probe')
        .all()
        .map((r) => r.n),
      [1],
    );
  } finally {
    db.close();
  }
  assert.notEqual(source.version(), captured.version, 'the later write remains dirty');
  const again = join(root, 'again');
  mkdirSync(again, { mode: 0o700 });
  const second = await source.capture(again, revision);
  assert.equal(source.version(), second.version);
  const replay = new DatabaseSync(join(again, 'account.sqlite'), { readOnly: true });
  try {
    assert.deepEqual(
      replay
        .prepare('SELECT n FROM backup_probe')
        .all()
        .map((r) => r.n),
      [1, 2],
    );
  } finally {
    replay.close();
  }

  const identity = join(root, 'age-identity');
  execFileSync('age-keygen', ['-o', identity], { stdio: 'ignore' });
  const recipient = execFileSync('age-keygen', ['-y', identity], { encoding: 'utf8' }).trim();
  const encrypted = join(root, 'backup.age');
  const digest = await encryptSnapshot(
    destination,
    encrypted,
    recipient,
    AbortSignal.timeout(10000),
  );
  assert.equal(digest.sha256, createHash('sha256').update(readFileSync(encrypted)).digest('hex'));
  assert(readFileSync(encrypted).subarray(0, 22).toString().startsWith('age-encryption.org/v1'));
  const tar = execFileSync('age', ['-d', '-i', identity, encrypted], { maxBuffer: 16 * 1024 ** 2 });
  assert.deepEqual(
    execFileSync('tar', ['-tzf', '-'], { input: tar, encoding: 'utf8' }).trim().split('\n').sort(),
    [...BACKUP_FILES].sort(),
  );
  const decoded = join(root, 'decoded');
  mkdirSync(decoded);
  execFileSync('tar', ['-xzf', '-', '-C', decoded], { input: tar });
  const manifest = JSON.parse(readFileSync(join(decoded, 'backup.json')));
  assert.deepEqual(manifest.pin, pin);
  assert.equal(manifest.sourceRevision, revision);
  for (const [file, record] of Object.entries(manifest.files)) {
    const bytes = readFileSync(join(decoded, file));
    assert.equal(bytes.length, record.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256);
  }
  assert(!readdirSync(decoded).includes('ownership.sqlite'));
  const bad = readFileSync(encrypted);
  bad[bad.length - 1] ^= 1;
  writeFileSync(encrypted, bad);
  assert.throws(
    () => execFileSync('age', ['-d', '-i', identity, encrypted], { stdio: 'pipe' }),
    'tampered payload must fail authentication',
  );
  writeFileSync(
    join(options.directory, 'store/pin.json'),
    JSON.stringify({ ...pin, serviceId: '00'.repeat(16) }),
  );
  const wrong = join(root, 'wrong');
  mkdirSync(wrong);
  await assert.rejects(source.capture(wrong, revision), /metadata mismatch/);
});

test('retention keeps five minutes, six UTC hour buckets, seven UTC date buckets and its last verified anchor', () => {
  const now = Date.parse('2026-10-09T12:15:00Z'),
    minute = 60000,
    hour = 60 * minute,
    day = 24 * hour;
  const offsets = [
    0,
    0.5 * minute,
    5 * minute,
    5 * minute + 1,
    16 * minute,
    17 * minute,
    hour,
    2 * hour,
    3 * hour,
    4 * hour,
    5 * hour,
    6 * hour,
    day,
    day + 1,
    6 * day,
    7 * day,
    30 * day,
    -minute,
  ];
  const versions = offsets.map((offset, i) => ({
    fileId: String(i),
    fileName: '',
    capturedAt: now - offset,
    bytes: 1,
    sha256: '0'.repeat(64),
  }));
  const deleted = new Set(retentionDeletes(versions, '16', now).map((v) => Number(v.fileId)));
  assert.deepEqual(
    [...deleted].sort((a, b) => a - b),
    [3, 5, 6, 11, 13, 15],
  );
  assert(!deleted.has(16));
  assert(!deleted.has(17));
  assert.throws(() => retentionDeletes(versions, 'missing', now), /anchor/);
  assert.throws(() => retentionDeletes([...versions, versions[0]], '0', now), /Duplicate/);
});
