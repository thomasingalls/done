/** Offline ownership + a durable fence. No public schema transition has shipped yet. */
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  statSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { randomBytes } from 'node:crypto';
import { canonical } from './protocol.ts';
import {
  lockPublicState,
  readExpectedPin,
  readOperatorKey,
  verifyPublicStore,
  PUBLIC_ACCOUNT_SCHEMA,
  type PublicStateOptions,
} from './public-state.ts';
import {
  backupNamespace,
  outside,
  ownedDirectory,
  cleanBackupWorkspace,
  type BackupConfig,
} from './backup/config.ts';
import { B2Store } from './backup/b2.ts';
import { BACKUP_FILES, fileDigest, SnapshotSource } from './backup/snapshot.ts';
import { encryptSnapshot } from './backup/archive.ts';
import { extractRecoveryArchive, verifyRecoverySnapshot } from './backup/restore-archive.ts';
import { parseMaintenanceName, type BackupVersion } from './backup/retention.ts';

type Digest = Awaited<ReturnType<typeof fileDigest>>;
type Files = Record<string, Digest>;
export interface MaintenanceOptions extends PublicStateOptions {
  pinFile: string;
  id: string;
  backup: BackupConfig;
  identityFile?: string;
}
type RecordState = {
  v: 1;
  binding: {
    id: string;
    pin: ReturnType<typeof readExpectedPin>;
    schema: number;
    revision: string;
    bucketId: string;
    namespace: string;
    recipient: string;
  };
  createdAt: number;
  source: Files;
  phase: 'preparing' | 'uploading' | 'ready' | 'resumed-unchanged' | 'expired';
  archive: null | { digest: Digest; capturedAt: number; fileName: string };
  remote: BackupVersion | null;
  resolvedAt: number | null;
  deleteAfter: number | null;
};
export type MaintenancePoint =
  | 'fenced'
  | 'encrypted'
  | 'uploaded'
  | 'ready'
  | 'resolved'
  | 'unfenced';
