import { membershipProofChain } from './membershipLocator.ts';
import { parseMembershipChain } from '../account-protocol/membershipLocator.ts';
/** Commit distribution, membership, final cutoff and retry evidence as one service transition. */
import type { DatabaseSync } from 'node:sqlite';
import { same } from '../account-protocol/admission.ts';
import { historyMembership } from '../account-protocol/admissionHistory.ts';
import { parseDraft } from '../account-protocol/recovery.ts';
import {
  membershipState,
  parseMembershipRotation,
  verifyMembershipRotation,
  type MembershipRotation,
  type MembershipRotationEpoch,
} from '../account-protocol/membership.ts';
import {
  parseRotationRequest,
  verifyRotationRequest,
  resolveRotationOutcome,
  type RotationOutcome,
} from '../account-protocol/rotation.ts';
import type { AcceptedHead } from '../account-protocol/positionDecision.ts';
import {
  snapshot,
  snapshotBytes,
  census,
  selectPublisher,
  verifyCurrentWorkspaceAuthority,
  type Snapshot,
  type DeliveryIssuer,
  type DeliveryHook,
} from './delivery.ts';
import { parseWitness } from './deliveryWitness.ts';
import { membershipEnabled } from './membershipStore.ts';
import { rethrowAuthorization } from './authorization.ts';
export interface RotationIssuer extends DeliveryIssuer {
  outcome(value: Omit<RotationOutcome, 'signature'>): Promise<RotationOutcome>;
  finalize(seal: unknown, id: string, pub: string, value: AcceptedHead): AcceptedHead;
  rotate(value: MembershipRotationEpoch): Promise<MembershipRotation>;
}
const no = (refusal: string) => ({ ok: false as const, refusal });
export async function commitRotation(
  db: DatabaseSync,
  input: unknown,
  issuer: RotationIssuer,
  hook: DeliveryHook,
) {
  if (!membershipEnabled(db)) return no('unavailable');
  let request;
  try {
    request = parseRotationRequest(input);
  } catch {
    return no('malformed');
  }
  const workspace = request.preparation.request.workspaceId,
    parentHead = request.preparation.request.parent;
  for (let retry = 0; retry < 4; retry++) {
    try {
      db.exec('BEGIN');
      const root = snapshot(db, workspace);
      db.exec('COMMIT');
      if (!root) return no('unavailable');
      const auth = await verifyCurrentWorkspaceAuthority(root, issuer);
      if (!auth.history) throw Error('Missing rotation history');
      const row = root.rotations?.find((r) => r.parent === parentHead);
      const saved = row ? parseMembershipRotation(JSON.parse(row.artifact)) : undefined;
      const parent = saved
        ? auth.rotationParents?.get(parentHead)
        : historyMembership(auth.history);
      if (!parent) throw Error('Missing rotation parent');
      const p = membershipState(parent),
        recovery = parseDraft(JSON.parse(root.recovery.draft));
      const verified = await verifyRotationRequest(request, parent, recovery);
      if (!same(request.preparation, saved?.epoch.rotation.preparation ?? auth.removal))
        throw Error('Rotation does not match durable preparation');
      // Current authorization remains required even for historical intent retries.
      if (!auth.members.some((m) => m.id === request.actorId))
        throw Error('Removed rotation actor');
      const capture = () => p.roster.map((m) => snapshot(db, workspace, m.id));
      const bytes = (values: (Snapshot | null)[]) => JSON.stringify(values.map(snapshotBytes));
      db.exec('BEGIN');
      const before = capture(),
        unchanged = snapshotBytes(snapshot(db, workspace)) === snapshotBytes(root);
      db.exec('COMMIT');
      if (!unchanged) continue;
      if (before.some((s) => !s)) throw Error('Missing rotation publisher');
      const ledgers = [],
        heads = [];
      for (const [i, source] of (before as Snapshot[]).entries()) {
        const member = p.roster[i]!;
        const raw = source.publisher ? source.publisherWitness : source.promotion.delivery_witness;
        if (member.state === 'pending') {
          if (source.rows.length || raw) throw Error('Pending publisher has a ledger');
          heads.push({ credentialId: member.id, position: 0, link: '00'.repeat(32) });
          continue;
        }
        const publisher = selectPublisher(auth, member.id),
          ledger = await census(source, publisher);
        ledgers.push({ publisher, ledger, witness: raw ? parseWitness(JSON.parse(raw)) : null });
        heads.push({ credentialId: member.id, position: ledger.through, link: ledger.previous });
      }
      let result = saved;
      if (!result) {
        const cut = request.preparation.cutoff.find(
          (h) => h.credentialId === request.preparation.request.targetId,
        )!;
        if (
          !same(
            heads.find((h) => h.credentialId === cut.credentialId),
            cut,
          )
        )
          throw Error('Target cutoff moved');
        const outcome = await issuer.outcome({
          v: 1,
          kind: 'rotate',
          workspaceId: workspace,
          lineageId: p.lineageId,
          target: request.target,
          epoch: p.epoch + 1,
          committedId: verified.id,
        });
        const finalization = issuer.finalize(
          auth.seal,
          root.promotion.request_digest,
          p.acceptancePublicKey,
          {
            workspace,
            credential: cut.credentialId,
            position: cut.position,
            link: cut.link,
            epoch: p.epoch + 1,
            final: true,
            signature: '00'.repeat(64),
          },
        );
        result = await issuer.rotate({
          v: 2,
          kind: 'membership-rotation-epoch',
          workspaceId: workspace,
          lineageId: p.lineageId,
          epoch: p.epoch + 1,
          parent: p.head,
          generation: request.target,
          acceptancePublicKey: p.acceptancePublicKey,
          rotation: request,
          outcome,
          recovery,
          heads,
          finalization,
        });
        if (!same(result.epoch.rotation, request) || !same(result.epoch.heads, heads))
          throw Error('Issued rotation changed');
        await verifyMembershipRotation(result, parent);
        const chain = membershipProofChain(root);
        parseMembershipChain({ ...chain, continuations: [...chain.continuations, result] });
      }
      const outcome = await resolveRotationOutcome(result.epoch.outcome, verified);
      if (outcome.kind === 'pending') throw Error('Unverified rotation outcome');
      const replacements = saved
        ? []
        : ledgers.map(({ publisher, ledger }) => ({
            credentialId: publisher.credential,
            witness: ledger.count
              ? issuer.witness(
                  auth.seal,
                  root.promotion.request_digest,
                  p.acceptancePublicKey,
                  { ...publisher.scope, head: result!.head },
                  { events: ledger.count, hash: ledger.commitment },
                )
              : null,
          }));
      hook('after-verify', 'commit-rotation');
      db.exec('BEGIN IMMEDIATE');
      if (bytes(capture()) !== bytes(before)) {
        db.exec('ROLLBACK');
        continue;
      }
      issuer.check(auth.seal, root.promotion.request_digest, p.acceptancePublicKey);
      const complete = issuer.authorize?.(db, {
        kind: 'workspace',
        workspaceId: workspace,
        credentialId: request.actorId,
        action: 'remove',
      });
      if (!saved) {
        db.prepare('INSERT INTO membership_rotations VALUES (?,?,?,?,?,?)').run(
          workspace,
          result.epoch.epoch,
          p.head,
          result.head,
          JSON.stringify(result),
          JSON.stringify(
            ledgers.map(({ publisher, witness }) => ({
              credentialId: publisher.credential,
              witness,
            })),
          ),
        );
        db.prepare(
          'UPDATE promotions SET successor_head=?,removal_parent=NULL WHERE account_id=?',
        ).run(result.head, root.account.id);
        db.prepare('DELETE FROM removal_preparations WHERE workspace_id=?').run(workspace);
        for (const r of replacements) {
          if (r.credentialId === auth.request.candidate.signer)
            db.prepare('UPDATE promotions SET delivery_witness=? WHERE account_id=?').run(
              r.witness ? JSON.stringify(r.witness) : null,
              root.account.id,
            );
          else if (r.witness)
            db.prepare(
              'INSERT INTO publisher_witnesses VALUES (?,?,?) ON CONFLICT(account_id,credential_id) DO UPDATE SET witness=excluded.witness',
            ).run(root.account.id, r.credentialId, JSON.stringify(r.witness));
        }
      }
      hook('before-commit', 'commit-rotation');
      issuer.check(auth.seal, root.promotion.request_digest, p.acceptancePublicKey);
      complete?.();
      db.exec('COMMIT');
      hook('after-commit', 'commit-rotation');
      return { ok: true as const, outcome: result.epoch.outcome, rotation: result };
    } catch (cause) {
      if (db.isTransaction) db.exec('ROLLBACK');
      rethrowAuthorization(cause);
      return no('unavailable');
    }
  }
  return no('state-changed');
}
