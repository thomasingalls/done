/** Isolated extraction only: no archive entry controls a filesystem path or file mode. */
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { extract } from 'tar-stream';
import { DatabaseSync } from 'node:sqlite';
import type { AuthorityPin } from '../../account-protocol/authority.ts';
import { PrivateAuthority } from '../authority.ts';
import { SessionCustody } from '../session-custody.ts';
import { canonical, fields, object } from '../protocol.ts';
import { PUBLIC_ACCOUNT_SCHEMA } from '../public-state.ts';
import { BACKUP_FILES, MAX_SNAPSHOT_BYTES, fileDigest } from './snapshot.ts';

const limits: Record<string, number> = {
  'account.sqlite': MAX_SNAPSHOT_BYTES,
  'authority.sqlite': 1024 ** 2,
  'pin.json': 8192,
  'manifest.json': 8192,
  'backup.json': 8192,
};
function bounded(limit: number, update: (bytes: Buffer) => void = () => {}) {
  let size = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > limit) return callback(Error('Recovery archive size limit exceeded'));
      update(chunk);
      callback(null, chunk);
    },
  });
}

/** SQLite is not opened until both full age authentication and ciphertext selection succeed. */
export async function extractRecoveryArchive(
  archive: string,
  identityFile: string,
  expectedSha256: string,
  destination: string,
  signal: AbortSignal,
) {
  const archiveStat = lstatSync(archive);
  if (!archiveStat.isFile() || archiveStat.size > MAX_SNAPSHOT_BYTES + 1024 ** 2)
    throw Error('Invalid or oversized recovery archive');
  const age = spawn('age', ['--decrypt', '--identity', identityFile], {
    stdio: ['pipe', 'pipe', 'ignore'],
    signal,
  });
  const ended = new Promise<void>((resolve, reject) => {
    age.once('error', () => reject(Error('Recovery decryption process failed')));
    age.once('exit', (code) =>
      code === 0 ? resolve() : reject(Error('Recovery archive authentication failed')),
    );
  });
  const digest = createHash('sha256');
  const tar = extract();
  const seen = new Set<string>();
  const entries: Promise<void>[] = [];
  tar.on('entry', (header, stream, next) => {
    const limit = Object.hasOwn(limits, header.name) ? limits[header.name]! : 0;
    if (
      !limit ||
      seen.has(header.name) ||
      header.type !== 'file' ||
      header.linkname ||
      !Number.isSafeInteger(header.size) ||
      header.size < 1 ||
      header.size > limit
    ) {
      // Parent extraction reports this refusal; the rejected entry has no file pipeline to own its error.
      stream.on('error', () => {});
      next(Error('Unclassified, duplicate or oversized recovery entry'));
      return;
    }
    seen.add(header.name);
    // Use only a name from the fixed allowlist. Ignore archive permissions, ownership and timestamps.
    const work = pipeline(
      stream,
      bounded(limit),
      createWriteStream(join(destination, header.name), { flags: 'wx', mode: 0o600 }),
      { signal },
    );
    entries.push(work);
    void work.then(
      () => next(),
      (cause: Error) => next(cause),
    );
  });
  const operations = [
    ended,
    pipeline(
      createReadStream(archive),
      bounded(MAX_SNAPSHOT_BYTES + 1024 ** 2, (b) => digest.update(b)),
      age.stdin,
      { signal },
    ),
    pipeline(age.stdout, createGunzip(), bounded(MAX_SNAPSHOT_BYTES + 2 * 1024 ** 2), tar, {
      signal,
    }),
  ];
  try {
    await Promise.all(operations);
    await Promise.all(entries);
    if (seen.size !== BACKUP_FILES.length) throw Error('Incomplete recovery archive');
    if (digest.digest('hex') !== expectedSha256) throw Error('Recovery ciphertext digest mismatch');
  } catch (cause) {
    age.kill('SIGKILL');
    tar.destroy();
    await Promise.allSettled([...operations, ...entries]);
    throw cause;
  }
}

