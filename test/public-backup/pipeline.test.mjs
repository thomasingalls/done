import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { initializePublicState, openPublicState } from '../../account-service/public-state.ts';
import { SnapshotSource } from '../../account-service/backup/snapshot.ts';
import { B2Store } from '../../account-service/backup/b2.ts';
import { BackupCycle } from '../../account-service/backup/cycle.ts';
import { backupNamespace, backupConfig } from '../../account-service/backup/config.ts';
import { b2Fixture } from './b2-fixture.mjs';

process.umask(0o077);
test('real encrypted pipeline uses version readback; failures never authorize pruning or lose pending changes', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const advance = (ms = 3600000) => t.mock.timers.tick(ms);
  const root = mkdtempSync(join(tmpdir(), 'done-b2-'));
  const options = {
    directory: join(root, 'state'),
    operatorKeyFile: join(root, 'key'),
    pinFile: join(root, 'pin'),
    policy: { origin: 'https://done.example.com', rpId: 'done.example.com' },
  };
  writeFileSync(options.operatorKeyFile, randomBytes(32));
  const pin = initializePublicState(options);
  writeFileSync(options.pinFile, JSON.stringify(pin));
  const owner = openPublicState(options),
    source = new SnapshotSource(join(options.directory, 'store'), pin);
  const writer = new DatabaseSync(join(options.directory, 'store/account.sqlite'));
  writer.exec('CREATE TABLE backup_probe(n INTEGER);');
  const identity = join(root, 'identity');
  execFileSync('age-keygen', ['-o', identity], { stdio: 'ignore' });
  const work = join(root, 'work');
  mkdirSync(work);
  const config = {
    bucketId: 'fixtureBucket',
    prefix: 'done-backups/' + 'ab'.repeat(16) + '/',
    workDirectory: work,
    credentialsFile: join(root, 'credentials'),
    sourceRevision: '12'.repeat(20),
    recipient: execFileSync('age-keygen', ['-y', identity], { encoding: 'utf8' }).trim(),
  };
  writeFileSync(
    config.credentialsFile,
    JSON.stringify({ keyId: 'fixtureKey', applicationKey: 'fixtureSecret00000000' }),
  );
  const fixture = await b2Fixture(config),
    namespace = backupNamespace(config, pin);
  const store = new B2Store(config, namespace, fixture.fetcher);
  const cycle = new BackupCycle(config, source, store);
  t.after(async () => {
    await cycle.close();
    await fixture.close();
    source.close();
    writer.close();
    owner.close();
    rmSync(root, { recursive: true, force: true });
  });

  // Use the actual configuration parser, including custody/workspace separation.
  const cfgPath = join(root, 'config');
  const { sourceRevision, ...publicConfig } = config;
  writeFileSync(cfgPath, JSON.stringify({ v: 1, ...publicConfig }));
  assert.deepEqual(
    backupConfig(options.directory, {
      DONE_BACKUP_CONFIG_FILE: cfgPath,
      DONE_SOURCE_REVISION: sourceRevision,
    }),
    config,
  );
  writeFileSync(
    cfgPath,
    JSON.stringify({ v: 1, ...publicConfig, workDirectory: options.directory }),
  );
  assert.throws(
    () =>
      backupConfig(options.directory, {
        DONE_BACKUP_CONFIG_FILE: cfgPath,
        DONE_SOURCE_REVISION: sourceRevision,
      }),
    /outside/,
  );
  fixture.controls.broadKey = true;
  await cycle.tick();
  assert.equal(cycle.health().backups, 0);
  assert.equal(fixture.files.size, 0);
  fixture.controls.broadKey = false;
  fixture.controls.badUploadHost = true;
  advance(30000);
  await cycle.tick();
  assert.equal(fixture.files.size, 0);
  fixture.controls.badUploadHost = false;
  advance(60000);
  await cycle.tick();
  assert.equal(cycle.health().backups, 1);
  assert(cycle.health().healthy);
  const first = [...fixture.files.values()][0];
  const encrypted = join(root, 'download.age');
  writeFileSync(encrypted, first.bytes);
  const decoded = execFileSync('age', ['-d', '-i', identity, encrypted], {
    maxBuffer: 16 * 1024 ** 2,
  });
  const manifest = JSON.parse(
    execFileSync('tar', ['-xzOf', '-', 'backup.json'], { input: decoded, encoding: 'utf8' }),
  );
  assert.deepEqual(manifest.pin, pin);
  await cycle.tick();
  assert.equal(cycle.health().backups, 1, 'unchanged state does not upload');

  const old = {
    ...first,
    fileId: randomUUID(),
    fileName:
      namespace +
      (Date.now() - 30 * 86400000) +
      '-' +
      '00'.repeat(16) +
      '-' +
      first.fileName.split('-').at(-1),
  };
  const foreign = {
    ...old,
    fileId: randomUUID(),
    fileName: config.prefix + 'other-service/keep.age',
  };
  const unknown = { ...old, fileId: randomUUID(), fileName: namespace + 'maintenance-keep.age' };
  for (const f of [old, foreign, unknown]) fixture.files.set(f.fileId, f);
  writer.exec('INSERT INTO backup_probe VALUES (1);');
  fixture.controls.loseUploadReply = true;
  await cycle.tick();
  assert.equal(cycle.health().backups, 1);
  assert(fixture.files.has(old.fileId));
  fixture.controls.corruptDownload = true;
  advance();
  await cycle.tick();
  assert.equal(cycle.health().backups, 1);
  assert(fixture.files.has(old.fileId));
  assert.equal(fixture.events.filter((e) => e.method === 'b2_delete_file_version').length, 0);
  fixture.controls.corruptDownload = false;
  advance();
  const unverified = {
    ...old,
    fileId: randomUUID(),
    fileName:
      namespace + Date.now() + '-' + '01'.repeat(16) + '-' + first.fileName.split('-').at(-1),
    bytes: Buffer.from(first.bytes),
  };
  unverified.bytes[unverified.bytes.length - 1] ^= 1;
  fixture.files.set(unverified.fileId, unverified);
  const beforeDeletes = fixture.events.filter((e) => e.method === 'b2_delete_file_version').length;
  await cycle.tick();
  assert.equal(cycle.health().backups, 2);
  assert.equal(cycle.health().lastFailureStage, 'retention');
  assert.equal(
    fixture.events.filter((e) => e.method === 'b2_delete_file_version').length,
    beforeDeletes,
    'a corrupted unverified hourly keeper cannot authorize deleting another copy',
  );
  unverified.bytes = Buffer.from(first.bytes);
  fixture.controls.failDelete = true;
  advance();
  await cycle.tick();
  assert.equal(cycle.health().backups, 2);
  assert.equal(cycle.health().lastFailureStage, 'retention');
  fixture.controls.failDelete = false;
  advance();
  await cycle.tick();
  assert.equal(cycle.health().backups, 2);
  assert(cycle.health().healthy);
  assert(!fixture.files.has(old.fileId));
  assert(fixture.files.has(foreign.fileId));
  assert(fixture.files.has(unknown.fileId));
  advance();
  fixture.controls.downloadQuota = true;
  await cycle.tick();
  assert.equal(cycle.health().lastFailureStage, 'remote-verify');
  assert.equal(cycle.health().quotaBlocked, true);
  const capEvents = fixture.events.length;
  advance(300000);
  await cycle.tick();
  assert.equal(
    fixture.events.length,
    capEvents,
    'actual B2 cap reply suppresses repeated provider calls',
  );
  fixture.controls.downloadQuota = false;
  advance(cycle.health().remoteRetryAt - Date.now());
  await cycle.tick();
  assert.equal(cycle.health().backups, 2, 'quota recovery reuses the uploaded version');
  assert(cycle.health().healthy);
  const retained = readdirSync(work);
  assert.equal(retained.length, 1);
  assert.deepEqual(readdirSync(join(work, retained[0])), ['payload.age']);
  await cycle.close();
  assert.deepEqual(readdirSync(work), []);
  assert(
    fixture.events
      .filter((e) => e.method === 'b2_list_file_versions')
      .some((e) => e.body.startFileId),
  );
  fixture.controls.repeatedCursor = true;
  await assert.rejects(store.list(AbortSignal.timeout(3000)), /Repeated/);
  await assert.rejects(
    store.delete({ fileId: foreign.fileId, fileName: foreign.fileName }, AbortSignal.timeout(3000)),
    /Unscoped/,
  );
});

