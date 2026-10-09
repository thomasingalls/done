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
import { membershipCheckpointRow, retainedCheckpoint } from './membershipCheckpoint.ts';
import { verifyBindingProof, type SlotBinding } from '../account-protocol/slot.ts';
import { validateCredentialKey, type StoredCredential } from './webauthn.ts';
import { captureRecoveryHistory, verifyRecoveryHistory } from './recoveryHistory.ts';
import { historySources } from './historySources.ts';
import { membershipProofChain } from './membershipLocator.ts';

export type ReplacementCheckpointIssuer = DeliveryIssuer & {
  bind(binding: SlotBinding): Promise<string>;
};

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
  issuer: ReplacementCheckpointIssuer,
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
  const capture = () => {
    const authority = snapshot(db, request.workspaceId),
      original = membershipCheckpointRow(db, request.workspaceId);
    return {
      authority,
      checkpoint: replacementCheckpointRow(db, request.workspaceId, request.preparationId),
      original,
      history: captureRecoveryHistory(db, request.workspaceId),
      sources: authority ? historySources(db, request.workspaceId, authority).sources : [],
      credential:
        !original && authority
          ? (db
              .prepare("SELECT * FROM credentials WHERE account_id=? AND state='confirmed'")
              .get(authority.promotion.account_id) as unknown as StoredCredential | undefined)
          : undefined,
    };
  };
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
      // Recovery can precede any original handoff. Mint the same public binding from the
      // original confirmed account credential, not from a missing content checkpoint.
      let rawBinding;
      if (before.original) rawBinding = retainedCheckpoint(before.original).binding;
      else {
        const credential = before.credential;
        if (
          !s.recoveries?.length ||
          !credential ||
          credential.account_id !== auth.anchor.request.candidate.accountId ||
          credential.id !== auth.anchor.receipt.activation.context.credentialId ||
          credential.state !== 'confirmed'
        )
          return no('unavailable');
        validateCredentialKey(credential);
        const value: SlotBinding = {
          v: 1,
          accountId: credential.account_id,
          principalId: auth.anchor.request.candidate.principalId,
          rpId: issuer.pin.rpId,
          epoch: 1,
          credId: credential.id,
          publicKey: credential.spki,
        };
        rawBinding = {
          v: 1,
          kind: 'promotion-slot-binding',
          requestDigest: auth.anchor.receipt.offer.epoch.requestDigest,
          epochHead: auth.anchor.receipt.offer.head,
          stored: { binding: value, bindingSignature: await issuer.bind(value) },
        };
      }
      // Independently verify the issued binding. No historical content key is shared.
      const binding = await verifyBindingProof(
        rawBinding,
        auth.anchor.request,
        auth.anchor.receipt,
        issuer.pin,
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
        if (!checkpoint) {
          const latest = before.history?.catalog.latest ?? '00'.repeat(32);
          if (
            (proposed.history?.checkpoint ?? '00'.repeat(32)) !== latest ||
            (proposed.history && !same(proposed.history.sources, before.sources))
          )
            return no('history-changed');
          await verifyRecoveryHistory(
            before.history,
            {
              pin: issuer.pin,
              request: auth.anchor.request,
              receipt: auth.anchor.receipt,
            },
            membershipProofChain(s),
          );
        }
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
        !same(current.checkpoint, before.checkpoint) ||
        !same(current.original, before.original) ||
        !same(current.history, before.history) ||
        !same(current.sources, before.sources) ||
        !same(current.credential ?? null, before.credential ?? null)
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
      // A hook or concurrent source publication cannot change the covered baseline at commit.
      if (
        checkpoint &&
        !before.checkpoint &&
        (!same(captureRecoveryHistory(db, request.workspaceId), before.history) ||
          !same(
            historySources(db, request.workspaceId, s).sources.filter((r) => r.head !== p.head),
            before.sources,
          ))
      )
        throw Error('Replacement history changed at commit');
      complete?.();
      db.exec('COMMIT');
      hook('after-commit', 'replacement-checkpoint');
      return { ok: true as const, checkpoint, binding };
    } catch (cause) {
      if (db.isTransaction) db.exec('ROLLBACK');
      rethrowAuthorization(cause);
      return no('unavailable');
    }
  }
  return no('state-changed');
}
