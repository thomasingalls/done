import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  BackupCycle,
  LOCAL_CHECK_MS,
  REMOTE_CHECK_MS,
} from '../../account-service/backup/cycle.ts';
import { B2QuotaExceeded, B2Store } from '../../account-service/backup/b2.ts';
import { fileDigest } from '../../account-service/backup/snapshot.ts';
import { parseBackupName } from '../../account-service/backup/retention.ts';

process.umask(0o077);
async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'done-cadence-'));
  let now = Date.UTC(2026, 9, 26, 10),
    version = 1,
    captures = 0;
  const events = [],
    files = new Map();
  const controls = { quota: false, lostReplies: 0 };
  const source = {
    version: () => version,
    capture: async (directory) => {
      captures++;
      writeFileSync(join(directory, 'account.sqlite'), 'plaintext fixture');
      return { version, capturedAt: now, snapshotBytes: 17 };
    },
  };
  const store = {
    prefix: 'backup/',
    reset() {
      events.push('reset');
    },
    async put(path, name, digest) {
      events.push({ put: name, bytes: readFileSync(path) });
      if (controls.lostReplies-- > 0) throw Error('lost reply');
      const record = {
        fileId: String(files.size + 1),
        fileName: name,
        bytes: digest.bytes,
        ...parseBackupName('backup/', name),
      };
      files.set(record.fileId, record);
      return record;
    },
    async verify(record) {
      events.push({ verify: record.fileId });
      if (controls.quota) throw new B2QuotaExceeded('download');
    },
    async list() {
      events.push('list');
      return [...files.values()];
    },
    async delete(record) {
      events.push({ delete: record.fileId });
      files.delete(record.fileId);
    },
  };
  const cycle = new BackupCycle(
    { workDirectory: directory, sourceRevision: '12'.repeat(20), recipient: 'unused' },
    source,
    store,
    async (_directory, output) => {
      writeFileSync(output, 'encrypted fixture ' + version, { mode: 0o600 });
      return fileDigest(output);
    },
    () => now,
  );
  t.after(async () => {
    await cycle.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    cycle,
    files,
    events,
    controls,
    directory,
    advance: (ms) => {
      now += ms;
    },
    write: () => {
      version++;
    },
    captures: () => captures,
    now: () => now,
    puts: () => events.filter((e) => e?.put),
    reads: () => events.filter((e) => e?.verify),
  };
}

test('uploads remain prompt; local checks are five-minute; remote cycles are hourly and time based', async (t) => {
  const f = await fixture(t);
  await f.cycle.tick();
  assert.equal(f.reads().length, 1);
  const firstVerified = f.cycle.health().lastSnapshotAt;
  for (let i = 0; i < 11; i++) {
    f.advance(LOCAL_CHECK_MS);
    f.write();
    await f.cycle.tick();
    assert.equal(f.puts().length, i + 2);
    assert.equal(f.reads().length, 1);
    assert.equal(f.cycle.health().lastSnapshotAt, firstVerified);
    assert.equal(f.cycle.health().pendingVerification, true);
    assert.equal(f.cycle.health().lastLocalVerifiedAt, f.now());
    assert.equal(f.cycle.health().healthy, true);
  }
  f.advance(LOCAL_CHECK_MS);
  await f.cycle.tick();
  assert.equal(f.cycle.health().pendingVerification, false);
  const count = f.reads().length;
  f.advance(REMOTE_CHECK_MS);
  await f.cycle.tick();
  assert.equal(
    f.reads().length,
    count + 1,
    'unchanged latest copy is rechecked, known keepers are reused',
  );
  assert.equal(f.captures(), 12);
  assert.equal(f.puts().length, 12);
});

test('quota refusal opens a circuit until UTC reset; local checking cannot mask remote failure', async (t) => {
  const f = await fixture(t);
  f.controls.quota = true;
  await f.cycle.tick();
  const afterFailure = f.events.length;
  // A previous UTC date's unfamiliar keeper must be checked before pruning, even
  // when the current cycle is recovering from a download quota failure.
  const previous = { ...f.files.values().next().value };
  previous.fileId = 'unfamiliar-prior-day';
  previous.capturedAt -= 86400000;
  previous.fileName = previous.fileName.replace(/^backup\/\d{13}/, 'backup/' + previous.capturedAt);
  f.files.set(previous.fileId, previous);
  const midnight = Date.UTC(2026, 9, 27);
  assert.equal(f.cycle.health().remoteRetryAt, midnight);
  assert.equal(f.cycle.health().healthy, false);
  assert.equal(f.cycle.health().backups, 0);
  assert.equal(f.cycle.health().uploads, 1);
  for (let i = 0; i < 12; i++) {
    f.advance(LOCAL_CHECK_MS);
    await f.cycle.tick();
  }
  assert.equal(
    f.events.length,
    afterFailure,
    'no authorize/list/upload/download/delete during cap backoff',
  );
  assert.equal(f.cycle.health().lastLocalVerifiedAt, f.now());
  assert.equal(f.cycle.health().lastFailureStage, 'remote-verify');
  assert.equal(f.puts().length, 1);
  assert.equal(f.captures(), 1);
  f.write();
  await f.cycle.tick();
  assert.equal(f.puts().length, 2, 'a download cap must not prevent new backup uploads');
  assert.equal(f.reads().length, 1);
  f.controls.quota = false;
  f.advance(midnight - f.now());
  await f.cycle.tick();
  assert.equal(f.puts().length, 2, 'the acknowledged uploads are reused across quota failure');
  assert.equal(f.reads().length, 3, 'latest plus unfamiliar keeper are verified in the same cycle');
  assert.equal(f.cycle.health().healthy, true);
});

