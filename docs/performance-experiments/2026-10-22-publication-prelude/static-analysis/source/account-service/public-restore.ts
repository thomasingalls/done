/** Operator-only isolated recovery. Nothing here authorizes publishing rewound account history. */
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { canonical, fields, object } from './protocol.ts';
import { publicPolicy } from './public-config.ts';
import {
  lockPublicState,
  readExpectedPin,
  readOperatorKey,
  verifyPublicStore,
  PUBLIC_ACCOUNT_SCHEMA,
  type PublicStateOptions,
} from './public-state.ts';
import { SessionCustody } from './session-custody.ts';
import type { AuthorityPin } from '../account-protocol/authority.ts';
import { BACKUP_FILES } from './backup/snapshot.ts';
import {
  extractRecoveryArchive,
  recoveryFileDigests,
  verifyRecoverySnapshot,
  checkRecoveryDatabase,
} from './backup/restore-archive.ts';

export interface RestoreOptions extends PublicStateOptions {
  pinFile: string;
  archive: string;
  archiveSha256: string;
  identityFile: string;
  sourceRevision: string;
}
type Hook = (
  point:
    | 'after-extract'
    | 'before-reset-commit'
    | 'after-reset-commit'
    | 'before-publish'
    | 'after-publish',
) => void;
function sync(path: string) {
  const fd = openSync(path, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function ownedDirectory(path: string) {
  const s = lstatSync(path);
  if (!s.isDirectory() || s.mode & 0o077 || (process.getuid && s.uid !== process.getuid()))
    throw Error('Recovery destination must be an owned private directory');
}
function external(path: string, directory: string) {
  const r = relative(realpathSync(directory), realpathSync(path));
  if (!r || (!isAbsolute(r) && r !== '..' && !r.startsWith('../')))
    throw Error('Recovery inputs must remain outside the destination');
}
function marker(directory: string, value: unknown) {
  const next = join(directory, 'restore.next');
  writeFileSync(next, JSON.stringify(value) + '\n', { flag: 'wx', mode: 0o600 });
  sync(next);
  renameSync(next, join(directory, 'restore.json'));
  sync(directory);
}
function readMarker(directory: string): Record<string, unknown> | undefined {
  const path = join(directory, 'restore.json');
  if (!existsSync(path)) return;
  const s = lstatSync(path);
  if (
    !s.isFile() ||
    s.size > 32768 ||
    s.mode & 0o077 ||
    (process.getuid && s.uid !== process.getuid())
  )
    throw Error('Invalid recovery progress');
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (
    !object(value) ||
    value.v !== 1 ||
    !['preparing', 'quarantined'].includes(String(value.phase))
  )
    throw Error('Invalid recovery progress');
  return value;
}
function discardIncomplete(directory: string) {
  for (const name of ['snapshot', 'candidate']) {
    const path = join(directory, name);
    if (!existsSync(path)) continue;
    ownedDirectory(path);
    const allowed = new Set([
      ...BACKUP_FILES,
      'account.sqlite-wal',
      'account.sqlite-shm',
      'authority.sqlite-wal',
      'authority.sqlite-shm',
      'account.sqlite-journal',
    ]);
    if (readdirSync(path).some((entry) => !allowed.has(entry)))
      throw Error('Unclassified interrupted recovery files; preserve for operator inspection');
    rmSync(path, { recursive: true });
  }
  if (existsSync(join(directory, 'restore.next'))) {
    const s = lstatSync(join(directory, 'restore.next'));
    if (!s.isFile()) throw Error('Invalid recovery progress staging');
    rmSync(join(directory, 'restore.next'));
  }
  sync(directory);
}
function removeEmptySidecars(directory: string) {
  // All connections are closed. Read-only WAL opens may leave empty WAL and SHM files.
  // Never hide committed data by hashing only the main database while a nonempty WAL exists.
  for (const name of ['account.sqlite', 'authority.sqlite']) {
    const wal = join(directory, name + '-wal');
    if (existsSync(wal) && lstatSync(wal).size !== 0)
      throw Error('Recovery database has an uncheckpointed WAL');
    for (const suffix of ['-wal', '-shm']) {
      const path = join(directory, name + suffix);
      if (!existsSync(path)) continue;
      if (!lstatSync(path).isFile()) throw Error('Invalid recovery database sidecar');
      rmSync(path);
    }
  }
}
function coldCheck(candidate: string, options: RestoreOptions, pin: AuthorityPin, key: Uint8Array) {
  const state = verifyPublicStore(candidate, options.policy, key, pin);
  try {
    state.authority.close();
  } finally {
    state.core.close();
  }
}
function resetSessions(candidate: string, pin: AuthorityPin, key: Uint8Array, hook: Hook) {
  const db = new DatabaseSync(join(candidate, 'account.sqlite'));
  const salt = randomBytes(32).toString('hex');
  const custody = new SessionCustody({ pin, operatorKey: key }, salt);
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; BEGIN IMMEDIATE;');
    const sessions = Number(db.prepare('SELECT COUNT(*) AS n FROM network_sessions').get()!.n);
    const attempts = Number(db.prepare('SELECT COUNT(*) AS n FROM session_attempts').get()!.n);
    db.exec(`DELETE FROM enrollment_session_links;
      DELETE FROM network_sessions;
      DELETE FROM session_attempts;
      UPDATE ceremonies SET expires=0;
      UPDATE attempts SET state='expired' WHERE state='open';`);
    const updated = db
      .prepare('UPDATE session_custody SET context=?,salt=?,key_check=?,seal_counter=0 WHERE id=1')
      .run(custody.context, salt, custody.tag());
    if (updated.changes !== 1) throw Error('Missing restored custody');
    if (db.prepare('PRAGMA foreign_key_check').all().length)
      throw Error('Recovery reset broke foreign keys');
    hook('before-reset-commit');
    db.exec('COMMIT');
    hook('after-reset-commit');
    return { sessions, attempts };
  } finally {
    if (db.isTransaction) db.exec('ROLLBACK');
    db.close();
    custody.close();
  }
}

export async function restorePublicBackup(options: RestoreOptions, hook: Hook = () => {}) {
  publicPolicy(options.policy.origin);
  if (
    !/^[0-9a-f]{64}$/.test(options.archiveSha256) ||
    !/^[0-9a-f]{40}(?:-dirty)?$/.test(options.sourceRevision)
  )
    throw Error('Recovery requires explicit archive SHA-256 and tool source revision');
  for (const path of [
    options.directory,
    options.archive,
    options.pinFile,
    options.operatorKeyFile,
    options.identityFile,
  ])
    if (!isAbsolute(path)) throw Error('Recovery paths must be absolute');
  if (!existsSync(options.directory)) {
    mkdirSync(options.directory, { mode: 0o700 });
    sync(dirname(options.directory));
  }
  const release = lockPublicState(options.directory, true);
  let key: Buffer | undefined;
  try {
    const allowed = new Set([
      'ownership.sqlite',
      'ownership.sqlite-journal',
      'restore.json',
      'restore.next',
      'snapshot',
      'candidate',
    ]);
    if (readdirSync(options.directory).some((name) => !allowed.has(name)))
      throw Error('Recovery refuses live or unclassified state; use an isolated destination');
    for (const path of [options.archive, options.identityFile]) external(path, options.directory);
    const identity = statSync(options.identityFile);
    if (!identity.isFile() || identity.size > 16384 || identity.mode & 0o007)
      throw Error('Recovery identity must be a bounded private file');
    key = readOperatorKey(options.operatorKeyFile, options.directory);
    const pin = readExpectedPin(options.pinFile, options.directory);
    if (pin.origin !== options.policy.origin || pin.rpId !== options.policy.rpId)
      throw Error('Recovery policy differs from expected pin');
    const binding = { archiveSha256: options.archiveSha256, pin };
    const prior = readMarker(options.directory);
    if (prior && canonical(prior.binding) !== canonical(binding))
      throw Error('Recovery input binding changed');
    const snapshot = join(options.directory, 'snapshot');
    const candidate = join(options.directory, 'candidate');
    if (prior?.phase === 'quarantined') {
      if (!fields(prior, ['v', 'phase', 'binding', 'report']))
        throw Error('Invalid recovery report');
      for (const [directory, allowed] of [
        [snapshot, BACKUP_FILES],
        [candidate, BACKUP_FILES.slice(0, 4)],
      ] as const) {
        ownedDirectory(directory);
        removeEmptySidecars(directory);
        if (readdirSync(directory).some((name) => !allowed.includes(name)))
          throw Error('Quarantined candidate or snapshot has unclassified files');
      }
      const report = prior.report;
      if (
        !object(report) ||
        !fields(report, [
          'capturedAt',
          'backupSourceRevision',
          'restoreSourceRevision',
          'verifiedAt',
          'accountSchema',
          'authoritySchema',
          'invalidated',
          'historyContinuity',
          'servingAllowed',
          'files',
        ]) ||
        report.servingAllowed !== false ||
        report.historyContinuity !== 'not-established' ||
        report.accountSchema !== PUBLIC_ACCOUNT_SCHEMA ||
        report.authoritySchema !== 1 ||
        !Number.isSafeInteger(report.verifiedAt) ||
        (report.verifiedAt as number) < 0 ||
        typeof report.restoreSourceRevision !== 'string' ||
        !/^[0-9a-f]{40}(?:-dirty)?$/.test(report.restoreSourceRevision) ||
        !object(report.invalidated) ||
        !fields(report.invalidated, ['sessions', 'attempts']) ||
        Object.values(report.invalidated).some(
          (v) => !Number.isSafeInteger(v) || (v as number) < 0,
        ) ||
        canonical(report.files) !== canonical(await recoveryFileDigests(candidate))
      )
        throw Error('Quarantined candidate changed');
      const verified = await verifyRecoverySnapshot(snapshot, pin, key);
      if (
        report.capturedAt !== verified.capturedAt ||
        report.backupSourceRevision !== verified.sourceRevision
      )
        throw Error('Recovery report differs from preserved snapshot');
      removeEmptySidecars(snapshot);
      sync(snapshot);
      // Exact file hashes preserve the already verified/reset outcome; retry never rotates custody again.
      return prior;
    }
    if (prior && !fields(prior, ['v', 'phase', 'binding']))
      throw Error('Invalid recovery progress');
    if (!prior) {
      if (
        readdirSync(options.directory).some(
          (n) => !['ownership.sqlite', 'ownership.sqlite-journal'].includes(n),
        )
      )
        throw Error('Unbound recovery files; preserve for operator inspection');
      marker(options.directory, { v: 1, phase: 'preparing', binding });
    }
    discardIncomplete(options.directory);
    mkdirSync(snapshot, { mode: 0o700 });
    mkdirSync(candidate, { mode: 0o700 });
    sync(options.directory);
    await extractRecoveryArchive(
      options.archive,
      options.identityFile,
      options.archiveSha256,
      snapshot,
      AbortSignal.timeout(300000),
    );
    const verified = await verifyRecoverySnapshot(snapshot, pin, key);
    removeEmptySidecars(snapshot);
    hook('after-extract');
    for (const name of BACKUP_FILES.slice(0, 4))
      copyFileSync(join(snapshot, name), join(candidate, name));
    coldCheck(candidate, options, pin, key);
    const invalidated = resetSessions(candidate, pin, key, hook);
    coldCheck(candidate, options, pin, key);
    checkRecoveryDatabase(join(candidate, 'account.sqlite'), PUBLIC_ACCOUNT_SCHEMA);
    removeEmptySidecars(candidate);
    const result = {
      v: 1,
      phase: 'quarantined',
      binding,
      report: {
        capturedAt: verified.capturedAt,
        backupSourceRevision: verified.sourceRevision,
        restoreSourceRevision: options.sourceRevision,
        verifiedAt: Date.now(),
        accountSchema: PUBLIC_ACCOUNT_SCHEMA,
        authoritySchema: 1,
        invalidated,
        historyContinuity: 'not-established',
        servingAllowed: false,
        files: await recoveryFileDigests(candidate),
      },
    };
    for (const directory of [snapshot, candidate]) {
      for (const name of readdirSync(directory)) sync(join(directory, name));
      sync(directory);
    }
    hook('before-publish');
    marker(options.directory, result);
    hook('after-publish');
    return result;
  } finally {
    key?.fill(0);
    release();
  }
}