type Hook = (point: MaintenancePoint) => void;
function sync(path: string) {
  const fd = openSync(path, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function regular(path: string) {
  const s = lstatSync(path);
  if (!s.isFile() || s.mode & 0o077 || (process.getuid && s.uid !== process.getuid()))
    throw Error('Maintenance requires owned private regular files');
  return s;
}
function save(directory: string, record: RecordState) {
  const next = join(directory, 'record.next');
  if (existsSync(next)) {
    regular(next);
    rmSync(next);
  }
  writeFileSync(next, JSON.stringify(record) + '\n', { flag: 'wx', mode: 0o600 });
  sync(next);
  renameSync(next, join(directory, 'record.json'));
  sync(directory);
}
function directoryFiles(directory: string) {
  ownedDirectory(directory);
  const allowed = new Set(['record.json', 'record.next', 'backup.age']);
  for (const name of readdirSync(directory)) {
    if (!allowed.has(name)) throw Error('Unclassified maintenance file');
    regular(join(directory, name));
  }
}
function load(directory: string, binding: RecordState['binding']): RecordState | undefined {
  directoryFiles(directory);
  const path = join(directory, 'record.json');
  if (!existsSync(path)) {
    // No archive/upload can precede the first durable intent. A killed initial write is retryable.
    if (existsSync(join(directory, 'backup.age'))) throw Error('Missing maintenance intent');
    return undefined;
  }
  if (regular(path).size > 65536) throw Error('Oversized maintenance record');
  const r = JSON.parse(readFileSync(path, 'utf8')) as RecordState;
  const digest = (d: Digest) =>
    d &&
    Number.isSafeInteger(d.bytes) &&
    d.bytes >= 0 &&
    /^[0-9a-f]{64}$/.test(d.sha256) &&
    /^[0-9a-f]{40}$/.test(d.sha1) &&
    Object.keys(d).sort().join() === 'bytes,sha1,sha256';
  const time = (n: number | null): n is number => Number.isSafeInteger(n) && n! > 0;
  if (
    !r ||
    Object.keys(r).sort().join() !==
      'archive,binding,createdAt,deleteAfter,phase,remote,resolvedAt,source,v' ||
    r.v !== 1 ||
    canonical(r.binding) !== canonical(binding) ||
    !time(r.createdAt) ||
    !r.source ||
    !Object.entries(r.source).every(
      ([name, d]) =>
        /^(account\.sqlite|authority\.sqlite)(-wal|-journal)?$|^(pin|manifest)\.json$/.test(name) &&
        digest(d),
    ) ||
    !BACKUP_FILES.slice(0, 4).every((name) => r.source[name]) ||
    !['preparing', 'uploading', 'ready', 'resumed-unchanged', 'expired'].includes(r.phase)
  )
    throw Error('Maintenance record/binding mismatch');
  if (
    r.archive !== null &&
    (!digest(r.archive.digest) ||
      !time(r.archive.capturedAt) ||
      Object.keys(r.archive).sort().join() !== 'capturedAt,digest,fileName' ||
      canonical(parseMaintenanceName(binding.namespace, r.archive.fileName, binding.id)) !==
        canonical({ capturedAt: r.archive.capturedAt, sha256: r.archive.digest.sha256 }))
  )
    throw Error('Invalid maintenance archive record');
  if (
    r.remote !== null &&
    (!r.archive ||
      Object.keys(r.remote).sort().join() !== 'bytes,capturedAt,fileId,fileName,sha256' ||
      typeof r.remote.fileId !== 'string' ||
      !r.remote.fileId ||
      r.remote.fileId.length > 2048 ||
      r.remote.fileName !== r.archive.fileName ||
      r.remote.bytes !== r.archive.digest.bytes ||
      r.remote.sha256 !== r.archive.digest.sha256 ||
      r.remote.capturedAt !== r.archive.capturedAt)
  )
    throw Error('Invalid maintenance remote receipt');
  const resolved = ['resumed-unchanged', 'expired'].includes(r.phase);
  if (
    (r.phase === 'preparing' && (r.archive || r.remote)) ||
    (r.phase === 'uploading' && (!r.archive || r.remote)) ||
    (r.phase === 'ready' && (!r.archive || !r.remote)) ||
    (resolved
      ? !time(r.resolvedAt) || r.deleteAfter !== Math.max(r.createdAt + 7 * 86400000, r.resolvedAt!)
      : r.resolvedAt !== null || r.deleteAfter !== null)
  )
    throw Error('Invalid maintenance phase');
  return r;
}
/** Include committed WAL bytes and rollback journals, not reconstructible SHM/empty sidecars. */
async function sourceFiles(store: string): Promise<Files> {
  ownedDirectory(store);
  const result: Files = {};
  const allowed = new Set(BACKUP_FILES.slice(0, 4));
  for (const db of ['account.sqlite', 'authority.sqlite'])
    for (const suffix of ['-wal', '-shm', '-journal']) allowed.add(db + suffix);
  for (const name of readdirSync(store)) {
    if (!allowed.has(name)) throw Error('Unclassified public store file');
    const s = regular(join(store, name));
    if (name.endsWith('-shm') || ((name.endsWith('-wal') || name.endsWith('-journal')) && !s.size))
      continue;
    result[name] = await fileDigest(join(store, name));
  }
  if (!BACKUP_FILES.slice(0, 4).every((name) => result[name]))
    throw Error('Incomplete public store');
  return result;
}
async function unchanged(store: string, record: RecordState) {
  if (canonical(await sourceFiles(store)) !== canonical(record.source))
    throw Error(
      'Source changed during maintenance; explicit migration or incident disposition required',
    );
}
function archiveCompleted(
  root: string,
  active: string,
  history: string,
  r: RecordState,
  hook: Hook,
) {
  if (!existsSync(history)) mkdirSync(history, { mode: 0o700 });
  ownedDirectory(history);
  const dest = join(history, r.binding.id);
  if (existsSync(dest)) throw Error('Ambiguous maintenance history');
  sync(history);
  renameSync(active, dest);
  sync(history);
  sync(root);
  hook('unfenced');
}

/** prepare creates a verified protected backup; resume only unfences byte-for-byte unchanged state.
 * A future target image must implement its own reviewed source->target migration, not SQL from env.
 */
export async function publicMaintenance(
  command: 'prepare' | 'status' | 'resume' | 'prune',
  options: MaintenanceOptions,
  hook: Hook = () => {},
  fetcher: typeof fetch = fetch,
) {
  if (
    !['prepare', 'status', 'resume', 'prune'].includes(command) ||
    !/^[0-9a-f]{32}$/.test(options.id) ||
    !/^[0-9a-f]{40}(?:-dirty)?$/.test(options.backup.sourceRevision)
  )
    throw Error('Invalid maintenance ID/source revision');
  const root = options.directory,
    active = join(root, 'maintenance'),
    history = join(root, 'maintenance-history'),
    completed = join(history, options.id),
    store = join(root, 'store');
  const release = lockPublicState(root);
  let key: Buffer | undefined, work: string | undefined;
  const signal = AbortSignal.timeout(300000);
  try {
    if (existsSync(join(root, 'restore.json'))) throw Error('Restored state remains quarantined');
    const pin = readExpectedPin(options.pinFile, root);
    if (pin.origin !== options.policy.origin || pin.rpId !== options.policy.rpId)
      throw Error('Maintenance policy mismatch');
    const binding: RecordState['binding'] = {
      id: options.id,
      pin,
      schema: PUBLIC_ACCOUNT_SCHEMA,
      revision: options.backup.sourceRevision,
      bucketId: options.backup.bucketId,
      namespace: backupNamespace(options.backup, pin),
      recipient: options.backup.recipient,
    };
    if (existsSync(history)) ownedDirectory(history);
    if (existsSync(active) && existsSync(completed)) throw Error('Ambiguous maintenance history');
    let r = existsSync(active)
      ? load(active, binding)
      : existsSync(completed)
        ? load(completed, binding)
        : undefined;
    const remote = new B2Store(options.backup, binding.namespace, fetcher);
    if (command === 'status')
      return r ?? { phase: existsSync(active) ? 'incomplete-intent' : 'absent' };
    if (command === 'prune') {
      if (existsSync(active) || !r || !['resumed-unchanged', 'expired'].includes(r.phase))
        throw Error('Maintenance backup remains protected');
      if (Date.now() < r.deleteAfter!) throw Error('Maintenance retention has not elapsed');
      // An independently verified routine recovery set must remain before deleting the protected copy.
      const anchor = (await remote.list(signal)).sort((a, b) => b.capturedAt - a.capturedAt)[0];
      if (!anchor || anchor.capturedAt < r.resolvedAt!)
        throw Error('A post-maintenance routine backup is required');
      await remote.verify(anchor, signal);
      for (const v of await remote.listMaintenance(options.id, signal))
        await remote.deleteMaintenance(v, options.id, signal);
      r.phase = 'expired';
      save(completed, r);
      rmSync(join(completed, 'backup.age'), { force: true });
      sync(completed);
      return r;
    }
    if (existsSync(completed)) {
      if (command === 'resume' && r && ['resumed-unchanged', 'expired'].includes(r.phase)) return r;
      throw Error('Maintenance ID has already completed; use a new ID');
    }
    outside(options.backup.workDirectory, root);
    for (const path of [
      options.operatorKeyFile,
      options.pinFile,
      options.backup.credentialsFile,
      options.identityFile,
    ])
      if (path) outside(path, options.backup.workDirectory);
    cleanBackupWorkspace(options.backup.workDirectory);
    if (command === 'resume') {
      if (!r) throw Error('No durable maintenance intent; retry prepare first');
      await unchanged(store, r);
      if (r.phase !== 'resumed-unchanged') {
        r.phase = 'resumed-unchanged';
        r.resolvedAt = Date.now();
        r.deleteAfter = Math.max(r.createdAt + 7 * 86400000, r.resolvedAt);
        save(active, r);
        hook('resolved');
      }
      archiveCompleted(root, active, history, r, hook);
      return r;
    }
    if (r && ['resumed-unchanged', 'expired'].includes(r.phase))
      throw Error('Use resume to finish maintenance resolution');
    // Validate key and identity separation before installing a new fence.
    key = readOperatorKey(options.operatorKeyFile, root);
    if (!options.identityFile || !isAbsolute(options.identityFile))
      throw Error('Maintenance needs an external age identity file');
    outside(options.identityFile, root);
    const identity = statSync(options.identityFile);
    if (!identity.isFile() || identity.size > 8192 || identity.mode & 0o007)
      throw Error('Invalid maintenance age identity');
    outside(options.backup.workDirectory, root);
    ownedDirectory(options.backup.workDirectory);
    outside(options.identityFile, options.backup.workDirectory);
    if (!r) {
      const source = await sourceFiles(store);
      if (!existsSync(active)) {
        mkdirSync(active, { mode: 0o700 });
        sync(root);
      }
      r = {
        v: 1,
        binding,
        createdAt: Date.now(),
        source,
        phase: 'preparing',
        archive: null,
        remote: null,
        resolvedAt: null,
        deleteAfter: null,
      };
      save(active, r);
      hook('fenced');
    }
    await unchanged(store, r);
    work = join(options.backup.workDirectory, 'run-' + randomBytes(16).toString('hex'));
    mkdirSync(work, { mode: 0o700 });
    const archive = join(active, 'backup.age');
    if (r.phase === 'preparing') {
      if (existsSync(archive)) {
        regular(archive);
        rmSync(archive);
      }
      const snapshot = join(work, 'snapshot');
      mkdirSync(snapshot, { mode: 0o700 });
      const source = new SnapshotSource(store, pin);
      let captured;
      try {
        captured = await source.capture(snapshot, binding.revision);
      } finally {
        source.close();
      }
      const digest = await encryptSnapshot(snapshot, archive, binding.recipient, signal);
      sync(archive);
      sync(active);
      r.archive = {
        digest,
        capturedAt: captured.capturedAt,
        fileName:
          binding.namespace +
          'maintenance/' +
          options.id +
          '/' +
          captured.capturedAt +
          '-' +
          digest.sha256 +
          '.tar.gz.age',
      };
      r.phase = 'uploading';
      save(active, r);
      hook('encrypted');
    }
    if (canonical(await fileDigest(archive)) !== canonical(r.archive!.digest))
      throw Error('Maintenance ciphertext changed');
    const decoded = join(work, 'verified');
    mkdirSync(decoded, { mode: 0o700 });
    await extractRecoveryArchive(
      archive,
      options.identityFile,
      r.archive!.digest.sha256,
      decoded,
      signal,
    );
    const verified = await verifyRecoverySnapshot(decoded, pin, key);
    if (
      verified.sourceRevision !== binding.revision ||
      verified.capturedAt !== r.archive!.capturedAt
    )
      throw Error('Maintenance backup provenance mismatch');
    // Cold-open only the disposable decrypted copy. Never reset live session custody or counters.
    const opened = verifyPublicStore(decoded, options.policy, key, pin);
    try {
      opened.core.close();
    } finally {
      opened.authority.close();
    }
    await unchanged(store, r);
    if (!r.remote) {
      // Recover a lost upload reply by exact immutable name/digest; duplicate versions remain protected.
      const candidates = (await remote.listMaintenance(options.id, signal)).filter(
        (v) => v.fileName === r!.archive!.fileName && v.bytes === r!.archive!.digest.bytes,
      );
      const found = candidates[0];
      if (found) {
        await remote.verify(found, signal);
        r.remote = found;
      } else
        r.remote = await remote.upload(archive, r.archive!.fileName, r.archive!.digest, signal);
      hook('uploaded');
    } else await remote.verify(r.remote, signal);
    await unchanged(store, r);
    r.phase = 'ready';
    save(active, r);
    hook('ready');
    return r;
  } finally {
    try {
      if (work) rmSync(work, { recursive: true, force: true });
    } finally {
      key?.fill(0);
      release();
    }
  }
}
