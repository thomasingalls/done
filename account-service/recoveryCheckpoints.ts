import { captureRecoveryHistory } from './recoveryHistory.ts';
/** Bounded immutable snapshot reads and a preparation fence for later checkpoint publications. */
import type { DatabaseSync } from 'node:sqlite';
import { RECOVERY_CHECKPOINT_PAGE_LIMIT } from '../account-protocol/recoveryRead.ts';
import { hash } from './protocol.ts';
export function recoveryCheckpoints(db: DatabaseSync, workspace: string, excludeRecovery?: string) {
  const refs = [
    ...db
      .prepare('SELECT workspace_id AS id FROM content_checkpoints WHERE workspace_id=?')
      .all(workspace)
      .map((r) => ({ kind: 'original' as const, id: String(r.id) })),
    ...db
      .prepare(
        'SELECT preparation_id AS id FROM replacement_checkpoints WHERE workspace_id=? ORDER BY preparation_id LIMIT 65',
      )
      .all(workspace)
      .map((r) => ({ kind: 'replacement' as const, id: String(r.id) })),
    ...db
      .prepare(
        'SELECT head AS id FROM recovery_successors WHERE workspace_id=? ORDER BY epoch LIMIT 65',
      )
      .all(workspace)
      .filter((r) => r.id !== excludeRecovery)
      .map((r) => ({ kind: 'recovery' as const, id: String(r.id) })),
  ];
  if (
    refs.filter((r) => r.kind === 'replacement').length > 64 ||
    refs.filter((r) => r.kind === 'recovery').length > 64
  )
    throw Error('Too many recovery checkpoints');
  const history = captureRecoveryHistory(db, workspace);
  return [
    ...refs.map((r) => ({ ...r, hash: hash(recoveryCheckpoint(db, workspace, r.kind, r.id)!) })),
    ...(history
      ? [{ kind: 'history' as const, id: 'admitted', hash: hash(JSON.stringify(history)) }]
      : []),
  ];
}
export function recoveryCheckpoint(
  db: DatabaseSync,
  workspace: string,
  kind: 'original' | 'replacement' | 'recovery',
  id: string,
): string | null {
  const [table, key] =
    kind === 'original'
      ? ['content_checkpoints', 'workspace_id']
      : kind === 'replacement'
        ? ['replacement_checkpoints', 'preparation_id']
        : ['recovery_successors', 'head'];
  const where = ` FROM ${table} WHERE workspace_id=? AND ${key}=?`;
  const size = db
    .prepare('SELECT length(CAST(checkpoint AS BLOB)) AS n' + where)
    .get(workspace, id);
  if (!size) return null;
  if (Number(size.n) > RECOVERY_CHECKPOINT_PAGE_LIMIT - 4096)
    throw Error('Oversized recovery checkpoint');
  return String(db.prepare('SELECT checkpoint' + where).get(workspace, id)!.checkpoint);
}
