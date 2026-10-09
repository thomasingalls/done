import { fstatSync, openSync, closeSync, readFileSync, realpathSync, lstatSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { AuthorityPin } from '../../account-protocol/authority.ts';
import { canonical } from '../protocol.ts';

export interface BackupConfig {
  bucketId: string;
  prefix: string;
  recipient: string;
  credentialsFile: string;
  workDirectory: string;
  sourceRevision: string;
}
export function privateJson(path: string, secret = false): any {
  const fd = openSync(path, 'r');
  try {
    const s = fstatSync(fd);
    if (!s.isFile() || s.size > 8192 || (secret && s.mode & 0o007))
      throw Error('Invalid backup configuration file');
    return JSON.parse(readFileSync(fd, 'utf8'));
  } finally {
    closeSync(fd);
  }
}
export function outside(path: string, root: string) {
  const rel = relative(realpathSync(root), realpathSync(path));
  if (!rel || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('../')))
    throw Error('Backup paths must be outside retained state');
}
export function ownedDirectory(path: string) {
  const s = lstatSync(path);
  if (!s.isDirectory() || s.mode & 0o077 || (process.getuid && s.uid !== process.getuid()))
    throw Error('Backup workspace must be an owned private directory');
}
export function backupConfig(
  state: string,
  env: Record<string, string | undefined> = process.env,
): BackupConfig | undefined {
  const path = env.DONE_BACKUP_CONFIG_FILE;
  if (!path) return undefined;
  if (!isAbsolute(path)) throw Error('Backup configuration path must be absolute');
  outside(path, state);
  const c = privateJson(path),
    sourceRevision = env.DONE_SOURCE_REVISION;
  if (
    Object.keys(c).sort().join() !== 'bucketId,credentialsFile,prefix,recipient,v,workDirectory' ||
    c.v !== 1 ||
    typeof c.bucketId !== 'string' ||
    !/^[a-zA-Z0-9]{6,64}$/.test(c.bucketId) ||
    typeof c.prefix !== 'string' ||
    !/^done-backups\/[0-9a-f]{32}\/$/.test(c.prefix) ||
    typeof c.recipient !== 'string' ||
    !/^age1[0-9a-z]{58}$/.test(c.recipient) ||
    !sourceRevision ||
    !/^[0-9a-f]{40}(?:-dirty)?$/.test(sourceRevision)
  )
    throw Error('Invalid backup configuration');
  for (const p of [c.credentialsFile, c.workDirectory]) {
    if (typeof p !== 'string' || !isAbsolute(p) || resolve(p) !== p)
      throw Error('Invalid backup path');
    outside(p, state);
  }
  ownedDirectory(c.workDirectory);
  // Cleanup owns only this dedicated workspace; it cannot contain its configuration or credentials.
  outside(path, c.workDirectory);
  outside(c.credentialsFile, c.workDirectory);
  return {
    bucketId: c.bucketId,
    prefix: c.prefix,
    recipient: c.recipient,
    credentialsFile: c.credentialsFile,
    workDirectory: c.workDirectory,
    sourceRevision,
  };
}
export function backupNamespace(config: Pick<BackupConfig, 'prefix'>, pin: AuthorityPin) {
  return config.prefix + createHash('sha256').update(canonical(pin)).digest('hex') + '/';
}