test('overlapping ticks coalesce; a late write stays dirty; close aborts transfer and waits before cleanup', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'done-cycle-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let version = 1,
    releaseCapture,
    captures = 0,
    uploadCalls = 0;
  const captured = new Promise((resolve) => {
    releaseCapture = resolve;
  });
  const source = {
    version: () => version,
    capture: async () => {
      captures++;
      await captured;
      return { version: 1, capturedAt: Date.now(), snapshotBytes: 10 };
    },
  };
  const store = {
    prefix: 'test/',
    reset() {},
    verify: async () => {},
    list: async () => [],
    delete: async () => {},
    put: async (_path, _name, _digest, signal) => {
      uploadCalls++;
      await new Promise((resolve, reject) =>
        signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }),
      );
    },
  };
  const cycle = new BackupCycle(
    { workDirectory: root, sourceRevision: '12'.repeat(20), recipient: 'unused' },
    source,
    store,
    async (_directory, path) => {
      writeFileSync(path, 'x', { mode: 0o600 });
      const { fileDigest } = await import('../../account-service/backup/snapshot.ts');
      return fileDigest(path);
    },
  );
  const first = cycle.tick();
  assert.equal(cycle.tick(), first);
  assert.equal(captures, 1);
  version = 2;
  releaseCapture();
  while (!uploadCalls) await new Promise((resolve) => setImmediate(resolve));
  await cycle.close();
  await first;
  assert.equal(cycle.health().backups, 0);
  assert(cycle.health().dirtySince);
  assert.deepEqual(readdirSync(root), []);
  await cycle.tick();
  assert.equal(captures, 1);
});
