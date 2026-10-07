import type { DatabaseSync } from 'node:sqlite';
import { same, verifySignature } from '../account-protocol/admission.ts';
import {
  parseCheckpointRequest,
  checkpointRequestMessage,
  verifyContentCheckpoint,
  verifyCheckpointAdmission,
  type ContentCheckpoint,
  type CheckpointAdmission,
} from '../account-protocol/contentCheckpoint.ts';
import {
  snapshot,
  snapshotBytes,
  verifyWorkspaceAuthority,
  type DeliveryIssuer,
  type DeliveryHook,
} from './delivery.ts';
export const CONTENT_CHECKPOINT_SCHEMA = `CREATE TABLE content_checkpoints (
 workspace_id TEXT PRIMARY KEY, checkpoint TEXT NOT NULL, admission TEXT);`;
/** One immutable baseline for the previously local-only publisher; no trim or replacement endpoint. */
export async function exchangeCheckpoint(
  db: DatabaseSync,
  input: unknown,
  issuer: DeliveryIssuer,
  hook: DeliveryHook,
) {
  const refuse = (refusal: string) => ({ ok: false as const, refusal });
  let r;
  try {
    r = parseCheckpointRequest(input);
  } catch {
    return refuse('malformed');
  }
  const capture = () => ({
    authority: snapshot(db, r.workspaceId),
    row:
      db.prepare('SELECT * FROM content_checkpoints WHERE workspace_id=?').get(r.workspaceId) ??
      null,
  });
  for (let retry = 0; retry < 4; retry++) {
    try {
      db.exec('BEGIN');
      const before = capture();
      db.exec('COMMIT');
      if (!before.authority) return refuse('unavailable');
      const s = before.authority,
        auth = await verifyWorkspaceAuthority(s, issuer);
      if (!auth.certificationSuccessor || !auth.successor || r.head !== auth.a.head)
        return refuse('stale');
      const a = {
        base: { pin: issuer.pin, request: auth.request, receipt: auth.receipt },
        successor: auth.successor,
        certification: auth.certificationSuccessor,
      };
      const member = a.certification.epoch.roster.find((m) => m.id === r.credentialId);
      if (
        !member ||
        (r.action === 'publish' && member.id !== auth.credential) ||
        (r.action === 'admit' && member.id === auth.credential)
      )
        return refuse('invalid-proof');
      await verifySignature(member.sPub, r.signature, await checkpointRequestMessage(r));
      let checkpoint: ContentCheckpoint | null = before.row
        ? await verifyContentCheckpoint(JSON.parse(before.row['checkpoint'] as string), a)
        : null;
      let admission: CheckpointAdmission | null = before.row?.['admission']
        ? await verifyCheckpointAdmission(
            JSON.parse(before.row['admission'] as string),
            checkpoint!,
            a,
          )
        : null;
      if (r.action === 'publish') {
        const proposed = await verifyContentCheckpoint(r.payload, a);
        if (checkpoint && !same(checkpoint, proposed)) return refuse('checkpoint-conflict');
        // Its zero heads retain the entire accepted suffix, including writes arriving after capture.
        checkpoint = proposed;
      }
      if (r.action === 'admit') {
        if (!checkpoint) return refuse('checkpoint-required');
        const proposed = await verifyCheckpointAdmission(r.payload, checkpoint, a);
        if (admission && !same(admission, proposed)) return refuse('admission-conflict');
        admission = proposed;
      }
      hook('after-verify', 'content-checkpoint');
      db.exec('BEGIN IMMEDIATE');
      const current = capture();
      if (snapshotBytes(current.authority) !== snapshotBytes(s) || !same(current.row, before.row)) {
        db.exec('ROLLBACK');
        continue;
      }
      issuer.check(auth.seal, s.promotion.request_digest, auth.a.acceptanceKey);
      if (checkpoint && !before.row)
        db.prepare('INSERT INTO content_checkpoints VALUES (?,?,?)').run(
          r.workspaceId,
          JSON.stringify(checkpoint),
          admission ? JSON.stringify(admission) : null,
        );
      else if (admission && !before.row?.['admission'])
        db.prepare('UPDATE content_checkpoints SET admission=? WHERE workspace_id=?').run(
          JSON.stringify(admission),
          r.workspaceId,
        );
      hook('before-commit', 'content-checkpoint');
      db.exec('COMMIT');
      hook('after-commit', 'content-checkpoint');
      return { ok: true as const, checkpoint, admission };
    } catch {
      if (db.isTransaction) db.exec('ROLLBACK');
      return refuse('unavailable');
    }
  }
  return refuse('state-changed');
}
