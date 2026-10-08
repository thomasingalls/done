/** One immutable replacement snapshot per admitted connection. No pruning or rewriting. */
import type { DatabaseSync } from 'node:sqlite';
import { same, verifySignature } from '../account-protocol/admission.ts';
import { membershipState } from '../account-protocol/membership.ts';
import {
  verifyReplacementCheckpoint,
  replacementCheckpointHash,
  REPLACEMENT_CHECKPOINT_LIMIT,
  type ReplacementCheckpoint,
} from '../account-protocol/replacementCheckpoint.ts';
import {
  parseReplacementTransfer,
  replacementTransferMessage,
} from '../account-protocol/replacementTransfer.ts';
import { snapshot, snapshotBytes, type DeliveryIssuer, type DeliveryHook } from './delivery.ts';
import { verifyPendingMembership } from './membershipAuthority.ts';
import { membershipEnabled } from './membershipStore.ts';
import { requireNoRemoval } from './removalStore.ts';
import { rethrowAuthorization } from './authorization.ts';

export const REPLACEMENT_CHECKPOINT_SCHEMA = `CREATE TABLE replacement_checkpoints (
 workspace_id TEXT NOT NULL, preparation_id TEXT NOT NULL, parent TEXT NOT NULL,
 checkpoint TEXT NOT NULL, PRIMARY KEY(workspace_id,preparation_id), UNIQUE(workspace_id,parent),
 FOREIGN KEY(workspace_id,preparation_id) REFERENCES membership_admissions(workspace_id,preparation_id));`;
export function replacementCheckpointRow(db: DatabaseSync, workspace: string, preparation: string) {
  const size = db
    .prepare(
      'SELECT length(CAST(checkpoint AS BLOB)) AS bytes FROM replacement_checkpoints WHERE workspace_id=? AND preparation_id=?',
    )
    .get(workspace, preparation);
  if (size && Number(size.bytes) > REPLACEMENT_CHECKPOINT_LIMIT)
    throw Error('Oversized retained replacement checkpoint');
  return (
    db
      .prepare('SELECT * FROM replacement_checkpoints WHERE workspace_id=? AND preparation_id=?')
      .get(workspace, preparation) ?? null
  );
}
export async function retainedReplacementCheckpoint(
  row: ReturnType<typeof replacementCheckpointRow>,
  parent: Parameters<typeof verifyReplacementCheckpoint>[1],
  expectedHash?: string,
) {
  if (!row || typeof row.checkpoint !== 'string') throw Error('Replacement checkpoint is missing');
  const c = await verifyReplacementCheckpoint(JSON.parse(row.checkpoint), parent);
  if (
    row.workspace_id !== c.manifest.workspaceId ||
    row.preparation_id !== c.manifest.preparationId ||
    row.parent !== c.manifest.epochHead ||
    (expectedHash && (await replacementCheckpointHash(c)) !== expectedHash)
  )
    throw Error('Retained replacement checkpoint changed');
  return c;
}
export async function exchangeReplacementCheckpoint(
  db: DatabaseSync,
  input: unknown,
  issuer: DeliveryIssuer,
  hook: DeliveryHook,
) {
  const no = (refusal: string) => ({ ok: false as const, refusal });
  if (!membershipEnabled(db)) return no('unavailable');
  let request;
  try {
    request = parseReplacementTransfer(input);
  } catch {
    return no('malformed');
  }
  const capture = () => ({
    authority: snapshot(db, request.workspaceId),
    checkpoint: replacementCheckpointRow(db, request.workspaceId, request.preparationId),
  });
  for (let retry = 0; retry < 4; retry++) {
    try {
      db.exec('BEGIN');
      const before = capture();
      db.exec('ROLLBACK');
      if (!before.authority) return no('unavailable');
      const s = before.authority,
        auth = await verifyPendingMembership(s, issuer),
        p = membershipState(auth.membership);
      if (
        auth.cancellation ||
        p.head !== request.parent ||
        p.generation < 2 ||
        auth.proof.epoch.preparation.context.attemptId !== request.preparationId
      )
        return no('stale');
      const candidate = auth.proof.epoch.preparation.context.candidate,
        member = p.certificate.members.find((m) => m.id === request.credentialId),
        publicKey =
          member?.sPub ?? (candidate.credentialId === request.credentialId ? candidate.sPub : null);
      if (!publicKey || (request.action === 'publish' && !member)) return no('invalid-proof');
      await verifySignature(
        publicKey,
        request.signature,
        await replacementTransferMessage(request),
      );
      let checkpoint: ReplacementCheckpoint | null = before.checkpoint
        ? await retainedReplacementCheckpoint(before.checkpoint, auth.membership)
        : null;
      if (request.action === 'publish') {
        const proposed = await verifyReplacementCheckpoint(request.payload, auth.membership);
        if (proposed.manifest.producer !== request.credentialId) return no('invalid-proof');
        if (checkpoint && !same(checkpoint, proposed)) return no('checkpoint-conflict');
        if (!checkpoint && (auth.delivery || auth.certification))
          return no('delivery-already-started');
        checkpoint = proposed;
      }
      if (
        auth.delivery?.v === 3 &&
        (!checkpoint ||
          (await replacementCheckpointHash(checkpoint)) !== auth.delivery.checkpointHash)
      )
        return no('checkpoint-conflict');
      hook('after-verify', 'replacement-checkpoint');
      db.exec('BEGIN IMMEDIATE');
      const current = capture();
      if (
        snapshotBytes(current.authority) !== snapshotBytes(s) ||
        !same(current.checkpoint, before.checkpoint)
      ) {
        db.exec('ROLLBACK');
        continue;
      }
      issuer.check(auth.anchor.seal, s.promotion.request_digest, p.acceptancePublicKey);
      requireNoRemoval(db, request.workspaceId);
      const complete = issuer.authorize?.(db, {
        kind: 'enrollment',
        workspaceId: request.workspaceId,
        credentialId: request.credentialId,
        attemptId: request.preparationId,
        action: 'transfer',
      });
      if (checkpoint && !before.checkpoint)
        db.prepare('INSERT INTO replacement_checkpoints VALUES (?,?,?,?)').run(
          request.workspaceId,
          request.preparationId,
          p.head,
          JSON.stringify(checkpoint),
        );
      hook('before-commit', 'replacement-checkpoint');
      complete?.();
      db.exec('COMMIT');
      hook('after-commit', 'replacement-checkpoint');
      return { ok: true as const, checkpoint };
    } catch (cause) {
      if (db.isTransaction) db.exec('ROLLBACK');
      rethrowAuthorization(cause);
      return no('unavailable');
    }
  }
  return no('state-changed');
}