test('lost upload replies retry identical encrypted bytes with exponential pacing', async (t) => {
  const f = await fixture(t);
  f.controls.lostReplies = 2;
  await f.cycle.tick();
  await f.cycle.tick();
  assert.equal(f.puts().length, 1);
  f.advance(30000);
  await f.cycle.tick();
  f.advance(30000);
  await f.cycle.tick();
  assert.equal(f.puts().length, 2);
  f.advance(30000);
  await f.cycle.tick();
  assert.equal(f.puts().length, 3);
  assert.equal(f.captures(), 1);
  assert.equal(new Set(f.puts().map((e) => e.put)).size, 1);
  assert.deepEqual(f.puts()[0].bytes, f.puts()[2].bytes);
  assert.equal(f.cycle.health().backups, 1);
});

test('local encrypted corruption stops remote work and leaves only encrypted temporary data', async (t) => {
  const f = await fixture(t);
  await f.cycle.tick();
  const names = readdirSync(f.directory);
  assert.equal(names.length, 1);
  const path = join(f.directory, names[0], 'payload.age');
  assert.deepEqual(readdirSync(join(f.directory, names[0])), ['payload.age']);
  writeFileSync(path, 'tampered', { mode: 0o600 });
  const before = f.events.length;
  f.advance(LOCAL_CHECK_MS);
  await f.cycle.tick();
  assert.equal(f.cycle.health().lastFailureStage, 'local-check');
  assert.equal(f.cycle.health().healthy, false);
  assert.equal(f.events.length, before);
  await f.cycle.close();
  assert.deepEqual(readdirSync(f.directory), []);
});

test('B2 caps are recognized only from bounded documented 403 codes; generic errors stay generic', async () => {
  const bytes = Buffer.from('ciphertext');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const record = {
    fileId: 'exact',
    fileName: 'backup/1793008800000-' + '00'.repeat(16) + '-' + sha256 + '.tar.gz.age',
    capturedAt: 1793008800000,
    sha256,
    bytes: bytes.length,
  };
  const authorization = {
    authorizationToken: 'fixture',
    apiInfo: {
      storageApi: {
        apiUrl: 'https://api001.backblazeb2.com',
        downloadUrl: 'https://f001.backblazeb2.com',
        allowed: {
          buckets: [{ id: 'bucket' }],
          namePrefix: 'backup/',
          capabilities: ['listFiles', 'readFiles', 'writeFiles', 'deleteFiles'],
        },
      },
    },
  };
  const root = mkdtempSync(join(tmpdir(), 'done-b2-cap-'));
  try {
    const credentialsFile = join(root, 'credentials');
    writeFileSync(
      credentialsFile,
      JSON.stringify({ keyId: 'fixtureKey', applicationKey: 'fixtureSecret00000000' }),
      { mode: 0o600 },
    );
    for (const [status, code, extra, quota] of [
      [403, 'download_cap_exceeded', '', true],
      [403, 'transaction_cap_exceeded', '', true],
      [403, 'cap_exceeded', '', true],
      [401, 'download_cap_exceeded', '', false],
      [403, 'access_denied', '', false],
      [403, 'download_cap_exceeded', 'x'.repeat(9000), false],
    ]) {
      const store = new B2Store(
        { credentialsFile, bucketId: 'bucket', prefix: 'backup/' },
        'backup/',
        async (url) =>
          String(url).includes('authorize')
            ? Response.json(authorization)
            : Response.json({ code, message: extra }, { status }),
      );
      await assert.rejects(
        store.verify(record, AbortSignal.timeout(1000)),
        (error) =>
          error instanceof B2QuotaExceeded === quota && !error.message.includes('fixtureSecret'),
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
