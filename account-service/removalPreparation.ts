import type { DeliveryVerification } from './deliveryVerification.ts';
import { verifiedCensus } from './delivery.ts';
import { membershipProofChain } from './membershipLocator.ts';
/** Persist a stable removal cutoff against actual publisher ledgers. No key rotation yet. */
import type { DatabaseSync } from 'node:sqlite';
import { same } from '../account-protocol/admission.ts';
import { historyMembership } from '../account-protocol/admissionHistory.ts';
import { MEMBERSHIP_CREDENTIAL_LIMIT, membershipState } from '../account-protocol/membership.ts';
import {
  removalPreparationMatchesRequest,
  parseRemovalPreparationRequest,
  verifyRemovalPreparationRequest,
  verifyRemovalPreparation,
  type RemovalPreparation,
} from '../account-protocol/rotation.ts';
import {
  snapshot,
  snapshotBytes,
  selectPublisher,
  type Snapshot,
  type DeliveryIssuer,
  type DeliveryHook,
} from './delivery.ts';
import { resolveMembershipDeliveryAuthority } from './membershipHistory.ts';
import { membershipEnabled } from './membershipStore.ts';
import { rethrowAuthorization } from './authorization.ts';
export interface RemovalIssuer extends DeliveryIssuer {
  prepare(value: Omit<RemovalPreparation, 'signature'>): Promise<RemovalPreparation>;
}
const no = (refusal: string) => ({ ok: false as const, refusal });
export async function prepareRemoval(
  db: DatabaseSync,
  input: unknown,
  issuer: RemovalIssuer,
  hook: DeliveryHook,
  reuse?: DeliveryVerification,
) {
  if (!membershipEnabled(db)) return no('unavailable');
  let request;
  try {
    request = parseRemovalPreparationRequest(input);
  } catch {
    return no('malformed');
  }
  for (let retry = 0; retry < 4; retry++) {
    try {
      db.exec('BEGIN');
      const root = snapshot(db, request.workspaceId);
      db.exec('COMMIT');
      if (!root) return no('unavailable');
      const auth = await resolveMembershipDeliveryAuthority(root, issuer);
      if (!auth.history) throw Error('Missing removal membership');
      const parent = historyMembership(auth.history),
        p = membershipState(parent);
      await verifyRemovalPreparationRequest(request, parent);
      const capture = () => p.roster.map((m) => snapshot(db, request.workspaceId, m.id));
      const bytes = (values: (Snapshot | null)[]) => JSON.stringify(values.map(snapshotBytes));
      db.exec('BEGIN');
      const before = capture(),
        unchanged = snapshotBytes(snapshot(db, request.workspaceId)) === snapshotBytes(root);
      db.exec('COMMIT');
      if (!unchanged) continue;
      if (before.some((s) => !s)) throw Error('Missing removal publisher');
      const cutoff = [];
      for (const [i, source] of (before as Snapshot[]).entries()) {
        const member = p.roster[i]!;
        if (member.state === 'pending') {
          if (source.rows.length || source.publisherWitness)
            throw Error('Pending target has accepted writing');
          cutoff.push({ credentialId: member.id, position: 0, link: '00'.repeat(32) });
        } else {
          const ledger = await verifiedCensus(
            source,
            selectPublisher(auth, source.publisher),
            reuse,
          );
          cutoff.push({ credentialId: member.id, position: ledger.through, link: ledger.previous });
        }
      }
      const row = root.removalPreparation;
      if (
        !row &&
        membershipProofChain(root).continuations.length >= 2 * MEMBERSHIP_CREDENTIAL_LIMIT
      )
        return no('capacity');
      let prepared;
      if (row) {
        prepared = await verifyRemovalPreparation(JSON.parse(row.artifact), parent);
        if (
          row.workspace_id !== request.workspaceId ||
          row.parent !== p.head ||
          row.target_id !== prepared.request.targetId
        )
          throw Error('Retained removal scope changed');
        if (!removalPreparationMatchesRequest(request, prepared)) return no('request-conflict');
        for (const h of cutoff) {
          const saved = prepared.cutoff.find((s) => s.credentialId === h.credentialId)!;
          if (
            h.position < saved.position ||
            (h.position === saved.position && h.link !== saved.link) ||
            (h.credentialId === request.targetId && !same(h, saved))
          )
            throw Error('Retained removal cutoff changed');
        }
      } else {
        prepared = await issuer.prepare({ v: 1, kind: 'removal-preparation', request, cutoff });
        await verifyRemovalPreparation(prepared, parent);
        if (!same(prepared.request, request) || !same(prepared.cutoff, cutoff))
          throw Error('Issued removal preparation changed');
      }
      hook('after-verify', 'prepare-removal');
      db.exec('BEGIN IMMEDIATE');
      if (bytes(capture()) !== bytes(before)) {
        db.exec('ROLLBACK');
        continue;
      }
      issuer.check(auth.seal, root.promotion.request_digest, p.acceptancePublicKey);
      const complete = issuer.authorize?.(db, {
        kind: 'workspace',
        workspaceId: request.workspaceId,
        credentialId: request.actorId,
        action: 'remove',
      });
      if (!row) {
        db.prepare('INSERT INTO removal_preparations VALUES (?,?,?,?)').run(
          request.workspaceId,
          p.head,
          request.targetId,
          JSON.stringify(prepared),
        );
        db.prepare('UPDATE promotions SET removal_parent=? WHERE account_id=?').run(
          p.head,
          root.account.id,
        );
      }
      hook('before-commit', 'prepare-removal');
      issuer.check(auth.seal, root.promotion.request_digest, p.acceptancePublicKey);
      complete?.();
      db.exec('COMMIT');
      hook('after-commit', 'prepare-removal');
      return { ok: true as const, preparation: prepared };
    } catch (cause) {
      if (db.isTransaction) db.exec('ROLLBACK');
      rethrowAuthorization(cause);
      return no('unavailable');
    }
  }
  return no('state-changed');
}
