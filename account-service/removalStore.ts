/** Private durable target fence. No deletion or timer may reopen this stream before resolution. */
import type { DatabaseSync } from 'node:sqlite';
import { ROTATION_LIMIT } from '../account-protocol/rotation.ts';
import { membershipEnabled } from './membershipStore.ts';
export const REMOVAL_SCHEMA = `ALTER TABLE promotions ADD COLUMN removal_parent TEXT;
CREATE TABLE removal_preparations (
 workspace_id TEXT PRIMARY KEY, parent TEXT NOT NULL, target_id TEXT NOT NULL, artifact TEXT NOT NULL);`;
export interface RemovalRow {
  workspace_id: string;
  parent: string;
  target_id: string;
  artifact: string;
}
export function removalRow(db: DatabaseSync, workspace: string): RemovalRow | null {
  if (!membershipEnabled(db)) return null;
  if (!db.isTransaction) throw Error('Removal capture requires a transaction');
  const size = db
    .prepare(
      'SELECT length(CAST(artifact AS BLOB)) AS bytes FROM removal_preparations WHERE workspace_id=?',
    )
    .get(workspace);
  if (size && Number(size.bytes) > ROTATION_LIMIT) throw Error('Oversized retained removal');
  return (
    (db
      .prepare('SELECT * FROM removal_preparations WHERE workspace_id=?')
      .get(workspace) as unknown as RemovalRow) ?? null
  );
}
/** Existing membership mutators must serialize against the stable prepared parent. */
export function requireNoRemoval(db: DatabaseSync, workspace: string) {
  if (removalRow(db, workspace)) throw Error('Removal preparation is unresolved');
}

/** Committed rotations retain their exact winning intent and predecessor ledger witnesses. */
export const ROTATION_SCHEMA = `CREATE TABLE membership_rotations (
 workspace_id TEXT NOT NULL, epoch INTEGER NOT NULL, parent TEXT NOT NULL, head TEXT NOT NULL,
 artifact TEXT NOT NULL, boundaries TEXT NOT NULL,
 PRIMARY KEY(workspace_id,epoch), UNIQUE(workspace_id,parent), UNIQUE(workspace_id,head));`;
export interface RotationRow {
  workspace_id: string;
  epoch: number;
  parent: string;
  head: string;
  artifact: string;
  boundaries: string;
}
export function rotationRows(db: DatabaseSync, workspace: string): RotationRow[] {
  if (!membershipEnabled(db)) return [];
  if (!db.isTransaction) throw Error('Rotation capture requires a transaction');
  const sizes = db
    .prepare(`SELECT length(CAST(artifact AS BLOB)) AS a,
 length(CAST(boundaries AS BLOB)) AS b FROM membership_rotations WHERE workspace_id=? LIMIT 65`)
    .all(workspace);
  if (
    sizes.length > 64 ||
    sizes.some((r) => Number(r.a) > ROTATION_LIMIT || Number(r.b) > ROTATION_LIMIT)
  )
    throw Error('Oversized retained rotation');
  return db
    .prepare('SELECT * FROM membership_rotations WHERE workspace_id=? ORDER BY epoch')
    .all(workspace) as unknown as RotationRow[];
}
