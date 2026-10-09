/** Read-only companion of a verified live owner. Never acquires/replaces the ownership inode. */
import { DatabaseSync, backup } from 'node:sqlite';
import { createReadStream, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { AuthorityPin } from '../../account-protocol/authority.ts';
import { canonical } from '../protocol.ts';
import { PUBLIC_ACCOUNT_SCHEMA } from '../public-state.ts';

export const MAX_SNAPSHOT_BYTES = 1024 ** 3;
export const BACKUP_FILES = [
  'account.sqlite',
  'authority.sqlite',
  'pin.json',
  'manifest.json',
  'backup.json',
];
export async function fileDigest(path: string) {
  const sha256 = createHash('sha256'),
    sha1 = createHash('sha1');
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    bytes += chunk.length;
    if (bytes > MAX_SNAPSHOT_BYTES + 1024 ** 2) throw Error('Backup size limit exceeded');
    sha256.update(chunk);
    sha1.update(chunk);
  }
  return { bytes, sha256: sha256.digest('hex'), sha1: sha1.digest('hex') };
}
function checkFile(path: string) {
  const s = lstatSync(path);
  if (!s.isFile() || s.mode & 0o077 || (process.getuid && s.uid !== process.getuid()))
    throw Error('Backup source must remain owned private regular files');
}
function integrity(db: DatabaseSync) {
  if (
    db
      .prepare('PRAGMA quick_check')
      .all()
      .some((r) => r.quick_check !== 'ok')
  )
    throw Error('Backup database integrity failed');
}
export class SnapshotSource {
  private db: DatabaseSync;
  private store: string;
  private pin: AuthorityPin;
  constructor(store: string, pin: AuthorityPin) {
    this.store = store;
    this.pin = pin;
    for (const file of BACKUP_FILES.slice(0, 4)) checkFile(join(store, file));
    this.db = new DatabaseSync(join(store, 'account.sqlite'), { readOnly: true });
  }
  version(): number {
    return Number(this.db.prepare('PRAGMA data_version').get()!.data_version);
  }
  close() {
    this.db.close();
  }
  /** Called only by the API-owned worker; parent retains exclusive lifetime ownership. */
  async capture(destination: string, sourceRevision: string, anchored: () => void = () => {}) {
    if (!/^[0-9a-f]{40}(?:-dirty)?$/.test(sourceRevision))
      throw Error('Missing backup source revision');
    const version = this.version(); // Conservative: concurrent commits may cause an extra later backup.
    const capturedAt = Date.now();
    this.db.exec('BEGIN');
    try {
      const schema = this.db.prepare('PRAGMA user_version').get()!.user_version;
      const policy = this.db.prepare('SELECT value FROM policy WHERE id=1').get()?.value;
      if (
        schema !== PUBLIC_ACCOUNT_SCHEMA ||
        policy !== canonical({ origin: this.pin.origin, rpId: this.pin.rpId })
      )
        throw Error('Backup source schema/policy mismatch');
      const pages = Number(this.db.prepare('PRAGMA page_count').get()!.page_count);
      const size = Number(this.db.prepare('PRAGMA page_size').get()!.page_size);
      if (pages * size > MAX_SNAPSHOT_BYTES) throw Error('Backup size limit exceeded');
      anchored();
      // The explicit read transaction fixes the WAL snapshot while other connections keep writing.
      await backup(this.db, join(destination, 'account.sqlite'));
    } finally {
      this.db.exec('ROLLBACK');
    }
    const authority = new DatabaseSync(join(this.store, 'authority.sqlite'), { readOnly: true });
    try {
      if (
        authority.prepare('PRAGMA user_version').get()!.user_version !== 1 ||
        authority.prepare('SELECT pin FROM authority WHERE id=1').get()?.pin !== canonical(this.pin)
      )
        throw Error('Backup authority mismatch');
      await backup(authority, join(destination, 'authority.sqlite'));
    } finally {
      authority.close();
    }
    // Authority and these metadata files are immutable for the lifetime of this API owner.
    for (const file of ['pin.json', 'manifest.json']) {
      const path = join(this.store, file);
      checkFile(path);
      if (lstatSync(path).size > 8192) throw Error('Oversized backup metadata');
      const bytes = readFileSync(path);
      const value = JSON.parse(bytes.toString());
      const expected =
        file === 'pin.json'
          ? this.pin
          : { v: 1, accountSchema: PUBLIC_ACCOUNT_SCHEMA, authoritySchema: 1, pin: this.pin };
      if (canonical(value) !== canonical(expected)) throw Error('Backup metadata mismatch');
      writeFileSync(join(destination, file), bytes, { flag: 'wx', mode: 0o600 });
    }
    for (const file of ['account.sqlite', 'authority.sqlite']) {
      const db = new DatabaseSync(join(destination, file), { readOnly: true });
      try {
        integrity(db);
      } finally {
        db.close();
      }
    }
    const files: Record<string, Awaited<ReturnType<typeof fileDigest>>> = {};
    for (const file of BACKUP_FILES.slice(0, 4))
      files[file] = await fileDigest(join(destination, file));
    const manifest = {
      v: 1,
      format: 'done-public-backup',
      capturedAt,
      sourceRevision,
      pin: this.pin,
      accountSchema: PUBLIC_ACCOUNT_SCHEMA,
      authoritySchema: 1,
      files,
    };
    writeFileSync(join(destination, 'backup.json'), JSON.stringify(manifest) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    return {
      version,
      capturedAt,
      snapshotBytes: Object.values(files).reduce((sum, f) => sum + f.bytes, 0),
    };
  }
}
