import type { DeliveryVerification } from './deliveryVerification.ts';
import { verifiedCensus } from './delivery.ts';
/** Later certified readers reuse the immutable generation-one baseline; no publish/admit alias. */
import type { DatabaseSync } from 'node:sqlite';
import { same } from '../account-protocol/admission.ts';
import {
  parseMembershipCheckpointRequest,
  verifyMembershipCheckpointRequest,
  verifyMembershipCheckpoint,
  checkMembershipCheckpointLifetime,
} from '../account-protocol/membershipCheckpoint.ts';
import { CONTENT_CHECKPOINT_LIMIT } from '../account-protocol/contentCheckpoint.ts';
import {
  snapshot,
  snapshotBytes,
  verifyCurrentWorkspaceAuthority,
  selectPublisher,
  type DeliveryIssuer,
  type DeliveryHook,
} from './delivery.ts';
import { membershipEnabled } from './membershipStore.ts';
import { rethrowAuthorization } from './authorization.ts';

export const membershipCheckpointRow = (db: DatabaseSync, workspace: string) =>
  db.prepare('SELECT * FROM content_checkpoints WHERE workspace_id=?').get(workspace) ?? null;
export function retainedCheckpoint(row: ReturnType<typeof membershipCheckpointRow>) {
  if (
    !row ||
    typeof row['checkpoint'] !== 'string' ||
    Buffer.byteLength(row['checkpoint']) > CONTENT_CHECKPOINT_LIMIT
  )
    throw Error('Historical checkpoint is missing or too large');
  return JSON.parse(row['checkpoint']);
}
export async function readMembershipCheckpoint(
  db: DatabaseSync,
  input: unknown,
  issuer: DeliveryIssuer,
  now: () => number,
  hook: DeliveryHook,
  reuse?: DeliveryVerification,
) {
  const no = (refusal: string) => ({ ok: false as const, refusal });
  if (!membershipEnabled(db)) return no('unavailable');
  let request;
  try {
    request = parseMembershipCheckpointRequest(input);
  } catch {
    return no('malformed');
  }
  const capture = () => ({
    authority: snapshot(db, request.workspaceId, request.credentialId),
    checkpoint: membershipCheckpointRow(db, request.workspaceId),
  });
  for (let retry = 0; retry < 4; retry++) {
    try {
      db.exec('BEGIN');
      const before = capture();
      db.exec('ROLLBACK');
      if (!before.authority) return no('unavailable');
      const s = before.authority,
        auth = selectPublisher(
          await verifyCurrentWorkspaceAuthority(s, issuer),
          request.credentialId,
        );
      if (!auth.history || !auth.successor || !auth.certificationSuccessor)
        return no('unavailable');
      await verifyMembershipCheckpointRequest(request, issuer.pin, auth.history, now());
      const checkpoint = await verifyMembershipCheckpoint(
        retainedCheckpoint(before.checkpoint),
        {
          base: { pin: issuer.pin, request: auth.request, receipt: auth.receipt },
          successor: auth.successor,
          certification: auth.certificationSuccessor,
        },
        auth.history,
      );
      // A new baseline read must not conceal damage to this reader's already accepted writing.
      await verifiedCensus(s, auth, reuse);
      hook('after-verify', 'membership-checkpoint');
      db.exec('BEGIN');
      const current = capture();
      if (
        snapshotBytes(current.authority) !== snapshotBytes(s) ||
        !same(current.checkpoint, before.checkpoint)
      ) {
        db.exec('ROLLBACK');
        continue;
      }
      const complete = issuer.authorize?.(db, {
        kind: 'workspace',
        workspaceId: request.workspaceId,
        credentialId: request.credentialId,
        action: 'checkpoint',
      });
      hook('before-commit', 'membership-checkpoint');
      checkMembershipCheckpointLifetime(request.expiresAt, now());
      issuer.check(auth.seal, s.promotion.request_digest, auth.a.acceptanceKey);
      complete?.();
      db.exec('COMMIT');
      return { ok: true as const, checkpoint };
    } catch (cause) {
      if (db.isTransaction) db.exec('ROLLBACK');
      rethrowAuthorization(cause);
      return no('unavailable');
    }
  }
  return no('state-changed');
}
