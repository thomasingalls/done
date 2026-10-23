import { RECOVERY_COMMIT_LIMIT } from '../account-protocol/recoveryCommit.ts';
import type { DatabaseSync } from 'node:sqlite';
import { MEMBERSHIP_PROOF_LIMIT } from '../account-protocol/membership.ts';
import { membershipEnabled } from './membershipStore.ts';
/** Committed outcomes outlive the preparation deadline. Checkpoints are fetched separately. */
export const RECOVERY_SUCCESSOR_SCHEMA = `CREATE TABLE recovery_successors (
 workspace_id TEXT NOT NULL, epoch INTEGER NOT NULL, parent TEXT NOT NULL, head TEXT NOT NULL,
 artifact TEXT NOT NULL, boundaries TEXT NOT NULL, attempt_id TEXT UNIQUE NOT NULL,
 retry_hash TEXT UNIQUE NOT NULL, request_hash TEXT NOT NULL, checkpoint TEXT NOT NULL,
 PRIMARY KEY(workspace_id,epoch), UNIQUE(workspace_id,parent), UNIQUE(workspace_id,head));`;
export interface RecoveryRow {
  workspace_id: string;
  epoch: number;
  parent: string;
  head: string;
  artifact: string;
  boundaries: string;
  attempt_id: string;
  retry_hash: string;
  request_hash: string;
}
export function recoveryRows(db: DatabaseSync, workspace: string): RecoveryRow[] {
  if (!membershipEnabled(db)) return [];
  if (!db.isTransaction) throw Error('Recovery capture requires a transaction');
  const sizes = db
    .prepare(`SELECT length(CAST(artifact AS BLOB)) AS a,
    length(CAST(boundaries AS BLOB)) AS b FROM recovery_successors WHERE workspace_id=? LIMIT 65`)
    .all(workspace);
  if (
    sizes.length > 64 ||
    sizes.some((r) => Number(r.a) > MEMBERSHIP_PROOF_LIMIT || Number(r.b) > MEMBERSHIP_PROOF_LIMIT)
  )
    throw Error('Oversized retained recovery');
  return db
    .prepare(`SELECT workspace_id,epoch,parent,head,artifact,boundaries,attempt_id,retry_hash,request_hash
    FROM recovery_successors WHERE workspace_id=? ORDER BY epoch`)
    .all(workspace) as unknown as RecoveryRow[];
}

export function retainedRecoveryCheckpoint(
  db: DatabaseSync,
  workspace: string,
  head: string,
): string {
  const size = db
    .prepare(
      'SELECT length(CAST(checkpoint AS BLOB)) AS n FROM recovery_successors WHERE workspace_id=? AND head=?',
    )
    .get(workspace, head);
  if (!size || Number(size.n) > RECOVERY_COMMIT_LIMIT)
    throw Error('Missing or oversized recovery checkpoint');
  return db
    .prepare('SELECT checkpoint FROM recovery_successors WHERE workspace_id=? AND head=?')
    .get(workspace, head)!.checkpoint as string;
}
