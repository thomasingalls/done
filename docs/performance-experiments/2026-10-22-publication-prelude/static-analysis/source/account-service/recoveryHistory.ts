/** Read-only, bounded recovery view of the admitted history archive. */
import type { DatabaseSync } from 'node:sqlite';
import {
  EMPTY_HISTORY_CHECKPOINT,
  HISTORY_CHECKPOINT_LIMIT,
  HISTORY_ADMISSION_LIMIT,
  historyCheckpointHash,
  verifyHistoryCheckpointAdmission,
  verifyHistoryCheckpointParent,
} from '../account-protocol/historyCheckpoint.ts';
import { parseHistoryCatalog, verifyHistoryCatalog } from '../account-protocol/historyExchange.ts';
import { verifyCheckpointTimeline } from '../account-protocol/checkpointTimeline.ts';
import { historyMembership } from '../account-protocol/admissionHistory.ts';
import { parseHistoryRecovery } from '../account-protocol/recoveryRead.ts';

export function captureRecoveryHistory(db: DatabaseSync, workspace: string) {
  const size = db
    .prepare(
      'SELECT length(CAST(value AS BLOB)) AS n FROM history_checkpoint_catalog WHERE workspace_id=?',
    )
    .get(workspace);
  if (!size) {
    if (
      db
        .prepare('SELECT 1 FROM history_checkpoint_records WHERE workspace_id=? LIMIT 1')
        .get(workspace)
    )
      throw Error('History catalog missing');
    return null;
  }
  if (Number(size.n) > 4096) throw Error('History catalog too large');
  const raw = db
    .prepare('SELECT value FROM history_checkpoint_catalog WHERE workspace_id=?')
    .get(workspace)!;
  if (typeof raw.value !== 'string' || raw.value.length > 4096)
    throw Error('History catalog too large');
  const catalog = parseHistoryCatalog(JSON.parse(raw.value));
  const get = (hash: string) => {
    if (hash === EMPTY_HISTORY_CHECKPOINT) return null;
    const args = [workspace, hash];
    const size = db
      .prepare(
        'SELECT length(CAST(checkpoint AS BLOB))+coalesce(length(CAST(admission AS BLOB)),0) AS n FROM history_checkpoint_records WHERE workspace_id=? AND hash=?',
      )
      .get(...args);
    if (!size || Number(size.n) > HISTORY_CHECKPOINT_LIMIT + HISTORY_ADMISSION_LIMIT)
      throw Error('History recovery record missing or too large');
    const row = db
      .prepare(
        'SELECT sequence,checkpoint,admission FROM history_checkpoint_records WHERE workspace_id=? AND hash=?',
      )
      .get(...args)!;
    if (typeof row.checkpoint !== 'string' || typeof row.admission !== 'string')
      throw Error('History recovery record is not admitted');
    return { sequence: Number(row.sequence), checkpoint: row.checkpoint, admission: row.admission };
  };
  return { catalog, latest: get(catalog.latest), previous: get(catalog.previous) };
}
export async function verifyRecoveryHistory(
  captured: ReturnType<typeof captureRecoveryHistory>,
  base: Parameters<typeof verifyCheckpointTimeline>[0],
  proofs: Parameters<typeof verifyCheckpointTimeline>[1],
) {
  if (!captured) return null;
  const { catalog } = captured;
  await verifyHistoryCatalog(
    catalog,
    base.pin,
    base.request.candidate.workspaceId,
    base.request.candidate.lineageId,
  );
  const timeline = await verifyCheckpointTimeline(base, proofs);
  const verify = async (row: NonNullable<typeof captured>['latest'], hash: string) => {
    if (!row) return null;
    const value = parseHistoryRecovery({
      checkpoint: JSON.parse(row.checkpoint),
      admission: JSON.parse(row.admission),
    });
    if (!value) throw Error('Missing history baseline');
    const cp = value.checkpoint,
      history = timeline.states.get(cp.manifest.epoch);
    if (
      !history ||
      cp.manifest.sequence !== row.sequence ||
      (await historyCheckpointHash(cp)) !== hash
    )
      throw Error('History recovery identity changed');
    await verifyHistoryCheckpointAdmission(value.admission, cp, historyMembership(history));
    return value;
  };
  const latest = await verify(captured.latest, catalog.latest),
    previous = await verify(captured.previous, catalog.previous);
  if (latest ? latest.checkpoint.manifest.sequence !== catalog.sequence : catalog.sequence !== 0)
    throw Error('History recovery sequence changed');
  if (latest) await verifyHistoryCheckpointParent(latest.checkpoint, previous?.checkpoint ?? null);
  else if (previous) throw Error('Unexpected previous history snapshot');
  return latest;
}