function json(path: string, limit = 8192) {
  const s = lstatSync(path);
  if (!s.isFile() || s.size > limit) throw Error('Invalid recovery metadata');
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}
export async function recoveryFileDigests(directory: string) {
  const files: Record<string, Awaited<ReturnType<typeof fileDigest>>> = {};
  for (const name of BACKUP_FILES.slice(0, 4)) {
    const s = lstatSync(join(directory, name));
    if (!s.isFile() || s.size > limits[name]!) throw Error('Invalid recovered file');
    files[name] = await fileDigest(join(directory, name));
  }
  return files;
}
export function checkRecoveryDatabase(path: string, schema: number) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec('PRAGMA trusted_schema=OFF;');
    if (db.prepare('PRAGMA user_version').get()!.user_version !== schema)
      throw Error('Unsupported recovery schema');
    if (
      db
        .prepare('PRAGMA integrity_check')
        .all()
        .some((r) => r.integrity_check !== 'ok') ||
      db.prepare('PRAGMA foreign_key_check').all().length
    )
      throw Error('Recovery database integrity or foreign key check failed');
  } finally {
    db.close();
  }
}

/** These checks prove internal integrity and key/pin consistency, not current history continuity. */
export async function verifyRecoverySnapshot(
  directory: string,
  pin: AuthorityPin,
  key: Uint8Array,
) {
  const meta = json(join(directory, 'backup.json'));
  if (
    !object(meta) ||
    !fields(meta, [
      'v',
      'format',
      'capturedAt',
      'sourceRevision',
      'pin',
      'accountSchema',
      'authoritySchema',
      'files',
    ]) ||
    meta.v !== 1 ||
    meta.format !== 'done-public-backup' ||
    !Number.isSafeInteger(meta.capturedAt) ||
    (meta.capturedAt as number) < 0 ||
    typeof meta.sourceRevision !== 'string' ||
    !/^[0-9a-f]{40}(?:-dirty)?$/.test(meta.sourceRevision) ||
    meta.accountSchema !== PUBLIC_ACCOUNT_SCHEMA ||
    meta.authoritySchema !== 1 ||
    canonical(meta.pin) !== canonical(pin) ||
    canonical(json(join(directory, 'pin.json'))) !== canonical(pin) ||
    canonical(json(join(directory, 'manifest.json'))) !==
      canonical({ v: 1, accountSchema: PUBLIC_ACCOUNT_SCHEMA, authoritySchema: 1, pin })
  )
    throw Error('Recovery manifest, schema or expected pin mismatch');
  const files = await recoveryFileDigests(directory);
  if (canonical(meta.files) !== canonical(files)) throw Error('Recovery file digest mismatch');
  checkRecoveryDatabase(join(directory, 'account.sqlite'), PUBLIC_ACCOUNT_SCHEMA);
  checkRecoveryDatabase(join(directory, 'authority.sqlite'), 1);
  PrivateAuthority.open(join(directory, 'authority.sqlite'), pin, key).close();
  const db = new DatabaseSync(join(directory, 'account.sqlite'), { readOnly: true });
  try {
    if (
      db.prepare('SELECT value FROM policy WHERE id=1').get()?.value !==
      canonical({ origin: pin.origin, rpId: pin.rpId })
    )
      throw Error('Recovery account policy mismatch');
    const row = db.prepare('SELECT * FROM session_custody WHERE id=1').get();
    if (!row) throw Error('Missing recovery session custody');
    const custody = new SessionCustody({ pin, operatorKey: key }, String(row.salt));
    try {
      if (row.context !== custody.context) throw Error('Recovery custody context mismatch');
      custody.check(String(row.key_check));
    } finally {
      custody.close();
    }
    return { capturedAt: meta.capturedAt as number, sourceRevision: meta.sourceRevision, files };
  } finally {
    db.close();
  }
}
